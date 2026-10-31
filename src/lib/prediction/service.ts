import { randomUUID } from 'node:crypto';
import type { PredictionRequest, PredictionResponse, ForecastTier } from '../../types/prediction';
import { eventKey, identifier, PredictionInputError, preparePredictionMessages } from './schema';

import { normalizePrediction } from './normalize';
export { normalizePrediction } from './normalize';

// Explicit rule-based demo only. This is not a fitted model or a validated forecast.
export function simulatePrediction(req: PredictionRequest): PredictionResponse {
  const latest = [...req.messages].sort((a,b) => a.time_to_tca-b.time_to_tca || b.source_row-a.source_row)[0];
  const risk = typeof latest.risk === 'number' ? latest.risk : null;
  const pc = risk === null ? null : risk <= -30 ? 0 : 10 ** risk;
  const distance = typeof latest.miss_distance === 'number' ? latest.miss_distance : null;
  const tier: ForecastTier = (pc !== null && pc >= 1e-4 || distance !== null && distance < 1000) ? 'Critical' : (pc !== null && pc >= 1e-6 || distance !== null && distance <= 5000) ? 'Elevated' : 'Safe';
  const probabilities = pc === null && distance === null ? {Safe:1/3,Elevated:1/3,Critical:1/3} : {Safe:.2,Elevated:.2,Critical:.2}; if (pc !== null || distance !== null) probabilities[tier]=.6;
  return {request_id:req.request_id,dataset_id:req.dataset_id,event_id:req.event_id,event_key:eventKey(req.dataset_id,req.event_id),record_id:req.record_id,schema_version:'2.0',classification:tier.toLowerCase() as PredictionResponse['classification'],tier_probabilities:probabilities,prediction_target:'final_recorded_event_tier',model_version:'demo-simulation-not-trained',simulation:true,source:'simulation',input_time_to_tca_days:latest.time_to_tca,provided_pc:pc,provided_pc_status:pc===null?'unavailable':risk !== null && risk <= -30?'approximately_zero':'provided',provided_log10_pc:risk,provided_miss_distance_m:distance,final_pc:null};
}
export async function handlePrediction(body: any, options: {apiUrl?:string;apiKey?:string;hfToken?:string;timeoutMs?:number;fetchImpl?:typeof fetch}) {
  let request: PredictionRequest;
  try {
    if (body?.schema_version !== '2.0') throw new PredictionInputError('Unsupported request schema_version');
    const event_id=identifier(body?.event_id,'event_id');
    request={request_id:randomUUID(),dataset_id:identifier(body?.dataset_id,'dataset_id'),event_id,
      record_id:identifier(body?.record_id,'record_id'),schema_version:'2.0',
      messages:preparePredictionMessages(body?.messages,event_id)};
  } catch (e) {
    return {status:e instanceof PredictionInputError?e.status:400,body:{status:'failed',error:e instanceof Error?e.message:'Invalid request'}};
  }
  if (!options.apiUrl) return {status:200,body:simulatePrediction(request)};
  const timeout=options.timeoutMs ?? 15000;
  const controller=new AbortController();
  const timer=setTimeout(() => controller.abort(),Number.isFinite(timeout)&&timeout>0?timeout:15000);
  try {
    const response=await (options.fetchImpl??fetch)(options.apiUrl,{
      method:'POST',headers:{'Content-Type':'application/json',...(options.apiKey?{'X-API-Key':options.apiKey}:{}),...(options.hfToken?{'Authorization':`Bearer ${options.hfToken}`}:{})},
      body:JSON.stringify(request),signal:controller.signal,cache:'no-store',
    });
    if (!response.ok) {
      const detail=await response.json().catch(() => null);
      return {status:[401,413,422,503,504].includes(response.status)?response.status:502,
        body:{status:'failed',error:typeof detail?.detail==='string'?detail.detail:`Prediction backend returned HTTP ${response.status}`}};
    }
    return {status:200,body:normalizePrediction(await response.json(),request)};
  } catch (e) {
    return {status:controller.signal.aborted?504:502,body:{status:'failed',error:controller.signal.aborted?'Prediction request timed out':e instanceof Error?e.message:'Prediction backend unavailable'}};
  } finally { clearTimeout(timer); }
}

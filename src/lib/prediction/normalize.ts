import type { PredictionRequest, PredictionResponse, ForecastTier } from '../../types/prediction';
import { eventKey } from './schema';
const TIERS: ForecastTier[] = ['Safe', 'Elevated', 'Critical'];
function finiteOrNull(value: unknown, name: string): number | null {
  if (value === null) return null;
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(`Invalid backend ${name}`);
  return value;
}
export function normalizePrediction(raw: any, req: PredictionRequest): PredictionResponse {
  if (!raw || !Array.isArray(raw.events) || typeof raw.model_id !== 'string' || !raw.model_id) throw new Error('Invalid prediction backend response');
  if (raw.schema_version !== 'airbus-final-event-v1' || raw.prediction_target !== 'final_recorded_event_tier' || raw.input_cutoff_days !== 2) throw new Error('Unexpected backend target or schema');
  const expectedKey = eventKey(req.dataset_id, req.event_id);
  if (raw.events.length !== 1 || raw.events[0].event_id !== req.event_id || raw.events[0].event_key !== expectedKey) throw new Error('Prediction backend returned a different event or namespace');
  const e = raw.events[0], f = e.forecast, o = e.latest_observed;
  if (!f || !o || !TIERS.includes(f.final_tier) || f.final_pc !== null || f.final_pc_status !== 'withheld_pending_validation') throw new Error('Invalid final-tier forecast response');
  const p = f.tier_probabilities;
  if (!p || TIERS.some(t => typeof p[t] !== 'number' || !Number.isFinite(p[t]) || p[t] < 0 || p[t] > 1) || Math.abs(TIERS.reduce((s,t) => s+p[t],0)-1) > 1e-6) throw new Error('Invalid tier probability distribution');
  const winner = TIERS.reduce((a,b) => p[b] > p[a] ? b : a);
  if (winner !== f.final_tier) throw new Error('Final tier disagrees with probability argmax');
  if (typeof e.input_time_to_tca_days !== 'number' || !Number.isFinite(e.input_time_to_tca_days) || e.input_time_to_tca_days < 2) throw new Error('Invalid forecast input horizon');
  if (!['provided', 'approximately_zero', 'unavailable'].includes(o.pc_status)) throw new Error('Invalid observed Pc status');
  const pc = finiteOrNull(o.pc, 'observed Pc');
  const logPc = finiteOrNull(o.risk_log10_pc, 'observed log10(Pc)');
  if (pc !== null && (pc < 0 || pc > 1)) throw new Error('Invalid observed Pc');
  if (logPc !== null && logPc > 0) throw new Error('Invalid observed log10(Pc)');
  if (o.pc_status === 'unavailable' && (pc !== null || logPc !== null) || o.pc_status === 'approximately_zero' && (pc !== 0 || logPc === null || logPc > -30) || o.pc_status === 'provided' && (pc === null || logPc === null || logPc <= -30 || Math.abs(pc - 10 ** logPc) > Math.max(1e-300, (10 ** logPc) * 1e-9))) throw new Error('Observed Pc status disagrees with value');
  return {
    simulation:false,source:'live',
    request_id:req.request_id,dataset_id:req.dataset_id,event_id:req.event_id,event_key:expectedKey,
    record_id:req.record_id,schema_version:'2.0',classification:f.final_tier.toLowerCase(),
    tier_probabilities:{Safe:p.Safe,Elevated:p.Elevated,Critical:p.Critical},
    prediction_target:'final_recorded_event_tier',model_version:raw.model_id,
    input_time_to_tca_days:e.input_time_to_tca_days,provided_pc:pc,provided_pc_status:o.pc_status,
    provided_log10_pc:logPc,provided_miss_distance_m:finiteOrNull(o.miss_distance_m,'observed miss distance'),final_pc:null,
  };
}

import type { Dataset, EncounterSummary } from '../../types/telemetry';
import { applyPrediction } from './client';
import { normalizePrediction } from './normalize';

/** Bind cached forecasts to the entire source file, never to event_id alone. */
export function applyPrecomputed(dataset: Pick<Dataset,'id'|'sha256_checksum'>, encounters: EncounterSummary[], cache: any): EncounterSummary[] {
  const sha=dataset.sha256_checksum;
  if (!/^[a-f0-9]{64}$/.test(sha) || !cache || cache.schema_version !== 'airbus-precomputed-final-event-v1' || cache.source_csv_sha256 !== sha || cache.namespace !== dataset.id || dataset.id !== `sha256:${sha}` || cache.simulation !== false || cache.prediction_kind !== 'precomputed_frozen_model' || cache.external_accuracy_available !== false || !Array.isArray(cache.events)) return encounters;
  const events=new Map<string,any>();
  for(const event of cache.events) { if(typeof event.event_id!=='string'||events.has(event.event_id))return encounters;events.set(event.event_id,event); }
  return encounters.map(enc=>{
    const event=events.get(enc.event_id); if(!event||enc.dataset_id!==dataset.id)return enc;
    try {
      const response=normalizePrediction({schema_version:'airbus-final-event-v1',prediction_target:cache.prediction_target,input_cutoff_days:cache.input_cutoff_days,model_id:cache.model_id,events:[event],skipped:[]},{dataset_id:dataset.id,event_id:enc.event_id,record_id:enc.latest_record_id,request_id:'precomputed',schema_version:'2.0',messages:[]});
      return applyPrediction(enc,{...response,source:'precomputed',simulation:false});
    } catch { return enc; }
  });
}

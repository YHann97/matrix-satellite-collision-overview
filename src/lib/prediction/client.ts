import type { TelemetryRow, EncounterSummary } from '../../types/telemetry';
import type { PredictionResponse } from '../../types/prediction';
import { preparePredictionMessages, PredictionInputError } from './schema';
export function messagesForPrediction(rows:TelemetryRow[],eventId:string) {
  if(rows.some(r=>r._prediction_history_complete===false)) throw new PredictionInputError('Legacy history lacks original per-message object types/source rows. Re-import the source CSV before forecasting.',422);
  return preparePredictionMessages(rows,eventId);
}
export function predictionKey(datasetId:string,eventId:string) { return JSON.stringify([datasetId,eventId]); }
export function isCurrentPrediction(captured:{datasetId:string;epoch:number;ticket:number},current:{datasetId:string;epoch:number;ticket:number}) {
  return captured.datasetId===current.datasetId && captured.epoch===current.epoch && captured.ticket===current.ticket;
}
export function applyPrediction(enc:EncounterSummary,response:PredictionResponse):EncounterSummary {
  if(enc.dataset_id!==response.dataset_id||enc.event_id!==response.event_id) return enc;
  return {...enc,model_tier:response.classification,model_tier_probabilities:response.tier_probabilities,
    model_version:response.model_version,model_simulation:response.simulation,model_prediction_source:response.source,prediction_status:'completed',prediction_error:null,
    prediction_as_of_days:response.input_time_to_tca_days,model_observed_pc:response.provided_pc,
    model_observed_pc_status:response.provided_pc_status,model_observed_miss_distance_m:response.provided_miss_distance_m,
    prediction_completed_at:new Date().toISOString(),predicted_pc:null};
}

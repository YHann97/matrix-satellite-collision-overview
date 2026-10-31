export type ForecastTier = 'Safe' | 'Elevated' | 'Critical';
export type TierProbabilities = Record<ForecastTier, number>;
export type PcStatus = 'provided' | 'approximately_zero' | 'unavailable';
export interface PredictionMessage {
  event_id: string;
  source_row: number;
  time_to_tca: number;
  [key: string]: string | number | null;
}
export interface PredictionRequest {
  request_id: string;
  dataset_id: string;
  event_id: string;
  record_id: string;
  schema_version: '2.0';
  messages: PredictionMessage[];
}
export interface PredictionResponse {
  request_id: string;
  dataset_id: string;
  event_id: string;
  event_key: string;
  record_id: string;
  schema_version: '2.0';
  classification: 'safe' | 'elevated' | 'critical';
  tier_probabilities: TierProbabilities;
  prediction_target: 'final_recorded_event_tier';
  model_version: string;
  input_time_to_tca_days: number;
  provided_pc: number | null;
  provided_pc_status: PcStatus;
  provided_log10_pc: number | null;
  provided_miss_distance_m: number | null;
  final_pc: null;
  simulation: boolean;
  source: 'live' | 'precomputed' | 'simulation';
}

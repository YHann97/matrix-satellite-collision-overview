import { OperationalTier } from './telemetry';

export interface PredictionRequest {
  request_id: string;
  dataset_id: string;
  event_id: string;
  record_id: string;
  schema_version: string;
  attributes: Record<string, string | number | null>;
}

export interface PredictionResponse {
  request_id: string;
  event_id: string;
  record_id: string;
  probability_constant?: number; // External field
  pc?: number; // Normalized internal field
  classification: OperationalTier;
  reason_codes: string[];
  prediction_target: 'current_assessment' | 'final_risk_tca';
  model_version: string;
  error?: string;
}

export interface PredictionRecord {
  id: string;
  dataset_id: string;
  event_id: string;
  record_id: string;
  request_payload: PredictionRequest;
  response_payload: PredictionResponse | null;
  pc: number | null;
  model_classification: OperationalTier | null;
  operational_classification: OperationalTier | null;
  discrepancy_flag: boolean;
  status: 'not_requested' | 'queued' | 'processing' | 'completed' | 'failed';
  prediction_target: string;
  model_version: string;
  error_message?: string | null;
  created_at: string;
  completed_at?: string | null;
}

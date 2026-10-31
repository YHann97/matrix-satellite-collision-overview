import type { TierProbabilities, PcStatus } from './prediction';
export type OperationalTier = 'critical' | 'elevated' | 'safe' | 'incomplete';

export type ReviewStatus = 'unreviewed' | 'acknowledged' | 'in_planning' | 'reviewed';

export type PlanningStatus = 'queued' | 'assessing' | 'reviewed';

export interface TelemetryRow {
  event_id: string;
  time_to_tca: number | null; // in days
  miss_distance: number | null; // in meters
  relative_speed: number | null; // in m/s
  relative_position_r: number | null; // m
  relative_position_t: number | null; // m
  relative_position_n: number | null; // m
  relative_velocity_r?: number | null; // m/s
  relative_velocity_t?: number | null; // m/s
  relative_velocity_n?: number | null; // m/s
  c_object_type?: string | null;
  c_sigma_r?: number | null; // m
  t_sigma_r?: number | null; // m
  max_risk_estimate?: number | null;
  risk?: number | null; // log10(Pc)
  F10?: number | null; // solar radio flux 10.7cm
  AP?: number | null; // geomagnetic index
  mission_id?: string | null;
  [key: string]: any;
}

export interface TelemetryRecord {
  id: string;
  dataset_id: string;
  event_id: string;
  source_row_number: number;
  time_to_tca: number | null;
  miss_distance: number | null;
  relative_speed: number | null;
  relative_position_r: number | null;
  relative_position_t: number | null;
  relative_position_n: number | null;
  c_object_type: string | null;
  c_sigma_r: number | null;
  t_sigma_r: number | null;
  max_risk_estimate: number | null;
  risk: number | null; // log10(Pc)
  f10: number | null;
  ap: number | null;
  mission_id: string | null;
  raw_attributes: Record<string, any>;
  created_at: string;
}

export interface EncounterSummary {
  id: string;
  dataset_id: string;
  event_id: string;
  latest_record_id: string;
  message_count: number;
  min_time_to_tca: number;
  miss_distance: number;
  relative_speed: number | null;
  c_object_type: string;
  source_pc: number | null;
  predicted_pc: number | null; // Legacy storage only. No learned Pc is produced.
  source_risk_log10_pc?: number | null;
  source_pc_status?: PcStatus;
  model_tier_probabilities?: TierProbabilities | null;
  model_version?: string | null;
  model_simulation?: boolean;
  model_prediction_source?: 'live' | 'precomputed' | 'simulation';
  model_observed_pc?: number | null;
  model_observed_pc_status?: PcStatus;
  model_observed_miss_distance_m?: number | null;
  prediction_as_of_days?: number | null;
  prediction_completed_at?: string | null;
  prediction_status?: 'processing' | 'completed' | 'failed';
  prediction_error?: string | null;
  operational_tier: OperationalTier;
  model_tier?: OperationalTier | null;
  classification_reasons: string[];
  review_status: ReviewStatus;
  mission_id: string | null;
  lat: number;
  lon: number;
  altitude_km: number;
  inclination_deg?: number | null; // real target orbit inclination, when the data has it
  debris_inclination_deg?: number | null; // the other object's orbit, from the c_ columns
  debris_apogee_km?: number | null;
  debris_perigee_km?: number | null;
  has_plan: boolean;
  plan_id?: string | null;
  updated_at: string;
}

export interface Dataset {
  id: string;
  filename: string;
  sha256_checksum: string;
  file_size_bytes: number;
  row_count: number;
  encounter_count: number;
  status: 'uploading' | 'parsing' | 'ready' | 'failed';
  error_message?: string | null;
  is_active: boolean;
  created_at: string;
}

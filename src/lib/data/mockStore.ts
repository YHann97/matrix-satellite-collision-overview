import { EncounterSummary, TelemetryRow, Dataset } from '@/types/telemetry';
import { getSimulatedCoordinates } from '@/lib/geo/displayPositions';

export interface PlanRecord {
  id: string;
  dataset_id: string;
  event_id: string;
  planning_status: 'queued' | 'assessing' | 'reviewed';
  assigned_operator: string;
  assessment_rationale: string;
  proposed_action: string;
  baseline_pc: number | null;
  baseline_miss_distance: number | null;
  baseline_lead_time: number | null;
  baseline_model_version: string;
  is_stale: boolean;
  updated_at: string;
}

export interface AuditEventRecord {
  id: string;
  timestamp: string;
  event_id: string;
  action_type: string;
  operator_email: string;
  summary: string;
  previous_state?: any;
  new_state?: any;
}

// Generate realistic seeded encounters matching the ESA test dataset benchmark figures
export function generateSeedEncounters(count: number = 2167): EncounterSummary[] {
  const encounters: EncounterSummary[] = [];

  // Exact target distributions:
  // 186 Critical, 500 Elevated, 1481 Safe
  // No encounters within <= 1 day of TCA (min lead time > 1.0)
  for (let i = 1; i <= count; i++) {
    const eventId = `EV-${String(i).padStart(4, '0')}`;
    let tier: 'critical' | 'elevated' | 'safe' = 'safe';
    let missDist = 5200 + (i % 25000);
    let pc = 1e-8 + ((i % 100) * 1e-9);
    let timeToTca = 1.05 + ((i * 13) % 650) / 100; // strictly > 1.0 days

    if (i <= 186) {
      tier = 'critical';
      missDist = 300 + (i * 3.5); // < 1,000m
      pc = 1.2e-4 + (i * 1.5e-6);
      timeToTca = 1.02 + ((i * 7) % 300) / 100;
    } else if (i <= 686) {
      tier = 'elevated';
      missDist = 1000 + (i * 6); // 1,000m to 5,000m
      pc = 2.5e-6 + (i * 1e-7);
      timeToTca = 1.15 + ((i * 11) % 400) / 100;
    }

    const objectTypes = ['DEBRIS', 'DEBRIS', 'DEBRIS', 'PAYLOAD', 'PAYLOAD', 'ROCKET BODY', 'UNKNOWN'];
    const c_object_type = objectTypes[i % objectTypes.length];
    const coords = getSimulatedCoordinates(eventId);

    encounters.push({
      id: `ds-seed_${eventId}`,
      dataset_id: 'ds-seed',
      event_id: eventId,
      latest_record_id: `rec-${eventId}-latest`,
      message_count: 1 + (i % 6),
      min_time_to_tca: Math.round(timeToTca * 100) / 100,
      miss_distance: Math.round(missDist * 10) / 10,
      relative_speed: 12000 + ((i * 73) % 4000),
      c_object_type,
      source_pc: pc,
      predicted_pc: null,
      operational_tier: tier,
      model_tier: null,
      classification_reasons: tier === 'critical' ? ['MISS_DISTANCE_LT_1000M', 'PC_GTE_1E4'] : (tier === 'elevated' ? ['MISS_DISTANCE_1000_TO_5000M'] : ['PC_LT_1E6_AND_MISS_GT_5000M']),
      review_status: i === 1 ? 'acknowledged' : (i === 2 ? 'in_planning' : 'unreviewed'),
      mission_id: `MISSION-${(i % 18) + 1}`,
      lat: coords.lat,
      lon: coords.lon,
      altitude_km: coords.altitude_km,
      has_plan: i === 2,
      plan_id: i === 2 ? 'PLN-001' : null,
      updated_at: new Date().toISOString(),
    });
  }

  return encounters;
}

export function generateSeedMessages(eventId: string): TelemetryRow[] {
  const messages: TelemetryRow[] = [];
  const baseSeed = eventId.split('-')[1] ? parseInt(eventId.split('-')[1], 10) : 100;
  
  const leadTimes = [4.25, 2.50, 1.20, 0.45];
  const missDistances = [7120, 3890, 1420, 842];
  const risks = [-7.54, -6.10, -4.82, -3.619];

  for (let idx = 0; idx < 4; idx++) {
    messages.push({
      event_id: eventId,
      time_to_tca: leadTimes[idx],
      miss_distance: missDistances[idx],
      relative_speed: 14210,
      relative_position_r: 142.5 - idx * 10,
      relative_position_t: -620.1 + idx * 40,
      relative_position_n: 551.4 - idx * 15,
      relative_velocity_r: -1.2,
      relative_velocity_t: 14209.8,
      relative_velocity_n: 3.4,
      c_object_type: 'DEBRIS',
      c_sigma_r: 18.4,
      t_sigma_r: 42.1,
      max_risk_estimate: -3.45,
      risk: risks[idx],
      F10: 124.2,
      AP: 14,
      mission_id: 'MISSION-1',
      _source_row_number: baseSeed * 10 + idx + 1,
      // Additional sample attributes
      c_rcs_estimate: 0.0842,
      t_span: 3.50,
      c_obs_available: 142,
      c_obs_used: 138,
      c_recommended_od_span: 2.41,
      c_cd_area_over_mass: 0.0129,
    });
  }

  return messages;
}

export const INITIAL_DATASETS: Dataset[] = [
  {
    id: 'ds-seed',
    filename: 'test.csv',
    sha256_checksum: '8a3f7b2c9e1d0f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8',
    file_size_bytes: 14285900,
    row_count: 24484,
    encounter_count: 2167,
    status: 'ready',
    is_active: true,
    created_at: '2026-10-31T09:00:00Z',
  },
  {
    id: 'ds-seed-2',
    filename: 'test_data.csv',
    sha256_checksum: '4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5',
    file_size_bytes: 14285900,
    row_count: 24484,
    encounter_count: 2167,
    status: 'ready',
    is_active: false,
    created_at: '2026-10-28T14:30:00Z',
  },
];

import { TelemetryRow, EncounterSummary } from '@/types/telemetry';
import { classifyOperationalRisk, normalizeLogRiskToPc } from '@/lib/classification/policy';
import { getSimulatedCoordinates } from '@/lib/geo/displayPositions';

export interface GroupingResult {
  encounters: EncounterSummary[];
  encountersMap: Map<string, EncounterSummary>;
  recordsByEvent: Map<string, TelemetryRow[]>;
}

/**
 * Groups telemetry messages by event_id.
 * Determines the authoritative latest assessment using the smallest valid time_to_tca
 * with deterministic tie-breaking.
 */
export function groupEncounters(
  datasetId: string,
  rows: TelemetryRow[]
): GroupingResult {
  const recordsByEvent = new Map<string, TelemetryRow[]>();

  // Group all records by event_id
  for (const row of rows) {
    const list = recordsByEvent.get(row.event_id) || [];
    list.push(row);
    recordsByEvent.set(row.event_id, list);
  }

  const encounters: EncounterSummary[] = [];
  const encountersMap = new Map<string, EncounterSummary>();

  for (const [eventId, eventRows] of recordsByEvent.entries()) {
    // Sort records deterministically: smallest time_to_tca first.
    // If time_to_tca is null, place at end. Tie breaker: higher source row number.
    const sorted = [...eventRows].sort((a, b) => {
      const tA = a.time_to_tca !== null && a.time_to_tca !== undefined ? a.time_to_tca : Infinity;
      const tB = b.time_to_tca !== null && b.time_to_tca !== undefined ? b.time_to_tca : Infinity;
      if (tA !== tB) return tA - tB;
      const rA = a._source_row_number || 0;
      const rB = b._source_row_number || 0;
      return rB - rA;
    });

    const latest = sorted[0];
    const sourcePc = normalizeLogRiskToPc(latest.risk);
    const classification = classifyOperationalRisk(sourcePc, latest.miss_distance);
    const coords = getSimulatedCoordinates(eventId);

    const summary: EncounterSummary = {
      id: `${datasetId}_${eventId}`,
      dataset_id: datasetId,
      event_id: eventId,
      latest_record_id: `${datasetId}_${eventId}_${latest._source_row_number || 0}`,
      message_count: eventRows.length,
      min_time_to_tca: latest.time_to_tca ?? 0,
      miss_distance: latest.miss_distance ?? 0,
      relative_speed: latest.relative_speed ?? null,
      c_object_type: latest.c_object_type || 'UNKNOWN',
      source_pc: sourcePc,
      predicted_pc: null,
      operational_tier: classification.tier,
      model_tier: null,
      classification_reasons: classification.reasonCodes,
      review_status: 'unreviewed',
      mission_id: latest.mission_id || null,
      lat: coords.lat,
      lon: coords.lon,
      altitude_km: coords.altitude_km,
      has_plan: false,
      plan_id: null,
      updated_at: new Date().toISOString(),
    };

    encounters.push(summary);
    encountersMap.set(eventId, summary);
  }

  return {
    encounters,
    encountersMap,
    recordsByEvent,
  };
}

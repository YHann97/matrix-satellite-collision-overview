import { TelemetryRow } from '@/types/telemetry';

/** Per-update telemetry is stored as compact arrays in shards, loaded when an encounter is opened. */
export const HISTORY_SHARDS = 32;

export const HISTORY_FIELDS = [
  'time_to_tca', 'miss_distance', 'relative_speed', 'risk', 'max_risk_estimate',
  'relative_position_r', 'relative_position_t', 'relative_position_n',
  'relative_velocity_r', 'relative_velocity_t', 'relative_velocity_n',
  'c_sigma_r', 't_sigma_r', 'F10', 'AP',
] as const;

export function historyShardOf(eventId: string): number {
  const n = Number(eventId);
  if (Number.isInteger(n) && n >= 0) return n % HISTORY_SHARDS;
  let h = 0;
  for (let i = 0; i < eventId.length; i++) h = (h * 31 + eventId.charCodeAt(i)) >>> 0;
  return h % HISTORY_SHARDS;
}

export function decodeHistory(
  rows: (number | null)[][],
  base: { event_id: string; mission_id: string | null; c_object_type: string | null }
): TelemetryRow[] {
  return rows.map((r, i) => {
    const msg: Record<string, any> = { ...base, _source_row_number: i + 1 };
    HISTORY_FIELDS.forEach((f, k) => {
      msg[f] = r[k] ?? null;
    });
    return msg as TelemetryRow;
  });
}

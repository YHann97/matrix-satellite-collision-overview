import type { PredictionMessage } from '../../types/prediction';

// Observed risk is allowed ONLY in the >=2-day history. Final answers never cross this boundary.
export const MODEL_FEATURE_ALLOWLIST = [
  'time_to_tca', 'miss_distance', 'relative_speed', 'relative_position_r',
  'relative_position_t', 'relative_position_n', 'c_object_type', 'c_sigma_r',
  't_sigma_r', 'max_risk_estimate', 'F10', 'AP', 'risk',
] as const;
export class PredictionInputError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}
export function extractModelFeatures(attributes: Record<string, unknown>) {
  return Object.fromEntries(MODEL_FEATURE_ALLOWLIST.filter(k => k in attributes).map(k => [k, attributes[k]]));
}
export function identifier(value: unknown, name: string): string {
  if (typeof value !== 'string' || !value.trim() || value.length > 128) throw new PredictionInputError(`Missing or invalid ${name}`);
  return value.trim();
}
export function preparePredictionMessages(input: unknown, eventId: string): PredictionMessage[] {
  if (!Array.isArray(input) || input.length === 0) throw new PredictionInputError('Actual encounter history is required', 422);
  if (input.length > 10000) throw new PredictionInputError('Too many encounter messages', 413);
  const result: PredictionMessage[] = [];
  for (const raw of input) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new PredictionInputError('Invalid history message');
    if (raw.event_id !== eventId) throw new PredictionInputError('History contains a different event_id');
    // Ignore future/ineligible rows before looking at any other numerical fields.
    if (typeof raw.time_to_tca !== 'number' || !Number.isFinite(raw.time_to_tca)) throw new PredictionInputError('Finite time_to_tca is required', 422);
    if (raw.time_to_tca < 2) continue;
    if (!Number.isSafeInteger(raw.source_row) || raw.source_row < 0) throw new PredictionInputError('Original source_row is required; re-import the source CSV');
    const row: PredictionMessage = { event_id: eventId, source_row: raw.source_row, time_to_tca: raw.time_to_tca };
    for (const name of MODEL_FEATURE_ALLOWLIST) {
      const value = raw[name] ?? null;
      if (name === 'c_object_type') {
        if (value !== null && typeof value !== 'string') throw new PredictionInputError('Invalid c_object_type');
      } else if (value !== null && (typeof value !== 'number' || !Number.isFinite(value))) {
        throw new PredictionInputError(`Invalid numerical field: ${name}`);
      }
      if (name === 'risk' && typeof value === 'number' && value > 0) throw new PredictionInputError('Observed log10(Pc) must be <=0');
      row[name] = value;
    }
    result.push(row);
  }
  if (!result.length) throw new PredictionInputError('No finite messages at least 2 days before TCA are available', 422);
  if (new Set(result.map(r => r.source_row)).size !== result.length) throw new PredictionInputError('Duplicate source_row in encounter history');
  return result;
}

export function eventKey(datasetId: string, eventId: string): string {
  const encode = (v: string) => encodeURIComponent(v).replace(/[!'()*]/g, c => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
  return `${encode(datasetId)}:${encode(eventId)}`;
}

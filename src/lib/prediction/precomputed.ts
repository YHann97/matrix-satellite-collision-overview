import type { Dataset, EncounterSummary, OperationalTier } from '../../types/telemetry';

const TIERS = ['Safe', 'Elevated', 'Critical'] as const;
type Tier = (typeof TIERS)[number];

/** Cache events are valid only for the exact CSV from which they were computed. */
export function applyPrecomputed(dataset: Dataset, encounters: EncounterSummary[], cache: any): EncounterSummary[] {
  const clean = encounters.map(e => ({
    ...e,
    operational_tier: dataset.kind === 'test' ? 'incomplete' as const : e.operational_tier,
    model_tier: null, model_confidence: null, model_tier_probabilities: null,
    predicted_pc: null, tier_is_predicted: false,
  }));
  const sha = dataset.sha256_checksum;
  if (dataset.kind !== 'test' || !/^[a-f0-9]{64}$/.test(sha) || !cache ||
      cache.schema_version !== 'airbus-precomputed-final-event-v1' || cache.source_csv_sha256 !== sha ||
      cache.namespace !== `sha256:${sha}` || cache.prediction_kind !== 'precomputed_frozen_model' ||
      cache.prediction_target !== 'final_recorded_event_tier' || cache.input_cutoff_days !== 2 ||
      cache.simulation !== false || cache.external_accuracy_available !== false ||
      !Array.isArray(cache.events) || cache.event_count !== encounters.length || cache.events.length !== encounters.length) return clean;
  const byId = new Map<string, any>();
  for (const event of cache.events) {
    if (typeof event.event_id !== 'string' || byId.has(event.event_id) ||
        event.event_key !== `${encodeURIComponent(cache.namespace)}:${encodeURIComponent(event.event_id)}`) return clean;
    byId.set(event.event_id, event);
  }
  if (clean.some(e => e.dataset_id !== dataset.id || !byId.has(e.event_id))) return clean;
  return clean.map(enc => {
    const event = byId.get(enc.event_id), forecast = event.forecast, p = forecast?.tier_probabilities;
    if (!forecast || !TIERS.includes(forecast.final_tier) || forecast.final_pc !== null ||
        !p || TIERS.some(t => typeof p[t] !== 'number' || !Number.isFinite(p[t]) || p[t] < 0 || p[t] > 1) ||
        Math.abs(TIERS.reduce((sum, t) => sum + p[t], 0) - 1) > 1e-6 ||
        TIERS.reduce((a, b) => p[b] > p[a] ? b : a) !== forecast.final_tier ||
        !Number.isFinite(event.input_time_to_tca_days) || event.input_time_to_tca_days < 2) return enc;
    const tier = (forecast.final_tier as Tier).toLowerCase() as OperationalTier;
    return { ...enc, operational_tier: tier, model_tier: tier, tier_is_predicted: true,
      model_confidence: p[forecast.final_tier as Tier], model_tier_probabilities: { Safe: p.Safe, Elevated: p.Elevated, Critical: p.Critical },
      model_version: cache.model_id, prediction_as_of_days: event.input_time_to_tca_days };
  });
}

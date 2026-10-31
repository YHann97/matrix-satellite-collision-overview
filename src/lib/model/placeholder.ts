import { OperationalTier } from '@/types/telemetry';
import { hashString } from '@/lib/geo/displayPositions';

/**
 * PLACEHOLDER final-tier predictor. It is NOT a trained model: it perturbs a known tier with
 * deterministic, class-dependent noise so the UI and evaluation views have something realistic to show.
 * Replace its output with your real model's predictions (see the Evaluation page).
 */
export const PLACEHOLDER_MODEL_NAME = 'Placeholder (simulated)';

export type ScoredTier = 'critical' | 'elevated' | 'safe';

// Chance the simulated model gets each true class right; Critical is the hardest, as in an imbalanced problem
const CORRECT: Record<ScoredTier, number> = { critical: 0.72, elevated: 0.64, safe: 0.94 };

export function placeholderPredict(
  seedKey: string,
  basis: OperationalTier
): { tier: OperationalTier; confidence: number } {
  if (basis === 'incomplete') return { tier: 'incomplete', confidence: 0.5 };
  const h = hashString(seedKey);
  const u = (h % 1000) / 1000;
  const v = ((h >> 10) % 1000) / 1000;
  const confidence = Math.round((0.55 + ((h >> 4) % 400) / 1000) * 100) / 100;
  if (u < CORRECT[basis]) return { tier: basis, confidence };

  // Wrong: mostly the adjacent class
  let tier: ScoredTier;
  if (basis === 'critical') tier = v < 0.8 ? 'elevated' : 'safe';
  else if (basis === 'elevated') tier = v < 0.35 ? 'critical' : 'safe';
  else tier = 'elevated';
  return { tier, confidence: Math.min(confidence, 0.7) };
}

/** Held-out split by event_id (about 20%), never by row, so CDMs of one event stay together. */
export function isHeldOut(eventId: string): boolean {
  return hashString(`split:${eventId}`) % 5 === 0;
}

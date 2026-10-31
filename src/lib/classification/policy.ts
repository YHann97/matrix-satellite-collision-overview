import { OperationalTier } from '@/types/telemetry';

export interface ClassificationResult {
  tier: OperationalTier;
  reasonCodes: string[];
  explanation: string;
  isModelDiscrepant?: boolean;
}

/**
 * Classifies an encounter's operational risk tier based on Pc and miss distance in meters.
 * Follows the challenge's strict sequential operational thresholds:
 * 
 * 1. Critical if Pc >= 1e-4 OR miss_distance_m < 1000
 * 2. Elevated if Pc >= 1e-6 OR 1000 <= miss_distance_m <= 5000
 * 3. Safe if Pc < 1e-6 AND miss_distance_m > 5000 (requires both inputs valid)
 * 4. Incomplete if missing or invalid inputs, unless an available input independently triggers Critical or Elevated
 */
export function classifyOperationalRisk(
  pc: number | null | undefined,
  missDistanceMeters: number | null | undefined,
  modelReportedTier?: OperationalTier | null
): ClassificationResult {
  const reasonCodes: string[] = [];
  const explanations: string[] = [];

  const hasValidPc = typeof pc === 'number' && Number.isFinite(pc) && pc >= 0 && pc <= 1;
  const hasValidDist = typeof missDistanceMeters === 'number' && Number.isFinite(missDistanceMeters) && missDistanceMeters >= 0;

  // Rule 1: Critical checks
  let isCriticalByDistance = false;
  let isCriticalByPc = false;

  if (hasValidDist && missDistanceMeters < 1000) {
    isCriticalByDistance = true;
    reasonCodes.push('MISS_DISTANCE_LT_1000M');
    explanations.push(`Miss distance is ${missDistanceMeters.toFixed(1)} m (< 1,000 m safety margin)`);
  }

  if (hasValidPc && pc >= 1e-4) {
    isCriticalByPc = true;
    reasonCodes.push('PC_GTE_1E4');
    explanations.push(`Probability of collision is ${pc.toExponential(2)} (>= 1.00e-4)`);
  }

  if (isCriticalByDistance || isCriticalByPc) {
    const discrepancy = modelReportedTier && modelReportedTier !== 'critical';
    return {
      tier: 'critical',
      reasonCodes,
      explanation: explanations.join('; '),
      isModelDiscrepant: !!discrepancy,
    };
  }

  // Rule 2: Elevated checks
  let isElevatedByDistance = false;
  let isElevatedByPc = false;

  if (hasValidDist && missDistanceMeters >= 1000 && missDistanceMeters <= 5000) {
    isElevatedByDistance = true;
    reasonCodes.push('MISS_DISTANCE_1000_TO_5000M');
    explanations.push(`Miss distance is ${missDistanceMeters.toFixed(1)} m (within 1,000 - 5,000 m boundary)`);
  }

  if (hasValidPc && pc >= 1e-6) {
    isElevatedByPc = true;
    reasonCodes.push('PC_GTE_1E6');
    explanations.push(`Probability of collision is ${pc.toExponential(2)} (>= 1.00e-6)`);
  }

  if (isElevatedByDistance || isElevatedByPc) {
    // Note: If one input was missing, but the valid one made it elevated:
    if (!hasValidDist) {
      reasonCodes.push('MISSING_DISTANCE_INPUT');
    }
    if (!hasValidPc) {
      reasonCodes.push('MISSING_PC_INPUT');
    }

    const discrepancy = modelReportedTier && modelReportedTier !== 'elevated';
    return {
      tier: 'elevated',
      reasonCodes,
      explanation: explanations.join('; '),
      isModelDiscrepant: !!discrepancy,
    };
  }

  // Rule 3: Safe check (strictly requires BOTH inputs valid)
  if (hasValidPc && hasValidDist) {
    if (pc < 1e-6 && missDistanceMeters > 5000) {
      reasonCodes.push('PC_LT_1E6_AND_MISS_GT_5000M');
      const discrepancy = modelReportedTier && modelReportedTier !== 'safe';
      return {
        tier: 'safe',
        reasonCodes,
        explanation: `Pc (${pc.toExponential(2)}) is < 1e-6 and miss distance (${(missDistanceMeters / 1000).toFixed(2)} km) is > 5 km`,
        isModelDiscrepant: !!discrepancy,
      };
    }
  }

  // Rule 4: Incomplete assessment
  const missingInputs: string[] = [];
  if (!hasValidPc) {
    missingInputs.push('Pc');
    reasonCodes.push('INVALID_OR_MISSING_PC');
  }
  if (!hasValidDist) {
    missingInputs.push('miss_distance');
    reasonCodes.push('INVALID_OR_MISSING_MISS_DISTANCE');
  }

  return {
    tier: 'incomplete',
    reasonCodes,
    explanation: `Assessment incomplete: missing or invalid input (${missingInputs.join(', ')})`,
    isModelDiscrepant: false,
  };
}

/**
 * Normalizes log10(Pc) to linear probability Pc: Pc = 10^(log10Pc)
 */
export function normalizeLogRiskToPc(log10Pc: number | null | undefined): number | null {
  if (log10Pc === null || log10Pc === undefined || !Number.isFinite(log10Pc)) {
    return null;
  }
  const pc = Math.pow(10, log10Pc);
  if (!Number.isFinite(pc) || pc < 0) return null;
  return Math.min(pc, 1.0);
}

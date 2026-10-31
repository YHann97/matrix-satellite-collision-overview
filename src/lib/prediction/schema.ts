// Allowlist of model features for the external prediction service
// Strictly excludes 'risk' and target variables per specification Section 7
export const MODEL_FEATURE_ALLOWLIST = [
  'time_to_tca',
  'miss_distance',
  'relative_speed',
  'relative_position_r',
  'relative_position_t',
  'relative_position_n',
  'c_object_type',
  'c_sigma_r',
  't_sigma_r',
  'max_risk_estimate',
  'F10',
  'AP',
];

/**
 * Filter an attribute dictionary down to only permitted model features
 */
export function extractModelFeatures(attributes: Record<string, any>): Record<string, any> {
  const filtered: Record<string, any> = {};
  for (const key of MODEL_FEATURE_ALLOWLIST) {
    if (key in attributes) {
      filtered[key] = attributes[key];
    }
  }
  return filtered;
}

import test from 'node:test';
import assert from 'node:assert/strict';
import { MODEL_FEATURE_ALLOWLIST, extractModelFeatures } from '../src/lib/prediction/schema';

test('Prediction feature allowlist strictly excludes risk and target variables', () => {
  assert.ok(!MODEL_FEATURE_ALLOWLIST.includes('risk'), 'Target variable "risk" must not be in model input feature allowlist');
  assert.ok(!MODEL_FEATURE_ALLOWLIST.includes('target'), 'Target columns must not be in feature allowlist');
  assert.ok(MODEL_FEATURE_ALLOWLIST.includes('time_to_tca'));
  assert.ok(MODEL_FEATURE_ALLOWLIST.includes('miss_distance'));
  assert.ok(MODEL_FEATURE_ALLOWLIST.includes('relative_speed'));
  assert.ok(MODEL_FEATURE_ALLOWLIST.includes('relative_position_r'));
  assert.ok(MODEL_FEATURE_ALLOWLIST.includes('c_sigma_r'));

  // Test extractModelFeatures
  const rawInput = {
    event_id: '12345',
    risk: -2.5, // should be excluded
    miss_distance: 750, // should be included
    time_to_tca: 1.2, // should be included
    unknown_field: 'xyz', // should be excluded
  };
  const extracted = extractModelFeatures(rawInput);
  assert.strictEqual(extracted.risk, undefined);
  assert.strictEqual(extracted.unknown_field, undefined);
  assert.strictEqual(extracted.miss_distance, 750);
  assert.strictEqual(extracted.time_to_tca, 1.2);
});

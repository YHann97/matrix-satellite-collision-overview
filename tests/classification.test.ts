import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyOperationalRisk, normalizeLogRiskToPc } from '../src/lib/classification/policy';

test('Boundary Condition B-1: Miss distance < 1,000m triggers Critical regardless of low Pc', () => {
  const result = classifyOperationalRisk(1e-7, 800);
  assert.equal(result.tier, 'critical');
  assert.ok(result.reasonCodes.includes('MISS_DISTANCE_LT_1000M'));
});

test('Boundary Condition B-2: Miss distance exactly 1,000m with low Pc triggers Elevated', () => {
  const result = classifyOperationalRisk(1e-7, 1000);
  assert.equal(result.tier, 'elevated');
  assert.ok(result.reasonCodes.includes('MISS_DISTANCE_1000_TO_5000M'));
});

test('Boundary Condition B-3: Miss distance 4,999m triggers Elevated', () => {
  const result = classifyOperationalRisk(1e-7, 4999);
  assert.equal(result.tier, 'elevated');
});

test('Boundary Condition B-4: Miss distance exactly 5,000m triggers Elevated', () => {
  const result = classifyOperationalRisk(1e-7, 5000);
  assert.equal(result.tier, 'elevated');
});

test('Boundary Condition B-5: Miss distance 5,001m and low Pc triggers Safe', () => {
  const result = classifyOperationalRisk(1e-7, 5001);
  assert.equal(result.tier, 'safe');
  assert.ok(result.reasonCodes.includes('PC_LT_1E6_AND_MISS_GT_5000M'));
});

test('Boundary Condition B-6: Pc exactly 1e-4 triggers Critical', () => {
  const result = classifyOperationalRisk(1e-4, 12000);
  assert.equal(result.tier, 'critical');
  assert.ok(result.reasonCodes.includes('PC_GTE_1E4'));
});

test('Boundary Condition B-7: Pc exactly 1e-6 triggers Elevated', () => {
  const result = classifyOperationalRisk(1e-6, 12000);
  assert.equal(result.tier, 'elevated');
  assert.ok(result.reasonCodes.includes('PC_GTE_1E6'));
});

test('Boundary Condition B-8: Missing distance does not silently default to Safe', () => {
  const result = classifyOperationalRisk(1e-7, null);
  assert.equal(result.tier, 'incomplete');
});

test('Boundary Condition B-9: Missing distance but Pc >= 1e-4 triggers Critical independently', () => {
  const result = classifyOperationalRisk(2e-4, null);
  assert.equal(result.tier, 'critical');
});

test('Log risk normalization: log10(Pc) = -3.61984', () => {
  const pc = normalizeLogRiskToPc(-3.61984);
  assert.ok(pc !== null);
  assert.ok(Math.abs(pc - 2.4e-4) < 1e-5);
});

test('Model discrepancy: model reports safe but policy calculates critical', () => {
  const result = classifyOperationalRisk(1e-7, 500, 'safe');
  assert.equal(result.tier, 'critical');
  assert.equal(result.isModelDiscrepant, true);
});

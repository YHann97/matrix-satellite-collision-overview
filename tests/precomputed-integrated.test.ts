import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { applyPrecomputed } from '../src/lib/prediction/precomputed';
import type { Dataset, EncounterSummary } from '../src/types/telemetry';

const json = (path: string) => JSON.parse(readFileSync(path, 'utf8'));

test('frozen test forecasts bind only to the matching source and keep observed values', () => {
  const manifest = json('public/data/manifest.json');
  const ds = manifest.datasets.find((d: Dataset) => d.id === 'ds-test') as Dataset;
  const encounters = json('public/data/test/encounters.json').encounters as EncounterSummary[];
  const cache = json('public/data/test/predictions.json');
  const result = applyPrecomputed(ds, encounters, cache);
  assert.equal(result.length, 2167);
  assert.equal(result.filter(e => e.tier_is_predicted).length, 2167);
  assert.deepEqual(['safe', 'elevated', 'critical'].map(t => result.filter(e => e.operational_tier === t).length), [1487, 492, 188]);
  assert.equal(result.filter((e, i) => e.operational_tier !== encounters[i].operational_tier).length, 340);
  assert.equal(result[0].source_pc, encounters[0].source_pc);
  assert.equal(result[0].current_tier, encounters[0].current_tier);
  assert.equal(result[0].predicted_pc, null);
  assert.ok(result[0].model_tier_probabilities);
  const mismatch = applyPrecomputed({ ...ds, sha256_checksum: '0'.repeat(64) }, encounters, cache);
  assert.equal(mismatch.filter(e => e.tier_is_predicted).length, 0);
  assert.ok(mismatch.every(e => e.model_tier === null && e.operational_tier === 'incomplete'));
  assert.equal(mismatch[0].current_tier, encounters[0].current_tier);
  const train = applyPrecomputed({ ...ds, kind: 'train', id: 'ds-train' }, encounters, cache);
  assert.ok(train.every(e => e.model_tier === null));
});

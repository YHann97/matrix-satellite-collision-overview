import test from 'node:test';
import assert from 'node:assert/strict';
import { parseTelemetryCsv, parseNumericCell } from '../src/lib/csv/parser';
import { groupEncounters } from '../src/lib/csv/grouping';

test('parseNumericCell preserves 0 as valid number', () => {
  assert.equal(parseNumericCell(0), 0);
  assert.equal(parseNumericCell('0'), 0);
  assert.equal(parseNumericCell('0.0'), 0);
  assert.equal(parseNumericCell(''), null);
  assert.equal(parseNumericCell('null'), null);
  assert.equal(parseNumericCell(null), null);
  assert.equal(parseNumericCell(undefined), null);
});

test('parseTelemetryCsv parses raw CSV and preserves columns', () => {
  const sampleCsv = `event_id,time_to_tca,miss_distance,relative_speed,c_object_type,custom_attr_1
EV-101,2.5,1200,14000,DEBRIS,test_value_1
EV-101,0.5,850,14010,DEBRIS,test_value_2
EV-102,1.2,6000,11000,PAYLOAD,test_value_3`;

  const parsed = parseTelemetryCsv(sampleCsv);
  assert.equal(parsed.totalRows, 3);
  assert.equal(parsed.rejectedRows, 0);
  assert.equal(parsed.rows[0].custom_attr_1, 'test_value_1');

  const grouped = groupEncounters('test-dataset', parsed.rows);
  assert.equal(grouped.encounters.length, 2);

  const ev101 = grouped.encountersMap.get('EV-101');
  assert.ok(ev101);
  assert.equal(ev101.message_count, 2);
  // Authoritative latest assessment must have smallest time_to_tca (0.5 < 2.5)
  assert.equal(ev101.min_time_to_tca, 0.5);
  assert.equal(ev101.miss_distance, 850);
  assert.equal(ev101.operational_tier, 'critical'); // because miss_dist < 1000m
});

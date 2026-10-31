import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, symlinkSync, copyFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

test('dataset rebuild preserves evaluation and never fabricates model predictions', () => {
  const project = process.cwd();
  const tmp = mkdtempSync(path.join(tmpdir(), 'airbus-build-test-'));
  try {
    mkdirSync(path.join(tmp, 'scripts'));
    mkdirSync(path.join(tmp, 'public/data/train'), { recursive: true });
    copyFileSync(path.join(project, 'scripts/build-encounters.ts'), path.join(tmp, 'scripts/build-encounters.ts'));
    symlinkSync(path.join(project, 'src'), path.join(tmp, 'src'), 'dir');
    symlinkSync(path.join(project, 'node_modules'), path.join(tmp, 'node_modules'), 'dir');
    const savedEvaluation = '{"model":"frozen real evaluation"}';
    writeFileSync(path.join(tmp, 'public/data/train/model_eval.json'), savedEvaluation);
    const csv = 'event_id,mission_id,time_to_tca,miss_distance,relative_speed,risk,c_object_type\n0,1,3,500,100,-5,DEBRIS\n0,1,2,600,100,-6,DEBRIS\n1,2,4,10000,100,-7,DEBRIS\n';
    const input = path.join(tmp, 'input.csv');
    writeFileSync(input, csv);
    for (const kind of ['train', 'test']) {
      execFileSync(process.execPath, ['--import', 'tsx', path.join(tmp, 'scripts/build-encounters.ts'), input, '--name', kind], { cwd: project });
      const out = JSON.parse(readFileSync(path.join(tmp, `public/data/${kind}/encounters.json`), 'utf8'));
      assert.equal(out.dataset.sha256_checksum, createHash('sha256').update(csv).digest('hex'));
      assert.equal(out.encounters.length, 2);
      assert.equal(out.dataset.predicted_counts, undefined);
      for (const encounter of out.encounters) {
        assert.equal(encounter.model_tier, null);
        assert.equal(encounter.model_confidence, null);
        assert.equal(encounter.tier_is_predicted, false);
        assert.equal(encounter.current_tier, encounter.operational_tier);
      }
      const manifest = JSON.parse(readFileSync(path.join(tmp, 'public/data/manifest.json'), 'utf8'));
      const registered = manifest.datasets.find((d: {kind: string}) => d.kind === kind);
      assert.equal(registered.sha256_checksum, out.dataset.sha256_checksum);
      assert.equal(registered.predicted_counts, undefined);
    }
    assert.equal(readFileSync(path.join(tmp, 'public/data/train/model_eval.json'), 'utf8'), savedEvaluation);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

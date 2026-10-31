/**
 * Streams a large conjunction CSV (e.g. the ESA train_data.csv or test_data.csv) and writes one encounter
 * per event_id plus per-update history to public/data/<name>/, and registers it in public/data/manifest.json.
 * event_id restarts in every file, so datasets are kept apart and never joined on event_id.
 *
 * Usage: npx tsx scripts/build-encounters.ts <path/to/file.csv> [--name train|test]
 *   --name defaults to "test" when the filename contains "test", otherwise "train".
 *
 * Predicted tiers come from src/lib/model/placeholder.ts (simulated). Swap in real model output later.
 */
import fs from 'fs';
import path from 'path';
import Papa from 'papaparse';
import { groupEncounters } from '../src/lib/csv/grouping';
import { parseNumericCell } from '../src/lib/csv/parser';
import { TelemetryRow } from '../src/types/telemetry';
import { HISTORY_FIELDS, HISTORY_SHARDS, historyShardOf } from '../src/lib/data/history';
import { isHeldOut, PLACEHOLDER_MODEL_NAME, placeholderPredict } from '../src/lib/model/placeholder';

const NUMERIC = [
  'time_to_tca', 'miss_distance', 'relative_speed', 'risk', 'max_risk_estimate',
  't_j2k_sma', 't_j2k_ecc', 't_j2k_inc', 't_h_apo', 't_h_per',
  'c_j2k_sma', 'c_j2k_ecc', 'c_j2k_inc', 'c_h_apo', 'c_h_per', 'geocentric_latitude',
];

const args = process.argv.slice(2);
const filePath = args.find((a) => !a.startsWith('--'));
if (!filePath || !fs.existsSync(filePath)) {
  console.error('Usage: npx tsx scripts/build-encounters.ts <path/to/file.csv> [--name train|test]');
  process.exit(1);
}
const nameIdx = args.indexOf('--name');
const kind: 'train' | 'test' =
  nameIdx >= 0 ? (args[nameIdx + 1] === 'test' ? 'test' : 'train') : /test/i.test(path.basename(filePath)) ? 'test' : 'train';
const dataRoot = path.join(__dirname, '..', 'public', 'data');
const outDir = path.join(dataRoot, kind);

const best = new Map<string, TelemetryRow>();
const counts = new Map<string, number>();
const lastLat = new Map<string, number>();
const history = new Map<string, (number | null)[][]>();
let totalRows = 0;

Papa.parse(fs.createReadStream(filePath, { encoding: 'utf-8' }) as any, {
  header: true,
  skipEmptyLines: 'greedy',
  step: (res: Papa.ParseStepResult<Record<string, string>>) => {
    const r = res.data;
    const eventId = r.event_id?.trim();
    if (!eventId) return;
    totalRows++;
    counts.set(eventId, (counts.get(eventId) ?? 0) + 1);

    const hist = history.get(eventId) ?? [];
    hist.push(HISTORY_FIELDS.map((f) => parseNumericCell(r[f])));
    history.set(eventId, hist);

    const lat = parseNumericCell(r.geocentric_latitude);
    if (lat !== null) lastLat.set(eventId, lat);

    // Latest assessment = smallest time_to_tca, same rule as groupEncounters
    const tca = parseNumericCell(r.time_to_tca);
    const prev = best.get(eventId);
    if (prev && !(tca !== null && (prev.time_to_tca == null || tca < prev.time_to_tca))) return;

    const row: TelemetryRow = {
      event_id: eventId,
      mission_id: r.mission_id?.trim() || null,
      c_object_type: r.c_object_type?.trim() || null,
      _source_row_number: totalRows + 1,
    } as unknown as TelemetryRow;
    for (const k of NUMERIC) row[k] = parseNumericCell(r[k]);
    best.set(eventId, row);
  },
  complete: () => {
    for (const [id, row] of best) {
      if (row.geocentric_latitude == null) row.geocentric_latitude = lastLat.get(id) ?? null;
    }
    const datasetId = `ds-${kind}`;
    const { encounters } = groupEncounters(datasetId, [...best.values()]);
    for (const e of encounters) e.message_count = counts.get(e.event_id) ?? 1;

    // Placeholder final-tier predictions. Train has observed final tiers; test has none, so its tier IS the prediction.
    const tiers = ['critical', 'elevated', 'safe'] as const;
    const predictedCounts: Record<string, number> = { critical: 0, elevated: 0, safe: 0, incomplete: 0 };
    const tierCounts: Record<string, number> = { critical: 0, elevated: 0, safe: 0, incomplete: 0 };
    const confusion = tiers.map(() => tiers.map(() => 0));
    for (const e of encounters) {
      const pred = placeholderPredict(`${kind}:${e.event_id}`, e.operational_tier);
      e.model_tier = pred.tier;
      e.model_confidence = pred.confidence;
      e.current_tier = e.operational_tier;
      if (kind === 'test') {
        e.operational_tier = pred.tier;
        e.tier_is_predicted = true;
      } else if (isHeldOut(e.event_id)) {
        const i = tiers.indexOf(e.operational_tier as (typeof tiers)[number]);
        const j = tiers.indexOf(pred.tier as (typeof tiers)[number]);
        if (i >= 0 && j >= 0) confusion[i][j]++;
      }
      predictedCounts[pred.tier]++;
      tierCounts[e.operational_tier]++;
    }

    if (kind === 'train') {
      const total = confusion.flat().reduce((s, n) => s + n, 0);
      const perClass = tiers.map((tier, i) => {
        const tp = confusion[i][i];
        const actual = confusion[i].reduce((s, n) => s + n, 0);
        const predicted = confusion.reduce((s, row) => s + row[i], 0);
        const precision = predicted ? tp / predicted : 0;
        const recall = actual ? tp / actual : 0;
        return { tier: tier, support: actual, precision, recall, f1: precision + recall ? (2 * precision * recall) / (precision + recall) : 0 };
      });
      const evalOut = {
        placeholder: true,
        model: PLACEHOLDER_MODEL_NAME,
        note: 'Simulated predictions, not a trained model. Replace this file with real held-out results (same shape).',
        task: 'Predict the final tier (from the last CDM before closest approach) using only CDMs with time_to_tca >= 2 days',
        split: { method: 'by event_id, about 80/20', held_out_events: total, total_events: encounters.length },
        classes: tiers,
        confusion, // rows = actual, columns = predicted, order = classes
        per_class: perClass,
        accuracy: total ? confusion.reduce((s, row, i) => s + row[i], 0) / total : 0,
        class_balance: Object.fromEntries(tiers.map((tier, i) => [tier, confusion[i].reduce((s, n) => s + n, 0)])),
      };
      fs.mkdirSync(outDir, { recursive: true });
      fs.writeFileSync(path.join(outDir, 'model_eval.json'), JSON.stringify(evalOut, null, 2));
    }

    // Per-update history, oldest message first (largest time_to_tca), sharded by event
    const shards: Record<string, (number | null)[][]>[] = Array.from({ length: HISTORY_SHARDS }, () => ({}));
    for (const [id, rows] of history) {
      rows.sort((a, b) => (b[0] ?? Infinity) - (a[0] ?? Infinity));
      shards[historyShardOf(id)][id] = rows;
    }
    const histDir = path.join(outDir, 'history');
    fs.mkdirSync(histDir, { recursive: true });
    shards.forEach((sh, i) => fs.writeFileSync(path.join(histDir, `${i}.json`), JSON.stringify(sh)));

    const out = {
      dataset: {
        id: datasetId,
        filename: path.basename(filePath),
        file_size_bytes: fs.statSync(filePath).size,
        row_count: totalRows,
        encounter_count: encounters.length,
        kind,
        has_outcomes: kind === 'train',
        data_path: `/data/${kind}`,
        predicted_counts: predictedCounts,
      },
      encounters,
    };
    const outPath = path.join(outDir, 'encounters.json');
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, JSON.stringify(out));
    // Register in the manifest (train first), replacing any previous entry of the same kind
    const manifestPath = path.join(dataRoot, 'manifest.json');
    const manifest: { datasets: Record<string, any>[] } = fs.existsSync(manifestPath)
      ? JSON.parse(fs.readFileSync(manifestPath, 'utf-8'))
      : { datasets: [] };
    manifest.datasets = [...manifest.datasets.filter((d) => d.kind !== kind), { ...out.dataset, tier_counts: tierCounts }].sort(
      (a, b) => (a.kind === 'train' ? -1 : 1) - (b.kind === 'train' ? -1 : 1)
    );
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

    const withOrbit = encounters.filter((e) => e.inclination_deg != null).length;
    console.log(`${totalRows} rows -> ${encounters.length} encounters (${withOrbit} with real orbit data)`);
    console.log(`Wrote ${outPath} (${(fs.statSync(outPath).size / 1048576).toFixed(1)} MB)`);
  },
});

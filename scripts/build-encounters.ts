/**
 * Streams a large conjunction CSV (e.g. the ESA train_data.csv or test_data.csv) and writes one encounter
 * per event_id plus per-update history to public/data/<name>/, and registers it in public/data/manifest.json.
 * event_id restarts in every file, so datasets are kept apart and never joined on event_id.
 *
 * Usage: npx tsx scripts/build-encounters.ts <path/to/file.csv> [--name train|test]
 *   --name defaults to "test" when the filename contains "test", otherwise "train".
 *
 * Tiers built here are source assessments; predictions and evaluation come from separately verified model artifacts.
 * Rebuilding a dataset never writes model_eval.json.
 */
import fs from 'fs';
import path from 'path';
import { createHash } from 'crypto';
import Papa from 'papaparse';
import { groupEncounters } from '../src/lib/csv/grouping';
import { parseNumericCell } from '../src/lib/csv/parser';
import { TelemetryRow } from '../src/types/telemetry';
import { HISTORY_FIELDS, HISTORY_SHARDS, historyShardOf } from '../src/lib/data/history';

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
// Hash the exact source bytes, so a prediction cache can only bind to the file it scored.
const sha256 = new Promise<string>((resolve, reject) => {
  const hash = createHash('sha256');
  const input = fs.createReadStream(filePath);
  input.on('data', (chunk) => hash.update(chunk));
  input.on('error', reject);
  input.on('end', () => resolve(hash.digest('hex')));
});

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
  complete: async () => {
    const sourceSha256 = await sha256;
    for (const [id, row] of best) {
      if (row.geocentric_latitude == null) row.geocentric_latitude = lastLat.get(id) ?? null;
    }
    const datasetId = `ds-${kind}`;
    const { encounters } = groupEncounters(datasetId, [...best.values()]);
    for (const e of encounters) e.message_count = counts.get(e.event_id) ?? 1;

    // Keep source assessments available for navigation, but never synthesize forecasts.
    // Test assessments are from the latest available CDM; they are not final outcomes.
    const tierCounts: Record<string, number> = { critical: 0, elevated: 0, safe: 0, incomplete: 0 };
    for (const e of encounters) {
      e.model_tier = null;
      e.model_confidence = null;
      e.current_tier = e.operational_tier;
      e.tier_is_predicted = false;
      tierCounts[e.operational_tier]++;
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
        sha256_checksum: sourceSha256,
        file_size_bytes: fs.statSync(filePath).size,
        row_count: totalRows,
        encounter_count: encounters.length,
        kind,
        has_outcomes: kind === 'train',
        data_path: `/data/${kind}`,
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

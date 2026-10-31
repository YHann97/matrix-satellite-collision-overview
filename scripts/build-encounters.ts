/**
 * Streams a large conjunction CSV (e.g. the ESA train_data.csv) and writes one encounter per
 * event_id to public/data/encounters.json, which the app loads on start.
 *
 * Usage: npx tsx scripts/build-encounters.ts <path/to/train_data.csv>
 */
import fs from 'fs';
import path from 'path';
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

const filePath = process.argv[2];
if (!filePath || !fs.existsSync(filePath)) {
  console.error('Usage: npx tsx scripts/build-encounters.ts <path/to/train_data.csv>');
  process.exit(1);
}

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
    const datasetId = `ds-${path.basename(filePath).replace(/\.csv$/i, '')}`;
    const { encounters } = groupEncounters(datasetId, [...best.values()]);
    for (const e of encounters) e.message_count = counts.get(e.event_id) ?? 1;

    // Per-update history, oldest message first (largest time_to_tca), sharded by event
    const shards: Record<string, (number | null)[][]>[] = Array.from({ length: HISTORY_SHARDS }, () => ({}));
    for (const [id, rows] of history) {
      rows.sort((a, b) => (b[0] ?? Infinity) - (a[0] ?? Infinity));
      shards[historyShardOf(id)][id] = rows;
    }
    const histDir = path.join(__dirname, '..', 'public', 'data', 'history');
    fs.mkdirSync(histDir, { recursive: true });
    shards.forEach((sh, i) => fs.writeFileSync(path.join(histDir, `${i}.json`), JSON.stringify(sh)));

    const out = {
      dataset: {
        id: datasetId,
        filename: path.basename(filePath),
        file_size_bytes: fs.statSync(filePath).size,
        row_count: totalRows,
        encounter_count: encounters.length,
      },
      encounters,
    };
    const outPath = path.join(__dirname, '..', 'public', 'data', 'encounters.json');
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, JSON.stringify(out));
    const withOrbit = encounters.filter((e) => e.inclination_deg != null).length;
    console.log(`${totalRows} rows -> ${encounters.length} encounters (${withOrbit} with real orbit data)`);
    console.log(`Wrote ${outPath} (${(fs.statSync(outPath).size / 1048576).toFixed(1)} MB)`);
  },
});

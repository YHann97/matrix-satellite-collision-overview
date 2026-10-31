import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import Papa from 'papaparse';
import { createClient } from '@supabase/supabase-js';
import { groupTelemetryByEncounter, parseNumericCell } from '../src/lib/csv/grouping';
import { TelemetryRow } from '../src/types/telemetry';

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const fileArg = args.find((a) => !a.startsWith('--'));

  let filePath = fileArg;
  if (!filePath) {
    if (fs.existsSync('test.csv')) {
      filePath = 'test.csv';
    } else if (fs.existsSync('test_data.csv')) {
      filePath = 'test_data.csv';
    }
  }

  if (!filePath || !fs.existsSync(filePath)) {
    console.error(`\x1b[31m[ERROR]\x1b[0m CSV file not found.`);
    console.log(`\nUsage: npx tsx scripts/ingest.ts [path/to/telemetry.csv] [--dry-run]\n`);
    console.log(`Examples:`);
    console.log(`  npx tsx scripts/ingest.ts ./test.csv`);
    console.log(`  npx tsx scripts/ingest.ts ./test_data.csv --dry-run`);
    process.exit(1);
  }

  console.log(`\x1b[34m[INFO]\x1b[0m Ingesting conjunction telemetry from: ${filePath}`);
  const fileBuffer = fs.readFileSync(filePath);
  const fileChecksum = crypto.createHash('sha256').update(fileBuffer).digest('hex');
  const filename = path.basename(filePath);
  const fileSize = fileBuffer.length;
  console.log(`\x1b[34m[INFO]\x1b[0m File Size: ${(fileSize / (1024 * 1024)).toFixed(2)} MB | SHA256: ${fileChecksum.slice(0, 16)}...`);

  // Parse CSV
  const fileContent = fileBuffer.toString('utf-8');
  const parsed = Papa.parse(fileContent, {
    header: true,
    skipEmptyLines: 'greedy',
    dynamicTyping: false,
  });

  if (parsed.errors && parsed.errors.length > 0) {
    console.warn(`\x1b[33m[WARN]\x1b[0m Encountered ${parsed.errors.length} CSV parsing notices.`);
  }

  const rawRows = parsed.data as Record<string, string>[];
  const columns = parsed.meta.fields || [];
  console.log(`\x1b[34m[INFO]\x1b[0m Total parsed rows: ${rawRows.length} | Columns: ${columns.length}`);

  // Dataset namespace
  const datasetId = `ds-${fileChecksum.slice(0, 8)}`;
  const datasetName = filename.replace(/\.csv$/i, '');

  // Transform rows to TelemetryRow format
  const rows: TelemetryRow[] = [];
  const rejectedRows: { row: number; reason: string }[] = [];
  const uniqueMissions = new Set<string>();

  rawRows.forEach((r, idx) => {
    const rowNum = idx + 2; // +1 for 0-index, +1 for header line
    const eventId = r['event_id'] ? String(r['event_id']).trim() : '';

    if (!eventId) {
      rejectedRows.push({ row: rowNum, reason: 'Missing event_id' });
      return;
    }

    const missionId = r['mission_id'] ? String(r['mission_id']).trim() : undefined;
    if (missionId) {
      uniqueMissions.add(missionId);
    }

    const typedRow: TelemetryRow = {
      id: `${datasetId}-${rowNum}`,
      dataset_id: datasetId,
      event_id: eventId,
      source_row_number: rowNum,
      mission_id: missionId,
      time_to_tca: parseNumericCell(r['time_to_tca']),
      miss_distance: parseNumericCell(r['miss_distance']),
      relative_speed: parseNumericCell(r['relative_speed']),
      relative_position_r: parseNumericCell(r['relative_position_r']),
      relative_position_t: parseNumericCell(r['relative_position_t']),
      relative_position_n: parseNumericCell(r['relative_position_n']),
      c_object_type: r['c_object_type'] || 'UNKNOWN',
      c_sigma_r: parseNumericCell(r['c_sigma_r']),
      t_sigma_r: parseNumericCell(r['t_sigma_r']),
      max_risk_estimate: parseNumericCell(r['max_risk_estimate']),
      risk: parseNumericCell(r['risk']),
      F10: parseNumericCell(r['F10']),
      AP: parseNumericCell(r['AP']),
      raw_attributes: r,
    };

    rows.push(typedRow);
  });

  console.log(`\x1b[34m[INFO]\x1b[0m Valid rows: ${rows.length} | Rejected rows: ${rejectedRows.length}`);

  // Build encounter summaries
  const encounterSummaries = groupTelemetryByEncounter(rows, datasetId);
  console.log(`\x1b[32m[SUCCESS]\x1b[0m Grouped into ${encounterSummaries.length} unique encounters.`);

  // Statistics
  const tierCounts = {
    critical: 0,
    elevated: 0,
    safe: 0,
    incomplete: 0,
  };
  let under24hCount = 0;

  encounterSummaries.forEach((e) => {
    tierCounts[e.operational_tier] = (tierCounts[e.operational_tier] || 0) + 1;
    if (e.min_time_to_tca !== null && e.min_time_to_tca >= 0 && e.min_time_to_tca <= 1.0) {
      under24hCount++;
    }
  });

  console.log(`\n======================================================`);
  console.log(`📊 INGESTION METRICS & REFERENCE VERIFICATION`);
  console.log(`======================================================`);
  console.log(`- Dataset ID:             ${datasetId}`);
  console.log(`- Total Telemetry Rows:   ${rows.length.toLocaleString()}`);
  console.log(`- Total Columns:          ${columns.length}`);
  console.log(`- Unique Event IDs:       ${encounterSummaries.length.toLocaleString()}`);
  console.log(`- Distinct Mission IDs:   ${uniqueMissions.size}`);
  console.log(`- Critical Encounters:    ${tierCounts.critical.toLocaleString()}`);
  console.log(`- Elevated Encounters:    ${tierCounts.elevated.toLocaleString()}`);
  console.log(`- Safe Encounters:        ${tierCounts.safe.toLocaleString()}`);
  console.log(`- Incomplete Encounters:  ${tierCounts.incomplete.toLocaleString()}`);
  console.log(`- Under 24h to TCA:       ${under24hCount} (Expected: 0 for reference test.csv)`);
  console.log(`======================================================\n`);

  // Supabase Ingestion
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SECRET_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (dryRun || !supabaseUrl || !supabaseKey) {
    if (dryRun) {
      console.log(`\x1b[33m[NOTICE]\x1b[0m Dry run mode active. No remote database operations executed.`);
    } else {
      console.log(`\x1b[33m[NOTICE]\x1b[0m Supabase credentials not set in environment.`);
      console.log(`         Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY to sync to Postgres.`);
    }

    const reportPath = 'ingestion-report.json';
    fs.writeFileSync(
      reportPath,
      JSON.stringify(
        {
          dataset_id: datasetId,
          filename,
          file_checksum: fileChecksum,
          total_rows: rows.length,
          rejected_rows: rejectedRows.length,
          columns_count: columns.length,
          unique_encounters: encounterSummaries.length,
          unique_missions: uniqueMissions.size,
          tier_breakdown: tierCounts,
          under_24h_to_tca: under24hCount,
          timestamp: new Date().toISOString(),
        },
        null,
        2
      )
    );
    console.log(`\x1b[32m[DONE]\x1b[0m Ingestion report saved to ${reportPath}\n`);
    return;
  }

  // Upload to Supabase Postgres
  console.log(`\x1b[34m[INFO]\x1b[0m Connecting to Supabase at: ${supabaseUrl}`);
  const supabase = createClient(supabaseUrl, supabaseKey);

  // 1. Insert dataset record
  console.log(`\x1b[34m[INFO]\x1b[0m Registering dataset...`);
  const { error: dsError } = await supabase.from('datasets').upsert({
    id: datasetId,
    name: datasetName,
    filename,
    file_checksum: fileChecksum,
    total_rows: rows.length,
    unique_events: encounterSummaries.length,
    status: 'ready',
    is_active: true,
  });

  if (dsError) {
    console.error(`\x1b[31m[ERROR]\x1b[0m Failed to insert dataset:`, dsError.message);
    process.exit(1);
  }

  // 2. Batch insert telemetry records (batches of 1,000)
  const BATCH_SIZE = 1000;
  console.log(`\x1b[34m[INFO]\x1b[0m Ingesting ${rows.length} telemetry records in batches of ${BATCH_SIZE}...`);
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    const { error: recError } = await supabase.from('telemetry_records').upsert(
      batch.map((r) => ({
        id: r.id,
        dataset_id: r.dataset_id,
        event_id: r.event_id,
        source_row_number: r.source_row_number,
        mission_id: r.mission_id,
        time_to_tca: r.time_to_tca,
        miss_distance: r.miss_distance,
        relative_speed: r.relative_speed,
        relative_position_r: r.relative_position_r,
        relative_position_t: r.relative_position_t,
        relative_position_n: r.relative_position_n,
        c_object_type: r.c_object_type,
        c_sigma_r: r.c_sigma_r,
        t_sigma_r: r.t_sigma_r,
        max_risk_estimate: r.max_risk_estimate,
        risk: r.risk,
        f10: r.F10,
        ap: r.AP,
        raw_attributes: r.raw_attributes,
      }))
    );
    if (recError) {
      console.error(`\x1b[31m[ERROR]\x1b[0m Failed batch ${i / BATCH_SIZE + 1}:`, recError.message);
    } else {
      process.stdout.write(`\r[INFO] Ingested ${Math.min(i + BATCH_SIZE, rows.length)} / ${rows.length} telemetry rows`);
    }
  }
  console.log('\n');

  // 3. Batch insert encounter summaries
  console.log(`\x1b[34m[INFO]\x1b[0m Ingesting ${encounterSummaries.length} encounter summaries...`);
  for (let i = 0; i < encounterSummaries.length; i += BATCH_SIZE) {
    const batch = encounterSummaries.slice(i, i + BATCH_SIZE);
    const { error: encError } = await supabase.from('encounters').upsert(
      batch.map((e) => ({
        id: e.id,
        dataset_id: e.dataset_id,
        event_id: e.event_id,
        mission_id: e.mission_id,
        update_count: e.update_count,
        latest_record_id: e.latest_record_id,
        operational_tier: e.operational_tier,
        review_status: e.review_status,
        min_time_to_tca: e.min_time_to_tca,
        latest_miss_distance: e.latest_miss_distance,
        latest_relative_speed: e.latest_relative_speed,
        latest_risk: e.latest_risk,
        latest_pc: e.latest_pc,
        c_object_type: e.c_object_type,
        primary_reason_code: e.primary_reason_code,
      }))
    );
    if (encError) {
      console.error(`\x1b[31m[ERROR]\x1b[0m Failed encounter batch ${i / BATCH_SIZE + 1}:`, encError.message);
    }
  }

  console.log(`\x1b[32m[DONE]\x1b[0m Dataset ${datasetId} fully synced to Supabase Postgres.`);
}

main().catch((err) => {
  console.error('\x1b[31m[FATAL]\x1b[0m', err);
  process.exit(1);
});

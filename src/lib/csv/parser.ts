import Papa from 'papaparse';
import { TelemetryRow } from '@/types/telemetry';

export interface ParseResult {
  rows: TelemetryRow[];
  headers: string[];
  totalRows: number;
  rejectedRows: number;
  errors: string[];
}

/**
 * Parses numeric value strictly, preserving 0 as valid number,
 * converting empty/whitespace strings to null, and rejecting NaNs.
 */
export function parseNumericCell(val: any): number | null {
  if (val === null || val === undefined) return null;
  if (typeof val === 'number') {
    return Number.isFinite(val) ? val : null;
  }
  const str = String(val).trim();
  if (str === '' || str.toLowerCase() === 'null' || str.toLowerCase() === 'nan') {
    return null;
  }
  const num = Number(str);
  return Number.isFinite(num) ? num : null;
}

/**
 * Parses CSV content into typed rows while preserving all raw attributes.
 */
export function parseTelemetryCsv(csvContent: string): ParseResult {
  const errors: string[] = [];
  let rejectedRows = 0;

  const parsed = Papa.parse<Record<string, any>>(csvContent, {
    header: true,
    skipEmptyLines: 'greedy',
    transformHeader: (h) => h.trim(),
  });

  if (parsed.errors && parsed.errors.length > 0) {
    for (const err of parsed.errors) {
      errors.push(`Row ${err.row}: ${err.message}`);
    }
  }

  const rows: TelemetryRow[] = [];
  const headers = parsed.meta.fields || [];

  parsed.data.forEach((rawRow, idx) => {
    const rowNum = idx + 1;
    const eventIdRaw = rawRow['event_id'];
    if (!eventIdRaw) {
      rejectedRows++;
      errors.push(`Row ${rowNum}: missing required 'event_id'`);
      return;
    }

    const event_id = String(eventIdRaw).trim();

    // Preserve all raw attributes, transforming cells appropriately
    const attributes: Record<string, any> = {};
    for (const [key, value] of Object.entries(rawRow)) {
      if (value === null || value === undefined || String(value).trim() === '') {
        attributes[key] = null;
      } else {
        const num = Number(value);
        attributes[key] = !isNaN(num) && String(value).trim() !== '' ? num : String(value).trim();
      }
    }

    // Extract core fields strictly
    const time_to_tca = parseNumericCell(rawRow['time_to_tca']);
    const miss_distance = parseNumericCell(rawRow['miss_distance']);
    const relative_speed = parseNumericCell(rawRow['relative_speed']);
    const relative_position_r = parseNumericCell(rawRow['relative_position_r']);
    const relative_position_t = parseNumericCell(rawRow['relative_position_t']);
    const relative_position_n = parseNumericCell(rawRow['relative_position_n']);
    const relative_velocity_r = parseNumericCell(rawRow['relative_velocity_r']);
    const relative_velocity_t = parseNumericCell(rawRow['relative_velocity_t']);
    const relative_velocity_n = parseNumericCell(rawRow['relative_velocity_n']);
    const c_sigma_r = parseNumericCell(rawRow['c_sigma_r']);
    const t_sigma_r = parseNumericCell(rawRow['t_sigma_r']);
    const max_risk_estimate = parseNumericCell(rawRow['max_risk_estimate']);
    const risk = parseNumericCell(rawRow['risk']);
    const F10 = parseNumericCell(rawRow['F10']);
    const AP = parseNumericCell(rawRow['AP']);
    const c_object_type = rawRow['c_object_type'] ? String(rawRow['c_object_type']).trim() : null;
    const mission_id = rawRow['mission_id'] ? String(rawRow['mission_id']).trim() : null;

    rows.push({
      ...attributes,
      event_id,
      time_to_tca,
      miss_distance,
      relative_speed,
      relative_position_r,
      relative_position_t,
      relative_position_n,
      relative_velocity_r,
      relative_velocity_t,
      relative_velocity_n,
      c_sigma_r,
      t_sigma_r,
      max_risk_estimate,
      risk,
      F10,
      AP,
      c_object_type,
      mission_id,
      _source_row_number: rowNum,
    });
  });

  return {
    rows,
    headers,
    totalRows: rows.length,
    rejectedRows,
    errors: errors.slice(0, 20),
  };
}

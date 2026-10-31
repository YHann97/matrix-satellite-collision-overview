import { hashString } from '@/lib/geo/displayPositions';

const DEG = Math.PI / 180;
const EARTH_RADIUS_KM = 6371;

export interface OrbitDisplay {
  lat: number;
  lon: number;
  altitude_km: number;
  inclination_deg: number;
  debris_inclination_deg: number | null;
  debris_apogee_km: number | null;
  debris_perigee_km: number | null;
}

const num = (v: unknown): number | null => {
  const n = typeof v === 'number' ? v : v === null || v === undefined || v === '' ? NaN : Number(v);
  return Number.isFinite(n) ? n : null;
};

const GOLDEN_ANGLE = 137.50776;

/** Stable per-mission number: the mission id itself when numeric, otherwise a hash of it. */
function missionIndex(missionId: string | null | undefined): number {
  const n = Number(missionId);
  return Number.isFinite(n) ? n : hashString(`m:${missionId ?? ''}`);
}

/**
 * Right ascension of the ascending node is not in the dataset, so each mission's orbit plane gets an
 * assumed RAAN. Golden-angle spacing keeps different missions' planes well apart, so every mission
 * has a visibly distinct orbit. Inclination and altitude are real.
 */
export function missionRaan(missionId: string | null | undefined): number {
  return (missionIndex(missionId) * GOLDEN_ANGLE) % 360;
}

/** Distinct, stable colour per mission (used for its orbit ring and legend). */
export function missionColor(missionId: string | null | undefined): string {
  const hue = (missionIndex(missionId) * GOLDEN_ANGLE + 200) % 360;
  return `hsl(${hue.toFixed(0)}, 75%, 62%)`;
}

/** Sub-satellite point of a circular orbit (inclination, RAAN) at argument of latitude u (radians). */
export function orbitPoint(inclinationDeg: number, raanDeg: number, u: number): { lat: number; lon: number } {
  const inc = inclinationDeg * DEG;
  const lat = Math.asin(Math.sin(inc) * Math.sin(u)) / DEG;
  let lon = raanDeg + Math.atan2(Math.cos(inc) * Math.sin(u), Math.cos(u)) / DEG;
  lon = ((lon % 360) + 360) % 360;
  return { lat, lon };
}

/**
 * Display position from real orbit data: altitude from the target's apogee/perigee, the orbit plane from
 * its inclination, and the point along the orbit from its geocentric latitude at TCA.
 * Not real: the orbit's RAAN, the ascending/descending branch, and a +-2 deg spread so
 * encounters at the same latitude do not stack on one pixel.
 * Returns null if the row has no usable orbit data.
 */
export function orbitDisplayFromRow(
  row: Record<string, any>,
  eventId: string,
  missionId: string | null | undefined
): OrbitDisplay | null {
  const inc = num(row.t_j2k_inc);
  const apo = num(row.t_h_apo);
  const per = num(row.t_h_per);
  const sma = num(row.t_j2k_sma);
  const lat = num(row.geocentric_latitude);
  if (inc === null || lat === null) return null;

  const altitude = apo !== null && per !== null ? (apo + per) / 2 : sma !== null ? sma - EARTH_RADIUS_KM : null;
  if (altitude === null) return null;

  const sinInc = Math.sin(inc * DEG);
  if (Math.abs(sinInc) < 1e-6) return null;
  const s = Math.max(-1, Math.min(1, Math.sin(lat * DEG) / sinInc));
  const u0 = Math.asin(s);

  const h = hashString(eventId);
  const u = (h % 2 === 0 ? u0 : Math.PI - u0) + (((h >> 1) % 1000) / 1000 - 0.5) * 4 * DEG;

  const p = orbitPoint(inc, missionRaan(missionId), u);
  return {
    lat: Math.round(p.lat * 1e4) / 1e4,
    lon: Math.round(p.lon * 1e4) / 1e4,
    altitude_km: Math.round(altitude * 10) / 10,
    inclination_deg: Math.round(inc * 100) / 100,
    debris_inclination_deg: num(row.c_j2k_inc),
    debris_apogee_km: num(row.c_h_apo),
    debris_perigee_km: num(row.c_h_per),
  };
}

/**
 * Orbit plane of the other object (debris) through an encounter point.
 * Both objects are at the same place at TCA, so the debris orbit must pass through (lat, lon):
 * its inclination is real, its RAAN is solved so the ring crosses the encounter point.
 */
export function debrisRaan(debrisInclinationDeg: number, lat: number, lon: number, eventId: string): number {
  const inc = debrisInclinationDeg * DEG;
  const sinInc = Math.sin(inc);
  if (Math.abs(sinInc) < 1e-6) return lon;
  const u0 = Math.asin(Math.max(-1, Math.min(1, Math.sin(lat * DEG) / sinInc)));
  const u = hashString(`c:${eventId}`) % 2 === 0 ? u0 : Math.PI - u0;
  const lonOnOrbit = Math.atan2(Math.cos(inc) * Math.sin(u), Math.cos(u)) / DEG;
  return (((lon - lonOnOrbit) % 360) + 360) % 360;
}

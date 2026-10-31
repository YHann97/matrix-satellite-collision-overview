/**
 * Deterministic pseudo-random number generator using a string seed.
 * Generates stable positions for illustrative display purposes only.
 */
function hashString(str: string): number {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash) + str.charCodeAt(i);
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash);
}

/**
 * Returns deterministic latitude, longitude, and altitude for display.
 * Clusters satellites into 3 realistic orbital inclination bands:
 * - ISS / LEO band: ~51.6 deg inclination
 * - Sun-synchronous / Polar band: ~97-98 deg inclination
 * - Mid-inclination band: ~28.5 deg inclination
 */
export function getSimulatedCoordinates(eventId: string): {
  lat: number;
  lon: number;
  altitude_km: number;
} {
  const seed = hashString(eventId);
  
  // Select orbital band
  const bandIndex = seed % 3;
  let inclination = 51.6;
  if (bandIndex === 1) inclination = 98.0;
  if (bandIndex === 2) inclination = 28.5;

  // True anomaly / orbital phase: 0 to 2*PI
  const phase = ((seed * 17) % 1000) / 1000 * Math.PI * 2;
  
  // Ascending node longitude: -180 to 180
  const raan = (((seed * 31) % 360) - 180);

  // Compute sub-satellite latitude & longitude based on inclination and phase
  const latRad = Math.asin(Math.sin((inclination * Math.PI) / 180) * Math.sin(phase));
  const lat = (latRad * 180) / Math.PI;
  
  // Projected longitude with RAAN offset
  let lon = (raan + Math.atan2(
    Math.cos((inclination * Math.PI) / 180) * Math.sin(phase),
    Math.cos(phase)
  ) * (180 / Math.PI)) % 360;
  if (lon > 180) lon -= 360;
  if (lon < -180) lon += 360;

  // Altitude in Low Earth Orbit (LEO): 400km - 850km
  const altitude_km = 450 + (seed % 400);

  return {
    lat: Math.round(lat * 10000) / 10000,
    lon: Math.round(lon * 10000) / 10000,
    altitude_km,
  };
}

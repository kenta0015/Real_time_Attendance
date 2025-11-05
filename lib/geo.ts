export function haversineMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const R = 6371000; // meters
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c);
}

export function isWithinWindow(
  now: number,
  startUtcISO: string,
  endUtcISO: string,
  windowMinutes: number
): boolean {
  const start = new Date(startUtcISO).getTime();
  const end = new Date(endUtcISO).getTime();
  const w = windowMinutes * 60 * 1000;
  return now >= start - w && now <= end + w;
}

export function accuracyThreshold(radiusM: number): number {
  return Math.max(50, radiusM * 2);
}





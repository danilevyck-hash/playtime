// Distancia entre dos coordenadas (haversine), en metros. La calcula el
// SERVIDOR al marcar: el teléfono solo manda lat/lng.
const R = 6_371_000;
const rad = (g: number) => (g * Math.PI) / 180;

export function distanciaM(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export const RADIO_BODEGA_M = 150;

/** «a 40 m» / «a 2.3 km» (en Panamá el decimal va con punto) — para decirle al colaborador a cuánto está. */
export function rotuloDistancia(m: number): string {
  return m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toLocaleString('es-PA', { maximumFractionDigits: 1 })} km`;
}

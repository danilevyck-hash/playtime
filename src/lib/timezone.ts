/**
 * Panama-local dates. Panama is UTC-5 year-round (no DST).
 *
 * "Today"/"tomorrow" must be computed in Panama wall-clock, NOT UTC: between 7pm
 * and midnight Panama, the UTC date is already the next day, so `new Date()
 * .toISOString()` jumps a day. Shift by the offset first, then read the ISO
 * fields. Works identically in the browser and on the server (Date.now() is the
 * same epoch everywhere), so a user in another timezone still sees Panama dates.
 */
export const PANAMA_OFFSET_MS = 5 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

function panamaNow(): Date {
  return new Date(Date.now() - PANAMA_OFFSET_MS);
}

/** Today in Panama, 'YYYY-MM-DD'. */
export function panamaToday(): string {
  return panamaNow().toISOString().slice(0, 10);
}

/** Tomorrow in Panama, 'YYYY-MM-DD' (e.g. min bookable event date). */
export function panamaTomorrow(): string {
  return new Date(panamaNow().getTime() + DAY_MS).toISOString().slice(0, 10);
}

/** Current month in Panama, 'YYYY-MM'. */
export function panamaMonthKey(): string {
  return panamaNow().toISOString().slice(0, 7);
}

/**
 * Un instante leído en la pared de Panamá: la fecha 'YYYY-MM-DD', los minutos
 * enteros desde la medianoche (8:10:59 → 490) y el día de la semana (0 = domingo).
 * Es lo único que necesita la planilla; los segundos se descartan a propósito.
 */
export function panamaParts(d: Date): { fecha: string; minutos: number; diaSemana: number } {
  const p = new Date(d.getTime() - PANAMA_OFFSET_MS);
  return {
    fecha: p.toISOString().slice(0, 10),
    minutos: p.getUTCHours() * 60 + p.getUTCMinutes(),
    diaSemana: p.getUTCDay(),
  };
}

/** 'YYYY-MM-DD' + minutos de Panamá → instante UTC (para guardar una hora que escribe la Dirección). */
export function panamaToDate(fecha: string, minutos: number): Date {
  return new Date(Date.parse(`${fecha}T00:00:00Z`) + minutos * 60 * 1000 + PANAMA_OFFSET_MS);
}

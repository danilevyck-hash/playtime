/**
 * Panama-local dates. Panama is UTC-5 year-round (no DST).
 *
 * "Today"/"tomorrow" must be computed in Panama wall-clock, NOT UTC: between 7pm
 * and midnight Panama, the UTC date is already the next day, so `new Date()
 * .toISOString()` jumps a day. Shift by the offset first, then read the ISO
 * fields. Works identically in the browser and on the server (Date.now() is the
 * same epoch everywhere), so a user in another timezone still sees Panama dates.
 */
const PANAMA_OFFSET_MS = 5 * 60 * 60 * 1000;
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

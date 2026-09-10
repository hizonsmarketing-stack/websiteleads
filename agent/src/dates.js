/** Date helpers. Everything is UTC and ISO — no timezone surprises in a cron job. */

export const DAY_MS = 24 * 60 * 60 * 1000;

export function isoDate(date) {
  return new Date(date).toISOString().slice(0, 10);
}

export function addDays(date, days) {
  return new Date(new Date(date).getTime() + days * DAY_MS);
}

/**
 * Two adjacent windows ending `lagDays` before today.
 *
 * The lag matters: Search Console is two to three days behind, so a window
 * ending today is a window with a hole at the end of it, and every page looks
 * like it is decaying.
 */
export function comparisonWindows(now, { windowDays = 90, lagDays = 3 } = {}) {
  const end = addDays(now, -lagDays);
  const start = addDays(end, -windowDays + 1);
  const priorEnd = addDays(start, -1);
  const priorStart = addDays(priorEnd, -windowDays + 1);
  return {
    current: { startDate: isoDate(start), endDate: isoDate(end) },
    prior: { startDate: isoDate(priorStart), endDate: isoDate(priorEnd) },
  };
}

/** Monday of the week containing `date`, so calendar weeks line up. */
export function startOfWeek(date) {
  const d = new Date(date);
  const day = d.getUTCDay();
  const offset = day === 0 ? -6 : 1 - day;
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + offset));
}

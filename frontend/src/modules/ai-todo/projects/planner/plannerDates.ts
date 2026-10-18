/**
 * Calendar-day maths for the AI Planner. Everything is a `YYYY-MM-DD` string and is computed in UTC, so a day is
 * a day whatever the viewer's timezone or daylight-saving changes are. Ends are inclusive: a 2-week plan that
 * starts on Monday the 3rd ends on Sunday the 16th.
 */

export type DurationUnit = 'weeks' | 'months';

const DAY_MS = 86_400_000;
const AVG_MONTH_DAYS = 30.4375;

export function parseDay(iso: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) return null;
  const [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d ? date : null;
}

export function isoOf(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Today in the viewer's own calendar (not UTC), as `YYYY-MM-DD`. */
export function todayLocal(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

export function addDays(iso: string, days: number): string {
  const date = parseDay(iso);
  if (!date) return iso;
  return isoOf(new Date(date.getTime() + days * DAY_MS));
}

/** The same day-of-month `months` later; a 31st that doesn't exist there lands on the last day of that month. */
export function addMonths(iso: string, months: number): string {
  const date = parseDay(iso);
  if (!date) return iso;
  const total = date.getUTCFullYear() * 12 + date.getUTCMonth() + months;
  const year = Math.floor(total / 12);
  const month = total - year * 12;
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return isoOf(new Date(Date.UTC(year, month, Math.min(date.getUTCDate(), lastDay))));
}

/** Days from `start` to `end`, both included. 0 when either is not a date or the range runs backwards. */
export function daysBetween(start: string, end: string): number {
  const a = parseDay(start);
  const b = parseDay(end);
  if (!a || !b || b < a) return 0;
  return Math.round((b.getTime() - a.getTime()) / DAY_MS) + 1;
}

/** The last day of a plan that starts on `start` and lasts `value` weeks or months. */
export function endFromDuration(start: string, value: number, unit: DurationUnit): string {
  if (!parseDay(start) || !(value > 0)) return start;
  return unit === 'weeks' ? addDays(start, Math.round(value) * 7 - 1) : addDays(addMonths(start, Math.round(value)), -1);
}

/** The duration that best matches a start–end range, as a whole number of the given unit (at least 1). */
export function durationOf(start: string, end: string, unit: DurationUnit): number {
  const days = daysBetween(start, end);
  if (!days) return 0;
  return Math.max(1, Math.round(unit === 'weeks' ? days / 7 : days / AVG_MONTH_DAYS));
}

/** "12 weeks" / "1 week" / "5 days" / "3 months", whichever reads best for a span of days. */
export function formatSpan(days: number): string {
  if (days <= 0) return '';
  if (days < 14) return `${days} ${days === 1 ? 'day' : 'days'}`;
  if (days < 90) {
    const weeks = Math.round(days / 7);
    return `${weeks} ${weeks === 1 ? 'week' : 'weeks'}`;
  }
  const months = Math.round(days / AVG_MONTH_DAYS);
  return `${months} ${months === 1 ? 'month' : 'months'}`;
}

/** "3 Nov 2026" */
export function formatDay(iso: string, withYear = true): string {
  const date = parseDay(iso);
  if (!date) return iso;
  return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', ...(withYear ? { year: 'numeric' } : {}), timeZone: 'UTC' });
}

/** "3 Nov – 16 Nov 2026" (the year is shown once, on the end, unless the range crosses a year). */
export function formatRange(start: string, end: string): string {
  const a = parseDay(start);
  const b = parseDay(end);
  if (!a || !b) return '';
  const sameYear = a.getUTCFullYear() === b.getUTCFullYear();
  return `${formatDay(start, !sameYear)} – ${formatDay(end, true)}`;
}

export function clampDay(iso: string, min: string, max: string): string {
  return iso < min ? min : iso > max ? max : iso;
}

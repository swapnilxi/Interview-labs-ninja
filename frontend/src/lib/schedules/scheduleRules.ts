/**
 * Scheduler rules: what a schedule's "when" looks like, how it is validated, and when it next runs.
 *
 * A rule is always read in the device's LOCAL time ("every weekday at 09:00" means 09:00 wherever the phone is). The
 * server only validates and stores rules (`normalizeRule`, imported by fe-apis/todo/schedules and ported to
 * backend/modules/ai_todo/schedules/rules.py — keep the two identical, including every error text). Working out the
 * actual moments (`occurrencesBetween` and friends) happens on the device: the web engine, the Scheduler tab and the
 * Android alarm sync all use the same functions.
 */

export type ScheduleRepeat =
  'once' | 'interval' | 'daily' | 'weekdays' | 'weekly' | 'monthly' | 'cron';

export interface ScheduleRule {
  repeat: ScheduleRepeat;
  /** once: local "YYYY-MM-DDTHH:MM". */
  at?: string;
  /** daily / weekdays / weekly / monthly: local "HH:MM". */
  time?: string;
  /** weekly: 0 = Sunday … 6 = Saturday, sorted, unique. */
  days?: number[];
  /** monthly: 1-31 (a short month uses its last day). */
  day_of_month?: number;
  /** interval: minutes between runs, 15 … 10080 (a week). */
  every_minutes?: number;
  /** interval: local "YYYY-MM-DDTHH:MM" of the first run; later runs are start + k × every_minutes. */
  start?: string;
  /** cron: "minute hour day-of-month month day-of-week", standard 5 fields. */
  cron?: string;
  /** Optional last day (local "YYYY-MM-DD"), inclusive. */
  end?: string;
}

export const SCHEDULE_REPEATS: ScheduleRepeat[] = [
  'once',
  'interval',
  'daily',
  'weekdays',
  'weekly',
  'monthly',
  'cron',
];
export const MIN_INTERVAL_MINUTES = 15;
export const MAX_INTERVAL_MINUTES = 10080;

const LOCAL_DT_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

function validLocalDateTime(s: unknown): s is string {
  if (typeof s !== 'string' || !LOCAL_DT_RE.test(s)) return false;
  return validDate(s.slice(0, 10)) && TIME_RE.test(s.slice(11));
}

function validDate(s: unknown): s is string {
  if (typeof s !== 'string' || !DATE_RE.test(s)) return false;
  const [y, m, d] = s.split('-').map(Number);
  if (m < 1 || m > 12 || d < 1) return false;
  return d <= new Date(Date.UTC(y, m, 0)).getUTCDate();
}

function asInt(v: unknown): number | null {
  if (typeof v === 'boolean') return null;
  if (typeof v === 'number' && Number.isInteger(v)) return v;
  if (typeof v === 'string' && /^-?\d+$/.test(v.trim())) return Number(v.trim());
  return null;
}

// ── Cron ─────────────────────────────────────────────────────────────────────────────────────────────────────────

const CRON_BOUNDS: [number, number][] = [
  [0, 59], // minute
  [0, 23], // hour
  [1, 31], // day of month
  [1, 12], // month
  [0, 7], // day of week (0 and 7 = Sunday)
];

/** One cron field → the sorted values it allows, or null when it is malformed. */
function cronField(field: string, lo: number, hi: number): number[] | null {
  const out = new Set<number>();
  for (const part of field.split(',')) {
    const m = /^(\*|\d+(?:-\d+)?)(?:\/(\d+))?$/.exec(part);
    if (!m) return null;
    let a = lo;
    let b = hi;
    if (m[1] !== '*') {
      const [x, y] = m[1].split('-').map(Number);
      a = x;
      b = y === undefined ? (m[2] ? hi : x) : y;
    }
    const step = m[2] ? Number(m[2]) : 1;
    if (a < lo || b > hi || a > b || step < 1) return null;
    for (let v = a; v <= b; v += step) out.add(v);
  }
  return [...out].sort((x, y) => x - y);
}

export interface ParsedCron {
  minutes: number[];
  hours: number[];
  dom: number[];
  months: number[];
  dow: number[];
  domAny: boolean;
  dowAny: boolean;
}

export function parseCron(expr: string): ParsedCron | null {
  const fields = expr.trim().split(/\s+/);
  if (fields.length !== 5) return null;
  const parsed = fields.map((f, i) => cronField(f, CRON_BOUNDS[i][0], CRON_BOUNDS[i][1]));
  if (parsed.some((p) => p === null)) return null;
  const [minutes, hours, dom, months, dowRaw] = parsed as number[][];
  const dow = [...new Set(dowRaw.map((d) => (d === 7 ? 0 : d)))].sort((a, b) => a - b);
  return { minutes, hours, dom, months, dow, domAny: fields[2] === '*', dowAny: fields[4] === '*' };
}

// ── Validation (server + client; mirrored in Python) ─────────────────────────────────────────────────────────────

export type NormalizeResult =
  { rule: ScheduleRule; error?: undefined } | { rule?: undefined; error: string };

/**
 * Checks a rule and returns it in canonical form (only the keys its repeat uses, in a fixed order), or the reason it
 * is invalid. `now` (local "YYYY-MM-DDTHH:MM") fills a missing interval start; without it, a missing start is an error.
 */
export function normalizeRule(raw: unknown, now?: string | null): NormalizeResult {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw))
    return { error: 'The schedule is missing its timing.' };
  const r = raw as Record<string, unknown>;
  const repeat = r.repeat;
  if (typeof repeat !== 'string' || !SCHEDULE_REPEATS.includes(repeat as ScheduleRepeat)) {
    return { error: `repeat must be one of: ${SCHEDULE_REPEATS.join(', ')}.` };
  }
  const rule: ScheduleRule = { repeat: repeat as ScheduleRepeat };

  if (repeat === 'once') {
    if (!validLocalDateTime(r.at))
      return { error: 'A one-time schedule needs a date and time (YYYY-MM-DDTHH:MM).' };
    rule.at = r.at;
  } else if (repeat === 'interval') {
    const every = asInt(r.every_minutes);
    if (every === null || every < MIN_INTERVAL_MINUTES || every > MAX_INTERVAL_MINUTES) {
      return {
        error: 'An interval must be between 15 minutes and 7 days (every_minutes 15-10080).',
      };
    }
    const start = r.start === undefined || r.start === null || r.start === '' ? now : r.start;
    if (!validLocalDateTime(start))
      return { error: 'An interval schedule needs a start (YYYY-MM-DDTHH:MM).' };
    rule.every_minutes = every;
    rule.start = start;
  } else if (repeat === 'cron') {
    const expr = typeof r.cron === 'string' ? r.cron.trim().split(/\s+/).join(' ') : '';
    if (!parseCron(expr)) {
      return {
        error:
          'Cron needs 5 valid fields: minute hour day-of-month month day-of-week (e.g. "0 9 * * 1-5").',
      };
    }
    rule.cron = expr;
  } else {
    if (typeof r.time !== 'string' || !TIME_RE.test(r.time))
      return { error: 'Pick a time of day (HH:MM).' };
    rule.time = r.time;
    if (repeat === 'weekly') {
      const days = Array.isArray(r.days) ? r.days.map(asInt) : [];
      if (!days.length || days.some((d) => d === null || d < 0 || d > 6)) {
        return { error: 'Pick at least one day of the week (0 = Sunday … 6 = Saturday).' };
      }
      rule.days = [...new Set(days as number[])].sort((a, b) => a - b);
    } else if (repeat === 'monthly') {
      const dom = asInt(r.day_of_month);
      if (dom === null || dom < 1 || dom > 31) return { error: 'Pick a day of the month (1-31).' };
      rule.day_of_month = dom;
    }
  }

  if (r.end !== undefined && r.end !== null && r.end !== '') {
    if (!validDate(r.end)) return { error: 'The end date must be YYYY-MM-DD.' };
    if (repeat !== 'once') rule.end = r.end;
  }
  return { rule };
}

// ── Occurrences (device-side) ────────────────────────────────────────────────────────────────────────────────────

const pad = (n: number) => String(n).padStart(2, '0');

/** Local "YYYY-MM-DDTHH:MM" → Date (local). */
export function parseLocalStamp(s: string): Date {
  const [d, t] = s.split('T');
  const [y, m, day] = d.split('-').map(Number);
  const [hh, mm] = (t || '00:00').split(':').map(Number);
  return new Date(y, m - 1, day, hh, mm);
}

/** Date → local "YYYY-MM-DDTHH:MM". */
export function toLocalStamp(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function minutesOf(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

function daysInMonth(y: number, m: number): number {
  return new Date(y, m + 1, 0).getDate();
}

/** The minutes-of-day a day-based rule runs at on this local day ([] when it doesn't run that day). */
function minutesOnDay(rule: ScheduleRule, day: Date, cron: ParsedCron | null): number[] {
  const dow = day.getDay();
  switch (rule.repeat) {
    case 'daily':
      return [minutesOf(rule.time!)];
    case 'weekdays':
      return dow >= 1 && dow <= 5 ? [minutesOf(rule.time!)] : [];
    case 'weekly':
      return rule.days!.includes(dow) ? [minutesOf(rule.time!)] : [];
    case 'monthly': {
      const target = Math.min(rule.day_of_month!, daysInMonth(day.getFullYear(), day.getMonth()));
      return day.getDate() === target ? [minutesOf(rule.time!)] : [];
    }
    case 'cron': {
      if (!cron || !cron.months.includes(day.getMonth() + 1)) return [];
      const domHit = cron.dom.includes(day.getDate());
      const dowHit = cron.dow.includes(dow);
      // Vixie cron: when both day fields are restricted, either one matching is enough.
      const dayHit = cron.domAny || cron.dowAny ? domHit && dowHit : domHit || dowHit;
      if (!dayHit) return [];
      const out: number[] = [];
      for (const h of cron.hours) for (const m of cron.minutes) out.push(h * 60 + m);
      return out;
    }
    default:
      return [];
  }
}

function endLimit(rule: ScheduleRule): number {
  if (!rule.end) return Infinity;
  const [y, m, d] = rule.end.split('-').map(Number);
  return new Date(y, m - 1, d, 23, 59, 59, 999).getTime();
}

/** Every run strictly after `from` and at or before `to`, oldest first, at most `limit`. */
export function occurrencesBetween(rule: ScheduleRule, from: Date, to: Date, limit = 500): Date[] {
  const out: Date[] = [];
  const lo = from.getTime();
  const hi = Math.min(to.getTime(), endLimit(rule));
  if (hi <= lo) return out;

  if (rule.repeat === 'once') {
    const at = rule.at ? parseLocalStamp(rule.at).getTime() : NaN;
    if (at > lo && at <= hi) out.push(new Date(at));
    return out;
  }

  if (rule.repeat === 'interval') {
    if (!rule.start || !rule.every_minutes) return out;
    const anchor = parseLocalStamp(rule.start).getTime();
    const step = rule.every_minutes * 60_000;
    let k = lo < anchor ? 0 : Math.floor((lo - anchor) / step) + 1;
    for (let t = anchor + k * step; t <= hi && out.length < limit; k++, t = anchor + k * step) {
      if (t > lo) out.push(new Date(t));
    }
    return out;
  }

  const cron = rule.repeat === 'cron' && rule.cron ? parseCron(rule.cron) : null;
  if (rule.repeat === 'cron' && !cron) return out;
  const cursor = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  for (let guard = 0; guard < 1600 && cursor.getTime() <= hi && out.length < limit; guard++) {
    for (const minute of minutesOnDay(rule, cursor, cron)) {
      const at = new Date(
        cursor.getFullYear(),
        cursor.getMonth(),
        cursor.getDate(),
        Math.floor(minute / 60),
        minute % 60
      );
      const t = at.getTime();
      if (t > lo && t <= hi) {
        out.push(at);
        if (out.length >= limit) break;
      }
    }
    cursor.setDate(cursor.getDate() + 1);
  }
  return out;
}

/** The next `count` runs after `after`. */
export function nextOccurrences(rule: ScheduleRule, after: Date, count: number): Date[] {
  const horizonDays = rule.repeat === 'cron' ? 1500 : rule.repeat === 'once' ? 36500 : 400;
  return occurrencesBetween(
    rule,
    after,
    new Date(after.getTime() + horizonDays * 86_400_000),
    count
  );
}

export function nextOccurrence(rule: ScheduleRule, after: Date): Date | null {
  return nextOccurrences(rule, after, 1)[0] ?? null;
}

/** The latest run in (notBefore, now], or null. */
export function lastOccurrence(rule: ScheduleRule, now: Date, notBefore: Date): Date | null {
  const list = occurrencesBetween(rule, notBefore, now, 5000);
  return list.length ? list[list.length - 1] : null;
}

// ── Labels ───────────────────────────────────────────────────────────────────────────────────────────────────────

const WEEKDAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function clock(time: string): string {
  const [h, m] = time.split(':').map(Number);
  return new Date(2000, 0, 1, h, m).toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  });
}

function ordinal(n: number): string {
  const s = n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] || 'th';
  return `${n}${s}`;
}

export function describeInterval(minutes: number): string {
  if (minutes % 1440 === 0) return minutes === 1440 ? 'Every day' : `Every ${minutes / 1440} days`;
  if (minutes % 60 === 0) return minutes === 60 ? 'Every hour' : `Every ${minutes / 60} hours`;
  return `Every ${minutes} minutes`;
}

/** "Every weekday at 9:00 AM", "Every Mon, Wed at 6:30 PM", "Once · 21 Nov, 9:00 AM", "Cron 0 9 * * 1-5". */
export function describeRule(rule: ScheduleRule): string {
  let text: string;
  switch (rule.repeat) {
    case 'once': {
      const d = rule.at ? parseLocalStamp(rule.at) : null;
      text = d
        ? `Once · ${d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })}, ${clock(rule.at!.slice(11))}`
        : 'Once';
      break;
    }
    case 'interval':
      text = describeInterval(rule.every_minutes || 60);
      break;
    case 'daily':
      text = `Every day at ${clock(rule.time!)}`;
      break;
    case 'weekdays':
      text = `Weekdays at ${clock(rule.time!)}`;
      break;
    case 'weekly':
      text =
        rule.days && rule.days.length === 7
          ? `Every day at ${clock(rule.time!)}`
          : `Every ${(rule.days || []).map((d) => WEEKDAY_SHORT[d]).join(', ')} at ${clock(rule.time!)}`;
      break;
    case 'monthly':
      text = `Monthly on the ${ordinal(rule.day_of_month || 1)} at ${clock(rule.time!)}`;
      break;
    case 'cron':
      text = `Cron ${rule.cron}`;
      break;
    default:
      text = 'Scheduled';
  }
  if (rule.end) {
    const [y, m, d] = rule.end.split('-').map(Number);
    text += ` · until ${new Date(y, m - 1, d).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}`;
  }
  return text;
}

/**
 * Smart date recognition for task capture — the TickTick-style "type it how you'd say it" parser.
 *
 * "Remind me to call mom tomorrow at 5pm" → title "Call mom", due tomorrow, reminder tomorrow 17:00.
 *
 * Runs entirely in the browser, instantly, for guests and logged-in people alike: it is plain pattern matching, not
 * an AI call (the AI path is `todoService.voiceCapture`, used for spoken notes when logged in). Everything here is in
 * the person's LOCAL time; `reminderTime.localInputToIso` turns a result into the UTC value that is saved.
 */

export type SmartPriority = 'p1' | 'p2' | 'p3' | 'p4';
export type SmartPart = 'date' | 'time' | 'priority';

export interface SmartParseResult {
  /** The task with the date, time, priority and filler words taken out. */
  title: string;
  /** Local day the task is for (YYYY-MM-DD), or null. */
  dueDate: string | null;
  /** Local reminder time (YYYY-MM-DDTHH:MM), or null. */
  remindAt: string | null;
  /** Only when the text says so (#p1, "urgent", "low priority"…); null leaves the default. */
  priority: SmartPriority | null;
  /** The words each detected part came from, e.g. { date: 'tomorrow', time: 'at 5pm' }. */
  found: Partial<Record<SmartPart, string>>;
}

export interface SmartParseOptions {
  /** Parts the person switched off (they tapped × on the chip): those words stay in the title. */
  ignore?: ReadonlySet<SmartPart>;
}

// ── Local date helpers ────────────────────────────────────────────────────────

const pad = (n: number) => String(n).padStart(2, '0');

export function ymd(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function localStamp(d: Date): string {
  return `${ymd(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function addDays(d: Date, days: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + days);
}

function at(day: Date, h: number, m: number): Date {
  return new Date(day.getFullYear(), day.getMonth(), day.getDate(), h, m);
}

/** The next whole 5 minutes after `d` + `minutes` (reminders on round times read better). */
function roundedFromNow(d: Date, minutes: number): Date {
  const t = new Date(d.getTime() + minutes * 60_000);
  const extra = (5 - (t.getMinutes() % 5)) % 5;
  return new Date(t.getFullYear(), t.getMonth(), t.getDate(), t.getHours(), t.getMinutes() + extra);
}

// ── Vocabulary ────────────────────────────────────────────────────────────────

const WEEKDAYS: Record<string, number> = {
  sunday: 0, sun: 0,
  monday: 1, mon: 1,
  tuesday: 2, tues: 2, tue: 2,
  wednesday: 3, wed: 3,
  thursday: 4, thurs: 4, thur: 4, thu: 4,
  friday: 5, fri: 5,
  saturday: 6, sat: 6,
};

const MONTHS: Record<string, number> = {
  jan: 0, january: 0, feb: 1, february: 1, mar: 2, march: 2, apr: 3, april: 3, may: 4, jun: 5, june: 5,
  jul: 6, july: 6, aug: 7, august: 7, sep: 8, sept: 8, september: 8, oct: 9, october: 9, nov: 10, november: 10,
  dec: 11, december: 11,
};

const MONTH_RE =
  '(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sept?(?:ember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)';
const FULL_DAY_RE = '(monday|tuesday|wednesday|thursday|friday|saturday|sunday)';
const ANY_DAY_RE = '(monday|tuesday|wednesday|thursday|friday|saturday|sunday|mon|tues?|wed|thu(?:rs?)?|fri|sat|sun)';

const NUMBER_WORDS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12,
  fifteen: 15, twenty: 20, thirty: 30, forty: 40, 'forty-five': 45, fifty: 50, a: 1, an: 1,
};

const PART_OF_DAY: Record<string, [number, number]> = {
  morning: [9, 0],
  noon: [12, 0],
  lunch: [12, 30],
  afternoon: [14, 0],
  evening: [18, 0],
  night: [21, 0],
  tonight: [20, 0],
};

// Leading words that only say "this is a task": dropped from the title.
const FILLER_RE = new RegExp(
  '^\\s*(?:(?:hey|ok(?:ay)?|please|so|um+|uh+)[\\s,]+)*' +
    '(?:' +
    "(?:can|could|would) you (?:please )?remind me(?: to| about| that| of)?" +
    '|remind me(?: to| about| that| of)?' +
    "|(?:please )?don'?t (?:let me )?forget(?: to| about)?" +
    '|i (?:need|have|want|must|should|gotta|got) to' +
    '|i have got to' +
    '|(?:add|create|make|set)(?: a| an)?(?: new)? (?:task|todo|to-do|reminder)(?: to| for| that)?' +
    '|(?:new )?(?:task|todo|to-do|reminder)\\s*:' +
    '|note to self\\s*:?' +
    ')\\s*',
  'i'
);

const REMIND_ME_RE = /\b(?:remind me|reminder|don'?t (?:let me )?forget|alert me|ping me|notify me|nudge me)\b/i;

// ── Parser ────────────────────────────────────────────────────────────────────

/** Turns spoken number words before a time ("at five pm", "five o'clock") into digits. */
function normaliseSpokenTimes(text: string): string {
  const words = Object.keys(NUMBER_WORDS).filter((w) => NUMBER_WORDS[w] <= 12 && w.length > 2).join('|');
  return text
    .replace(new RegExp(`\\b(${words})(?=\\s*(?:o'?clock|a\\.?m\\.?|p\\.?m\\.?)(?:\\W|$))`, 'gi'), (w) =>
      String(NUMBER_WORDS[w.toLowerCase()])
    )
    .replace(new RegExp(`\\b(at|by|around)\\s+(${words})\\b`, 'gi'), (_m, prep: string, w: string) =>
      `${prep} ${NUMBER_WORDS[w.toLowerCase()]}`
    );
}

interface Cursor {
  text: string;
  found: Partial<Record<SmartPart, string>>;
}

/** Removes the first match of `re` from the working text and returns it (or null). */
function take(cursor: Cursor, re: RegExp): RegExpExecArray | null {
  const m = re.exec(cursor.text);
  if (!m) return null;
  cursor.text = `${cursor.text.slice(0, m.index)} ${cursor.text.slice(m.index + m[0].length)}`;
  return m;
}

function remember(cursor: Cursor, part: SmartPart, words: string) {
  const clean = words.trim();
  cursor.found[part] = cursor.found[part] ? `${cursor.found[part]} ${clean}` : clean;
}

function nextWeekday(today: Date, weekday: number, mode: 'plain' | 'this' | 'next'): Date {
  let diff = (weekday - today.getDay() + 7) % 7;
  if (mode === 'this') return addDays(today, diff);
  if (diff === 0) diff = 7;
  let target = addDays(today, diff);
  if (mode === 'next') {
    // "next Friday" said on a Wednesday means the Friday of next week, not the one two days away.
    const mondayOf = (d: Date) => addDays(d, -((d.getDay() + 6) % 7)).getTime();
    if (mondayOf(target) === mondayOf(today)) target = addDays(target, 7);
  }
  return target;
}

function dateFromDayMonth(today: Date, day: number, month: number): Date | null {
  if (day < 1 || day > 31) return null;
  let candidate = new Date(today.getFullYear(), month, day);
  if (candidate.getMonth() !== month) return null; // 31 Feb
  if (candidate < startOfDay(today)) candidate = new Date(today.getFullYear() + 1, month, day);
  return candidate;
}

/** Hour for a bare "at 5" with no am/pm: 1–6 read as afternoon, 7–11 as morning, 12 as noon. */
function guessHour(h: number): number {
  if (h >= 13) return h;
  if (h === 12) return 12;
  return h <= 6 ? h + 12 : h;
}

export function smartParse(input: string, now: Date = new Date(), options: SmartParseOptions = {}): SmartParseResult {
  const ignore = options.ignore ?? new Set<SmartPart>();
  const original = input.trim();
  const cursor: Cursor = { text: normaliseSpokenTimes(original), found: {} };
  const today = startOfDay(now);
  const wantsReminder = REMIND_ME_RE.test(original);

  cursor.text = cursor.text.replace(FILLER_RE, '');

  // ── Priority ──
  let priority: SmartPriority | null = null;
  if (!ignore.has('priority')) {
    const rules: [RegExp, SmartPriority][] = [
      [/(?:^|\s)#p([1-4])\b/i, 'p1'],
      [/\b(?:urgent(?:ly)?|asap|a\.s\.a\.p\.?|immediately|right away|top priority|critical)\b/i, 'p1'],
      [/(?:^|\s)!!!(?=\s|$)/, 'p1'],
      [/\b(?:high(?:est)? priority|important)\b/i, 'p2'],
      [/(?:^|\s)!!(?=\s|$)/, 'p2'],
      [/\b(?:low priority|no rush|whenever|someday|some day)\b/i, 'p4'],
    ];
    for (const [re, level] of rules) {
      const m = take(cursor, re);
      if (!m) continue;
      priority = re.source.includes('#p') ? (`p${m[1]}` as SmartPriority) : level;
      remember(cursor, 'priority', m[0]);
      break;
    }
  }

  // ── Relative moment: "in 20 minutes", "in 2 hours", "in 3 days" ──
  let moment: Date | null = null; // an exact reminder time
  let day: Date | null = null; // a due day
  let time: [number, number] | null = null; // a time of day, with or without a day
  let bareHour: { h: number; m: number } | null = null; // "at 5": am/pm decided once the day is known

  if (!ignore.has('time') || !ignore.has('date')) {
    const half = /\bin\s+(?:a\s+)?half\s+(?:an?\s+)?hour\b/i;
    const rel = new RegExp(
      `\\bin\\s+(\\d+(?:\\.\\d+)?|${Object.keys(NUMBER_WORDS).join('|')})\\s*(minutes?|mins?|hours?|hrs?|h|days?|weeks?)\\b`,
      'i'
    );
    const halfMatch = !ignore.has('time') ? take(cursor, half) : null;
    if (halfMatch) {
      moment = new Date(now.getTime() + 30 * 60_000);
      remember(cursor, 'time', halfMatch[0]);
    } else {
      const probe = rel.exec(cursor.text);
      if (probe) {
        const amount = Number.isNaN(Number(probe[1])) ? NUMBER_WORDS[probe[1].toLowerCase()] : Number(probe[1]);
        const unit = probe[2].toLowerCase();
        const isClock = /^(m|h)/.test(unit);
        if (isClock && !ignore.has('time')) {
          take(cursor, rel);
          moment = new Date(now.getTime() + amount * (unit.startsWith('h') ? 3_600_000 : 60_000));
          remember(cursor, 'time', probe[0]);
        } else if (!isClock && !ignore.has('date')) {
          take(cursor, rel);
          day = addDays(today, Math.round(amount * (unit.startsWith('w') ? 7 : 1)));
          remember(cursor, 'date', probe[0]);
        }
      }
    }
  }

  // ── Day ──
  if (!ignore.has('date') && !day && !moment) {
    const dayRules: [RegExp, (m: RegExpExecArray) => Date | null, ([number, number] | null)?][] = [
      [/\b(?:the\s+)?day\s+after\s+tomorrow\b/i, () => addDays(today, 2)],
      [/\b(?:tomorrow|tomorow|tmrw|tmr)\b/i, () => addDays(today, 1)],
      [/\btonight\b/i, () => today, PART_OF_DAY.tonight],
      [/\b(?:by\s+)?(?:eod|end\s+of\s+(?:the\s+)?day)\b/i, () => today, [18, 0]],
      [/\btoday\b/i, () => today],
      [/\b(?:by\s+)?(?:the\s+)?end\s+of\s+(?:the\s+|this\s+)?week\b/i, () => nextWeekday(today, 5, 'this')],
      [/\b(?:this\s+|next\s+)?weekend\b/i, (m) => nextWeekday(today, 6, /next/i.test(m[0]) ? 'next' : 'this')],
      [/\bnext\s+week\b/i, () => nextWeekday(today, 1, 'plain')],
      [/\bnext\s+month\b/i, () => new Date(today.getFullYear(), today.getMonth() + 1, today.getDate())],
      [/\b(\d{4})-(\d{2})-(\d{2})\b/, (m) => {
        const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
        return d.getMonth() === Number(m[2]) - 1 ? d : null;
      }],
      [new RegExp(`\\b(?:on\\s+)?(?:the\\s+)?(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:of\\s+)?${MONTH_RE}\\b`, 'i'), (m) =>
        dateFromDayMonth(today, Number(m[1]), MONTHS[m[2].toLowerCase()])],
      [new RegExp(`\\b(?:on\\s+)?${MONTH_RE}\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b`, 'i'), (m) =>
        dateFromDayMonth(today, Number(m[2]), MONTHS[m[1].toLowerCase()])],
      [/\bon\s+the\s+(\d{1,2})(?:st|nd|rd|th)\b/i, (m) => {
        const n = Number(m[1]);
        let d = new Date(today.getFullYear(), today.getMonth(), n);
        if (d.getDate() !== n) return null;
        if (d < today) d = new Date(today.getFullYear(), today.getMonth() + 1, n);
        return d.getDate() === n ? d : null;
      }],
      [new RegExp(`\\b(this|next|coming|on|by)\\s+${ANY_DAY_RE}\\b`, 'i'), (m) => {
        const mode = m[1].toLowerCase() === 'next' ? 'next' : m[1].toLowerCase() === 'this' ? 'this' : 'plain';
        return nextWeekday(today, WEEKDAYS[m[2].toLowerCase()], mode);
      }],
      [new RegExp(`\\b${FULL_DAY_RE}\\b`, 'i'), (m) => nextWeekday(today, WEEKDAYS[m[1].toLowerCase()], 'plain')],
    ];
    for (const [re, resolve, impliedTime] of dayRules) {
      const probe = re.exec(cursor.text);
      if (!probe) continue;
      const resolved = resolve(probe);
      if (!resolved) continue;
      take(cursor, re);
      day = resolved;
      remember(cursor, 'date', probe[0]);
      if (impliedTime && !ignore.has('time')) time = impliedTime;
      break;
    }
  }

  // ── Time of day ──
  if (!ignore.has('time') && !moment) {
    const ampm = /\b(?:at|@|by|around|before)?\s*(\d{1,2})(?::|\.)?(\d{2})?\s*(a\.?\s?m\.?|p\.?\s?m\.?)(?=\W|$)/i;
    const h24 = /\b(?:at|@|by|around|before)?\s*([01]?\d|2[0-3]):([0-5]\d)\b/i;
    const bare = /\b(?:at|@|by|around)\s+(\d{1,2})(?:\s*o'?clock)?\b(?!\s*(?:%|st|nd|rd|th|min|mins|minutes|hours?|hrs|days?|weeks?|people|pages?|km|kg))/i;
    const oclock = /\b(\d{1,2})\s*o'?clock\b/i;
    const named = /\b(?:at\s+)?(noon|midday|midnight)\b/i;
    const part = /\b(?:in\s+the\s+|this\s+|tomorrow\s+|at\s+)?(morning|afternoon|evening|night|lunch(?:time)?)\b/i;

    let m: RegExpExecArray | null;
    if ((m = take(cursor, ampm))) {
      let h = Number(m[1]) % 12;
      if (/p/i.test(m[3])) h += 12;
      const mins = m[2] ? Number(m[2]) : 0;
      if (Number(m[1]) <= 12 && mins < 60) {
        time = [h, mins];
        remember(cursor, 'time', m[0]);
      }
    } else if ((m = take(cursor, h24))) {
      time = [Number(m[1]), Number(m[2])];
      remember(cursor, 'time', m[0]);
    } else if ((m = take(cursor, named))) {
      time = m[1].toLowerCase() === 'midnight' ? [23, 59] : [12, 0];
      remember(cursor, 'time', m[0]);
    } else if ((m = take(cursor, bare)) || (m = take(cursor, oclock))) {
      const h = Number(m[1]);
      if (h >= 0 && h <= 23) {
        bareHour = { h, m: 0 };
        remember(cursor, 'time', m[0]);
      }
    }
    // A part of the day sets the time only when no clock time was said ("tomorrow evening"), and settles a bare
    // hour's am/pm ("at 8 in the evening").
    const pm = part.exec(cursor.text);
    if (pm) {
      const key = pm[1].toLowerCase().startsWith('lunch') ? 'lunch' : pm[1].toLowerCase();
      const [ph, pmin] = PART_OF_DAY[key];
      take(cursor, part);
      remember(cursor, 'time', pm[0]);
      if (bareHour) {
        const afternoonish = ph >= 12;
        let h = bareHour.h % 12;
        if (afternoonish) h += 12;
        time = [h, bareHour.m];
        bareHour = null;
      } else if (!time) {
        time = [ph, pmin];
      }
    }
  }

  // ── Put it together ──
  let remindAt: Date | null = moment;
  if (!remindAt && bareHour) {
    if (day) {
      remindAt = at(day, guessHour(bareHour.h), bareHour.m);
    } else {
      // No day: the nearest future reading of the hour, today or tomorrow ("at 10" said at 9 pm → 10 pm).
      const candidates = bareHour.h >= 12 ? [bareHour.h] : [bareHour.h, bareHour.h + 12];
      const upcoming = candidates.map((h) => at(today, h, bareHour!.m)).filter((d) => d > now);
      remindAt = upcoming.length ? upcoming[0] : at(addDays(today, 1), guessHour(bareHour.h), bareHour.m);
    }
  }
  if (!remindAt && time) {
    if (day) remindAt = at(day, time[0], time[1]);
    else {
      const todayAt = at(today, time[0], time[1]);
      remindAt = todayAt > now ? todayAt : at(addDays(today, 1), time[0], time[1]);
    }
  }
  if (!remindAt && wantsReminder && !ignore.has('time')) {
    // "Remind me…" with no time: 9:00 on the day, or an hour from now when that day is today (or no day was said).
    if (day && day > today) remindAt = at(day, 9, 0);
    else remindAt = roundedFromNow(now, 60);
  }

  const dueDay = day ?? (remindAt ? startOfDay(remindAt) : null);

  return {
    title: tidyTitle(cursor.text) || original,
    dueDate: dueDay ? ymd(dueDay) : null,
    remindAt: remindAt ? localStamp(remindAt) : null,
    priority,
    found: cursor.found,
  };
}

const EDGE_WORDS = '(?:to|on|at|by|for|in|the|and|from|around|before|this|next|until|till|due|starting)';

function tidyTitle(text: string): string {
  let t = text
    .replace(/\b(?:and\s+|please\s+)?(?:remind me|ping me|alert me|notify me|nudge me)(?:\s+(?:about|of)\s+(?:it|this|that))?\b/gi, ' ')
    .replace(/\s+/g, ' ').replace(/\s+([,.!?;:])/g, '$1').trim();
  let previous = '';
  while (previous !== t) {
    previous = t;
    t = t
      .replace(new RegExp(`^${EDGE_WORDS}\\b\\s*`, 'i'), '')
      .replace(new RegExp(`\\s*\\b${EDGE_WORDS}$`, 'i'), '')
      .replace(/^[,.;:\-–—\s]+|[,;:\-–—\s]+$/g, '')
      .trim();
  }
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : '';
}

/**
 * Splits a dictated note into separate tasks on explicit breaks only (new lines, ";", "and then", "also"), so
 * "buy bread and milk" stays one task. The AI path splits more cleverly; this is the offline fallback.
 */
export function splitNote(text: string): string[] {
  return text
    .split(/\n+|;\s*|\s*,?\s+and\s+then\s+|\s*[,.]\s+also\s+|\.\s+(?=[A-Z])/)
    .map((s) => s.replace(/^(?:also|and)\s+/i, '').trim())
    .filter((s) => s.length > 1);
}

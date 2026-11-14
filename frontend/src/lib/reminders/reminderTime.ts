/**
 * Reminder time helpers: local ↔ saved (UTC) conversion, human labels, quick presets and calendar export.
 *
 * A task's `remind_at` is saved as UTC ISO 8601 (`2026-11-15T11:30:00.000Z`) so every device and the server agree on
 * the moment; everything shown to the person is in their local time.
 */

import { localStamp, ymd } from './smartParse';

const pad = (n: number) => String(n).padStart(2, '0');

/** "YYYY-MM-DDTHH:MM" in local time (a parser result, a datetime-local input) → the UTC ISO string that is saved. */
export function localInputToIso(local: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(local);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]));
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** A saved reminder → the value a `<input type="datetime-local">` expects. */
export function isoToLocalInput(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : localStamp(d);
}

function dayDiff(d: Date, now: Date): number {
  const a = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const b = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  return Math.round((a - b) / 86_400_000);
}

export function formatClock(d: Date): string {
  return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

/** "Today", "Tomorrow", "Yesterday", "Fri", "21 Nov", "21 Nov 2027". */
export function formatDayLabel(d: Date, now: Date = new Date()): string {
  const diff = dayDiff(d, now);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  if (diff === -1) return 'Yesterday';
  if (diff > 1 && diff < 7) return d.toLocaleDateString(undefined, { weekday: 'short' });
  const sameYear = d.getFullYear() === now.getFullYear();
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', ...(sameYear ? {} : { year: 'numeric' }) });
}

/** A saved reminder as "Today, 5:00 PM" / "Fri, 9:00 AM". */
export function formatReminder(iso: string | null | undefined, now: Date = new Date()): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${formatDayLabel(d, now)}, ${formatClock(d)}`;
}

/** A local parser stamp ("YYYY-MM-DDTHH:MM") as "Tomorrow, 5:00 PM". */
export function formatLocalStamp(local: string | null | undefined, now: Date = new Date()): string {
  const iso = local ? localInputToIso(local) : null;
  return iso ? formatReminder(iso, now) : '';
}

/** A due date (YYYY-MM-DD) as "Today" / "Fri" / "21 Nov". */
export function formatDueDate(dueDate: string | null | undefined, now: Date = new Date()): string {
  if (!dueDate) return '';
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(dueDate);
  if (!m) return '';
  return formatDayLabel(new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])), now);
}

export function isPast(iso: string | null | undefined, now: Date = new Date()): boolean {
  if (!iso) return false;
  const t = Date.parse(iso);
  return !Number.isNaN(t) && t <= now.getTime();
}

export interface ReminderPreset {
  id: string;
  label: string;
  /** Saved value (UTC ISO). */
  iso: string;
  /** Short local time, shown next to the label. */
  hint: string;
}

/** The quick choices in every reminder menu. Ones already in the past are left out. */
export function reminderPresets(now: Date = new Date()): ReminderPreset[] {
  const make = (id: string, label: string, d: Date): ReminderPreset => ({
    id,
    label,
    iso: d.toISOString(),
    hint: dayDiffLabel(d, now),
  });
  const inOneHour = new Date(now.getTime() + 60 * 60_000);
  inOneHour.setMinutes(Math.ceil(inOneHour.getMinutes() / 5) * 5, 0, 0);
  const evening = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 18, 0);
  const tomorrowMorning = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 9, 0);
  const daysToMonday = ((8 - now.getDay()) % 7) || 7;
  const nextMonday = new Date(now.getFullYear(), now.getMonth(), now.getDate() + daysToMonday, 9, 0);
  const list = [make('hour', 'In 1 hour', inOneHour)];
  if (evening.getTime() - now.getTime() > 45 * 60_000) list.push(make('evening', 'This evening', evening));
  list.push(make('tomorrow', 'Tomorrow morning', tomorrowMorning));
  list.push(make('next-week', 'Next week', nextMonday));
  return list;
}

function dayDiffLabel(d: Date, now: Date): string {
  const diff = dayDiff(d, now);
  if (diff === 0) return formatClock(d);
  return `${formatDayLabel(d, now)} ${formatClock(d)}`;
}

/** Snooze choices for a reminder that just went off. */
export function snoozeOptions(now: Date = new Date()): ReminderPreset[] {
  const plus = (minutes: number) => new Date(now.getTime() + minutes * 60_000);
  const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 9, 0);
  return [
    { id: '10m', label: '10 minutes', iso: plus(10).toISOString(), hint: formatClock(plus(10)) },
    { id: '1h', label: '1 hour', iso: plus(60).toISOString(), hint: formatClock(plus(60)) },
    { id: 'tomorrow', label: 'Tomorrow', iso: tomorrow.toISOString(), hint: `${formatClock(tomorrow)}` },
  ];
}

// ── Calendar export: the reminder reaches the phone even when this app is closed ──────────────────────────────

interface CalendarTask {
  id: number | string;
  title: string;
  remind_at?: string | null;
  due_date?: string | null;
  context?: string | null;
}

function icsStamp(d: Date): string {
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;
}

function icsText(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/([,;])/g, '\\$1');
}

/** When the calendar entry should start: the reminder, else 9:00 on the due date. */
function calendarStart(task: CalendarTask): Date | null {
  if (task.remind_at) {
    const d = new Date(task.remind_at);
    if (!Number.isNaN(d.getTime())) return d;
  }
  if (task.due_date) {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(task.due_date);
    if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 9, 0);
  }
  return null;
}

export function canAddToCalendar(task: CalendarTask): boolean {
  return calendarStart(task) !== null;
}

/** An .ics event with an alarm at the start time (Apple Calendar, Outlook, Google Calendar import). */
export function buildIcs(task: CalendarTask): string | null {
  const start = calendarStart(task);
  if (!start) return null;
  const end = new Date(start.getTime() + 15 * 60_000);
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//LabNinja//AI To-Do//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:task-${task.id}-${start.getTime()}@labninja`,
    `DTSTAMP:${icsStamp(new Date())}`,
    `DTSTART:${icsStamp(start)}`,
    `DTEND:${icsStamp(end)}`,
    `SUMMARY:${icsText(task.title)}`,
    ...(task.context ? [`DESCRIPTION:${icsText(task.context)}`] : []),
    'BEGIN:VALARM',
    'ACTION:DISPLAY',
    `DESCRIPTION:${icsText(task.title)}`,
    'TRIGGER:PT0M',
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ];
  return lines.join('\r\n');
}

export function downloadIcs(task: CalendarTask): boolean {
  const ics = buildIcs(task);
  if (!ics) return false;
  const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const safe = task.title.replace(/[^\w\- ]+/g, '').trim().slice(0, 40) || 'reminder';
  a.download = `${safe}.ics`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return true;
}

/** Google Calendar's "new event" page, pre-filled (Android phones open it in the Calendar app). */
export function googleCalendarUrl(task: CalendarTask): string | null {
  const start = calendarStart(task);
  if (!start) return null;
  const end = new Date(start.getTime() + 15 * 60_000);
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: task.title,
    dates: `${icsStamp(start)}/${icsStamp(end)}`,
    details: task.context ? `${task.context}\n\nAdded from LabNinja AI To-Do` : 'Added from LabNinja AI To-Do',
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

export { ymd, localStamp };

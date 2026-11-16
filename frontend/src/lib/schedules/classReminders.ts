/**
 * Practice reminders for an AI LMS class ("remind me to practise the AI class at 18:30").
 *
 * A class reminder is an ordinary Scheduler reminder (lib/services/scheduleService.ts), so it runs where every
 * reminder runs: the web engine while LabNinja is open in a browser tab, and native alarms in the Android app even
 * when it is closed. There is deliberately no server cron. It also lists in the To-Do Scheduler tab like any other.
 *
 * What makes it a *class* reminder is one marker in the schedule's `source_text` field, `lms-class:<slug>` (that
 * field only records the sentence a schedule was made from; nothing else reads it). Everything that knows about the
 * marker is in this file. The rest of the app asks `classSlugOf(schedule)` or `scheduleTargetHref(schedule)`
 * (nativeScheduler.ts), and the Scheduler editor hides the marker through `visibleSourceText`.
 */

import { scheduleService, type Schedule } from '@/lib/services/scheduleService';
import { normalizeRule, type ScheduleRule } from '@/lib/schedules/scheduleRules';

export const CLASS_REMINDER_PREFIX = 'lms-class:';
/** One class can have a few practice times a day (one schedule each), not a calendar's worth. */
export const MAX_PRACTICE_TIMES = 3;

const SLUG_RE = /^[a-z0-9-]{1,80}$/;
const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;
const TITLE_MAX = 120;
const REPEATS: readonly string[] = ['daily', 'weekdays', 'weekly'];

export type PracticeRepeat = 'daily' | 'weekdays' | 'weekly';

/** What the class reminders dialog edits. `message: ''` means the default text. */
export interface PracticeSettings {
  /** Local "HH:MM", one to MAX_PRACTICE_TIMES, each its own schedule. */
  times: string[];
  repeat: PracticeRepeat;
  /** Weekly only: 0 = Sunday … 6 = Saturday. */
  days: number[];
  message: string;
}

export const DEFAULT_PRACTICE: PracticeSettings = {
  times: ['18:00'],
  repeat: 'daily',
  days: [1, 3, 5],
  message: '',
};

/** A class slug the marker can carry (letters a-z, digits, hyphens). Others get no reminder button. */
export function isReminderSlug(slug: string): boolean {
  return SLUG_RE.test(slug);
}

export function classReminderMarker(slug: string): string {
  return `${CLASS_REMINDER_PREFIX}${slug}`;
}

/** The class a schedule reminds about, or null when it is not a class reminder. */
export function classSlugOf(schedule: Pick<Schedule, 'kind' | 'source_text'>): string | null {
  if (schedule.kind !== 'reminder' || !schedule.source_text?.startsWith(CLASS_REMINDER_PREFIX)) return null;
  const slug = schedule.source_text.slice(CLASS_REMINDER_PREFIX.length);
  return SLUG_RE.test(slug) ? slug : null;
}

/** Where tapping a class reminder goes. */
export function classReminderHref(slug: string): string {
  return `/ai-lms/classes/${slug}`;
}

export function defaultReminderMessage(className: string): string {
  return `Time to practice ${className}. Pick up where you left off.`;
}

export function reminderTitle(className: string): string {
  return `Practice: ${className}`.slice(0, TITLE_MAX);
}

/**
 * The text the Scheduler editor may show as "From “…”": the sentence a schedule was made from, never the class marker.
 * (A class reminder has no such sentence, so the line is simply left out.)
 */
export function visibleSourceText(sourceText: string | null | undefined): string | null {
  if (!sourceText || sourceText.startsWith(CLASS_REMINDER_PREFIX)) return null;
  return sourceText;
}

/** The reminders saved for a class, earliest time first. */
export async function listClassReminders(slug: string): Promise<Schedule[]> {
  const all = await scheduleService.list();
  return all
    .filter((s) => classSlugOf(s) === slug)
    .sort((a, b) => (a.rule.time ?? '').localeCompare(b.rule.time ?? '') || a.id - b.id);
}

/** Saved reminders → what the dialog shows. Null when there are none. */
export function practiceFromSchedules(schedules: Schedule[], className: string): PracticeSettings | null {
  if (schedules.length === 0) return null;
  const timed = schedules.filter((s) => s.rule.time && REPEATS.includes(s.rule.repeat));
  const first = timed[0] ?? schedules[0];
  const repeat: PracticeRepeat = REPEATS.includes(first.rule.repeat)
    ? (first.rule.repeat as PracticeRepeat)
    : 'daily';
  const times = [...new Set(timed.map((s) => s.rule.time as string))].sort();
  const text = (first.message ?? '').trim();
  return {
    times: times.length ? times : DEFAULT_PRACTICE.times,
    repeat,
    days: repeat === 'weekly' && first.rule.days?.length ? [...first.rule.days] : DEFAULT_PRACTICE.days,
    message: text && text !== defaultReminderMessage(className) ? text : '',
  };
}

/** A readable reason the settings cannot be saved, or null. */
export function validatePractice(settings: PracticeSettings): string | null {
  if (settings.times.length === 0) return 'Pick at least one practice time.';
  if (settings.times.length > MAX_PRACTICE_TIMES) return `Use up to ${MAX_PRACTICE_TIMES} practice times.`;
  if (settings.times.some((t) => !TIME_RE.test(t))) return 'Enter every practice time as hours and minutes.';
  if (new Set(settings.times).size !== settings.times.length) return 'Two practice times are the same.';
  if (settings.repeat === 'weekly' && settings.days.length === 0) return 'Choose at least one day.';
  return null;
}

function ruleFor(settings: PracticeSettings, time: string): ScheduleRule {
  const raw: Record<string, unknown> = { repeat: settings.repeat, time };
  if (settings.repeat === 'weekly') raw.days = [...new Set(settings.days)].sort((a, b) => a - b);
  const checked = normalizeRule(raw);
  if (!checked.rule) throw new Error(checked.error ?? 'That time cannot be scheduled.');
  return checked.rule;
}

/**
 * Makes the class's reminders match `settings`: one reminder per time, existing ones reused in time order, the rest
 * created, any left over deleted. Rejects with a readable message and leaves what already saved in place.
 */
export async function saveClassReminders(
  slug: string,
  className: string,
  settings: PracticeSettings
): Promise<Schedule[]> {
  if (!isReminderSlug(slug)) throw new Error('This class cannot have reminders.');
  const problem = validatePractice(settings);
  if (problem) throw new Error(problem);
  const times = [...settings.times].sort();
  const rules = times.map((time) => ruleFor(settings, time)); // all valid before anything is written
  const message = settings.message.trim() || defaultReminderMessage(className);
  const existing = await listClassReminders(slug);
  const saved: Schedule[] = [];
  for (let i = 0; i < rules.length; i++) {
    const payload = {
      title: reminderTitle(className),
      kind: 'reminder' as const,
      message,
      rule: rules[i],
      enabled: true,
      source_text: classReminderMarker(slug),
    };
    saved.push(
      existing[i] ? await scheduleService.update(existing[i].id, payload) : await scheduleService.create(payload)
    );
  }
  for (const extra of existing.slice(rules.length)) await scheduleService.remove(extra.id);
  return saved;
}

/** Turns the class's reminders off (deletes them). Returns how many there were. */
export async function removeClassReminders(slug: string): Promise<number> {
  const existing = await listClassReminders(slug);
  for (const schedule of existing) await scheduleService.remove(schedule.id);
  return existing.length;
}

/** Dispatched to ask a class's practice-reminders dialog to open (the Join button offers it right after joining). */
export const OPEN_CLASS_REMINDERS_EVENT = 'lms:open-class-reminders';

export function requestOpenClassReminders(slug: string): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(OPEN_CLASS_REMINDERS_EVENT, { detail: { slug } }));
  }
}

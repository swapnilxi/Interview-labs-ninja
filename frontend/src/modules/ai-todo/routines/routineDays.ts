import { ymd } from '@/lib/reminders/smartParse';
import type { RoutineGroup, RoutineItem } from '@/lib/services/routineService';

/** 0 = Sunday, as JavaScript's getDay() and the stored `days`. */
export const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const DAY_LETTERS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
export const DAY_NAMES = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];

export const WEEKDAYS = [1, 2, 3, 4, 5];
export const WEEKEND = [0, 6];

const same = (a: number[], b: number[]) => a.length === b.length && a.every((d, i) => d === b[i]);

/** "Every day", "Mon–Fri", "Sat, Sun", "Mon, Wed, Fri", or null when the group has no days. */
export function daysLabel(group: Pick<RoutineGroup, 'kind' | 'days'>): string | null {
  if (group.kind === 'dailies') return 'Every day';
  const days = group.days ?? [];
  if (!days.length) return null;
  if (days.length === 7) return 'Every day';
  if (same(days, WEEKDAYS)) return 'Mon–Fri';
  if (same(days, WEEKEND)) return 'Sat, Sun';
  // Monday first, the way a week reads.
  return [...days]
    .sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7))
    .map((d) => DAY_SHORT[d])
    .join(', ');
}

/** Is the group on for `now`'s local date: Dailies always; others on their weekdays or the date they were switched on for. */
export function isOnToday(group: RoutineGroup, now: Date): boolean {
  if (group.kind === 'dailies') return true;
  if (group.active_on === ymd(now)) return true;
  return (group.days ?? []).includes(now.getDay());
}

/** Switched on for today only (not by its days). */
export function isSwitchedOn(group: RoutineGroup, now: Date): boolean {
  return group.kind !== 'dailies' && group.active_on === ymd(now);
}

/** Dailies start a new day at this local hour: before it, yesterday's ticks still count and nothing has reset yet. */
export const DAILIES_RESET_HOUR = 8;

/**
 * The date a tick made at `now` belongs to (and the one `done_on` is compared with). Dailies turn over at 8 am: a
 * tick made at 7:59 is still "yesterday's" and ends at 8:00. Every other group turns over at midnight, as before.
 * Nothing is reset on a server: an item is done only while its `done_on` equals this date.
 */
export function tickDay(group: Pick<RoutineGroup, 'kind'>, now: Date): string {
  if (group.kind === 'dailies' && now.getHours() < DAILIES_RESET_HOUR) {
    // Built from the calendar fields, not by subtracting hours, so a daylight-saving change can't shift the date.
    return ymd(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1));
  }
  return ymd(now);
}

export function isDoneToday(
  item: RoutineItem,
  group: Pick<RoutineGroup, 'kind'>,
  now: Date
): boolean {
  return item.done_on === tickDay(group, now);
}

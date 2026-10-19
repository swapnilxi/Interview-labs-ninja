/**
 * The auto organizer remembers its answers per browser (localStorage key `dsa-auto-organizer-answers`),
 * so the next run starts from the last one. Only a convenience: every access is wrapped in try/catch
 * (private windows and blocked storage throw) and anything unreadable falls back to the defaults.
 *
 * Stored shape: the AutoAnswers fields, flat, plus `timeline` ('weeks' | 'date') and `date`
 * ("YYYY-MM-DD", the interview date when the timeline is a date).
 */
import { normalizeAutoAnswers, type AutoAnswers } from '../weekPlan';

export const AUTO_ANSWERS_KEY = 'dsa-auto-organizer-answers';

export type TimelineMode = 'weeks' | 'date';

export interface WizardAnswers {
  answers: AutoAnswers;
  timeline: TimelineMode;
  /** Interview date ("YYYY-MM-DD") or '' when none was picked. */
  date: string;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** The saved answers, or null when there are none (or they can't be read). */
export function loadWizardAnswers(): WizardAnswers | null {
  try {
    if (typeof window === 'undefined') return null;
    const raw = window.localStorage.getItem(AUTO_ANSWERS_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    const src = parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {};
    return {
      answers: normalizeAutoAnswers(parsed),
      timeline: src.timeline === 'date' ? 'date' : 'weeks',
      date: typeof src.date === 'string' && ISO_DATE.test(src.date) ? src.date : '',
    };
  } catch {
    return null;
  }
}

export function saveWizardAnswers({ answers, timeline, date }: WizardAnswers): void {
  try {
    window.localStorage.setItem(AUTO_ANSWERS_KEY, JSON.stringify({ ...answers, timeline, date }));
  } catch {
    // Storage full or blocked: the answers just aren't remembered.
  }
}

/** Today in local time as "YYYY-MM-DD" (what a date input's value and `min` use). */
export function localIsoDate(now: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** Whole days from today to a "YYYY-MM-DD" date (negative in the past), or null if unreadable. */
export function daysUntil(date: string, now: Date = new Date()): number | null {
  const value = date.trim();
  if (!ISO_DATE.test(value)) return null;
  const [y, m, d] = value.split('-').map(Number);
  const target = new Date(y, m - 1, d);
  if (Number.isNaN(target.getTime())) return null;
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((target.getTime() - today.getTime()) / 86_400_000);
}

/** "12 Dec 2026" for a "YYYY-MM-DD" date ('' if unreadable). */
export function formatDate(date: string): string {
  if (!ISO_DATE.test(date)) return '';
  const [y, m, d] = date.split('-').map(Number);
  const value = new Date(y, m - 1, d);
  if (Number.isNaN(value.getTime())) return '';
  return value.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

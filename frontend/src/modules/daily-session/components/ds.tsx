'use client';

/**
 * Small building blocks of the Daily Session skin (styles in ../daily-session.css, scoped to `.ds-skin`).
 * Colour comes from the skin's tokens; a `tone` picks one of the palette hues.
 */

import React from 'react';

export type Tone = 'indigo' | 'gold' | 'jade' | 'rose' | 'neutral';

export const toneClass = (t: Tone) => `ds-tone-${t}`;

/** Semantic tone of a difficulty: Easy jade, Medium saffron, Hard rose, anything else (Mixed / All) indigo. */
export function difficultyTone(d: string | undefined): Tone {
  const v = (d || '').toLowerCase();
  if (v === 'easy') return 'jade';
  if (v === 'medium') return 'gold';
  if (v === 'hard') return 'rose';
  return 'indigo';
}

export function DifficultyChip({
  difficulty,
  className = '',
}: {
  difficulty: string;
  className?: string;
}) {
  return (
    <span
      className={`ds-chip ${toneClass(difficultyTone(difficulty))} ${className}`}
      data-semantic="difficulty"
    >
      <span className="ds-dot" aria-hidden="true" />
      {difficulty}
    </span>
  );
}

/** Circular progress. `value` 0..1. Children sit in the middle. */
export function Ring({
  value,
  size = 56,
  stroke = 6,
  tone = 'indigo',
  children,
  label,
}: {
  value: number;
  size?: number;
  stroke?: number;
  tone?: Tone;
  children?: React.ReactNode;
  label?: string;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
  return (
    <div
      className={`relative inline-flex flex-shrink-0 items-center justify-center ${toneClass(tone)}`}
      style={{ width: size, height: size }}
      role={label ? 'img' : undefined}
      aria-label={label}
    >
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="-rotate-90"
        aria-hidden="true"
      >
        <circle
          className="ds-ring-track"
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
        />
        <circle
          className="ds-ring-fill"
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - v)}
        />
      </svg>
      {children !== undefined && (
        <div className="absolute inset-0 flex items-center justify-center">{children}</div>
      )}
    </div>
  );
}

/** Linear progress. `value` 0..1. */
export function Bar({
  value,
  tone = 'indigo',
  className = '',
  label,
}: {
  value: number;
  tone?: Tone;
  className?: string;
  label?: string;
}) {
  const pct = Math.round(Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0)) * 100);
  return (
    <div
      className={`ds-track ${toneClass(tone)} ${className}`}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={pct}
      aria-label={label}
    >
      <span style={{ width: `${pct}%` }} />
    </div>
  );
}

/** A numbered step label: "1  Topic". */
export function StepLabel({
  n,
  children,
  hint,
}: {
  n: number;
  children: React.ReactNode;
  hint?: React.ReactNode;
}) {
  return (
    <div className="mb-3 flex items-baseline justify-between gap-3">
      <h3 className="ds-h3 flex items-center gap-2.5">
        <span className="ds-stepnum" aria-hidden="true">
          {n}
        </span>
        {children}
      </h3>
      {hint && <span className="text-xs font-semibold ds-faint">{hint}</span>}
    </div>
  );
}

// ── Dates ──────────────────────────────────────────────────────────────────

export const dayKey = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** "Today", "Yesterday", or "Mon, 9 Nov" for a YYYY-MM-DD date. */
export function relativeDay(date: string): string {
  const today = new Date();
  if (date === dayKey(today)) return 'Today';
  const y = new Date(today);
  y.setDate(y.getDate() - 1);
  if (date === dayKey(y)) return 'Yesterday';
  const d = new Date(`${date}T00:00:00`);
  if (Number.isNaN(d.getTime())) return date;
  return d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
}

/** Days with practice activity kept in this browser: finished practice drills (YYYY-MM-DD). */
export function readPracticeDays(): string[] {
  try {
    const raw = JSON.parse(localStorage.getItem('labninja.practice.history.v1') || '[]');
    if (!Array.isArray(raw)) return [];
    return raw
      .map((r: { at?: string }) => (typeof r?.at === 'string' ? dayKey(new Date(r.at)) : null))
      .filter((d): d is string => !!d);
  } catch {
    return [];
  }
}

/** The current week, Monday first, as YYYY-MM-DD keys. */
function thisWeek(): { key: string; label: string; isToday: boolean }[] {
  const now = new Date();
  const monday = new Date(now);
  monday.setDate(now.getDate() - ((now.getDay() + 6) % 7));
  const todayKey = dayKey(now);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    const key = dayKey(d);
    return {
      key,
      label: d.toLocaleDateString(undefined, { weekday: 'narrow' }),
      isToday: key === todayKey,
    };
  });
}

/** Mon..Sun, a filled flame for each day with practice. */
export function WeekStrip({ activeDays }: { activeDays: Set<string> }) {
  const week = thisWeek();
  return (
    <ol className="grid grid-cols-7 gap-1" aria-label="This week">
      {week.map((d) => {
        const done = activeDays.has(d.key);
        return (
          <li
            key={d.key}
            className="ds-day"
            data-done={done}
            data-today={d.isToday}
            aria-label={`${new Date(`${d.key}T00:00:00`).toLocaleDateString(undefined, { weekday: 'long' })}${done ? ', practised' : ''}${d.isToday ? ', today' : ''}`}
          >
            <i aria-hidden="true">
              {done ? (
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                  aria-hidden="true"
                >
                  <path d="M12.96 2.1a.75.75 0 0 0-1.17.1C9.6 5.4 8.66 7.56 8.5 9.2c-.62-.6-1.05-1.36-1.28-2.28a.75.75 0 0 0-1.3-.3C4.7 8.22 4 10.1 4 12.1 4 16.55 7.58 20 12 20s8-3.45 8-7.9c0-4.5-3.04-7.78-7.04-10Z" />
                </svg>
              ) : (
                <span className="text-[11px]">·</span>
              )}
            </i>
            <span aria-hidden="true">{d.label}</span>
          </li>
        );
      })}
    </ol>
  );
}

/** "mm:ss". */
export const clock = (s: number) =>
  `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

/** True when a key press is meant for a text field, not a page shortcut. */
export function isTypingTarget(t: EventTarget | null): boolean {
  const el = t as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable;
}

/** The bank can hold the same question more than once (re-generated sessions): keep the first of each. */
export function uniqueByText<T extends { questionText: string }>(list: T[]): T[] {
  const seen = new Set<string>();
  return list.filter((q) => {
    const k = q.questionText.trim().toLowerCase();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

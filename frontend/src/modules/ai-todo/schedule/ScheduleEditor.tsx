'use client';

import React, { useMemo, useState } from 'react';
import Icon from '@/components/ui/AppIcon';
import {
  describeRule,
  nextOccurrences,
  normalizeRule,
  toLocalStamp,
  type ScheduleRepeat,
  type ScheduleRule,
} from '@/lib/schedules/scheduleRules';
import type {
  AgentContext,
  ScheduleCreatePayload,
  ScheduleKind,
} from '@/lib/services/scheduleService';
import { formatReminder } from '@/lib/reminders/reminderTime';

/**
 * The "options" way to set up a schedule (and where an AI draft lands for a check before saving): what kind, what it
 * says or does, and when. The preview under "When" lists the next runs, worked out by the same rules the engine and the
 * phone use, so what you see is what will fire.
 */

type Unit = 'minutes' | 'hours' | 'days';

export interface EditorValue {
  title: string;
  kind: ScheduleKind;
  message: string;
  agent_context: AgentContext;
  add_tasks: boolean;
  repeat: ScheduleRepeat;
  at: string;
  time: string;
  days: number[];
  day_of_month: number;
  every: number;
  unit: Unit;
  start: string;
  cron: string;
  end: string;
  source_text: string | null;
}

const REPEAT_OPTIONS: { id: ScheduleRepeat; label: string }[] = [
  { id: 'once', label: 'Once' },
  { id: 'daily', label: 'Every day' },
  { id: 'weekdays', label: 'Weekdays (Mon–Fri)' },
  { id: 'weekly', label: 'Weekly, on chosen days' },
  { id: 'monthly', label: 'Monthly' },
  { id: 'interval', label: 'Every few minutes / hours' },
  { id: 'cron', label: 'Custom (cron)' },
];

const DAY_LETTERS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** Now rounded up to the next 5 minutes, as a local stamp. */
function soon(minutesAhead = 5): string {
  const d = new Date(Date.now() + minutesAhead * 60_000);
  d.setMinutes(Math.ceil(d.getMinutes() / 5) * 5, 0, 0);
  return toLocalStamp(d);
}

export function blankEditor(kind: ScheduleKind = 'reminder'): EditorValue {
  const tomorrow9 = new Date();
  tomorrow9.setDate(tomorrow9.getDate() + 1);
  tomorrow9.setHours(9, 0, 0, 0);
  return {
    title: '',
    kind,
    message: '',
    agent_context: 'tasks',
    add_tasks: false,
    repeat: 'daily',
    at: toLocalStamp(tomorrow9),
    time: '09:00',
    days: [1, 3, 5],
    day_of_month: 1,
    every: 2,
    unit: 'hours',
    start: soon(),
    cron: '0 9 * * 1-5',
    end: '',
    source_text: null,
  };
}

/** A saved schedule or an AI draft → editor fields (unused fields keep sensible defaults). */
export function editorFrom(input: {
  title: string;
  kind: ScheduleKind;
  message: string | null;
  agent_context: AgentContext;
  add_tasks: boolean;
  rule: ScheduleRule;
  source_text?: string | null;
}): EditorValue {
  const v = blankEditor(input.kind);
  const r = input.rule;
  const every = r.every_minutes ?? 120;
  const unit: Unit = every % 1440 === 0 ? 'days' : every % 60 === 0 ? 'hours' : 'minutes';
  return {
    ...v,
    title: input.title,
    message: input.message ?? '',
    agent_context: input.agent_context,
    add_tasks: input.add_tasks,
    repeat: r.repeat,
    at: r.at ?? v.at,
    time: r.time ?? v.time,
    days: r.days ?? v.days,
    day_of_month: r.day_of_month ?? v.day_of_month,
    every: unit === 'days' ? every / 1440 : unit === 'hours' ? every / 60 : every,
    unit,
    start: r.start ?? v.start,
    cron: r.cron ?? v.cron,
    end: r.end ?? '',
    source_text: input.source_text ?? null,
  };
}

function ruleFrom(v: EditorValue): Record<string, unknown> {
  const factor = v.unit === 'days' ? 1440 : v.unit === 'hours' ? 60 : 1;
  return {
    repeat: v.repeat,
    at: v.at,
    time: v.time,
    days: v.days,
    day_of_month: v.day_of_month,
    every_minutes: Math.round(v.every * factor),
    start: v.start,
    cron: v.cron,
    end: v.end || null,
  };
}

export function payloadFrom(v: EditorValue, rule: ScheduleRule): ScheduleCreatePayload {
  return {
    title: v.title.trim(),
    kind: v.kind,
    message: v.message.trim() || null,
    rule,
    agent_context: v.agent_context,
    add_tasks: v.kind === 'agent' && v.add_tasks,
    source_text: v.source_text,
  };
}

interface Props {
  initial: EditorValue;
  heading: string;
  saveLabel: string;
  canUseAgent: boolean;
  saving: boolean;
  onSave: (payload: ScheduleCreatePayload) => void;
  onCancel: () => void;
}

export default function ScheduleEditor({
  initial,
  heading,
  saveLabel,
  canUseAgent,
  saving,
  onSave,
  onCancel,
}: Props) {
  const [v, setV] = useState<EditorValue>(initial);
  const [touched, setTouched] = useState(false);
  const set = (patch: Partial<EditorValue>) => setV((cur) => ({ ...cur, ...patch }));

  const checked = useMemo(() => normalizeRule(ruleFrom(v)), [v]);
  const upcoming = useMemo(
    () => (checked.rule ? nextOccurrences(checked.rule, new Date(), 3) : []),
    [checked]
  );
  const titleMissing = !v.title.trim();
  const agentBlocked = v.kind === 'agent' && !canUseAgent;
  const error = checked.error ?? (touched && titleMissing ? 'Give it a title.' : null);
  const onceInPast = v.repeat === 'once' && checked.rule && upcoming.length === 0;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (!checked.rule || titleMissing || agentBlocked) return;
    onSave(payloadFrom(v, checked.rule));
  };

  const field = 'todo-input todo-input-quiet h-11 px-3 text-sm';

  return (
    <form onSubmit={submit} className="sch-editor" aria-label={heading}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-heading text-base font-semibold text-foreground">{heading}</h3>
          {v.source_text && (
            <p className="mt-0.5 break-words text-xs text-muted-foreground">
              From “{v.source_text}”
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={onCancel}
          aria-label="Close"
          className="todo-btn todo-btn-ghost -mr-1 -mt-1 h-9 w-9 shrink-0 px-0"
        >
          <Icon name="XMarkIcon" size={16} />
        </button>
      </div>

      <div className="todo-segmented mt-4 w-full" role="group" aria-label="Kind">
        <button
          type="button"
          className="todo-segment flex-1"
          aria-pressed={v.kind === 'reminder'}
          onClick={() => set({ kind: 'reminder' })}
        >
          <Icon name="BellIcon" size={15} />
          Reminder
        </button>
        <button
          type="button"
          className="todo-segment flex-1"
          aria-pressed={v.kind === 'agent'}
          onClick={() => set({ kind: 'agent' })}
        >
          <Icon name="SparklesIcon" size={15} />
          AI job
        </button>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        {v.kind === 'agent'
          ? 'At each run the AI follows your instructions (it can read your tasks) and sends you its answer.'
          : 'A notification with your text, at the time you pick.'}
      </p>
      {agentBlocked && (
        <p className="todo-alert todo-alert-warning mt-2 text-xs">
          Sign in to schedule AI jobs. Reminders work without an account.
        </p>
      )}

      <label className="sch-label" htmlFor="sch-title">
        Title
      </label>
      <input
        id="sch-title"
        value={v.title}
        onChange={(e) => set({ title: e.target.value })}
        maxLength={120}
        placeholder={v.kind === 'agent' ? 'Morning plan' : 'Drink water'}
        className={field}
      />

      <label className="sch-label" htmlFor="sch-message">
        {v.kind === 'agent' ? 'What should the AI do each time?' : 'Reminder text (optional)'}
      </label>
      <textarea
        id="sch-message"
        value={v.message}
        onChange={(e) => set({ message: e.target.value })}
        rows={v.kind === 'agent' ? 3 : 2}
        maxLength={2000}
        placeholder={
          v.kind === 'agent'
            ? 'Look at my tasks and give me a focused plan for today: the top 3 and what to drop.'
            : 'Stand up, stretch, refill your bottle.'
        }
        className="todo-input todo-input-quiet min-h-[4.5rem] resize-y px-3 py-2.5 text-sm"
      />

      {v.kind === 'agent' && (
        <div className="mt-3 flex flex-col gap-2">
          <label className="sch-check">
            <input
              type="checkbox"
              checked={v.agent_context === 'tasks'}
              onChange={(e) => set({ agent_context: e.target.checked ? 'tasks' : 'none' })}
            />
            <span>Let it read my open tasks</span>
          </label>
          <label className="sch-check">
            <input
              type="checkbox"
              checked={v.add_tasks}
              onChange={(e) => set({ add_tasks: e.target.checked })}
            />
            <span>Add the tasks it suggests to Smart To-Do</span>
          </label>
        </div>
      )}

      <fieldset className="mt-4">
        <legend className="sch-label mt-0">When</legend>
        <select
          value={v.repeat}
          onChange={(e) => set({ repeat: e.target.value as ScheduleRepeat })}
          aria-label="Repeat"
          className={field}
        >
          {REPEAT_OPTIONS.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </select>

        <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
          {v.repeat === 'once' && (
            <input
              type="datetime-local"
              value={v.at}
              onChange={(e) => set({ at: e.target.value })}
              aria-label="Date and time"
              className={`${field} sm:col-span-2`}
            />
          )}

          {(v.repeat === 'daily' ||
            v.repeat === 'weekdays' ||
            v.repeat === 'weekly' ||
            v.repeat === 'monthly') && (
            <input
              type="time"
              value={v.time}
              onChange={(e) => set({ time: e.target.value })}
              aria-label="Time"
              className={field}
            />
          )}

          {v.repeat === 'monthly' && (
            <label className="flex items-center gap-2 text-sm text-muted-foreground">
              <span className="shrink-0">Day</span>
              <input
                type="number"
                min={1}
                max={31}
                value={v.day_of_month}
                onChange={(e) => set({ day_of_month: Number(e.target.value) })}
                aria-label="Day of the month"
                className={field}
              />
            </label>
          )}

          {v.repeat === 'interval' && (
            <>
              <div className="flex gap-2">
                <input
                  type="number"
                  min={1}
                  value={v.every}
                  onChange={(e) => set({ every: Number(e.target.value) })}
                  aria-label="Every"
                  className={`${field} w-[5.5rem] shrink-0`}
                />
                <select
                  value={v.unit}
                  onChange={(e) => set({ unit: e.target.value as Unit })}
                  aria-label="Unit"
                  className={field}
                >
                  <option value="minutes">minutes</option>
                  <option value="hours">hours</option>
                  <option value="days">days</option>
                </select>
              </div>
              <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                Starting
                <input
                  type="datetime-local"
                  value={v.start}
                  onChange={(e) => set({ start: e.target.value })}
                  className={field}
                />
              </label>
            </>
          )}

          {v.repeat === 'cron' && (
            <label className="flex flex-col gap-1 text-xs text-muted-foreground sm:col-span-2">
              minute · hour · day of month · month · day of week
              <input
                value={v.cron}
                onChange={(e) => set({ cron: e.target.value })}
                spellCheck={false}
                autoCapitalize="off"
                placeholder="0 9 * * 1-5"
                className={`${field} font-mono`}
              />
            </label>
          )}
        </div>

        {v.repeat === 'weekly' && (
          <div className="mt-2 flex gap-1.5" role="group" aria-label="Days of the week">
            {DAY_LETTERS.map((letter, day) => {
              const on = v.days.includes(day);
              return (
                <button
                  key={day}
                  type="button"
                  aria-pressed={on}
                  aria-label={DAY_NAMES[day]}
                  onClick={() =>
                    set({
                      days: on
                        ? v.days.filter((d) => d !== day)
                        : [...v.days, day].sort((a, b) => a - b),
                    })
                  }
                  className="sch-day"
                >
                  {letter}
                </button>
              );
            })}
          </div>
        )}

        {v.repeat !== 'once' && (
          <label className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
            <span className="shrink-0">Until (optional)</span>
            <input
              type="date"
              value={v.end}
              onChange={(e) => set({ end: e.target.value })}
              className="todo-input todo-input-quiet h-9 px-2 text-sm"
            />
          </label>
        )}
      </fieldset>

      <div className="sch-preview" aria-live="polite">
        {checked.rule ? (
          <>
            <p className="font-semibold text-foreground">{describeRule(checked.rule)}</p>
            {upcoming.length ? (
              <p className="mt-0.5">
                Next: {upcoming.map((d) => formatReminder(d.toISOString())).join(' · ')}
              </p>
            ) : (
              <p className="mt-0.5 text-warning">
                {onceInPast ? 'That time has already passed.' : 'No upcoming run.'}
              </p>
            )}
          </>
        ) : (
          <p className="text-warning">{checked.error}</p>
        )}
      </div>

      {error && error !== checked.error && <p className="mt-2 text-xs text-destructive">{error}</p>}

      <div className="mt-4 flex gap-2">
        <button
          type="submit"
          disabled={saving || agentBlocked || !checked.rule}
          className="todo-btn todo-btn-primary h-11 flex-1 text-sm"
        >
          {saving ? 'Saving…' : saveLabel}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="todo-btn todo-btn-ghost h-11 px-4 text-sm"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

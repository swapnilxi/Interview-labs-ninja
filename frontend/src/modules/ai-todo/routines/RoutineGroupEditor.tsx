'use client';

import { useState } from 'react';
import Icon from '@/components/ui/AppIcon';
import { DAY_LETTERS, DAY_NAMES, WEEKDAYS, WEEKEND } from './routineDays';

export interface GroupDraft {
  name: string;
  days: number[];
}

interface RoutineGroupEditorProps {
  heading: string;
  initial: GroupDraft;
  /** Dailies: only the name can change (it is on every day). */
  isDailies?: boolean;
  saving: boolean;
  error: string | null;
  saveLabel: string;
  onSave: (draft: GroupDraft) => void;
  onCancel: () => void;
}

const NAME_MAX = 60;

/** Monday first, the way a week reads; the stored numbers stay 0 = Sunday. */
const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];

const PRESETS: { label: string; days: number[] }[] = [
  { label: 'Weekdays', days: WEEKDAYS },
  { label: 'Weekend', days: WEEKEND },
  { label: 'No fixed days', days: [] },
];

export default function RoutineGroupEditor({
  heading,
  initial,
  isDailies,
  saving,
  error,
  saveLabel,
  onSave,
  onCancel,
}: RoutineGroupEditorProps) {
  const [name, setName] = useState(initial.name);
  const [days, setDays] = useState<number[]>(initial.days);

  const toggle = (day: number) =>
    setDays((list) =>
      list.includes(day) ? list.filter((d) => d !== day) : [...list, day].sort((a, b) => a - b)
    );
  const matches = (preset: number[]) =>
    preset.length === days.length && preset.every((d) => days.includes(d));

  return (
    <form
      className="rt-editor"
      aria-label={heading}
      onSubmit={(e) => {
        e.preventDefault();
        if (!name.trim() || saving) return;
        onSave({ name: name.trim(), days });
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <h3 className="font-heading text-base font-semibold text-foreground">{heading}</h3>
        <button
          type="button"
          onClick={onCancel}
          aria-label="Close"
          className="todo-btn todo-btn-ghost -mr-1 -mt-1 h-9 w-9 shrink-0 px-0"
        >
          <Icon name="XMarkIcon" size={16} />
        </button>
      </div>

      <label htmlFor="rt-group-name" className="rt-label">
        Name
      </label>
      <input
        id="rt-group-name"
        type="text"
        autoFocus
        value={name}
        maxLength={NAME_MAX}
        onChange={(e) => setName(e.target.value)}
        placeholder="e.g. Weekend, Deployment eve"
        className="todo-input h-11 px-3 text-[15px]"
        enterKeyHint="done"
      />

      {isDailies ? (
        <p className="mt-3 text-[13px] text-muted-foreground">
          Dailies are on every day, on top of any other group that is on.
        </p>
      ) : (
        <fieldset className="mt-1">
          <legend className="rt-label">On these days</legend>
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Quick picks">
            {PRESETS.map((p) => (
              <button
                key={p.label}
                type="button"
                aria-pressed={matches(p.days)}
                onClick={() => setDays(p.days)}
                className="rt-preset"
              >
                {p.label}
              </button>
            ))}
          </div>
          <div className="mt-2.5 flex flex-wrap gap-1.5" role="group" aria-label="Days of the week">
            {WEEK_ORDER.map((day) => (
              <button
                key={day}
                type="button"
                aria-pressed={days.includes(day)}
                aria-label={DAY_NAMES[day]}
                onClick={() => toggle(day)}
                className="rt-day"
              >
                {DAY_LETTERS[day]}
              </button>
            ))}
          </div>
          <p className="mt-2.5 text-[13px] leading-snug text-muted-foreground">
            {days.length
              ? 'It shows on Today on these days, together with Dailies.'
              : 'With no days it shows only when you switch it on, like the day before a deployment.'}
          </p>
        </fieldset>
      )}

      {error && (
        <p role="alert" className="mt-3 text-[13px] text-error">
          {error}
        </p>
      )}

      <div className="mt-5 flex gap-2">
        <button
          type="submit"
          disabled={!name.trim() || saving}
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

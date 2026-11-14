'use client';

import React, { useRef, useState } from 'react';
import Icon from '@/components/ui/AppIcon';
import Popover from '@/components/ui/Popover';
import { formatReminder, isoToLocalInput, isPast, localInputToIso, reminderPresets } from '@/lib/reminders/reminderTime';

interface ReminderPickerProps {
  /** Saved reminder (UTC ISO) or null. */
  value: string | null | undefined;
  onChange: (iso: string | null) => void;
  /** Chip (compact, inside a row or the capture card) or field (a labelled control in the task panel). */
  variant?: 'chip' | 'field';
  disabled?: boolean;
  /** For screen readers: what the reminder is for. */
  taskTitle?: string;
}

/**
 * The bell chip: quick presets (in an hour, this evening, tomorrow morning, next week), any date and time, or none.
 * Shared by the capture review, the Today rows and the task panel, so a reminder is set the same way everywhere.
 */
export default function ReminderPicker({ value, onChange, variant = 'chip', disabled, taskTitle }: ReminderPickerProps) {
  const [open, setOpen] = useState(false);
  const [custom, setCustom] = useState('');
  const anchorRef = useRef<HTMLButtonElement>(null);
  const label = value ? formatReminder(value) : '';
  const overdue = value ? isPast(value) : false;

  const choose = (iso: string | null) => {
    onChange(iso);
    setOpen(false);
  };

  const openPicker = () => {
    setCustom(isoToLocalInput(value) || '');
    setOpen((v) => !v);
  };

  return (
    <>
      <button
        ref={anchorRef}
        type="button"
        disabled={disabled}
        onClick={openPicker}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={value ? `Reminder: ${label}. Change reminder${taskTitle ? ` for ${taskTitle}` : ''}` : `Add a reminder${taskTitle ? ` for ${taskTitle}` : ''}`}
        data-set={value ? 'true' : 'false'}
        data-overdue={overdue ? 'true' : 'false'}
        className={variant === 'chip' ? 'vc-chip vc-chip-reminder' : 'todo-btn todo-btn-quiet h-10 justify-start gap-2 px-3 text-sm font-medium'}
      >
        <Icon name={value ? 'BellAlertIcon' : 'BellIcon'} size={variant === 'chip' ? 14 : 16} />
        <span className="truncate">{value ? label : variant === 'chip' ? 'Remind me' : 'Add a reminder'}</span>
      </button>
      <Popover
        open={open}
        anchorRef={anchorRef}
        onClose={() => setOpen(false)}
        role="dialog"
        label="Set a reminder"
        placement="bottom-start"
        className="todo-popover w-[17rem] p-1.5"
      >
        <p className="px-2.5 pb-1 pt-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Remind me</p>
        <ul className="flex flex-col">
          {reminderPresets().map((preset, i) => (
            <li key={preset.id}>
              <button
                type="button"
                data-autofocus={i === 0 ? true : undefined}
                onClick={() => choose(preset.iso)}
                className="todo-focus flex min-h-[2.75rem] w-full items-center justify-between gap-3 rounded-md px-2.5 text-left text-sm text-foreground hover:bg-muted"
              >
                <span>{preset.label}</span>
                <span className="text-xs text-muted-foreground">{preset.hint}</span>
              </button>
            </li>
          ))}
        </ul>
        <form
          className="mt-1 border-t border-border px-1.5 pb-1 pt-2"
          onSubmit={(e) => {
            e.preventDefault();
            const iso = localInputToIso(custom);
            if (iso) choose(iso);
          }}
        >
          <label htmlFor="reminder-custom" className="mb-1 block px-1 text-xs font-medium text-muted-foreground">
            Pick a date and time
          </label>
          <div className="flex items-center gap-1.5">
            <input
              id="reminder-custom"
              type="datetime-local"
              value={custom}
              onChange={(e) => setCustom(e.target.value)}
              className="todo-input todo-input-quiet h-10 min-w-0 flex-1 px-2 text-sm"
            />
            <button type="submit" disabled={!custom} className="todo-btn todo-btn-primary h-10 px-3">
              Set
            </button>
          </div>
        </form>
        {value && (
          <button
            type="button"
            onClick={() => choose(null)}
            className="todo-focus mt-1 flex min-h-[2.75rem] w-full items-center gap-2 rounded-md px-2.5 text-left text-sm text-error hover:bg-muted"
          >
            <Icon name="BellSlashIcon" size={16} />
            Remove reminder
          </button>
        )}
      </Popover>
    </>
  );
}

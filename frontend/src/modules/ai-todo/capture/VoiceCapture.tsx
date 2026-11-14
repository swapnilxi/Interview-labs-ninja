'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Icon from '@/components/ui/AppIcon';
import Popover from '@/components/ui/Popover';
import { toast } from '@/lib/ui/toast';
import { isLoggedIn } from '@/lib/auth/tokenStore';
import { todoService, type Task, type TaskPriority } from '@/lib/services/todoService';
import { smartParse, splitNote, ymd, type SmartPart } from '@/lib/reminders/smartParse';
import { formatDueDate, formatReminder, localInputToIso } from '@/lib/reminders/reminderTime';
import ReminderPicker from '../reminders/ReminderPicker';
import { useVoiceNote, voiceNoteSupported } from './useVoiceNote';

/**
 * The capture card: say it or type it, and it becomes a task with its date and reminder.
 *
 *   type  → live chips for the date, time and priority it understood (tap × to keep those words in the title) → Enter
 *   speak → live words → "Here's what I heard": one card per task (AI when logged in, quick parsing otherwise) → Add
 */

export const PRIORITY_META: Record<TaskPriority, { label: string; className: string; ring: string }> = {
  p1: { label: 'Urgent', className: 'text-red-500', ring: '#ef4444' },
  p2: { label: 'High', className: 'text-amber-500', ring: '#f59e0b' },
  p3: { label: 'Normal', className: 'text-sky-500', ring: '#0ea5e9' },
  p4: { label: 'Low', className: 'text-slate-400', ring: '#94a3b8' },
};

interface Draft {
  key: string;
  include: boolean;
  title: string;
  priority: TaskPriority;
  dueDate: string | null;
  /** UTC ISO. */
  remindAt: string | null;
  timeEstimate: string | null;
  context: string | null;
}

type Phase = 'compose' | 'understanding' | 'review';

interface VoiceCaptureProps {
  model: string;
  /** Called with the tasks just saved (the Today list refreshes, the notification nudge may show). */
  onAdded?: (tasks: Task[]) => void;
  /** Start listening as soon as the card mounts (the mic button opened it). */
  listenOnMount?: boolean;
  /** Inside the phone sheet: tighter, no outer card chrome. */
  compact?: boolean;
  onDone?: () => void;
}

let draftSeq = 0;
const nextKey = () => `d${++draftSeq}`;

function draftFromText(text: string, now: Date): Draft {
  const parsed = smartParse(text, now);
  return {
    key: nextKey(),
    include: true,
    title: parsed.title,
    priority: parsed.priority ?? 'p3',
    dueDate: parsed.dueDate,
    remindAt: parsed.remindAt ? localInputToIso(parsed.remindAt) : null,
    timeEstimate: null,
    context: null,
  };
}

export default function VoiceCapture({ model, onAdded, listenOnMount = false, compact = false, onDone }: VoiceCaptureProps) {
  const [text, setText] = useState('');
  const [ignore, setIgnore] = useState<Set<SmartPart>>(new Set());
  const [manualReminder, setManualReminder] = useState<string | null | undefined>(undefined);
  const [phase, setPhase] = useState<Phase>('compose');
  const [heard, setHeard] = useState('');
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [note, setNote] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [canSpeak, setCanSpeak] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const addAllRef = useRef<HTMLButtonElement>(null);

  useEffect(() => setCanSpeak(voiceNoteSupported()), []);

  // ── Understanding a note ────────────────────────────────────────────────────────────────────────────────────
  const understand = useCallback(
    async (note: string, viaVoice: boolean) => {
      setHeard(note);
      setNote(null);
      const now = new Date();
      if (isLoggedIn()) {
        setPhase('understanding');
        try {
          const tasks = await todoService.voiceCapture(note, model);
          if (tasks.length) {
            setDrafts(
              tasks.map((t) => ({
                key: nextKey(),
                include: true,
                title: t.title,
                priority: t.priority,
                dueDate: t.due_date,
                remindAt: t.remind_at ? localInputToIso(t.remind_at) : null,
                timeEstimate: t.time_estimate,
                context: t.context,
              }))
            );
            setPhase('review');
            return;
          }
        } catch (err) {
          setNote(
            `AI couldn’t read it (${err instanceof Error ? err.message.replace(/\.$/, '') : 'no answer'}), so this is the quick reading. Check it before adding.`
          );
        }
      } else if (viaVoice) {
        setNote('Quick reading on this device. Log in to let AI split long notes and pick times for you.');
      }
      const pieces = splitNote(note);
      setDrafts((pieces.length ? pieces : [note]).map((p) => draftFromText(p, now)));
      setPhase('review');
    },
    [model]
  );

  const voice = useVoiceNote((spoken) => void understand(spoken, true));
  const listening = voice.state === 'listening';
  const transcribing = voice.state === 'transcribing';

  useEffect(() => {
    if (listenOnMount && canSpeak) void voice.start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listenOnMount, canSpeak]);

  useEffect(() => {
    if (phase === 'review') requestAnimationFrame(() => addAllRef.current?.focus({ preventScroll: true }));
  }, [phase]);

  // ── Typing: live smart parse ────────────────────────────────────────────────────────────────────────────────
  const parsed = useMemo(() => (text.trim() ? smartParse(text, new Date(), { ignore }) : null), [text, ignore]);
  const parsedReminder = parsed?.remindAt ? localInputToIso(parsed.remindAt) : null;
  const reminderValue = manualReminder !== undefined ? manualReminder : parsedReminder;

  const resetCompose = () => {
    setText('');
    setIgnore(new Set());
    setManualReminder(undefined);
  };

  // ── Saving ─────────────────────────────────────────────────────────────────────────────────────────────────
  const save = async (items: Omit<Draft, 'key' | 'include'>[]) => {
    if (!items.length || saving) return;
    setSaving(true);
    const created: Task[] = [];
    try {
      for (const item of items) {
        created.push(
          await todoService.createTaskStrict({
            title: item.title.trim(),
            priority: item.priority,
            status: 'backlog',
            due_date: item.dueDate ?? (item.remindAt ? ymd(new Date(item.remindAt)) : null),
            remind_at: item.remindAt,
            time_estimate: item.timeEstimate,
            context: item.context,
          })
        );
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Couldn’t add the task.');
      setSaving(false);
      if (created.length) onAdded?.(created);
      return;
    }
    setSaving(false);
    const first = created[0];
    const when = first.remind_at ? ` · ${formatReminder(first.remind_at)}` : first.due_date ? ` · ${formatDueDate(first.due_date)}` : '';
    toast.success(created.length === 1 ? `Added “${first.title}”${when}` : `Added ${created.length} tasks`, {
      action: {
        label: 'Undo',
        onClick: async () => {
          for (const t of created) await todoService.deleteTask(t.id);
          onAdded?.([]);
        },
      },
    });
    onAdded?.(created);
    return created;
  };

  const submitTyped = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!parsed || !parsed.title.trim()) return;
    const done = await save([
      {
        title: parsed.title,
        priority: parsed.priority ?? 'p3',
        dueDate: parsed.dueDate,
        remindAt: reminderValue ?? null,
        timeEstimate: null,
        context: null,
      },
    ]);
    if (done) {
      resetCompose();
      onDone?.();
      inputRef.current?.focus();
    }
  };

  const addReviewed = async () => {
    const chosen = drafts.filter((d) => d.include && d.title.trim());
    const done = await save(chosen);
    if (done) {
      setDrafts([]);
      setPhase('compose');
      setHeard('');
      setNote(null);
      onDone?.();
    }
  };

  const discardReview = () => {
    setDrafts([]);
    setPhase('compose');
    setNote(null);
    setText(heard);
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  const updateDraft = (key: string, patch: Partial<Draft>) =>
    setDrafts((list) => list.map((d) => (d.key === key ? { ...d, ...patch } : d)));

  const micPressed = () => {
    if (listening) voice.stop();
    else if (!transcribing) void voice.start();
  };

  // Alt/Option + N anywhere on the page: start talking.
  useEffect(() => {
    if (compact) return;
    const onKey = (e: KeyboardEvent) => {
      if (!e.altKey || e.ctrlKey || e.metaKey || e.repeat) return;
      if (e.code !== 'KeyN') return;
      if (document.querySelector('[data-modal-root]')) return;
      e.preventDefault();
      micPressed();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [compact, listening, transcribing]);

  const chosenCount = drafts.filter((d) => d.include && d.title.trim()).length;

  // ── Render ─────────────────────────────────────────────────────────────────────────────────────────────────
  return (
    <section className={compact ? 'vc-card vc-card-compact' : 'vc-card'} aria-label="Add a task by voice or text" data-listening={listening ? 'true' : undefined}>
      {phase !== 'review' && (
        <form onSubmit={submitTyped} className="vc-row">
          {canSpeak && (
            <button
              type="button"
              onClick={micPressed}
              disabled={transcribing || phase === 'understanding'}
              className="vc-mic"
              data-state={listening ? 'listening' : transcribing || phase === 'understanding' ? 'busy' : 'idle'}
              aria-label={listening ? 'Stop and add what I said' : 'Speak a task'}
              aria-pressed={listening}
              title={listening ? 'Stop (it also stops by itself when you pause)' : 'Speak a task (Alt/Option + N)'}
              style={listening ? ({ '--vc-level': voice.level.toFixed(2) } as React.CSSProperties) : undefined}
            >
              {transcribing || phase === 'understanding' ? (
                <span className="h-5 w-5 animate-spin rounded-full border-2 border-white/40 border-t-white" aria-hidden />
              ) : listening ? (
                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor" aria-hidden>
                  <rect x="6.5" y="6.5" width="11" height="11" rx="2.5" />
                </svg>
              ) : (
                <Icon name="MicrophoneIcon" size={22} />
              )}
            </button>
          )}

          <div className="vc-field">
            {listening || transcribing || phase === 'understanding' ? (
              <div className="vc-live" aria-live="polite">
                <span className={voice.interim ? 'text-foreground' : 'text-muted-foreground'}>
                  {phase === 'understanding'
                    ? 'Understanding…'
                    : transcribing
                      ? 'Writing it down…'
                      : voice.interim || 'Listening… say a task, a day and a time'}
                </span>
                {listening && (
                  <span className="vc-wave" aria-hidden>
                    <i /><i /><i /><i /><i />
                  </span>
                )}
              </div>
            ) : (
              <input
                ref={inputRef}
                type="text"
                value={text}
                onChange={(e) => {
                  setText(e.target.value);
                  if (!e.target.value) {
                    setIgnore(new Set());
                    setManualReminder(undefined);
                  }
                }}
                placeholder={canSpeak ? 'Type a task, or tap the mic' : 'Type a task, e.g. “Call Priya at 5pm”'}
                aria-label="New task"
                enterKeyHint="done"
                autoComplete="off"
                className="vc-input"
              />
            )}
          </div>

          {listening ? (
            <button type="button" onClick={voice.cancel} className="todo-btn todo-btn-ghost h-11 px-3">
              Cancel
            </button>
          ) : (
            <button
              type="submit"
              disabled={!parsed?.title.trim() || saving || phase === 'understanding'}
              className="vc-add"
              aria-label="Add task"
            >
              <Icon name="ArrowUpIcon" size={18} />
            </button>
          )}
        </form>
      )}

      {/* What the typed text means: tap a chip's × to keep those words in the title instead. */}
      {phase === 'compose' && !listening && parsed && (
        <div className="vc-chips" aria-label="What this task will get">
          {parsed.dueDate && !parsedReminder && (
            <span className="vc-chip" data-set="true">
              <Icon name="CalendarDaysIcon" size={14} />
              {formatDueDate(parsed.dueDate)}
              <button type="button" className="vc-chip-x" aria-label="Don’t use this date" onClick={() => setIgnore(new Set(ignore).add('date'))}>
                <Icon name="XMarkIcon" size={12} />
              </button>
            </span>
          )}
          <ReminderPicker value={reminderValue} onChange={(iso) => setManualReminder(iso)} taskTitle={parsed.title} />
          {parsedReminder && manualReminder === undefined && (
            <button
              type="button"
              className="vc-chip vc-chip-ghost"
              onClick={() => setIgnore(new Set(ignore).add('time').add('date'))}
              aria-label="Keep the date and time words in the title"
            >
              <Icon name="XMarkIcon" size={12} /> Not a time
            </button>
          )}
          {parsed.priority && (
            <span className="vc-chip" data-set="true">
              <Icon name="FlagIcon" size={14} className={PRIORITY_META[parsed.priority].className} />
              {PRIORITY_META[parsed.priority].label}
              <button type="button" className="vc-chip-x" aria-label="Don’t use this priority" onClick={() => setIgnore(new Set(ignore).add('priority'))}>
                <Icon name="XMarkIcon" size={12} />
              </button>
            </span>
          )}
          {isLoggedIn() && text.trim().split(/\s+/).length >= 6 && (
            <button type="button" className="vc-chip vc-chip-ai" onClick={() => void understand(text.trim(), false)}>
              <Icon name="SparklesIcon" size={14} />
              Split with AI
            </button>
          )}
        </div>
      )}

      {voice.error && phase === 'compose' && (
        <p role="alert" className="vc-error">
          <Icon name="ExclamationTriangleIcon" size={14} />
          {voice.error}
        </p>
      )}

      {/* ── Review what was heard ── */}
      {phase === 'review' && (
        <div className="vc-review">
          <div className="flex items-start gap-3">
            <span className="vc-review-icon text-primary" aria-hidden>
              <Icon name="SparklesIcon" size={20} variant="solid" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-foreground">
                {drafts.length === 1 ? 'Here’s the task I heard' : `I heard ${drafts.length} tasks`}
              </p>
              <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">“{heard}”</p>
            </div>
          </div>
          {note && <p className="vc-note">{note}</p>}

          <ul className="mt-3 flex flex-col gap-2">
            {drafts.map((d) => (
              <li key={d.key} className="vc-draft" data-off={d.include ? undefined : 'true'}>
                {drafts.length > 1 && (
                  <input
                    type="checkbox"
                    checked={d.include}
                    onChange={(e) => updateDraft(d.key, { include: e.target.checked })}
                    aria-label={`Add “${d.title}”`}
                    className="vc-draft-check"
                  />
                )}
                <div className="min-w-0 flex-1">
                  <input
                    value={d.title}
                    onChange={(e) => updateDraft(d.key, { title: e.target.value })}
                    aria-label="Task title"
                    className="vc-draft-title"
                  />
                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                    <DateChip value={d.dueDate} onChange={(v) => updateDraft(d.key, { dueDate: v })} />
                    <ReminderPicker value={d.remindAt} onChange={(iso) => updateDraft(d.key, { remindAt: iso })} taskTitle={d.title} />
                    <PriorityChip value={d.priority} onChange={(p) => updateDraft(d.key, { priority: p })} />
                    {d.timeEstimate && (
                      <span className="vc-chip" data-set="true">
                        <Icon name="ClockIcon" size={14} />
                        {d.timeEstimate}
                      </span>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>

          <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
            <button type="button" onClick={discardReview} className="todo-btn todo-btn-ghost h-10 px-3">
              Edit as text
            </button>
            <button
              type="button"
              onClick={() => {
                setDrafts([]);
                setPhase('compose');
                setNote(null);
                onDone?.();
              }}
              className="todo-btn todo-btn-quiet h-10 px-3"
            >
              Discard
            </button>
            <button
              ref={addAllRef}
              type="button"
              onClick={() => void addReviewed()}
              disabled={!chosenCount || saving}
              className="todo-btn todo-btn-primary h-10 px-4 text-sm"
            >
              <Icon name="CheckIcon" size={16} />
              {saving ? 'Adding…' : chosenCount === 1 ? 'Add task' : `Add ${chosenCount} tasks`}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

// ── Small chips used by the review cards ──────────────────────────────────────────────────────────────────────

function DateChip({ value, onChange }: { value: string | null; onChange: (v: string | null) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <span className="vc-chip relative" data-set={value ? 'true' : 'false'}>
      <Icon name="CalendarDaysIcon" size={14} />
      <button
        type="button"
        className="todo-focus rounded"
        onClick={() => {
          const el = inputRef.current;
          if (!el) return;
          try {
            el.showPicker();
          } catch {
            el.focus();
          }
        }}
        aria-label={value ? `Due ${formatDueDate(value)}. Change date` : 'Add a due date'}
      >
        {value ? formatDueDate(value) : 'Date'}
      </button>
      <input
        ref={inputRef}
        type="date"
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value || null)}
        tabIndex={-1}
        aria-hidden
        className="pointer-events-none absolute inset-0 h-full w-full opacity-0"
      />
      {value && (
        <button type="button" className="vc-chip-x" aria-label="Remove date" onClick={() => onChange(null)}>
          <Icon name="XMarkIcon" size={12} />
        </button>
      )}
    </span>
  );
}

export function PriorityChip({ value, onChange }: { value: TaskPriority; onChange: (p: TaskPriority) => void }) {
  const [open, setOpen] = useState(false);
  const anchorRef = useRef<HTMLButtonElement>(null);
  const meta = PRIORITY_META[value];
  return (
    <>
      <button
        ref={anchorRef}
        type="button"
        className="vc-chip"
        data-set={value !== 'p3' ? 'true' : 'false'}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Priority: ${meta.label}. Change priority`}
        onClick={() => setOpen((v) => !v)}
      >
        <Icon name="FlagIcon" size={14} variant={value === 'p3' ? 'outline' : 'solid'} className={meta.className} />
        {meta.label}
      </button>
      <Popover open={open} anchorRef={anchorRef} onClose={() => setOpen(false)} label="Priority" placement="bottom-start" className="todo-popover w-44 p-1">
        {(Object.keys(PRIORITY_META) as TaskPriority[]).map((p) => (
          <button
            key={p}
            type="button"
            role="menuitem"
            onClick={() => {
              onChange(p);
              setOpen(false);
            }}
            className="todo-focus flex min-h-[2.75rem] w-full items-center gap-2.5 rounded-md px-2.5 text-left text-sm text-foreground hover:bg-muted"
          >
            <Icon name="FlagIcon" size={16} variant="solid" className={PRIORITY_META[p].className} />
            <span className="flex-1">{PRIORITY_META[p].label}</span>
            {p === value && <Icon name="CheckIcon" size={14} className="text-primary" />}
          </button>
        ))}
      </Popover>
    </>
  );
}

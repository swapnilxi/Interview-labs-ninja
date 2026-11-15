'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Icon from '@/components/ui/AppIcon';
import FlatIcon from '@/components/ui/FlatIcon';
import { toast } from '@/lib/ui/toast';
import { confirmDialog } from '@/lib/ui/confirm';
import { isLoggedIn, onAuthChange } from '@/lib/auth/tokenStore';
import { isMissingKeyError } from '@/lib/services/settingsService';
import {
  scheduleService,
  parseServerTime,
  SCHEDULES_CHANGED_EVENT,
  type Schedule,
  type ScheduleCreatePayload,
  type ScheduleRun,
} from '@/lib/services/scheduleService';
import { describeRule, nextOccurrence } from '@/lib/schedules/scheduleRules';
import { runAgentOccurrence } from '@/lib/schedules/scheduleEngine';
import { nativeSchedulerAvailable, nativeSchedulerStatus } from '@/lib/schedules/nativeScheduler';
import { isNativeApp } from '@/lib/reminders/nativeReminders';
import { formatReminder } from '@/lib/reminders/reminderTime';
import ScheduleEditor, { blankEditor, editorFrom, type EditorValue } from './ScheduleEditor';

/**
 * To-Do → Scheduler: reminders and AI jobs that run on a schedule. Describe one in your own words (the AI turns it into
 * a schedule you confirm) or set it up with the options. The list shows when each runs next and what it said last
 * time. Runs happen in lib/schedules/scheduleEngine.ts (open tab) and the native alarms (Android app, app closed).
 */

const EXAMPLES = [
  'Every weekday at 8:30am, plan my day from my tasks',
  'Remind me to drink water every 2 hours',
  'Every Sunday at 7pm, review my week and add 3 tasks for next week',
  'Tomorrow at 6pm remind me to call the bank',
];

type EditorState = {
  mode: 'new' | 'edit';
  id?: number;
  initial: EditorValue;
  heading: string;
} | null;

export default function SchedulerView() {
  const router = useRouter();
  const params = useSearchParams();
  const focusId = Number(params.get('schedule')) || null;
  const focusRun = Number(params.get('run')) || null;
  const runNow = params.get('run_now');

  const [schedules, setSchedules] = useState<Schedule[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loggedIn, setLoggedIn] = useState(false);
  const [text, setText] = useState('');
  const [parsing, setParsing] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [editor, setEditor] = useState<EditorState>(null);
  const [saving, setSaving] = useState(false);
  const [now, setNow] = useState(() => new Date());
  const editorRef = useRef<HTMLDivElement>(null);
  const runNowDone = useRef<string | null>(null);

  const load = useCallback(async () => {
    try {
      setSchedules(await scheduleService.list());
      setLoadError(null);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Could not load your schedules.');
    }
  }, []);

  useEffect(() => {
    setLoggedIn(isLoggedIn());
    void load();
    const onChange = () => void load();
    window.addEventListener(SCHEDULES_CHANGED_EVENT, onChange);
    const offAuth = onAuthChange(() => {
      setLoggedIn(isLoggedIn());
      void load();
    });
    const tick = setInterval(() => setNow(new Date()), 30_000);
    return () => {
      window.removeEventListener(SCHEDULES_CHANGED_EVENT, onChange);
      offAuth();
      clearInterval(tick);
    };
  }, [load]);

  // A phone notification that couldn't run the job opens `…&run_now=<occurrence>`: run it here, once.
  useEffect(() => {
    if (!runNow || !schedules || runNowDone.current === runNow) return;
    const target = schedules.find((s) => s.id === focusId);
    if (!target || target.kind !== 'agent') return;
    runNowDone.current = runNow;
    void runAgentOccurrence(target, runNow, { source: 'app' });
    const next = new URLSearchParams(params.toString());
    next.delete('run_now');
    router.replace(`/ai-todo?${next.toString()}`);
  }, [runNow, schedules, focusId, params, router]);

  useEffect(() => {
    if (editor)
      requestAnimationFrame(() =>
        editorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
      );
  }, [editor]);

  const describe = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const request = text.trim();
    if (!request || parsing) return;
    setParseError(null);
    setParsing(true);
    try {
      const draft = await scheduleService.parse(request);
      setEditor({ mode: 'new', initial: editorFrom(draft), heading: 'Check and save' });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'The AI could not read that.';
      setParseError(
        isMissingKeyError(message)
          ? 'Add an AI key in Config (or pick “Use .env default”), then try again.'
          : message
      );
    } finally {
      setParsing(false);
    }
  };

  const save = async (payload: ScheduleCreatePayload) => {
    if (!editor) return;
    setSaving(true);
    try {
      if (editor.mode === 'edit' && editor.id) {
        await scheduleService.update(editor.id, payload);
        toast.success('Schedule updated');
      } else {
        const saved = await scheduleService.create(payload);
        const next = nextOccurrence(saved.rule, new Date());
        toast.success(
          next ? `Scheduled · next ${formatReminder(next.toISOString())}` : 'Scheduled'
        );
        setText('');
      }
      setEditor(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not save the schedule.');
    } finally {
      setSaving(false);
    }
  };

  const { active, inactive, nextLabel } = useMemo(() => {
    const list = schedules ?? [];
    const withNext = list.map((s) => ({ s, next: s.enabled ? nextOccurrence(s.rule, now) : null }));
    const on = withNext
      .filter((x) => x.s.enabled)
      .sort((a, b) => (a.next?.getTime() ?? Infinity) - (b.next?.getTime() ?? Infinity));
    const soonest = on.find((x) => x.next);
    return {
      active: on,
      inactive: withNext.filter((x) => !x.s.enabled),
      nextLabel: soonest?.next
        ? `${soonest.s.title} · ${formatReminder(soonest.next.toISOString(), now)}`
        : null,
    };
  }, [schedules, now]);

  return (
    <div className="today-layout">
      <div className="min-w-0">
        <div className="mb-[1rem] flex flex-wrap items-end justify-between gap-x-4 gap-y-1">
          <div>
            <p className="text-[13px] font-semibold text-muted-foreground">Scheduler</p>
            <h2 className="font-heading mt-0.5 text-[1.625rem] font-bold leading-tight tracking-[-0.022em] text-foreground sm:text-[1.85rem]">
              Put it on a schedule
            </h2>
          </div>
          {nextLabel && <p className="text-sm text-muted-foreground">Next: {nextLabel}</p>}
        </div>

        {/* Describe it */}
        <form onSubmit={describe} className="vc-card sch-composer">
          <label htmlFor="sch-describe" className="sr-only">
            Describe what to schedule
          </label>
          <textarea
            id="sch-describe"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                void describe();
              }
            }}
            rows={2}
            maxLength={500}
            disabled={!loggedIn}
            placeholder={
              loggedIn
                ? 'Describe it: “every weekday at 8:30, plan my day from my tasks”'
                : 'Sign in to describe a schedule in your own words'
            }
            className="sch-describe"
          />
          <div className="flex flex-wrap items-center gap-2 px-[0.5rem] pb-[0.25rem]">
            <button
              type="button"
              onClick={() =>
                setEditor({
                  mode: 'new',
                  initial: blankEditor(loggedIn ? 'agent' : 'reminder'),
                  heading: 'New schedule',
                })
              }
              className="todo-btn todo-btn-ghost h-9 px-2.5 text-sm"
            >
              <Icon name="AdjustmentsHorizontalIcon" size={15} />
              Set it up yourself
            </button>
            <button
              type="submit"
              disabled={!loggedIn || !text.trim() || parsing}
              className="todo-btn todo-btn-primary ml-auto h-9 px-3.5 text-sm"
            >
              <Icon name="SparklesIcon" size={15} variant="solid" />
              {parsing ? 'Reading…' : 'Schedule it'}
            </button>
          </div>
        </form>

        {loggedIn && !text && !editor && (
          <div className="mt-3 flex flex-wrap gap-1.5" aria-label="Examples">
            {EXAMPLES.map((example) => (
              <button
                key={example}
                type="button"
                onClick={() => setText(example)}
                className="sch-example"
              >
                {example}
              </button>
            ))}
          </div>
        )}

        {parseError && (
          <div role="alert" className="todo-alert todo-alert-error mt-3">
            <Icon name="ExclamationTriangleIcon" size={14} className="mt-px shrink-0" />
            <p className="flex-1">{parseError}</p>
          </div>
        )}

        {editor && (
          <div ref={editorRef} className="mt-4">
            <ScheduleEditor
              key={`${editor.mode}-${editor.id ?? 'new'}-${editor.initial.source_text ?? ''}`}
              initial={editor.initial}
              heading={editor.heading}
              saveLabel={editor.mode === 'edit' ? 'Save changes' : 'Save schedule'}
              canUseAgent={loggedIn}
              saving={saving}
              onSave={(payload) => void save(payload)}
              onCancel={() => setEditor(null)}
            />
          </div>
        )}

        {loadError && (
          <div role="alert" className="todo-alert todo-alert-error mt-4">
            <Icon name="ExclamationTriangleIcon" size={14} className="mt-px shrink-0" />
            <p className="flex-1">{loadError}</p>
            <button
              type="button"
              onClick={() => void load()}
              className="todo-btn todo-btn-ghost h-8 px-2"
            >
              Retry
            </button>
          </div>
        )}

        <div className="mt-[1.75rem] flex flex-col gap-[1.5rem]">
          {schedules && schedules.length === 0 && (
            <div className="agenda-empty">
              <FlatIcon name="clock" size={28} />
              <p className="font-heading mt-3 text-base font-semibold text-foreground">
                Nothing scheduled yet
              </p>
              <p className="mt-1 max-w-[24rem] text-sm text-muted-foreground">
                A reminder tells you something at a time. An AI job thinks for you at that time
                (plans your morning, reviews your week, checks what’s overdue) and sends you its
                answer.
              </p>
            </div>
          )}
          {active.length > 0 && (
            <ScheduleGroup
              id="active"
              title="Active"
              items={active}
              now={now}
              focusId={focusId}
              focusRun={focusRun}
              loggedIn={loggedIn}
              onEdit={(s) =>
                setEditor({
                  mode: 'edit',
                  id: s.id,
                  initial: editorFrom(s),
                  heading: 'Edit schedule',
                })
              }
            />
          )}
          {inactive.length > 0 && (
            <ScheduleGroup
              id="paused"
              title="Paused or done"
              items={inactive}
              now={now}
              focusId={focusId}
              focusRun={focusRun}
              loggedIn={loggedIn}
              onEdit={(s) =>
                setEditor({
                  mode: 'edit',
                  id: s.id,
                  initial: editorFrom(s),
                  heading: 'Edit schedule',
                })
              }
            />
          )}
        </div>
      </div>

      <aside className="today-aside" aria-label="Where schedules run">
        <SchedulerStatusCard loggedIn={loggedIn} />
      </aside>
    </div>
  );
}

// ── List ─────────────────────────────────────────────────────────────────────────────────────────────────────────

interface GroupProps {
  id: string;
  title: string;
  items: { s: Schedule; next: Date | null }[];
  now: Date;
  focusId: number | null;
  focusRun: number | null;
  loggedIn: boolean;
  onEdit: (s: Schedule) => void;
}

function ScheduleGroup({ id, title, items, now, focusId, focusRun, loggedIn, onEdit }: GroupProps) {
  return (
    <section aria-labelledby={`sch-group-${id}`} className="agenda-group">
      <header className="agenda-head">
        <h3 id={`sch-group-${id}`} className="agenda-title">
          {title}
        </h3>
        <span className="agenda-count">{items.length}</span>
      </header>
      <ul className="flex flex-col gap-2">
        {items.map(({ s, next }) => (
          <ScheduleItem
            key={s.id}
            schedule={s}
            next={next}
            now={now}
            focused={s.id === focusId}
            focusRun={s.id === focusId ? focusRun : null}
            loggedIn={loggedIn}
            onEdit={() => onEdit(s)}
          />
        ))}
      </ul>
    </section>
  );
}

interface ItemProps {
  schedule: Schedule;
  next: Date | null;
  now: Date;
  focused: boolean;
  focusRun: number | null;
  loggedIn: boolean;
  onEdit: () => void;
}

function ScheduleItem({ schedule: s, next, now, focused, focusRun, loggedIn, onEdit }: ItemProps) {
  const [open, setOpen] = useState(focused);
  const [runs, setRuns] = useState<ScheduleRun[] | null>(null);
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLLIElement>(null);
  const agentNeedsLogin = s.kind === 'agent' && !loggedIn;

  useEffect(() => {
    if (focused) {
      setOpen(true);
      requestAnimationFrame(() =>
        ref.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      );
    }
  }, [focused]);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    scheduleService
      .runs(s.id)
      .then((list) => alive && setRuns(list))
      .catch(() => alive && setRuns([]));
    return () => {
      alive = false;
    };
  }, [open, s.id, s.last_run_at]);

  const toggle = async () => {
    setBusy(true);
    try {
      await scheduleService.update(s.id, { enabled: !s.enabled });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not update the schedule.');
    } finally {
      setBusy(false);
    }
  };

  const runNow = async () => {
    setBusy(true);
    try {
      if (s.kind === 'agent') {
        const result = await runAgentOccurrence(s, new Date().toISOString(), {
          source: 'manual',
          quiet: true,
        });
        if (result?.run.status === 'ok') setOpen(true);
      } else {
        await scheduleService.run(s.id, new Date().toISOString(), 'manual');
        toast.info(s.message ? `${s.title}: ${s.message}` : s.title);
      }
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    const ok = await confirmDialog({
      title: `Delete “${s.title}”?`,
      message: 'It stops running on this device and your phone, and its history is removed.',
      confirmLabel: 'Delete',
      tone: 'danger',
    });
    if (!ok) return;
    try {
      await scheduleService.remove(s.id);
      toast.success('Schedule deleted');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not delete the schedule.');
    }
  };

  const lastAt = parseServerTime(s.last_run_at);
  const once = s.rule.repeat === 'once';

  return (
    <li
      ref={ref}
      className="sch-item"
      data-off={s.enabled ? undefined : 'true'}
      data-focus={focused ? 'true' : undefined}
    >
      <div className="flex items-start gap-3">
        <span className="rem-alert-icon" aria-hidden>
          {s.kind === 'agent' ? (
            <Icon name="SparklesIcon" size={18} variant="solid" className="lab-ink" />
          ) : (
            <FlatIcon name="clock" size={18} />
          )}
        </span>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="todo-focus min-w-0 flex-1 rounded-lg text-left"
        >
          <p className="break-words text-[15px] font-semibold leading-snug text-foreground">
            {s.title}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            <span className="font-medium">{s.kind === 'agent' ? 'AI job' : 'Reminder'}</span> ·{' '}
            {describeRule(s.rule)}
          </p>
          <p className="mt-0.5 text-xs">
            {s.enabled && next ? (
              <span className="lab-ink font-medium">
                Next: {formatReminder(next.toISOString(), now)}
              </span>
            ) : s.enabled ? (
              <span className="text-muted-foreground">No upcoming run</span>
            ) : (
              <span className="text-muted-foreground">
                {once && s.last_status === 'ok' ? 'Done' : 'Paused'}
              </span>
            )}
            {agentNeedsLogin && <span className="text-warning"> · sign in to run</span>}
          </p>
        </button>
        <button
          type="button"
          role="switch"
          aria-checked={s.enabled}
          aria-label={s.enabled ? `Pause ${s.title}` : `Resume ${s.title}`}
          disabled={busy}
          onClick={() => void toggle()}
          className="sch-switch"
        />
      </div>

      {!open && s.last_output && s.kind === 'agent' && (
        <p className="mt-2 line-clamp-2 break-words pl-[3.25rem] text-[13px] leading-relaxed text-muted-foreground">
          {s.last_output}
        </p>
      )}

      {open && (
        <div className="mt-3 pl-0 sm:pl-[3.25rem]">
          {s.message && (
            <p className="whitespace-pre-line break-words text-[13px] leading-relaxed text-foreground">
              <span className="font-semibold text-muted-foreground">
                {s.kind === 'agent' ? 'Instructions: ' : 'Text: '}
              </span>
              {s.message}
            </p>
          )}
          {s.kind === 'agent' && (
            <p className="mt-1 text-xs text-muted-foreground">
              {s.agent_context === 'tasks' ? 'Reads your open tasks' : 'Doesn’t read your tasks'}
              {s.add_tasks ? ' · adds the tasks it suggests' : ''}
            </p>
          )}

          <div className="mt-3 flex flex-wrap gap-1.5">
            <button
              type="button"
              disabled={busy || agentNeedsLogin}
              onClick={() => void runNow()}
              className="todo-btn todo-btn-quiet h-9 px-3 text-sm"
            >
              <Icon name="PlayIcon" size={14} />
              {busy && s.kind === 'agent' ? 'Running…' : 'Run now'}
            </button>
            <button
              type="button"
              onClick={onEdit}
              className="todo-btn todo-btn-ghost h-9 px-3 text-sm"
            >
              <Icon name="PencilSquareIcon" size={14} />
              Edit
            </button>
            <button
              type="button"
              onClick={() => void remove()}
              className="todo-btn todo-btn-ghost h-9 px-3 text-sm text-destructive"
            >
              <Icon name="TrashIcon" size={14} />
              Delete
            </button>
          </div>

          <h4 className="mt-4 text-xs font-semibold text-muted-foreground">History</h4>
          {runs === null ? (
            <p className="mt-1 text-xs text-muted-foreground">Loading…</p>
          ) : runs.length === 0 ? (
            <p className="mt-1 text-xs text-muted-foreground">
              {Number.isNaN(lastAt)
                ? 'Hasn’t run yet.'
                : `Last ran ${formatReminder(new Date(lastAt).toISOString(), now)}.`}
            </p>
          ) : (
            <ol className="mt-1.5 flex flex-col gap-1.5">
              {runs.map((run) => (
                <RunRow key={run.id} run={run} highlight={run.id === focusRun} now={now} />
              ))}
            </ol>
          )}
        </div>
      )}
    </li>
  );
}

const SOURCE_LABEL: Record<string, string> = { web: 'browser', app: 'phone', manual: 'run now' };

function RunRow({ run, highlight, now }: { run: ScheduleRun; highlight: boolean; now: Date }) {
  const at = parseServerTime(run.finished_at || run.started_at);
  const when = Number.isNaN(at) ? '' : formatReminder(new Date(at).toISOString(), now);
  return (
    <li
      className="sch-run"
      data-status={run.status}
      data-highlight={highlight ? 'true' : undefined}
    >
      <p className="text-xs text-muted-foreground">
        <span className="sch-run-dot" aria-hidden />
        {run.status === 'error' ? 'Failed' : run.status === 'running' ? 'Running' : 'Ran'} {when}
        {SOURCE_LABEL[run.source] ? ` · ${SOURCE_LABEL[run.source]}` : ''}
        {run.created_task_ids.length
          ? ` · added ${run.created_task_ids.length} task${run.created_task_ids.length > 1 ? 's' : ''}`
          : ''}
      </p>
      {run.output && (
        <p className="mt-0.5 whitespace-pre-line break-words text-[13px] leading-relaxed text-foreground">
          {run.title && run.title !== run.output ? (
            <span className="font-semibold">{run.title}. </span>
          ) : null}
          {run.output}
        </p>
      )}
    </li>
  );
}

// ── Where it runs ────────────────────────────────────────────────────────────────────────────────────────────────

function SchedulerStatusCard({ loggedIn }: { loggedIn: boolean }) {
  const [native, setNative] = useState<{
    app: boolean;
    plugin: boolean;
    exact?: boolean;
    notifications?: boolean;
  } | null>(null);

  useEffect(() => {
    const app = isNativeApp();
    const plugin = nativeSchedulerAvailable();
    if (!plugin) {
      setNative({ app, plugin });
      return;
    }
    void nativeSchedulerStatus().then((st) =>
      setNative({ app, plugin, exact: st?.exact, notifications: st?.notifications })
    );
  }, []);

  if (!native) return null;
  const phoneReady = native.plugin && native.exact !== false && native.notifications !== false;
  return (
    <div className="rem-status" data-tone={native.app ? (phoneReady ? 'on' : 'off') : 'on'}>
      <div className="flex items-start gap-3">
        <span className="rem-status-dot" aria-hidden />
        <div className="min-w-0">
          <p className="text-sm font-semibold text-foreground">
            {native.app
              ? phoneReady
                ? 'Runs on this phone, even closed'
                : 'Phone setup needed'
              : 'Runs while LabNinja is open'}
          </p>
          <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
            {native.app
              ? !native.plugin
                ? 'Install the latest version of the app to run schedules with it closed. Until then they run while it is open.'
                : native.notifications === false
                  ? 'Allow notifications for LabNinja in Android Settings, or you won’t see the results.'
                  : native.exact === false
                    ? 'Allow “Alarms & reminders” for LabNinja in Android Settings so jobs run on the minute.'
                    : 'Each run is an exact phone alarm. AI jobs call the AI from your phone and show the answer as a notification (needs internet then).'
              : 'Any open LabNinja tab runs your schedules. Closed tabs can’t: a missed reminder shows when you’re back, and an AI job up to 6 hours late still runs. Install the Android app to run them closed.'}
          </p>
        </div>
      </div>
      <p className="rem-tip">
        <Icon name="SparklesIcon" size={14} className="mt-0.5 shrink-0" />
        <span>
          {loggedIn
            ? 'AI jobs use your main model and keys from Config.'
            : 'Reminders are saved in this browser. Sign in for AI jobs and to describe schedules in your own words.'}
        </span>
      </p>
    </div>
  );
}

'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Icon from '@/components/ui/AppIcon';
import FlatIcon from '@/components/ui/FlatIcon';
import Modal from '@/components/ui/Modal';
import { toast } from '@/lib/ui/toast';
import { confirmDialog } from '@/lib/ui/confirm';
import { isLoggedIn, onAuthChange } from '@/lib/auth/tokenStore';
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
import AssistantMarkdown from './assistant/AssistantMarkdown';

/**
 * To-Do → Assistant → "Scheduled": the reminders and AI jobs that run on a schedule, beside the Assistant chat (which is
 * where you describe new ones in your own words). The list shows when each runs next and what it said last time; "New"
 * sets one up with the options. Runs happen in lib/schedules/scheduleEngine.ts (open tab) and the native alarms
 * (Android app, app closed).
 */

/** The Assistant's "Edit" on a schedule card: `new CustomEvent(EDIT_SCHEDULE_EVENT, { detail: id })`. */
export const EDIT_SCHEDULE_EVENT = 'todo:schedule-edit';

type EditorState = {
  mode: 'new' | 'edit';
  id?: number;
  initial: EditorValue;
  heading: string;
} | null;

interface Props {
  /** Reports how many schedules there are (the phone switch shows it). */
  onCount?: (count: number) => void;
}

export default function SchedulerView({ onCount }: Props) {
  const router = useRouter();
  const params = useSearchParams();
  const focusId = Number(params.get('schedule')) || null;
  const focusRun = Number(params.get('run')) || null;
  const runNow = params.get('run_now');

  const [schedules, setSchedules] = useState<Schedule[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loggedIn, setLoggedIn] = useState(false);
  const [editor, setEditor] = useState<EditorState>(null);
  const [saving, setSaving] = useState(false);
  const [now, setNow] = useState(() => new Date());
  const runNowDone = useRef<string | null>(null);
  const schedulesRef = useRef<Schedule[] | null>(null);
  schedulesRef.current = schedules;

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

  useEffect(() => {
    if (schedules) onCount?.(schedules.length);
  }, [schedules, onCount]);

  // "Edit" on one of the Assistant's cards.
  useEffect(() => {
    const onEdit = async (e: Event) => {
      const id = Number((e as CustomEvent).detail);
      const list = schedulesRef.current ?? (await scheduleService.list().catch(() => []));
      const s =
        list.find((x) => x.id === id) ??
        (await scheduleService.list().catch(() => [])).find((x) => x.id === id);
      if (s)
        setEditor({ mode: 'edit', id: s.id, initial: editorFrom(s), heading: 'Edit schedule' });
      else toast.error('That schedule no longer exists.');
    };
    window.addEventListener(EDIT_SCHEDULE_EVENT, onEdit);
    return () => window.removeEventListener(EDIT_SCHEDULE_EVENT, onEdit);
  }, []);

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
      }
      setEditor(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not save the schedule.');
    } finally {
      setSaving(false);
    }
  };

  const { active, inactive } = useMemo(() => {
    const list = schedules ?? [];
    const withNext = list.map((s) => ({ s, next: s.enabled ? nextOccurrence(s.rule, now) : null }));
    const on = withNext
      .filter((x) => x.s.enabled)
      .sort((a, b) => (a.next?.getTime() ?? Infinity) - (b.next?.getTime() ?? Infinity));
    return { active: on, inactive: withNext.filter((x) => !x.s.enabled) };
  }, [schedules, now]);

  const openEdit = (s: Schedule) =>
    setEditor({ mode: 'edit', id: s.id, initial: editorFrom(s), heading: 'Edit schedule' });

  return (
    <div>
      <div className="mb-[0.75rem] flex items-center justify-between gap-3">
        <h3 className="flex items-baseline gap-2 text-base font-semibold text-foreground">
          Scheduled
          {schedules && schedules.length > 0 && (
            <span className="text-[13px] font-normal text-muted-foreground">
              {schedules.length}
            </span>
          )}
        </h3>
        <button
          type="button"
          onClick={() =>
            setEditor({
              mode: 'new',
              initial: blankEditor(loggedIn ? 'agent' : 'reminder'),
              heading: 'New schedule',
            })
          }
          className="todo-btn todo-btn-quiet h-9 px-3 text-sm"
        >
          <Icon name="PlusIcon" size={15} />
          New
        </button>
      </div>

      <Modal
        isOpen={!!editor}
        onClose={() => setEditor(null)}
        label={editor?.heading ?? 'Schedule'}
        closeOnBackdrop={false}
        className="agt-editor-modal max-h-[90vh] w-full max-w-[34rem] overflow-y-auto"
      >
        {editor && (
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
        )}
      </Modal>

      {loadError && (
        <div role="alert" className="todo-alert todo-alert-error mb-3">
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

      <div className="flex flex-col gap-[1.25rem]">
        {schedules === null && !loadError && (
          <div className="flex flex-col gap-2" aria-hidden>
            <div className="skeleton h-[4.5rem] rounded-[1.125rem]" />
            <div className="skeleton h-[4.5rem] rounded-[1.125rem]" />
          </div>
        )}
        {schedules && schedules.length === 0 && (
          <div className="agenda-empty">
            <FlatIcon name="clock" size={28} quiet className="text-muted-foreground" />
            <p className="font-heading mt-3 text-base font-semibold text-foreground">
              Nothing scheduled yet
            </p>
            <p className="mt-1 max-w-[24rem] text-sm text-muted-foreground">
              Tell the Assistant what to do and when (“every Friday at 6pm, write my weekly
              report”), or set one up with New. A reminder tells you something; an AI job thinks for
              you at that time and sends you its answer.
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
            onEdit={openEdit}
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
            onEdit={openEdit}
          />
        )}
        <SchedulerStatusCard loggedIn={loggedIn} />
      </div>
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
            <FlatIcon name="clock" size={18} quiet />
          )}
        </span>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="todo-focus min-w-0 flex-1 rounded-lg text-left"
        >
          <p className="break-words text-[15px] font-medium leading-snug text-foreground">
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
              <span className="font-medium text-muted-foreground">
                {s.kind === 'agent' ? 'Instructions: ' : 'Text: '}
              </span>
              {s.message}
            </p>
          )}
          {s.kind === 'agent' && (
            <p className="mt-1 text-xs text-muted-foreground">{jobSummary(s)}</p>
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

          <h4 className="mt-4 text-xs font-medium text-muted-foreground">History</h4>
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

/** What an AI job reads and does, in one line. */
export function jobSummary(
  s: Pick<Schedule, 'agent_context' | 'use_web' | 'write_report' | 'add_tasks'>
): string {
  return [
    s.agent_context === 'workspace'
      ? 'Reads all of your To-Do'
      : s.agent_context === 'tasks'
        ? 'Reads your open tasks'
        : 'Doesn’t read your tasks',
    s.use_web && 'searches the web',
    s.write_report && 'writes a full report',
    s.add_tasks && 'adds the tasks it suggests',
  ]
    .filter(Boolean)
    .join(' · ');
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
      {run.report ? (
        <div className="mt-1">
          {run.title && <p className="text-[13px] font-medium text-foreground">{run.title}</p>}
          <div className="sch-run-report">
            <AssistantMarkdown text={run.report} />
          </div>
        </div>
      ) : (
        run.output && (
          <p className="mt-0.5 whitespace-pre-line break-words text-[13px] leading-relaxed text-foreground">
            {run.title && run.title !== run.output ? (
              <span className="font-medium">{run.title}. </span>
            ) : null}
            {run.output}
          </p>
        )
      )}
      {run.sources && run.sources.length > 0 && (
        <p className="mt-1 break-words text-xs text-muted-foreground">
          Sources:{' '}
          {run.sources.map((src, i) => (
            <React.Fragment key={src.url}>
              {i > 0 && ', '}
              <a
                href={src.url}
                target="_blank"
                rel="noopener noreferrer nofollow"
                className="underline"
              >
                {src.title}
              </a>
            </React.Fragment>
          ))}
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
          <p className="text-sm font-medium text-foreground">
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

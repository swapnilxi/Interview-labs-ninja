'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Icon from '@/components/ui/AppIcon';
import FlatIcon, { type FlatIconName } from '@/components/ui/FlatIcon';
import Popover from '@/components/ui/Popover';
import { toast } from '@/lib/ui/toast';
import { TASKS_CHANGED_EVENT, todoService, triggerConfetti, type Task } from '@/lib/services/todoService';
import { ymd } from '@/lib/reminders/smartParse';
import { canAddToCalendar, downloadIcs, formatDueDate, googleCalendarUrl, isPast } from '@/lib/reminders/reminderTime';
import VoiceCapture, { PRIORITY_META } from '../capture/VoiceCapture';
import ReminderPicker from '../reminders/ReminderPicker';
import ReminderStatusCard, { NotificationNudge } from '../reminders/ReminderStatusCard';
import TaskDetailModal from '../tasks/TaskDetailModal';

/**
 * Today: the home of the To-Do — say or type a task, and see what needs you now. Tasks are grouped by when they are
 * for (Overdue · Today · Tomorrow · Upcoming · Anytime), each with its reminder, in the TickTick/ClickUp manner: a round
 * check coloured by priority, the title, and quiet chips. Built on the same tasks as the Tasks tab.
 */

interface TodayViewProps {
  model: 'ollama' | 'gemini';
}

type GroupId = 'overdue' | 'today' | 'tomorrow' | 'upcoming' | 'anytime';

const GROUPS: { id: GroupId; label: string; icon: FlatIconName; empty?: string }[] = [
  { id: 'overdue', label: 'Overdue', icon: 'warning' },
  { id: 'today', label: 'Today', icon: 'calendar' },
  { id: 'tomorrow', label: 'Tomorrow', icon: 'next' },
  { id: 'upcoming', label: 'Next 7 days and later', icon: 'plan' },
  { id: 'anytime', label: 'Anytime', icon: 'idea' },
];

const ANYTIME_LIMIT = 8;

function dayOf(task: Task): string | null {
  if (task.due_date) return task.due_date.slice(0, 10);
  if (task.remind_at) {
    const d = new Date(task.remind_at);
    if (!Number.isNaN(d.getTime())) return ymd(d);
  }
  return null;
}

function isOpen(task: Task): boolean {
  return task.status !== 'done' && task.status !== 'not_done';
}

function sortKey(task: Task): number {
  const t = task.remind_at ? Date.parse(task.remind_at) : NaN;
  return Number.isNaN(t) ? Number.MAX_SAFE_INTEGER : t;
}

const PRIORITY_RANK = { p1: 0, p2: 1, p3: 2, p4: 3 } as const;

/** Server timestamps are UTC, sometimes without a zone and with microseconds (Safari can't parse those as they are). */
function serverTime(value: string): Date | null {
  let v = value.trim().replace(' ', 'T').replace(/(\.\d{3})\d+/, '$1');
  if (!/(Z|[+-]\d\d:?\d\d)$/.test(v)) v += 'Z';
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

function greeting(now: Date): string {
  const h = now.getHours();
  if (h < 5) return 'Good night';
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

export default function TodayView({ model }: TodayViewProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [tasks, setTasks] = useState<Task[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showAllAnytime, setShowAllAnytime] = useState(false);
  const [showDone, setShowDone] = useState(false);
  const [now, setNow] = useState(() => new Date());
  const [detailId, setDetailId] = useState<number | null>(null);
  const [justAdded, setJustAdded] = useState<Set<number>>(new Set());
  const captureRef = useRef<HTMLDivElement>(null);

  // The floating mic is for when the capture card has scrolled away: while the card is on screen it would only be a
  // second mic floating over the list (see .vc-fab-today in tailwind.css).
  useEffect(() => {
    const el = captureRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(([entry]) => {
      document.body.dataset.captureInView = entry.isIntersecting ? 'true' : 'false';
    });
    io.observe(el);
    return () => {
      io.disconnect();
      delete document.body.dataset.captureInView;
    };
  }, []);

  const load = useCallback(async () => {
    try {
      const list = await todoService.fetchTaskTreeStrict().then((tree) => {
        const flat: Task[] = [];
        const walk = (nodes: Task[]) => nodes.forEach((n) => (flat.push(n), n.children?.length && walk(n.children)));
        walk(tree);
        return flat;
      });
      setTasks(list);
      setLoadError(null);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Couldn’t load your tasks.');
      setTasks((prev) => prev ?? []);
    }
    setNow(new Date());
  }, []);

  useEffect(() => {
    void load();
    const onChange = () => void load();
    window.addEventListener(TASKS_CHANGED_EVENT, onChange);
    // Re-group at least once a minute so "Today"/"Overdue" and red reminder chips stay true.
    const tick = setInterval(() => setNow(new Date()), 60_000);
    return () => {
      window.removeEventListener(TASKS_CHANGED_EVENT, onChange);
      clearInterval(tick);
    };
  }, [load]);

  // ?task=ID (a tapped reminder) opens that task.
  const taskParam = searchParams.get('task');
  useEffect(() => {
    const id = taskParam ? Number(taskParam) : NaN;
    if (Number.isFinite(id) && id > 0) setDetailId(id);
  }, [taskParam]);

  const closeDetail = () => {
    setDetailId(null);
    if (taskParam) {
      const params = new URLSearchParams(searchParams.toString());
      params.delete('task');
      router.replace(`/ai-todo?${params.toString()}`, { scroll: false });
    }
    void load();
  };

  const byId = useMemo(() => new Map((tasks ?? []).map((t) => [t.id, t])), [tasks]);

  const groups = useMemo(() => {
    const out: Record<GroupId, Task[]> = { overdue: [], today: [], tomorrow: [], upcoming: [], anytime: [] };
    if (!tasks) return out;
    const today = ymd(now);
    const tomorrow = ymd(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1));
    for (const t of tasks) {
      if (!isOpen(t)) continue;
      const day = dayOf(t);
      if (!day) {
        // Only whole tasks, not the AI's sub-steps: "Anytime" is what you captured, not every breakdown leaf.
        if (t.parent_id === null) out.anytime.push(t);
      } else if (day < today) out.overdue.push(t);
      else if (day === today) out.today.push(t);
      else if (day === tomorrow) out.tomorrow.push(t);
      else out.upcoming.push(t);
    }
    const byTime = (a: Task, b: Task) =>
      (dayOf(a) ?? '').localeCompare(dayOf(b) ?? '') ||
      sortKey(a) - sortKey(b) ||
      PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] ||
      a.id - b.id;
    (Object.keys(out) as GroupId[]).forEach((g) => out[g].sort(byTime));
    out.anytime.sort((a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] || b.id - a.id);
    return out;
  }, [tasks, now]);

  const doneToday = useMemo(() => {
    if (!tasks) return [];
    const today = ymd(now);
    return tasks.filter((t) => {
      if (t.status !== 'done' || !t.updated_at) return false;
      const when = serverTime(t.updated_at);
      return when !== null && ymd(when) === today;
    });
  }, [tasks, now]);

  const remindersToday = groups.today.filter((t) => t.remind_at && !isPast(t.remind_at, now)).length;
  const openToday = groups.today.length + groups.overdue.length;

  const setDone = async (task: Task, done: boolean, origin?: HTMLElement | null) => {
    setTasks((list) => list?.map((t) => (t.id === task.id ? { ...t, status: done ? 'done' : 'backlog' } : t)) ?? list);
    if (done && origin) {
      const r = origin.getBoundingClientRect();
      triggerConfetti(r.left + r.width / 2, r.top + r.height / 2);
    }
    const saved = await todoService.updateTask(task.id, { status: done ? 'done' : 'backlog' });
    if (!saved) void load();
    else if (done)
      toast.success(`Done: ${task.title}`, {
        action: { label: 'Undo', onClick: () => void todoService.updateTask(task.id, { status: task.status }) },
      });
  };

  const setReminder = async (task: Task, iso: string | null) => {
    setTasks((list) => list?.map((t) => (t.id === task.id ? { ...t, remind_at: iso } : t)) ?? list);
    const patch: Record<string, string | null> = { remind_at: iso };
    // A reminder on a day other than the due day moves the task to that day, so it shows where you expect it.
    if (iso && task.due_date && task.due_date.slice(0, 10) !== ymd(new Date(iso))) patch.due_date = ymd(new Date(iso));
    if (iso && !task.due_date) patch.due_date = ymd(new Date(iso));
    const saved = await todoService.updateTask(task.id, patch);
    if (!saved) void load();
  };

  const moveToTomorrow = async (task: Task) => {
    const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    const patch: Record<string, string | null> = { due_date: ymd(tomorrow) };
    if (task.remind_at) {
      const r = new Date(task.remind_at);
      patch.remind_at = new Date(tomorrow.getFullYear(), tomorrow.getMonth(), tomorrow.getDate(), r.getHours(), r.getMinutes()).toISOString();
    }
    await todoService.updateTask(task.id, patch);
  };

  const rescheduleOverdue = async () => {
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    for (const t of groups.overdue) {
      const patch: Record<string, string | null> = { due_date: ymd(today) };
      if (t.remind_at) {
        const r = new Date(t.remind_at);
        const moved = new Date(today.getFullYear(), today.getMonth(), today.getDate(), r.getHours(), r.getMinutes());
        patch.remind_at = (moved > now ? moved : new Date(now.getTime() + 60 * 60_000)).toISOString();
      }
      await todoService.updateTask(t.id, patch);
    }
    toast.success(`Moved ${groups.overdue.length} task${groups.overdue.length === 1 ? '' : 's'} to today`);
  };

  const remove = async (task: Task) => {
    setTasks((list) => list?.filter((t) => t.id !== task.id) ?? list);
    const ok = await todoService.deleteTask(task.id);
    if (!ok) void load();
    else toast.info(`Deleted “${task.title}”`);
  };

  const onAdded = (created: Task[]) => {
    if (created.length) setJustAdded(new Set(created.map((t) => t.id)));
    void load();
  };

  const totalOpen = (Object.keys(groups) as GroupId[]).reduce((n, g) => n + groups[g].length, 0);

  return (
    <div className="today-layout">
      <div className="min-w-0">
        {/* Greeting: the day at a glance */}
        <div className="mb-[1rem] flex flex-wrap items-end justify-between gap-x-4 gap-y-1">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
              {now.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}
            </p>
            <h2 className="font-heading mt-1 text-[1.6rem] font-semibold leading-tight tracking-tight text-foreground sm:text-[1.85rem]">
              {greeting(now)}
            </h2>
          </div>
          {tasks && (
            <p className="text-sm text-muted-foreground">
              {openToday === 0 ? 'Nothing due today' : `${openToday} to do today`}
              {remindersToday > 0 && ` · ${remindersToday} reminder${remindersToday === 1 ? '' : 's'} to come`}
            </p>
          )}
        </div>

        <div ref={captureRef}>
          <VoiceCapture model={model} onAdded={onAdded} />
        </div>

        {/* Phones and tablets: the side card is far below, so a reminder you just set gets its "turn on" right here. */}
        <NotificationNudge hasReminders={(tasks ?? []).some((t) => isOpen(t) && t.remind_at && !isPast(t.remind_at, now))} />

        {loadError && (
          <div role="alert" className="todo-alert todo-alert-error mt-4">
            <Icon name="ExclamationTriangleIcon" size={14} className="mt-px shrink-0" />
            <p className="flex-1">{loadError}</p>
            <button type="button" onClick={() => void load()} className="todo-btn todo-btn-ghost h-8 px-2">
              Retry
            </button>
          </div>
        )}

        <div className="mt-[1.75rem] flex flex-col gap-[1.5rem]">
          {tasks === null ? (
            <AgendaSkeleton />
          ) : totalOpen === 0 ? (
            <div className="agenda-empty">
              <FlatIcon name="ok" size={44} />
              <p className="font-heading mt-3 text-base font-semibold text-foreground">You’re all clear</p>
              <p className="mt-1 max-w-[22rem] text-sm text-muted-foreground">
                Tap the mic and say what’s on your mind — “remind me to pay rent on Friday at 10” — and it lands here with its reminder.
              </p>
            </div>
          ) : (
            GROUPS.map((group) => {
              const all = groups[group.id];
              if (!all.length) return null;
              const list = group.id === 'anytime' && !showAllAnytime ? all.slice(0, ANYTIME_LIMIT) : all;
              return (
                <section key={group.id} aria-labelledby={`agenda-${group.id}`} className="agenda-group" data-group={group.id}>
                  <header className="agenda-head">
                    <FlatIcon name={group.icon} size={18} />
                    <h3 id={`agenda-${group.id}`} className="agenda-title">
                      {group.label}
                    </h3>
                    <span className="agenda-count">{all.length}</span>
                    {group.id === 'overdue' && (
                      <button type="button" onClick={() => void rescheduleOverdue()} className="todo-btn todo-btn-ghost ml-auto h-8 px-2.5">
                        <Icon name="ArrowUturnRightIcon" size={14} />
                        Move all to today
                      </button>
                    )}
                  </header>
                  <ul className="agenda-list">
                    {list.map((task) => (
                      <AgendaRow
                        key={task.id}
                        task={task}
                        parent={task.parent_id ? byId.get(task.parent_id) ?? null : null}
                        now={now}
                        showDay={group.id === 'upcoming' || group.id === 'overdue'}
                        fresh={justAdded.has(task.id)}
                        onToggle={(done, el) => void setDone(task, done, el)}
                        onOpen={() => setDetailId(task.id)}
                        onReminder={(iso) => void setReminder(task, iso)}
                        onTomorrow={() => void moveToTomorrow(task)}
                        onDelete={() => void remove(task)}
                      />
                    ))}
                  </ul>
                  {group.id === 'anytime' && all.length > ANYTIME_LIMIT && (
                    <button type="button" onClick={() => setShowAllAnytime((v) => !v)} className="todo-btn todo-btn-ghost mt-1 h-9 px-2.5">
                      {showAllAnytime ? 'Show fewer' : `Show all ${all.length}`}
                    </button>
                  )}
                </section>
              );
            })
          )}

          {doneToday.length > 0 && (
            <section aria-labelledby="agenda-done" className="agenda-group">
              <button
                type="button"
                onClick={() => setShowDone((v) => !v)}
                aria-expanded={showDone}
                className="agenda-head todo-focus w-full rounded-lg text-left"
              >
                <FlatIcon name="done" size={18} />
                <h3 id="agenda-done" className="agenda-title">
                  Completed today
                </h3>
                <span className="agenda-count">{doneToday.length}</span>
                <Icon name="ChevronDownIcon" size={14} className={`ml-auto text-muted-foreground transition-transform ${showDone ? 'rotate-180' : ''}`} />
              </button>
              {showDone && (
                <ul className="agenda-list">
                  {doneToday.map((task) => (
                    <AgendaRow
                      key={task.id}
                      task={task}
                      parent={null}
                      now={now}
                      showDay={false}
                      onToggle={(done) => void setDone(task, done)}
                      onOpen={() => setDetailId(task.id)}
                      onDelete={() => void remove(task)}
                    />
                  ))}
                </ul>
              )}
            </section>
          )}
        </div>
      </div>

      <aside className="today-aside" aria-label="Reminders on this device">
        <ReminderStatusCard />
      </aside>

      <TaskDetailModal taskId={detailId} isOpen={detailId !== null} onClose={closeDetail} onUpdate={() => void load()} model={model} />
    </div>
  );
}

// ── One task row ──────────────────────────────────────────────────────────────────────────────────────────────

interface AgendaRowProps {
  task: Task;
  parent: Task | null;
  now: Date;
  showDay: boolean;
  fresh?: boolean;
  onToggle: (done: boolean, el?: HTMLElement | null) => void;
  onOpen: () => void;
  onReminder?: (iso: string | null) => void;
  onTomorrow?: () => void;
  onDelete: () => void;
}

function AgendaRow({ task, parent, now, showDay, fresh, onToggle, onOpen, onReminder, onTomorrow, onDelete }: AgendaRowProps) {
  const done = task.status === 'done';
  const prio = PRIORITY_META[task.priority] ?? PRIORITY_META.p3;
  const checkRef = useRef<HTMLButtonElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLButtonElement>(null);
  const due = task.due_date ? formatDueDate(task.due_date, now) : '';
  const overdueDay = !done && task.due_date && task.due_date.slice(0, 10) < ymd(now);
  const subtasks = task.children?.length ?? 0;
  const subDone = task.children?.filter((c) => c.status === 'done').length ?? 0;
  const gcal = googleCalendarUrl(task);

  return (
    <li className="todo-row agenda-row" data-done={done ? 'true' : undefined} data-fresh={fresh ? 'true' : undefined}>
      <button
        ref={checkRef}
        type="button"
        role="checkbox"
        aria-checked={done}
        aria-label={done ? `Mark “${task.title}” not done` : `Complete “${task.title}”`}
        onClick={() => onToggle(!done, checkRef.current)}
        className="prio-check"
        style={{ '--prio': prio.ring } as React.CSSProperties}
      >
        <span className="prio-check-dot" aria-hidden>
          <Icon name="CheckIcon" size={12} className="prio-check-mark" />
        </span>
      </button>

      <div className="min-w-0 flex-1">
        <button type="button" onClick={onOpen} className="agenda-task-title todo-focus rounded text-left">
          {task.title}
        </button>
        <div className="agenda-meta">
          {parent && (
            <span className="agenda-parent">in {parent.title}</span>
          )}
          {onReminder && !done ? (
            <ReminderPicker value={task.remind_at} onChange={onReminder} taskTitle={task.title} />
          ) : null}
          {showDay && due && !task.remind_at && (
            <span className={`vc-chip ${overdueDay ? 'vc-chip-danger' : ''}`} data-set="true">
              <Icon name="CalendarDaysIcon" size={13} />
              {due}
            </span>
          )}
          {task.priority !== 'p3' && (
            <span className="vc-chip" data-set="true" title={`${prio.label} priority`}>
              <Icon name="FlagIcon" size={13} variant="solid" className={prio.className} />
              {prio.label}
            </span>
          )}
          {subtasks > 0 && (
            <span className="vc-chip" data-set="true" title="Subtasks done">
              <Icon name="ListBulletIcon" size={13} />
              {subDone}/{subtasks}
            </span>
          )}
          {task.is_recurring && (
            <span className="vc-chip" data-set="true" title="Repeats">
              <Icon name="ArrowPathIcon" size={13} />
              {task.recurrence_interval ?? 'Repeats'}
            </span>
          )}
        </div>
      </div>

      <button
        ref={menuRef}
        type="button"
        onClick={() => setMenuOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        aria-label={`More for “${task.title}”`}
        className="todo-btn todo-btn-ghost todo-reveal h-9 w-9 shrink-0 px-0"
      >
        <Icon name="EllipsisHorizontalIcon" size={18} />
      </button>
      <Popover open={menuOpen} anchorRef={menuRef} onClose={() => setMenuOpen(false)} label={`Actions for ${task.title}`} className="todo-popover w-56 p-1">
        <MenuItem icon="PencilSquareIcon" label="Open details" onClick={() => (setMenuOpen(false), onOpen())} />
        {onTomorrow && !done && <MenuItem icon="ArrowUturnRightIcon" label="Move to tomorrow" onClick={() => (setMenuOpen(false), onTomorrow())} />}
        {canAddToCalendar(task) && (
          <MenuItem icon="CalendarDaysIcon" label="Add to calendar (.ics)" onClick={() => (setMenuOpen(false), downloadIcs(task))} />
        )}
        {gcal && (
          <a
            role="menuitem"
            href={gcal}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => setMenuOpen(false)}
            className="todo-focus flex min-h-[2.75rem] w-full items-center gap-2.5 rounded-md px-2.5 text-sm text-foreground hover:bg-muted"
          >
            <Icon name="ArrowTopRightOnSquareIcon" size={16} className="text-muted-foreground" />
            Google Calendar
          </a>
        )}
        <MenuItem icon="TrashIcon" label="Delete" danger onClick={() => (setMenuOpen(false), onDelete())} />
      </Popover>
    </li>
  );
}

function MenuItem({ icon, label, onClick, danger }: { icon: string; label: string; onClick: () => void; danger?: boolean }) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className={`todo-focus flex min-h-[2.75rem] w-full items-center gap-2.5 rounded-md px-2.5 text-left text-sm hover:bg-muted ${danger ? 'text-error' : 'text-foreground'}`}
    >
      <Icon name={icon} size={16} className={danger ? '' : 'text-muted-foreground'} />
      {label}
    </button>
  );
}

function AgendaSkeleton() {
  return (
    <div className="flex flex-col gap-3" aria-hidden>
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="flex items-center gap-3 px-2 py-2.5">
          <span className="h-5 w-5 animate-pulse rounded-full bg-muted" />
          <span className="h-4 animate-pulse rounded bg-muted" style={{ width: `${60 - i * 9}%` }} />
        </div>
      ))}
    </div>
  );
}

'use client';

import { useEffect, useRef, useState } from 'react';
import Icon from '@/components/ui/AppIcon';
import FlatIcon from '@/components/ui/FlatIcon';
import type { PlanPhase, ProjectPlan } from '@/lib/services/projectPlannerService';
import { toast } from '@/lib/ui/toast';
import { formatRange } from './plannerDates';
import { colorOf } from './planColors';
import {
  addSprint,
  listName,
  moveSprint,
  moveTask,
  removeSprint,
  sprintRoom,
  type OrganiseResult,
  type TaskList,
} from './sprintPlan';

const ROW_BTN =
  'todo-focus flex h-[1.75rem] w-[1.75rem] shrink-0 items-center justify-center rounded-md text-muted-foreground transition-smooth hover:mix-bg-foreground/[0.08] disabled:pointer-events-none disabled:opacity-40';

function Bullets({ title, items }: { title: string; items: string[] }) {
  if (!items.length) return null;
  return (
    <div>
      <h5 className="text-[13px] font-semibold text-muted-foreground">{title}</h5>
      <ul className="mt-1.5 flex flex-col gap-1">
        {items.map((item, i) => (
          <li
            key={`${i}-${item}`}
            className="flex items-start gap-2 text-sm leading-snug text-foreground"
          >
            <span
              className="mt-[0.45rem] h-1.5 w-1.5 shrink-0 rounded-full bg-muted-foreground"
              aria-hidden="true"
            />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

interface TaskListProps {
  list: TaskList;
  tasks: string[];
  sprintCount: number;
  organising: boolean;
  locked: boolean;
  onMove: (from: TaskList, index: number, to: TaskList, toIndex?: number) => void;
  empty: string;
}

/** A sprint's (or the backlog's) tasks: a checklist to read, or rows with order and "Move to" controls. */
function Tasks({ list, tasks, sprintCount, organising, locked, onMove, empty }: TaskListProps) {
  if (!tasks.length) {
    return (
      <p className="rounded-lg border border-dashed px-3 py-2.5 text-sm text-muted-foreground">
        {empty}
      </p>
    );
  }
  if (!organising) {
    return (
      <ul className="flex flex-col gap-1">
        {tasks.map((task, i) => (
          <li
            key={`${i}-${task}`}
            className="flex items-start gap-2 text-sm leading-snug text-foreground"
          >
            <span
              className="mt-[0.3rem] h-3 w-3 shrink-0 rounded-[3px] border border-border"
              aria-hidden="true"
            />
            <span>{task}</span>
          </li>
        ))}
      </ul>
    );
  }
  const destinations: TaskList[] = [...Array.from({ length: sprintCount }, (_, i) => i), 'backlog'];
  return (
    <ol className="flex flex-col gap-1.5">
      {tasks.map((task, i) => (
        <li
          key={`${i}-${task}`}
          className="flex flex-wrap items-center gap-x-2 gap-y-1.5 rounded-lg border bg-card px-2.5 py-2"
        >
          <span className="min-w-0 flex-1 basis-[12rem] text-sm leading-snug text-foreground">
            {task}
          </span>
          <span className="flex items-center gap-1">
            <button
              type="button"
              className={ROW_BTN}
              disabled={locked || i === 0}
              onClick={() => onMove(list, i, list, i - 1)}
              aria-label={`Move "${task}" up`}
              title="Move up"
            >
              <Icon name="ChevronUpIcon" size={15} />
            </button>
            <button
              type="button"
              className={ROW_BTN}
              disabled={locked || i === tasks.length - 1}
              onClick={() => onMove(list, i, list, i + 1)}
              aria-label={`Move "${task}" down`}
              title="Move down"
            >
              <Icon name="ChevronDownIcon" size={15} />
            </button>
            <select
              value={String(list)}
              disabled={locked}
              onChange={(e) => {
                const value = e.target.value;
                onMove(list, i, value === 'backlog' ? 'backlog' : Number(value));
              }}
              aria-label={`Move "${task}" to`}
              className="todo-input todo-input-quiet h-[1.75rem] w-auto py-0 pl-2 pr-7 text-xs font-medium"
            >
              {destinations.map((d) => (
                <option key={String(d)} value={String(d)}>
                  {d === 'backlog' ? 'Backlog' : `Sprint ${d + 1}`}
                </option>
              ))}
            </select>
          </span>
        </li>
      ))}
    </ol>
  );
}

interface SprintBoardProps {
  plan: ProjectPlan;
  /** The timeline the plan was written for: sprint dates are slots of it. */
  start: string;
  end: string;
  organising: boolean;
  locked: boolean;
  onChange: (plan: ProjectPlan) => void;
}

/**
 * A sprint plan's sprints and backlog. In Organise mode each task can be moved up or down, or to another sprint
 * or the backlog, and whole sprints can be moved, removed or added (in the timeline's next free slot).
 */
export default function SprintBoard({
  plan,
  start,
  end,
  organising,
  locked,
  onChange,
}: SprintBoardProps) {
  const [announcement, setAnnouncement] = useState('');
  // The plan on screen, for Undo buttons that are clicked after later changes.
  const latest = useRef(plan);
  latest.current = plan;
  // The toast whose Undo still applies: any newer change takes it away (an older Undo would undo nothing).
  const undoToast = useRef<number | null>(null);
  useEffect(
    () => () => {
      if (undoToast.current !== null) toast.dismiss(undoToast.current);
    },
    []
  );

  const apply = (result: OrganiseResult, message: string, undoable: boolean) => {
    if ('error' in result) {
      toast.error(result.error);
      return;
    }
    if (result.plan === plan) return;
    const before = plan;
    const after = result.plan;
    onChange(after);
    setAnnouncement(message);
    if (undoToast.current !== null) toast.dismiss(undoToast.current);
    undoToast.current = null;
    if (undoable) {
      undoToast.current = toast.success(message, {
        action: {
          label: 'Undo',
          onClick: () => {
            undoToast.current = null;
            // Only while nothing else changed since (the plan may also have changed in the AI chat).
            if (latest.current === after) onChange(before);
          },
        },
      });
    }
  };

  const onMove = (from: TaskList, index: number, to: TaskList, toIndex?: number) => {
    const task =
      (from === 'backlog' ? plan.backlog : plan.phases[from]?.key_tasks)?.[index] ?? 'Task';
    const between = from !== to;
    apply(
      moveTask(plan, from, index, to, toIndex),
      between
        ? `Moved "${task}" to ${listName(to)}.`
        : `Moved "${task}" ${toIndex !== undefined && toIndex < index ? 'up' : 'down'}.`,
      between
    );
  };

  const count = plan.phases.length;
  const room = sprintRoom(plan, start, end);

  return (
    <div className="flex flex-col gap-[0.75rem]">
      <p className="sr-only" aria-live="polite">
        {announcement}
      </p>

      {plan.phases.map((sprint, index) => (
        <SprintCard
          key={`${index}-${sprint.start_date}`}
          sprint={sprint}
          index={index}
          count={count}
          organising={organising}
          locked={locked}
          onMove={onMove}
          onMoveSprint={(delta) =>
            apply(
              moveSprint(plan, index, delta, start, end),
              `Sprint ${index + 1} is now Sprint ${index + 1 + delta}.`,
              false
            )
          }
          onRemove={() =>
            apply(
              removeSprint(plan, index, start, end),
              `Removed Sprint ${index + 1}${sprint.key_tasks.length ? '; its tasks are in the backlog' : ''}.`,
              true
            )
          }
        />
      ))}

      {organising && (
        <button
          type="button"
          onClick={() => apply(addSprint(plan, start, end), `Added Sprint ${count + 1}.`, false)}
          disabled={locked || count >= room}
          className="todo-add-slot todo-focus flex w-full items-center justify-center gap-2 rounded-lg py-3 text-sm font-medium disabled:pointer-events-none disabled:opacity-50"
        >
          <Icon name="PlusIcon" size={16} />
          {count >= room
            ? 'No room for another sprint before the end date'
            : `Add Sprint ${count + 1}`}
        </button>
      )}

      {(plan.backlog.length > 0 || organising) && (
        <section
          className="todo-glass flex flex-col gap-3 p-[1.25rem]"
          aria-labelledby="planner-backlog-title"
        >
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
            <span className="todo-icon-chip h-[1.75rem] w-[1.75rem]" aria-hidden="true">
              <Icon name="InboxStackIcon" size={15} />
            </span>
            <h4
              id="planner-backlog-title"
              className="font-heading text-base font-semibold text-foreground"
            >
              Backlog
            </h4>
            <span className="todo-chip bg-muted text-muted-foreground">
              {plan.backlog.length} {plan.backlog.length === 1 ? 'task' : 'tasks'}
            </span>
          </div>
          <p className="text-sm leading-relaxed text-muted-foreground">
            Work that didn&rsquo;t fit into the sprints. Pull tasks into a sprint when there is
            room.
          </p>
          <Tasks
            list="backlog"
            tasks={plan.backlog}
            sprintCount={count}
            organising={organising}
            locked={locked}
            onMove={onMove}
            empty="Nothing waiting. Move a task here to take it out of its sprint for now."
          />
        </section>
      )}
    </div>
  );
}

function SprintCard({
  sprint,
  index,
  count,
  organising,
  locked,
  onMove,
  onMoveSprint,
  onRemove,
}: {
  sprint: PlanPhase;
  index: number;
  count: number;
  organising: boolean;
  locked: boolean;
  onMove: TaskListProps['onMove'];
  onMoveSprint: (delta: -1 | 1) => void;
  onRemove: () => void;
}) {
  const color = colorOf(index);
  const number = index + 1;
  return (
    <article
      className="todo-glass overflow-hidden"
      style={{ borderLeft: `3px solid ${color}` }}
      aria-label={`Sprint ${number}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2 px-[1.25rem] pb-2 pt-[1.25rem]">
        <div className="flex min-w-0 flex-1 items-start gap-2.5">
          <span
            className="flex h-[1.75rem] w-[1.75rem] shrink-0 items-center justify-center rounded-lg text-xs font-bold text-white"
            style={{ background: color }}
            aria-hidden="true"
          >
            {number}
          </span>
          <div className="min-w-0">
            <p className="text-xs font-semibold text-muted-foreground">Sprint {number}</p>
            <h4 className="font-heading text-base font-semibold leading-snug text-foreground">
              {sprint.name || <span className="text-muted-foreground">No goal yet</span>}
            </h4>
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-1.5">
          <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <Icon name="CalendarDaysIcon" size={13} aria-hidden="true" />
            {formatRange(sprint.start_date, sprint.end_date)}
            {sprint.duration && (
              <span className="todo-chip bg-muted text-muted-foreground">{sprint.duration}</span>
            )}
          </p>
          {organising && (
            <span className="ml-1 flex items-center gap-0.5">
              <button
                type="button"
                className={ROW_BTN}
                disabled={locked || index === 0}
                onClick={() => onMoveSprint(-1)}
                aria-label={`Make Sprint ${number} earlier`}
                title="Earlier"
              >
                <Icon name="ChevronUpIcon" size={15} />
              </button>
              <button
                type="button"
                className={ROW_BTN}
                disabled={locked || index === count - 1}
                onClick={() => onMoveSprint(1)}
                aria-label={`Make Sprint ${number} later`}
                title="Later"
              >
                <Icon name="ChevronDownIcon" size={15} />
              </button>
              <button
                type="button"
                className={`${ROW_BTN} hover:text-red-600`}
                disabled={locked || count <= 1}
                onClick={onRemove}
                aria-label={`Remove Sprint ${number}`}
                title="Remove sprint (its tasks go to the backlog)"
              >
                <Icon name="TrashIcon" size={14} />
              </button>
            </span>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-[1rem] px-[1.25rem] pb-[1.25rem]">
        {sprint.description && (
          <p className="text-sm leading-relaxed text-muted-foreground">{sprint.description}</p>
        )}

        <div>
          <h5 className="mb-1.5 text-[13px] font-semibold text-muted-foreground">
            Tasks{organising && sprint.key_tasks.length > 0 ? ` · ${sprint.key_tasks.length}` : ''}
          </h5>
          <Tasks
            list={index}
            tasks={sprint.key_tasks}
            sprintCount={count}
            organising={organising}
            locked={locked}
            onMove={onMove}
            empty="No tasks yet. Move tasks here from the backlog or another sprint."
          />
        </div>

        {!organising && (
          <>
            {(sprint.deliverables.length > 0 || sprint.risks.length > 0) && (
              <div className="grid grid-cols-1 gap-[1rem] md:grid-cols-2">
                <Bullets title="Deliverables" items={sprint.deliverables} />
                <Bullets title="Risks" items={sprint.risks} />
              </div>
            )}
            {sprint.milestone && (
              <p className="flex items-start gap-2 rounded-lg border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-sm font-medium text-amber-800 dark:text-amber-300">
                <FlatIcon name="trophy" size={16} className="mt-px shrink-0" />
                <span>
                  <span className="font-semibold">Sprint review:</span> {sprint.milestone}
                </span>
              </p>
            )}
          </>
        )}
      </div>
    </article>
  );
}

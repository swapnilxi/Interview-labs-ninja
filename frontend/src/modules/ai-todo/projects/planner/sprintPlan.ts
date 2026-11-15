/**
 * Organising a sprint plan by hand (Plan step → Organise): moving tasks between sprints and the backlog, putting
 * them in order, and adding, removing or moving whole sprints. Pure functions: each returns the new plan, or a
 * sentence saying why the change is not possible. A sprint's dates come from its position in the timeline
 * (sprintSlots), so moving or removing a sprint re-dates the ones after it.
 */

import {
  BACKLOG_MAX,
  SPRINT_TASK_MAX,
  emptySprint,
  type PlanPhase,
  type ProjectPlan,
} from '@/lib/services/projectPlannerService';
import { MAX_SPRINTS, sprintSlots } from './plannerDates';

/** Where a task lives: a sprint (its 0-based index) or the backlog. */
export type TaskList = number | 'backlog';
export type OrganiseResult = { plan: ProjectPlan } | { error: string };

export function listName(list: TaskList): string {
  return list === 'backlog' ? 'the backlog' : `Sprint ${list + 1}`;
}

function tasksOf(plan: ProjectPlan, list: TaskList): string[] | null {
  return list === 'backlog' ? plan.backlog : (plan.phases[list]?.key_tasks ?? null);
}

function capOf(list: TaskList): number {
  return list === 'backlog' ? BACKLOG_MAX : SPRINT_TASK_MAX;
}

function withTasks(plan: ProjectPlan, changes: Map<TaskList, string[]>): ProjectPlan {
  return {
    ...plan,
    backlog: changes.get('backlog') ?? plan.backlog,
    phases: plan.phases.map((phase, i) =>
      changes.has(i) ? { ...phase, key_tasks: changes.get(i)! } : phase
    ),
  };
}

/** Each sprint moved to the slot its position now calls for. */
function redated(phases: PlanPhase[], start: string, end: string, weeks: number): PlanPhase[] {
  const slots = sprintSlots(start, end, weeks);
  return phases.map((phase, i) => {
    const slot = slots[i];
    if (!slot || (slot.start_date === phase.start_date && slot.end_date === phase.end_date))
      return phase;
    return {
      ...emptySprint(slot),
      ...phase,
      start_date: slot.start_date,
      end_date: slot.end_date,
      duration: emptySprint(slot).duration,
    };
  });
}

/**
 * Moves task `index` of `from` to `to`, at `toIndex` (default: the end). Inside one list this reorders it.
 * Refused when the target already holds as many tasks as it may.
 */
export function moveTask(
  plan: ProjectPlan,
  from: TaskList,
  index: number,
  to: TaskList,
  toIndex?: number
): OrganiseResult {
  const source = tasksOf(plan, from);
  const target = tasksOf(plan, to);
  if (!source || !target || index < 0 || index >= source.length) return { plan };
  if (from === to) {
    const next = [...source];
    const [task] = next.splice(index, 1);
    const at = Math.max(0, Math.min(toIndex ?? next.length, next.length));
    if (at === index) return { plan };
    next.splice(at, 0, task);
    return { plan: withTasks(plan, new Map([[from, next]])) };
  }
  if (target.length >= capOf(to)) {
    const name = listName(to);
    return {
      error: `${name.charAt(0).toUpperCase()}${name.slice(1)} is full: it can hold ${capOf(to)} tasks.`,
    };
  }
  const nextSource = source.filter((_, i) => i !== index);
  const nextTarget = [...target];
  nextTarget.splice(
    Math.max(0, Math.min(toIndex ?? nextTarget.length, nextTarget.length)),
    0,
    source[index]
  );
  return {
    plan: withTasks(
      plan,
      new Map<TaskList, string[]>([
        [from, nextSource],
        [to, nextTarget],
      ])
    ),
  };
}

/** How many sprints the timeline has room for (at most MAX_SPRINTS). */
export function sprintRoom(plan: ProjectPlan, start: string, end: string): number {
  return sprintSlots(start, end, plan.sprint_weeks).length;
}

/** Adds an empty sprint after the last one, in the next free slot of the timeline. */
export function addSprint(plan: ProjectPlan, start: string, end: string): OrganiseResult {
  const slots = sprintSlots(start, end, plan.sprint_weeks);
  if (plan.phases.length >= slots.length) {
    return {
      error:
        slots.length >= MAX_SPRINTS
          ? `A sprint plan can have at most ${MAX_SPRINTS} sprints.`
          : 'There is no room for another sprint before the end date.',
    };
  }
  return { plan: { ...plan, phases: [...plan.phases, emptySprint(slots[plan.phases.length])] } };
}

/** Removes a sprint; its tasks go to the front of the backlog, and the sprints after it move up a slot. */
export function removeSprint(
  plan: ProjectPlan,
  index: number,
  start: string,
  end: string
): OrganiseResult {
  const sprint = plan.phases[index];
  if (!sprint) return { plan };
  if (plan.phases.length <= 1) return { error: 'A sprint plan needs at least one sprint.' };
  if (plan.backlog.length + sprint.key_tasks.length > BACKLOG_MAX) {
    return {
      error: `The backlog can hold ${BACKLOG_MAX} tasks, so this sprint's tasks don't fit there. Move some of them to another sprint first.`,
    };
  }
  const phases = redated(
    plan.phases.filter((_, i) => i !== index),
    start,
    end,
    plan.sprint_weeks
  );
  return { plan: { ...plan, phases, backlog: [...sprint.key_tasks, ...plan.backlog] } };
}

/** Swaps a sprint with its neighbour (`delta` -1 = earlier, +1 = later); the two trade dates. */
export function moveSprint(
  plan: ProjectPlan,
  index: number,
  delta: -1 | 1,
  start: string,
  end: string
): OrganiseResult {
  const to = index + delta;
  if (!plan.phases[index] || !plan.phases[to]) return { plan };
  const phases = [...plan.phases];
  [phases[index], phases[to]] = [phases[to], phases[index]];
  return { plan: { ...plan, phases: redated(phases, start, end, plan.sprint_weeks) } };
}

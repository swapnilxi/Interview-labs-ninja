import type { PlanStep } from '@/lib/services/projectPlannerService';

/**
 * Every address in the Plan tab, in one place. A project is `?tab=plan&project=<id>`; what you see inside it is
 * `section=` (the Explorer by default, or the AI Planner) and, inside the planner, `step=`. `view=` still picks
 * the Plan tab's own sub-views (Projects, Matrix, Roadmap).
 */

export type ProjectSection = 'explore' | 'planner';

const PLAN = '/ai-todo?tab=plan';

export const planUrls = {
  /** The list of projects. */
  list: PLAN,
  project(id: number, section: ProjectSection = 'explore', step?: PlanStep): string {
    const params = new URLSearchParams({ tab: 'plan', project: String(id) });
    if (section === 'planner') {
      params.set('section', 'planner');
      if (step) params.set('step', step);
    }
    return `/ai-todo?${params.toString()}`;
  },
  /** The roadmap view with this project already chosen. */
  roadmap(id: number): string {
    return `${PLAN}&view=roadmap&project=${id}`;
  },
};

/** `?project=` as a project id, or null when it is missing or not a number. */
export function parseProjectId(raw: string | null): number | null {
  return raw && /^\d+$/.test(raw) ? Number(raw) : null;
}

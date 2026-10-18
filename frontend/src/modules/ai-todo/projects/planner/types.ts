/** What the planner is waiting on, so each screen can show its own button as busy and lock the others. */
export type PlannerBusy = null | 'questions' | 'feasibility' | 'generate' | 'refine' | 'apply';

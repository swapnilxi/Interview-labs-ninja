import data from './projectTemplates.json';

/**
 * Example projects: enterprise-scale systems with a worked-out context (goal, scale, requirements, decisions already made, hard
 * problems, what to ask of each lab). A person starts one from /labs-project/new?example=<id>; it fills the New project form and
 * nothing is created until they press Create, so the text is theirs to edit. The numbers are illustrative.
 *
 * The texts are in projectTemplates.json (limits: name 120, description 1,000, context 12,000, the same as any project).
 */
export interface ProjectTemplate {
  id: string;
  name: string;
  description: string;
  context: string;
  /** What it is good for, shown under the card. */
  tags: string[];
}

export const PROJECT_TEMPLATES: ProjectTemplate[] = data;

export function templateById(id: string | null | undefined): ProjectTemplate | null {
  return PROJECT_TEMPLATES.find((t) => t.id === id) ?? null;
}

/** The New project page with an example filled in. */
export const exampleHref = (id: string) => `/labs-project/new?example=${encodeURIComponent(id)}`;

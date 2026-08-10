/**
 * Registry of built-in resume templates — one self-contained module per
 * template (id/name/description), mirroring portfolio/templates/'s
 * structure. Resumes are styled via a continuous knob system (font/density/
 * headerStyle/heading rules — see resume/render.py's resume_css_from_spec on
 * the backend), not discrete per-template markup like portfolio's named
 * visual themes, so each of these is a data module rather than a rendering
 * component — this registry's job is to be the single source of truth for
 * "what are the built-in template ids/names/descriptions," replacing what
 * used to be two independently hand-maintained copies of the same list
 * (views/ViewEditor.tsx and views/CareerStudioTabs.tsx).
 */

import { TEMPLATE as classic } from './classic/classic';
import { TEMPLATE as compact } from './compact/compact';
import { TEMPLATE as elegant } from './elegant/elegant';
import { TEMPLATE as executive } from './executive/executive';
import { TEMPLATE as minimalist } from './minimalist/minimalist';
import { TEMPLATE as modern } from './modern/modern';
import { TEMPLATE as technical } from './technical/technical';

export interface ResumeTemplateInfo {
  id: string;
  name: string;
  desc: string;
}

/** Display order matches the original hand-maintained lists. */
export const LIST: ResumeTemplateInfo[] = [classic, modern, compact, elegant, executive, minimalist, technical];

export const REGISTRY: Record<string, ResumeTemplateInfo> = Object.fromEntries(LIST.map((t) => [t.id, t]));

export function getTemplateInfo(id: string | null | undefined): ResumeTemplateInfo | undefined {
  return REGISTRY[id || ''];
}

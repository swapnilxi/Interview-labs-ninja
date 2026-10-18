'use client';

/**
 * AI Planner for a project (Plan tab → project → AI Planner): the saved workspace plus the AI steps, which talk
 * to /todo/projects/{id}/plan/* (backend/modules/ai_todo/projects/plan_router.py, twin in fe-apis/todo).
 *
 * The planner is an AI feature, so — like every AI call — it needs a login and has no guest fallback. The server
 * stores the workspace as opaque JSON; its shape is owned here, and everything read from the server or the AI is
 * run through the normalizers below, so a half-valid reply degrades into an empty field instead of a crash.
 */

import { apiFetch, parseApiError } from '../http/apiClient';
import { aiRequestFields } from './settingsService';
import { addDays, clampDay, daysBetween, formatSpan, parseDay, type DurationUnit } from '@/modules/ai-todo/projects/planner/plannerDates';

export type { DurationUnit };

// ── Types ────────────────────────────────────────────────────────────────────

export type PlanStep = 'brief' | 'questions' | 'timeline' | 'plan';
export const PLAN_STEPS: PlanStep[] = ['brief', 'questions', 'timeline', 'plan'];

export interface PlanDocument {
  id: string;
  name: string;
  text: string;
}

export interface PlanQuestion {
  id: string;
  question: string;
  why: string;
  suggestions: string[];
  answer: string;
}

export type Verdict = 'realistic' | 'tight' | 'unrealistic' | 'generous';

export interface Feasibility {
  verdict: Verdict;
  headline: string;
  reasoning: string;
  concerns: string[];
  recommendations: string[];
  suggested_duration: { value: number; unit: DurationUnit } | null;
  /** The timeline this verdict was given for; it is stale once the dates change. */
  checked_for: { start_date: string; end_date: string };
  /** True when the AI had the written plan in front of it, not just the brief. */
  with_plan: boolean;
}

export interface PlanPhase {
  name: string;
  description: string;
  start_date: string;
  end_date: string;
  /** Worked out from the dates ("6 weeks"), never taken from the AI, so it can't contradict them. */
  duration: string;
  objectives: string[];
  key_tasks: string[];
  deliverables: string[];
  milestone: string;
  risks: string[];
}

export interface PlanRisk {
  risk: string;
  mitigation: string;
}

export interface ProjectPlan {
  summary: string;
  phases: PlanPhase[];
  assumptions: string[];
  risks: PlanRisk[];
  success_metrics: string[];
}

export interface PlanChatTurn {
  role: 'user' | 'assistant';
  content: string;
}

export interface PlannerState {
  /** Requirements and notes the user typed. */
  context: string;
  /** Text files the user attached. */
  documents: PlanDocument[];
  questions: PlanQuestion[];
  /** The AI said the brief already answers everything it needs. */
  questions_ready: boolean;
  questions_note: string;
  start_date: string;
  end_date: string;
  /** The unit the duration field is shown in (the dates are what is stored). */
  unit: DurationUnit;
  feasibility: Feasibility | null;
  plan: ProjectPlan | null;
  /** The timeline the plan was last written or adjusted for. */
  plan_for: { start_date: string; end_date: string } | null;
  chat: PlanChatTurn[];
  /** When the plan was last added to the project's tasks (ISO), so a second click can ask first. */
  applied_at: string | null;
}

/** How much text the AI reads from the brief (notes first, then documents in order). */
export const MAX_MATERIAL_CHARS = 60_000;
/** How much the planner will keep: the server refuses to save a workspace over ~500 KB, and the plan and chat need room too. */
export const MAX_STORED_MATERIAL_CHARS = 400_000;

export function emptyPlannerState(): PlannerState {
  return {
    context: '',
    documents: [],
    questions: [],
    questions_ready: false,
    questions_note: '',
    start_date: '',
    end_date: '',
    unit: 'weeks',
    feasibility: null,
    plan: null,
    plan_for: null,
    chat: [],
    applied_at: null,
  };
}

// ── Normalizers ──────────────────────────────────────────────────────────────

function isObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function text(value: unknown, max = 1200): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function strings(value: unknown, maxItems = 12, maxLen = 400): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const item of value) {
    const s = text(item, maxLen);
    if (s) out.push(s);
    if (out.length >= maxItems) break;
  }
  return out;
}

let idCounter = 0;
function newId(prefix: string): string {
  idCounter += 1;
  return `${prefix}_${Date.now().toString(36)}_${idCounter}_${Math.random().toString(36).slice(2, 6)}`;
}

function dayOr(value: unknown): string | null {
  return typeof value === 'string' && parseDay(value.trim()) ? value.trim() : null;
}

/** A question list as the AI returns it (`{questions: [{question, why, suggestions}]}`), without the ones already asked. */
export function normalizeQuestions(raw: unknown, alreadyAsked: PlanQuestion[] = []): { questions: PlanQuestion[]; ready: boolean; note: string } {
  const body = isObject(raw) ? raw : {};
  const seen = new Set(alreadyAsked.map((q) => q.question.trim().toLowerCase()));
  const questions: PlanQuestion[] = [];
  for (const item of Array.isArray(body.questions) ? body.questions : []) {
    const entry = typeof item === 'string' ? { question: item } : isObject(item) ? item : null;
    const question = entry ? text(entry.question, 400) : '';
    if (!question || seen.has(question.toLowerCase())) continue;
    seen.add(question.toLowerCase());
    questions.push({
      id: newId('q'),
      question,
      why: text(entry!.why, 300),
      suggestions: strings(entry!.suggestions, 4, 120),
      answer: '',
    });
    if (questions.length >= 8) break;
  }
  return { questions, ready: body.ready === true, note: text(body.note, 400) };
}

const VERDICTS: Verdict[] = ['realistic', 'tight', 'unrealistic', 'generous'];

export function normalizeFeasibility(raw: unknown, startDate: string, endDate: string, withPlan: boolean): Feasibility {
  const body = isObject(raw) ? raw : {};
  const verdict = VERDICTS.includes(body.verdict as Verdict) ? (body.verdict as Verdict) : 'tight';

  let suggested: Feasibility['suggested_duration'] = null;
  if (isObject(body.suggested_duration)) {
    const value = Math.round(Number(body.suggested_duration.value));
    const unit = body.suggested_duration.unit === 'months' ? 'months' : body.suggested_duration.unit === 'weeks' ? 'weeks' : null;
    if (unit && Number.isFinite(value) && value >= 1 && value <= (unit === 'weeks' ? 260 : 60)) suggested = { value, unit };
  }
  if (verdict === 'realistic') suggested = null;

  const reasoning = text(body.reasoning, 1500);
  return {
    verdict,
    headline: text(body.headline, 300) || reasoning.split(/(?<=[.!?])\s/)[0] || 'Here is how this timeline looks.',
    reasoning,
    concerns: strings(body.concerns, 4, 300),
    recommendations: strings(body.recommendations, 4, 300),
    suggested_duration: suggested,
    checked_for: { start_date: startDate, end_date: endDate },
    with_plan: withPlan,
  };
}

/**
 * The AI's plan, made safe to draw: strings trimmed and capped, phase dates forced inside the chosen timeline
 * (a phase with a missing or unreadable date gets an equal share of it), and each phase's duration worked out
 * from its dates. Throws a sentence a user can act on when there is no usable phase at all.
 */
export function normalizePlan(raw: unknown, startDate: string, endDate: string): ProjectPlan {
  const body = isObject(raw) ? raw : {};
  const rawPhases = (Array.isArray(body.phases) ? body.phases : []).filter(isObject).slice(0, 12);
  const named = rawPhases.filter((p) => text(p.name, 160));
  if (!named.length) throw new Error("The AI didn't return any phases. Please try again.");

  const totalDays = daysBetween(startDate, endDate) || 1;
  const phases: PlanPhase[] = named.map((phase, index) => {
    const slot = Math.max(1, Math.floor(totalDays / named.length));
    const fallbackStart = addDays(startDate, index * slot);
    const fallbackEnd = index === named.length - 1 ? endDate : addDays(startDate, (index + 1) * slot - 1);
    const start = clampDay(dayOr(phase.start_date) ?? fallbackStart, startDate, endDate);
    let end = clampDay(dayOr(phase.end_date) ?? fallbackEnd, startDate, endDate);
    if (end < start) end = start;
    return {
      name: text(phase.name, 160),
      description: text(phase.description, 800),
      start_date: start,
      end_date: end,
      duration: formatSpan(daysBetween(start, end)),
      objectives: strings(phase.objectives, 5),
      key_tasks: strings(phase.key_tasks, 10),
      deliverables: strings(phase.deliverables, 5),
      milestone: text(phase.milestone, 300),
      risks: strings(phase.risks, 5),
    };
  });

  const risks: PlanRisk[] = [];
  for (const item of Array.isArray(body.risks) ? body.risks : []) {
    if (typeof item === 'string' && text(item, 300)) risks.push({ risk: text(item, 300), mitigation: '' });
    else if (isObject(item) && text(item.risk, 300)) risks.push({ risk: text(item.risk, 300), mitigation: text(item.mitigation, 300) });
    if (risks.length >= 8) break;
  }

  return {
    summary: text(body.summary, 1500),
    phases,
    assumptions: strings(body.assumptions, 8),
    risks,
    success_metrics: strings(body.success_metrics, 8),
  };
}

/** The workspace as saved on the server (or null/garbage → a fresh one). Never throws. */
export function normalizeState(raw: unknown): PlannerState {
  const state = emptyPlannerState();
  if (!isObject(raw)) return state;

  state.context = typeof raw.context === 'string' ? raw.context : '';
  state.documents = (Array.isArray(raw.documents) ? raw.documents : [])
    .filter(isObject)
    .map((d) => ({ id: text(d.id, 60) || newId('d'), name: text(d.name, 160) || 'Untitled', text: typeof d.text === 'string' ? d.text : '' }))
    .filter((d) => d.text.trim());
  state.questions = (Array.isArray(raw.questions) ? raw.questions : [])
    .filter(isObject)
    .map((q) => ({
      id: text(q.id, 60) || newId('q'),
      question: text(q.question, 400),
      why: text(q.why, 300),
      suggestions: strings(q.suggestions, 4, 120),
      answer: typeof q.answer === 'string' ? q.answer : '',
    }))
    .filter((q) => q.question);
  state.questions_ready = raw.questions_ready === true;
  state.questions_note = text(raw.questions_note, 400);
  state.start_date = dayOr(raw.start_date) ?? '';
  state.end_date = dayOr(raw.end_date) ?? '';
  if (state.start_date && state.end_date && state.end_date < state.start_date) state.end_date = state.start_date;
  state.unit = raw.unit === 'months' ? 'months' : 'weeks';
  state.chat = (Array.isArray(raw.chat) ? raw.chat : [])
    .filter(isObject)
    .map((t) => ({ role: t.role === 'assistant' ? ('assistant' as const) : ('user' as const), content: text(t.content, 4000) }))
    .filter((t) => t.content)
    .slice(-60);
  state.applied_at = typeof raw.applied_at === 'string' ? raw.applied_at : null;

  const planFor = isObject(raw.plan_for) ? { start_date: dayOr(raw.plan_for.start_date), end_date: dayOr(raw.plan_for.end_date) } : null;
  if (planFor?.start_date && planFor.end_date && raw.plan) {
    try {
      state.plan = normalizePlan(raw.plan, planFor.start_date, planFor.end_date);
      state.plan_for = { start_date: planFor.start_date, end_date: planFor.end_date };
    } catch {
      state.plan = null;
    }
  }

  if (isObject(raw.feasibility) && isObject(raw.feasibility.checked_for)) {
    const checked = { start_date: dayOr(raw.feasibility.checked_for.start_date), end_date: dayOr(raw.feasibility.checked_for.end_date) };
    if (checked.start_date && checked.end_date) {
      state.feasibility = normalizeFeasibility(raw.feasibility, checked.start_date, checked.end_date, raw.feasibility.with_plan === true);
    }
  }
  return state;
}

// ── API ──────────────────────────────────────────────────────────────────────

/** What every AI step needs to know, in the shape the server's PlannerRequest takes. */
function inputsOf(state: PlannerState) {
  return {
    context: state.context,
    documents: state.documents.map((d) => ({ name: d.name, text: d.text })),
    qa: state.questions.map((q) => ({ question: q.question, answer: q.answer })),
    start_date: state.start_date || null,
    end_date: state.end_date || null,
  };
}

async function aiPost(projectId: number, step: string, body: Record<string, unknown>, model: string): Promise<Record<string, unknown>> {
  const res = await apiFetch(`/todo/projects/${projectId}/plan/${step}`, {
    method: 'POST',
    body: JSON.stringify({ ...aiRequestFields(model), ...body }),
  });
  if (!res.ok) throw new Error(await parseApiError(res));
  return res.json();
}

export const projectPlannerService = {
  /** The saved workspace; a project that has none yet gives a fresh one. Throws when it can't be read. */
  async load(projectId: number): Promise<PlannerState> {
    const res = await apiFetch(`/todo/projects/${projectId}/plan`);
    if (!res.ok) throw new Error(await parseApiError(res));
    const data = await res.json();
    return normalizeState(data?.state);
  },

  /**
   * `keepalive` lets the request outlive the page (a reload or closing the tab); browsers cap such a body at 64 KB,
   * so a larger workspace is sent the ordinary way.
   */
  async save(projectId: number, state: PlannerState, keepalive = false): Promise<boolean> {
    try {
      const body = JSON.stringify({ state });
      const res = await apiFetch(`/todo/projects/${projectId}/plan`, { method: 'PUT', body, keepalive: keepalive && body.length < 60_000 });
      return res.ok;
    } catch {
      return false;
    }
  },

  /** Ask for the questions the AI still needs answered (a follow-up round when some are already answered). */
  async askQuestions(projectId: number, state: PlannerState, model: string) {
    const data = await aiPost(projectId, 'questions', inputsOf(state), model);
    return normalizeQuestions(data, state.questions);
  },

  async checkTimeline(projectId: number, state: PlannerState, model: string): Promise<Feasibility> {
    const data = await aiPost(projectId, 'feasibility', { ...inputsOf(state), plan: state.plan }, model);
    return normalizeFeasibility(data, state.start_date, state.end_date, !!state.plan);
  },

  async generate(projectId: number, state: PlannerState, model: string): Promise<ProjectPlan> {
    const data = await aiPost(projectId, 'generate', inputsOf(state), model);
    return normalizePlan(data.plan, state.start_date, state.end_date);
  },

  /** Chat with the AI about the plan. `plan` comes back only when the AI changed it. */
  async refine(projectId: number, state: PlannerState, message: string, model: string): Promise<{ reply: string; plan: ProjectPlan | null }> {
    const data = await aiPost(
      projectId,
      'refine',
      { ...inputsOf(state), plan: state.plan, message, history: state.chat.map((t) => ({ role: t.role, content: t.content })) },
      model
    );
    const reply = text(data.reply, 2000) || 'Done.';
    const changed = data.changed !== false && data.plan != null;
    return { reply, plan: changed ? normalizePlan(data.plan, state.start_date, state.end_date) : null };
  },

  /** Add the plan's phases and tasks to the project's node tree. Resolves how many were created. */
  async applyToProject(projectId: number, plan: ProjectPlan): Promise<{ phases: number; nodes: number }> {
    const res = await apiFetch(`/todo/projects/${projectId}/plan/apply`, { method: 'POST', body: JSON.stringify({ phases: plan.phases }) });
    if (!res.ok) throw new Error(await parseApiError(res));
    return res.json();
  },
};

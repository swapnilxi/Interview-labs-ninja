/**
 * fe-apis/guidedPractice/handlers.ts
 *
 * Port of backend/modules/guided_practice/router.py (served at /guided-practice). Limits, status codes and error
 * texts match the Python so both backends answer alike -- keep the two in sync.
 *
 *   GET/PUT/DELETE /state, GET /summary      the learner's saved path and progress for one DSA page
 *   POST /curriculum | /outline | /phase | /question | /breakdown | /deeper | /tutor | /star
 *                                            build a prompt (prompts.ts), run it with the model chosen in Config
 *                                            and return the raw answer: the browser parses it
 */

import { callAIText, resolveModel } from '../ai';
import { aiSettings, HttpError, type Row } from '../todo/_shared';
import type { TodoRoute } from '../todo/router';
import { deleteState, fetchState, fetchSummary, saveState } from './db';
import {
  buildBreakdownPrompt,
  buildCurriculumPrompt,
  buildDeeperPrompt,
  buildOutlinePrompt,
  buildPhasePrompt,
  buildQuestionPrompt,
  buildStarPrompt,
  buildTutorPrompt,
  GUIDED_LABS,
  MAX_TOKENS,
  STAR_VARIANTS,
  TUTOR_ACTIONS,
  type ExistingChild,
  type ExistingDeeper,
  type OutlinePhase,
  type PathPos,
  type PromptCtx,
  type QuestionRef,
  type StarVariant,
  type TutorAction,
  type TutorTurn,
} from './prompts';

/** A slow model writing a long answer can take a while; the route's maxDuration (300s) leaves room for this. */
const AI_TIMEOUT_MS = 240_000;
const NO_KEY_MARKER = 'No API key configured';
/** The saved document of one page: the generated path plus the learner's progress, tutor threads and answers. */
const MAX_STATE_CHARS = 1_500_000;

// ── Validation (Pydantic's 422s) ────────────────────────────────────────────

function isObject(v: unknown): v is Row {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** The JSON body as an object. A `null`, array or scalar body is a 422 (as in FastAPI), not a crash further down. */
async function readBody(json: () => Promise<Row>): Promise<Row> {
  const body = await json();
  if (!isObject(body)) throw new HttpError(422, 'Input should be a valid dictionary');
  return body;
}

function strField(
  body: Row,
  key: string,
  max: number,
  opts: { min?: number; def?: string; label?: string } = {}
): string {
  const label = opts.label ?? key;
  const v = body[key];
  if (v === undefined || v === null) {
    if (opts.def !== undefined) return opts.def;
    throw new HttpError(422, `Field '${label}' is required`);
  }
  if (typeof v !== 'string') throw new HttpError(422, `Field '${label}' must be a string`);
  if (v.length < (opts.min ?? 0)) throw new HttpError(422, `Field '${label}' must not be empty`);
  if (v.length > max) throw new HttpError(422, `Field '${label}' is too long (max ${max})`);
  return v;
}

/** A JSON integer within [min, max] (a float, a string or a boolean is refused). */
function intField(
  body: Row,
  key: string,
  min: number,
  max: number,
  def: number,
  label = key
): number {
  const v = body[key];
  if (v === undefined || v === null) return def;
  if (typeof v !== 'number' || !Number.isInteger(v) || v < min || v > max) {
    throw new HttpError(422, `Field '${label}' must be an integer from ${min} to ${max}`);
  }
  return v;
}

function boolField(body: Row, key: string, def = false, label = key): boolean {
  const v = body[key];
  if (v === undefined || v === null) return def;
  if (typeof v !== 'boolean') throw new HttpError(422, `Field '${label}' must be true or false`);
  return v;
}

function stringList(body: Row, key: string, maxItems: number, maxLen: number): string[] {
  const v = body[key];
  if (v === undefined || v === null) return [];
  if (!Array.isArray(v) || !v.every((x) => typeof x === 'string')) {
    throw new HttpError(422, `Field '${key}' must be a list of strings`);
  }
  if (v.length > maxItems)
    throw new HttpError(422, `Field '${key}' has too many items (max ${maxItems})`);
  if (v.some((x: string) => x.length > maxLen))
    throw new HttpError(422, `Field '${key}' has an item that is too long (max ${maxLen})`);
  return v;
}

function objectList(body: Row, key: string, maxItems: number): Row[] {
  const v = body[key];
  if (v === undefined || v === null) return [];
  if (!Array.isArray(v) || !v.every(isObject))
    throw new HttpError(422, `Field '${key}' must be a list of objects`);
  if (v.length > maxItems)
    throw new HttpError(422, `Field '${key}' has too many items (max ${maxItems})`);
  return v as Row[];
}

function queryPage(query: URLSearchParams) {
  const lab = oneOf(query.get('lab'), GUIDED_LABS, 'lab', 'dsa');
  const topicId = query.get('topic_id') ?? '';
  const subtopicId = query.get('subtopic_id') ?? '';
  if (topicId.length < 1 || topicId.length > 200)
    throw new HttpError(422, "Query 'topic_id' must be 1-200 characters");
  if (subtopicId.length > 200)
    throw new HttpError(422, "Query 'subtopic_id' is too long (max 200)");
  return { lab, topicId, subtopicId };
}

/** The problem and the learner, as every AI request describes them. */
function parseCtx(body: Row): PromptCtx {
  strField(body, 'topic_id', 200, { min: 1 });
  return {
    lab: oneOf(body.lab, GUIDED_LABS, 'lab', 'dsa'),
    topicName: strField(body, 'topic_name', 300, { min: 1 }),
    topicBrief: strField(body, 'topic_brief', 2000, { def: '' }),
    category: strField(body, 'category', 200, { def: '' }),
    difficulty: strField(body, 'difficulty', 40, { def: '' }),
    subtopicName: strField(body, 'subtopic_name', 300, { def: '' }),
    subtopicBrief: strField(body, 'subtopic_brief', 2000, { def: '' }),
    learnerLevel: strField(body, 'learner_level', 120, { def: '' }),
    learnerProgress: strField(body, 'learner_progress', 800, { def: '' }),
    completedTitles: stringList(body, 'completed_titles', 40, 300),
  };
}

function parseQuestionRef(body: Row): QuestionRef {
  const raw = body.question;
  if (!isObject(raw)) throw new HttpError(422, "Field 'question' is required");
  const label = (k: string) => `question.${k}`;
  let level: number | null = null;
  if (raw.level !== undefined && raw.level !== null)
    level = intField(raw, 'level', 1, 5, 1, label('level'));
  return {
    title: strField(raw, 'title', 400, { min: 1, label: label('title') }),
    objective: strField(raw, 'objective', 800, { def: '', label: label('objective') }),
    kind: strField(raw, 'kind', 20, { def: 'concept', label: label('kind') }),
    difficulty: strField(raw, 'difficulty', 20, { def: 'medium', label: label('difficulty') }),
    why: strField(raw, 'why', 800, { def: '', label: label('why') }),
    relation: strField(raw, 'relation', 20, { def: 'base', label: label('relation') }),
    level,
    angle: strField(raw, 'angle', 40, { def: '', label: label('angle') }),
    wantsExercise: boolField(raw, 'wants_exercise', false, label('wants_exercise')),
    effort: strField(raw, 'effort', 40, { def: '', label: label('effort') }),
  };
}

function parsePathPos(body: Row): PathPos {
  return {
    phaseNumber: intField(body, 'phase_number', 0, 50, 0),
    phaseTitle: strField(body, 'phase_title', 200, { def: '' }),
    phaseGoal: strField(body, 'phase_goal', 500, { def: '' }),
    ancestryTitles: stringList(body, 'ancestry_titles', 8, 400),
  };
}

// ── The saved document ──────────────────────────────────────────────────────

/** Whole, clamped numbers only: the summary is what the topic page's card shows, never trusted markup. */
function sanitizeSummary(raw: unknown): string {
  const s: Row = isObject(raw) ? raw : {};
  const num = (v: unknown, max: number) =>
    typeof v === 'number' && Number.isFinite(v) ? Math.min(Math.max(Math.floor(v), 0), max) : 0;
  return JSON.stringify({
    percent: num(s.percent, 100),
    completed: num(s.completed, 100000),
    total: num(s.total, 100000),
    xp: num(s.xp, 10_000_000),
    level: num(s.level, 1000),
    levelTitle: typeof s.levelTitle === 'string' ? s.levelTitle.slice(0, 40) : '',
    phasesDone: num(s.phasesDone, 1000),
    phases: num(s.phases, 1000),
    bossDefeated: s.bossDefeated === true,
  });
}

// ── AI ──────────────────────────────────────────────────────────────────────

async function runAi(task: keyof typeof MAX_TOKENS, prompt: string, body: Row) {
  const settings = aiSettings(body);
  let text: string;
  try {
    text = await callAIText(prompt, settings, AI_TIMEOUT_MS, MAX_TOKENS[task]);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes(NO_KEY_MARKER)) throw new HttpError(400, message);
    throw new HttpError(502, `The AI call failed: ${message}`);
  }
  if (!(text || '').trim()) throw new HttpError(502, 'The AI returned an empty answer. Try again.');
  // `model` is the id the request resolved to (an empty choice means the server's .env default).
  return { text, model: resolveModel(settings.model) };
}

function parseOutlinePhases(body: Row): OutlinePhase[] {
  return objectList(body, 'outline', 12).map((o) => ({
    title: strField(o, 'title', 200, { min: 1, label: 'outline.title' }),
    goal: strField(o, 'goal', 500, { def: '', label: 'outline.goal' }),
  }));
}

function parseExistingChildren(body: Row): ExistingChild[] {
  return objectList(body, 'existing_children', 12).map((e) => ({
    title: strField(e, 'title', 400, { min: 1, label: 'existing_children.title' }),
    completed: boolField(e, 'completed', false, 'existing_children.completed'),
  }));
}

function parseExistingDeeper(body: Row): ExistingDeeper[] {
  return objectList(body, 'existing_deeper', 14).map((e) => ({
    title: strField(e, 'title', 400, { min: 1, label: 'existing_deeper.title' }),
    level: intField(e, 'level', 1, 5, 1, 'existing_deeper.level'),
    completed: boolField(e, 'completed', false, 'existing_deeper.completed'),
  }));
}

function parseHistory(body: Row): TutorTurn[] {
  return objectList(body, 'history', 16).map((h) => {
    if (h.role !== 'learner' && h.role !== 'tutor')
      throw new HttpError(422, "history turns need role 'learner' or 'tutor'");
    return {
      role: h.role as 'learner' | 'tutor',
      text: strField(h, 'text', 3000, { def: '', label: 'history.text' }),
    };
  });
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[], name: string, def: T): T {
  if (value === undefined || value === null) return def;
  if (typeof value !== 'string' || !(allowed as readonly string[]).includes(value)) {
    throw new HttpError(422, `Field '${name}' must be one of: ${allowed.join(', ')}`);
  }
  return value as T;
}

// ── Routes ──────────────────────────────────────────────────────────────────

export const routes: TodoRoute[] = [
  {
    method: 'GET',
    path: '/state',
    handler: ({ userId, query }) => {
      const { lab, topicId, subtopicId } = queryPage(query);
      const row = fetchState(userId, lab, topicId, subtopicId);
      return row
        ? {
            exists: true,
            version: row.version,
            state: row.state,
            summary: row.summary,
            updatedAt: row.updatedAt,
          }
        : { exists: false, version: 0, state: null, summary: null, updatedAt: null };
    },
  },
  {
    method: 'PUT',
    path: '/state',
    handler: async ({ userId, json }) => {
      const body = await readBody(json);
      const lab = oneOf(body.lab, GUIDED_LABS, 'lab', 'dsa');
      const topicId = strField(body, 'topic_id', 200, { min: 1 });
      const subtopicId = strField(body, 'subtopic_id', 200, { def: '' });
      const expected = intField(body, 'expected_version', 0, 1_000_000_000, 0);
      if (!isObject(body.state)) throw new HttpError(422, "Field 'state' must be an object");
      const stateJson = JSON.stringify(body.state);
      if (stateJson.length > MAX_STATE_CHARS) {
        throw new HttpError(
          413,
          `This page's progress is too large to save (max ${MAX_STATE_CHARS} characters).`
        );
      }
      const saved = saveState(
        userId,
        lab,
        topicId,
        subtopicId,
        expected,
        stateJson,
        sanitizeSummary(body.summary)
      );
      if (!saved.ok) {
        throw new HttpError(
          409,
          'Your saved progress changed somewhere else (another tab or device). Reload to continue.'
        );
      }
      return { version: saved.version, updatedAt: saved.updatedAt };
    },
  },
  {
    method: 'DELETE',
    path: '/state',
    handler: ({ userId, query }) => {
      const { lab, topicId, subtopicId } = queryPage(query);
      deleteState(userId, lab, topicId, subtopicId);
      return { ok: true };
    },
  },
  {
    // What the topic page's card shows, without the whole document.
    method: 'GET',
    path: '/summary',
    handler: ({ userId, query }) => {
      const { lab, topicId, subtopicId } = queryPage(query);
      const row = fetchSummary(userId, lab, topicId, subtopicId);
      return row
        ? { exists: true, summary: row.summary, updatedAt: row.updatedAt }
        : { exists: false, summary: null, updatedAt: null };
    },
  },
  {
    method: 'POST',
    path: '/curriculum',
    handler: async ({ json }) => {
      const body = await readBody(json);
      const ctx = parseCtx(body);
      const phaseCount = intField(body, 'phase_count', 3, 6, 5);
      const focus = strField(body, 'focus', 600, { def: '' });
      return runAi('curriculum', buildCurriculumPrompt(ctx, phaseCount, focus), body);
    },
  },
  {
    method: 'POST',
    path: '/outline',
    handler: async ({ json }) => {
      const body = await readBody(json);
      const ctx = parseCtx(body);
      const phaseCount = intField(body, 'phase_count', 3, 6, 5);
      const focus = strField(body, 'focus', 600, { def: '' });
      return runAi('outline', buildOutlinePrompt(ctx, phaseCount, focus), body);
    },
  },
  {
    method: 'POST',
    path: '/phase',
    handler: async ({ json }) => {
      const body = await readBody(json);
      const ctx = parseCtx(body);
      const prompt = buildPhasePrompt(ctx, {
        number: intField(body, 'phase_number', 1, 50, 1),
        title: strField(body, 'phase_title', 200, { def: '' }),
        goal: strField(body, 'phase_goal', 500, { def: '' }),
        outline: parseOutlinePhases(body),
        otherTitles: stringList(body, 'other_titles', 60, 300),
        keptTitles: stringList(body, 'kept_titles', 8, 400),
        focus: strField(body, 'focus', 600, { def: '' }),
      });
      return runAi('phase', prompt, body);
    },
  },
  {
    method: 'POST',
    path: '/question',
    handler: async ({ json }) => {
      const body = await readBody(json);
      const ctx = parseCtx(body);
      const question = parseQuestionRef(body);
      const pos = parsePathPos(body);
      const siblings = stringList(body, 'sibling_titles', 12, 300);
      return runAi('question', buildQuestionPrompt(ctx, question, pos, siblings), body);
    },
  },
  {
    method: 'POST',
    path: '/breakdown',
    handler: async ({ json }) => {
      const body = await readBody(json);
      const ctx = parseCtx(body);
      const question = parseQuestionRef(body);
      const pos = parsePathPos(body);
      const existing = parseExistingChildren(body);
      const pathTitles = stringList(body, 'path_titles', 60, 300);
      const regenerate = boolField(body, 'regenerate');
      return runAi(
        'breakdown',
        buildBreakdownPrompt(ctx, question, pos, existing, pathTitles, regenerate),
        body
      );
    },
  },
  {
    method: 'POST',
    path: '/deeper',
    handler: async ({ json }) => {
      const body = await readBody(json);
      const ctx = parseCtx(body);
      const question = parseQuestionRef(body);
      const pos = parsePathPos(body);
      const existing = parseExistingDeeper(body);
      const pathTitles = stringList(body, 'path_titles', 60, 300);
      const regenerate = boolField(body, 'regenerate');
      return runAi(
        'deeper',
        buildDeeperPrompt(ctx, question, pos, existing, pathTitles, regenerate),
        body
      );
    },
  },
  {
    method: 'POST',
    path: '/tutor',
    handler: async ({ json }) => {
      const body = await readBody(json);
      const ctx = parseCtx(body);
      const action: TutorAction = oneOf(body.action, TUTOR_ACTIONS, 'action', 'ask');
      const message = strField(body, 'message', 2000, { def: '' });
      if (action === 'ask' && !message.trim()) throw new HttpError(422, 'message is required');
      const prompt = buildTutorPrompt(ctx, {
        question: parseQuestionRef(body),
        pos: parsePathPos(body),
        explanation: strField(body, 'explanation', 2500, { def: '' }),
        exercisePrompt: strField(body, 'exercise_prompt', 1500, { def: '' }),
        childTitles: stringList(body, 'child_titles', 10, 400),
        completedExerciseTitles: stringList(body, 'completed_exercise_titles', 20, 300),
        action,
        message,
        hintLevel: intField(body, 'hint_level', 1, 3, 1),
        history: parseHistory(body),
        learnerCode: strField(body, 'learner_code', 6000, { def: '' }),
        testReport: strField(body, 'test_report', 1800, { def: '' }),
        starAnswer: strField(body, 'star_answer', 8000, { def: '' }),
        solutionRevealed: boolField(body, 'solution_revealed'),
      });
      return runAi('tutor', prompt, body);
    },
  },
  {
    method: 'POST',
    path: '/star',
    handler: async ({ json }) => {
      const body = await readBody(json);
      const ctx = parseCtx(body);
      const variant: StarVariant = oneOf(body.variant, STAR_VARIANTS, 'variant', 'generate');
      const existingAnswer = strField(body, 'existing_answer', 12000, { def: '' });
      // A rewrite needs the answer it rewrites; the code of the answer follows it when there is one, and works without.
      if (variant !== 'generate' && variant !== 'code' && !existingAnswer.trim())
        throw new HttpError(422, 'existing_answer is required');
      const prompt = buildStarPrompt(ctx, {
        question: parseQuestionRef(body),
        pos: parsePathPos(body),
        explanation: strField(body, 'explanation', 2500, { def: '' }),
        exercisePrompt: strField(body, 'exercise_prompt', 1500, { def: '' }),
        variant,
        existingAnswer,
      });
      return runAi('star', prompt, body);
    },
  },
];

/**
 * fe-apis/dsaLab/weekPlan.ts
 *
 * Port of backend/modules/dsa_lab/week_plan.py + the /dsa/week-plan/* routes of dsa_lab/router.py:
 * a user's week-by-week DSA study plans. Each plan is a "profile" (one row in dsa_week_plan_profiles,
 * at most 20 per user, at most one active); /week-plan reads and writes the active one, and "no active
 * profile" means the frontend shows its suggested plan. The old one-row dsa_week_plans table is migrated
 * lazily at the start of every route. POST /week-plan/auto is the AI organizer (pure half in ./autoPlan);
 * its result is not saved. Routes, status codes, limits and messages match the Python -- keep them in sync.
 */

import {
  aiSettings,
  extractJsonObject,
  HttpError,
  parseJson,
  withTodoDb,
  type Row,
  type TodoDb,
} from '../todo/_shared';
import { callAIText } from '../ai';
import type { TodoCtx, TodoRoute } from '../todo/router';
import { cpLength, pyStrip } from '../labProjects/text';
import { hasLoneSurrogate, printable } from './text';
import {
  autoPlanMaxTokens,
  buildAutoPlanPrompt,
  normalizeAutoPlan,
  validateAutoRequest,
} from './autoPlan';

export const WEEK_CAP = 7; // most questions a single week may hold
export const MAX_WEEKS = 24;
export const MAX_PROFILES = 20;
const NAME_MAX = 60;
const LABEL_MAX = 60;
const SUMMARY_MAX = 600;
const MAX_ENTRIES = 500; // assignments and order
const DEFAULT_NAME = 'My plan';
const WEEK_KEY = /^[1-9][0-9]*$/;
/** The 409 of a PUT /week-plan that named a plan other than the active one (twin: week_plan.py). */
export const NOT_ACTIVE_MESSAGE = 'This plan is no longer the active one.';
/**
 * Longest wait for the AI across every provider it tries, kept under the route's maxDuration (60 s) so the
 * caller gets a JSON error of ours (504 below) instead of the platform's own non-JSON 504.
 */
const AI_DEADLINE_MS = 45_000;
/** One provider attempt may run a little past the deadline, so the deadline (not the attempt's own timeout) ends the wait. */
const AI_ATTEMPT_TIMEOUT_MS = AI_DEADLINE_MS + 2_000;

class AiDeadlineError extends Error {}

let schemaReady = false;

function withDb<T>(fn: (db: TodoDb) => T): T {
  return withTodoDb((db) => {
    if (!schemaReady) {
      // dsa_week_plans is the legacy one-row-per-user table, kept so migrateLegacy can read it.
      db.exec(`
        CREATE TABLE IF NOT EXISTS dsa_week_plans (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id INTEGER DEFAULT NULL,
          plan_json TEXT NOT NULL,
          updated_at TEXT NOT NULL DEFAULT (datetime('now')),
          UNIQUE(user_id)
        );
        CREATE INDEX IF NOT EXISTS idx_dsa_week_plans_user_id ON dsa_week_plans(user_id);
        CREATE TABLE IF NOT EXISTS dsa_week_plan_profiles (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id INTEGER NOT NULL,
          name TEXT NOT NULL,
          plan_json TEXT NOT NULL,
          summary TEXT NOT NULL DEFAULT '',
          is_active INTEGER NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
        CREATE INDEX IF NOT EXISTS idx_dsa_week_plan_profiles_user_id ON dsa_week_plan_profiles(user_id);
      `);
      schemaReady = true;
    }
    return fn(db);
  });
}

/**
 * A profile id from the path. Python reads at most 4300 digits as one integer (the same limit as for its keys), so
 * FastAPI answers an id of thousands of digits with a 422 before any lookup; a shorter one that no row has is a 404.
 */
const PATH_ID_MAX_DIGITS = 4300;
function idParam({ params, intParam }: Pick<TodoCtx, 'params' | 'intParam'>): number {
  const id = intParam('id');
  if ((params.id ?? '').replace(/^-/, '').length > PATH_ID_MAX_DIGITS)
    throw new HttpError(422, "Invalid integer for 'id'");
  return id;
}

/** One transaction per request, with the legacy row migrated first (like every Python route). */
function inPlanTx<T>(userId: number, fn: (db: TodoDb) => T): T {
  return withDb((db) =>
    db.transaction(() => {
      migrateLegacy(db, userId);
      return fn(db);
    })
  );
}

// ── Shapes ──────────────────────────────────────────────────────────────────

export interface PlanBody {
  weeks: number;
  /** topic id -> week (1-based); a question that isn't listed is in no week (the queue). */
  assignments: Record<string, number>;
  /** The learner's sequence; inside a week, questions sort by their index here. */
  order: string[];
  /** "<week number>" -> short focus label. */
  labels: Record<string, string>;
}

interface ActivePlan extends PlanBody {
  updatedAt: string;
  profileId: number;
  name: string;
}

interface ProfileSummary {
  id: number;
  name: string;
  weeks: number;
  planned: number;
  summary: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

interface ProfileFull extends ProfileSummary {
  plan: PlanBody;
}

/** plan_json as stored: always the normalised four keys, in this order. */
function planJson(plan: PlanBody): string {
  return JSON.stringify({
    weeks: plan.weeks,
    assignments: plan.assignments,
    order: plan.order,
    labels: plan.labels,
  });
}

function storedPlan(value: unknown): PlanBody {
  const p = parseJson<Row>(value, {});
  return {
    weeks: p.weeks,
    assignments: p.assignments ?? {},
    order: p.order ?? [],
    labels: p.labels ?? {},
  };
}

function activePlanOf(row: Row): ActivePlan {
  const plan = storedPlan(row.plan_json);
  return {
    weeks: plan.weeks,
    assignments: plan.assignments,
    order: plan.order,
    labels: plan.labels,
    updatedAt: row.updated_at,
    profileId: row.id,
    name: row.name,
  };
}

function profileSummary(row: Row): ProfileSummary {
  const plan = storedPlan(row.plan_json);
  return {
    id: row.id,
    name: row.name,
    weeks: plan.weeks,
    planned: Object.keys(plan.assignments).length,
    summary: row.summary,
    active: Boolean(row.is_active),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function profileFull(row: Row): ProfileFull {
  return { ...profileSummary(row), plan: storedPlan(row.plan_json) };
}

// ── Validation ──────────────────────────────────────────────────────────────

function isObject(v: unknown): v is Row {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

/** Missing or null: "not sent". */
function absent(v: unknown): boolean {
  return v === undefined || v === null;
}

/** The request body must be a JSON object (Pydantic rejects anything else with a 422). */
function bodyObject(body: unknown): Row {
  if (!isObject(body)) throw new HttpError(422, 'Request body must be a JSON object');
  return body;
}

/**
 * FastAPI answers 422 when a route's body model gets no body at all, while ctx.json() turns an empty
 * body into {}. Only PATCH needs this: on the other routes {} fails a field check anyway.
 */
async function requireBody(req: Request): Promise<void> {
  if (!pyStrip(await req.clone().text()))
    throw new HttpError(422, 'Request body must be a JSON object');
}

const AI_FIELDS = [
  'model',
  'geminiKey',
  'openaiKey',
  'anthropicKey',
  'deepseekKey',
  'groqKey',
  'openrouterKey',
  'openrouterUrl',
  'customKey',
  'customBaseUrl',
  'customModel',
  'ollamaUrl',
  'ollamaModel',
];

/** Pydantic's AISettings: each field, when sent, is text (`model` may also be null = the .env default). */
function checkAiFields(body: Row): void {
  for (const key of AI_FIELDS) {
    const value = body[key];
    if (value === undefined || typeof value === 'string' || (key === 'model' && value === null))
      continue;
    throw new HttpError(422, `Field '${key}' must be a string`);
  }
}

/**
 * A human-readable problem with the plan, or null when it is fine. `order` and `labels` are the raw
 * values sent (missing/null = [] / {}). The first failure wins; like the Python, each `order` item
 * (id, then repeat) and each label (week key, then text, then length) is checked in full before the next.
 */
export function validatePlan(
  weeks: number,
  assignments: Record<string, number>,
  order?: unknown,
  labels?: unknown
): string | null {
  const counts = new Map<number, number>();
  for (const [topicId, week] of Object.entries(assignments)) {
    if (!topicId || cpLength(topicId) > 200 || hasLoneSurrogate(topicId))
      return 'Every question id must be 1-200 characters.';
    if (week < 1 || week > weeks)
      return `'${topicId}' is in week ${week}, but the plan has weeks 1-${weeks}.`;
    counts.set(week, (counts.get(week) ?? 0) + 1);
  }
  for (const week of [...counts.keys()].sort((a, b) => a - b)) {
    const n = counts.get(week)!;
    if (n > WEEK_CAP) return `Week ${week} has ${n} questions; a week holds at most ${WEEK_CAP}.`;
  }

  const ids = absent(order) ? [] : order;
  if (!Array.isArray(ids)) return "Field 'order' must be a list of question ids.";
  if (ids.length > MAX_ENTRIES) return `Field 'order' has too many entries (max ${MAX_ENTRIES}).`;
  const seen = new Set<string>();
  for (const id of ids) {
    if (typeof id !== 'string' || !id || cpLength(id) > 200 || hasLoneSurrogate(id))
      return 'Every question id must be 1-200 characters.';
    if (seen.has(id)) return `'${id}' appears twice in 'order'.`;
    seen.add(id);
  }

  const raw = absent(labels) ? {} : labels;
  if (!isObject(raw)) return "Field 'labels' must be an object.";
  for (const [key, value] of Object.entries(raw)) {
    if (!WEEK_KEY.test(key) || Number(key) > weeks)
      return `There is a label for week '${printable(key)}', but the plan has weeks 1-${weeks}.`;
    if (typeof value !== 'string' || hasLoneSurrogate(value))
      return 'Every week label must be text.';
    if (cpLength(pyStrip(value)) > LABEL_MAX)
      return `Week ${key}'s label is longer than ${LABEL_MAX} characters.`;
  }
  return null;
}

/** A plan on the wire after its type checks (Pydantic's WeekPlanIn); `order`/`labels` are left to validatePlan. */
interface PlanIn {
  weeks: number;
  assignments: Record<string, number>;
  order: unknown;
  labels: unknown;
}

function planTypes(body: Row): PlanIn {
  const weeks = body.weeks;
  if (!Number.isInteger(weeks) || weeks < 1 || weeks > MAX_WEEKS) {
    throw new HttpError(422, `Field 'weeks' must be an integer from 1 to ${MAX_WEEKS}`);
  }
  // Missing = {}; null is refused like Pydantic's Dict field does.
  const raw = body.assignments === undefined ? {} : body.assignments;
  if (!isObject(raw)) throw new HttpError(422, "Field 'assignments' must be an object");
  const entries = Object.entries(raw);
  if (entries.length > MAX_ENTRIES)
    throw new HttpError(422, `Field 'assignments' has too many entries (max ${MAX_ENTRIES})`);
  if (!entries.every(([, w]) => Number.isInteger(w)))
    throw new HttpError(422, 'Every week must be an integer');
  const assignments = Object.fromEntries(entries) as Record<string, number>;
  return { weeks, assignments, order: body.order, labels: body.labels };
}

/** A plan nested in a profile body: an object, then its type checks. */
function nestedPlan(value: unknown): PlanIn {
  if (!isObject(value)) throw new HttpError(422, "Field 'plan' must be an object.");
  return planTypes(value);
}

/** validatePlan (422 with its message), then the stored form: every key present, labels trimmed, empty ones dropped. */
function checkedPlan(plan: PlanIn): PlanBody {
  const problem = validatePlan(plan.weeks, plan.assignments, plan.order, plan.labels);
  if (problem) throw new HttpError(422, problem);
  const labels: [string, string][] = [];
  for (const [key, value] of Object.entries((plan.labels ?? {}) as Record<string, string>)) {
    const label = pyStrip(value);
    if (label) labels.push([key, label]);
  }
  return {
    weeks: plan.weeks,
    assignments: plan.assignments,
    order: [...((plan.order ?? []) as string[])],
    labels: Object.fromEntries(labels),
  };
}

function nameField(value: unknown): string {
  const name = typeof value === 'string' && !hasLoneSurrogate(value) ? pyStrip(value) : '';
  if (!name || cpLength(name) > NAME_MAX)
    throw new HttpError(422, `A plan name must be 1-${NAME_MAX} characters.`);
  return name;
}

function summaryField(value: unknown): string {
  const summary = typeof value === 'string' && !hasLoneSurrogate(value) ? pyStrip(value) : null;
  if (summary === null || cpLength(summary) > SUMMARY_MAX)
    throw new HttpError(422, `The plan summary must be at most ${SUMMARY_MAX} characters.`);
  return summary;
}

// ── Database (synchronous; call inside inPlanTx) ────────────────────────────

/**
 * The old single plan becomes the user's first profile ("My plan", active) if they have none yet;
 * the legacy row is deleted either way.
 */
function migrateLegacy(db: TodoDb, userId: number): void {
  const legacy = db.get(
    'SELECT plan_json, updated_at FROM dsa_week_plans WHERE user_id = ?',
    userId
  );
  if (!legacy) return;
  const count = db.get<{ n: number }>(
    'SELECT COUNT(*) AS n FROM dsa_week_plan_profiles WHERE user_id = ?',
    userId
  )!.n;
  if (count === 0) {
    const old = parseJson<Row>(legacy.plan_json, {});
    const plan: PlanBody = {
      weeks: old.weeks,
      assignments: old.assignments ?? {},
      order: [],
      labels: {},
    };
    db.run(
      `INSERT INTO dsa_week_plan_profiles
         (user_id, name, plan_json, summary, is_active, created_at, updated_at)
       VALUES (?, ?, ?, '', 1, COALESCE(?, datetime('now')), COALESCE(?, datetime('now')))`,
      userId,
      DEFAULT_NAME,
      planJson(plan),
      legacy.updated_at,
      legacy.updated_at
    );
  }
  db.run('DELETE FROM dsa_week_plans WHERE user_id = ?', userId);
}

function activeRow(db: TodoDb, userId: number): Row | undefined {
  return db.get(
    'SELECT * FROM dsa_week_plan_profiles WHERE user_id = ? AND is_active = 1 ORDER BY id LIMIT 1',
    userId
  );
}

function activeId(db: TodoDb, userId: number): number | null {
  return activeRow(db, userId)?.id ?? null;
}

function profileOr404(db: TodoDb, userId: number, id: number): Row {
  const row = db.get(
    'SELECT * FROM dsa_week_plan_profiles WHERE id = ? AND user_id = ?',
    id,
    userId
  );
  if (!row) throw new HttpError(404, 'Plan not found.');
  return row;
}

/** The user's profile names, lower-cased (duplicates are case-insensitive). */
function takenNames(db: TodoDb, userId: number, exceptId: number | null = null): Set<string> {
  const rows = db.all<{ id: number; name: string }>(
    'SELECT id, name FROM dsa_week_plan_profiles WHERE user_id = ?',
    userId
  );
  return new Set(rows.filter((r) => r.id !== exceptId).map((r) => r.name.toLowerCase()));
}

function assertNameFree(
  db: TodoDb,
  userId: number,
  name: string,
  exceptId: number | null = null
): void {
  if (takenNames(db, userId, exceptId).has(name.toLowerCase()))
    throw new HttpError(409, `You already have a plan named '${name}'.`);
}

function assertRoomForOneMore(db: TodoDb, userId: number): void {
  const n = db.get<{ n: number }>(
    'SELECT COUNT(*) AS n FROM dsa_week_plan_profiles WHERE user_id = ?',
    userId
  )!.n;
  if (n >= MAX_PROFILES)
    throw new HttpError(409, `You can keep at most ${MAX_PROFILES} plans. Delete one first.`);
}

/** "My plan", or "My plan 2", "My plan 3", ... -- the first one the user doesn't have (case-insensitive). */
function firstFreeName(db: TodoDb, userId: number, base: string): string {
  const taken = takenNames(db, userId);
  if (!taken.has(base.toLowerCase())) return base;
  for (let n = 2; ; n++) {
    const name = `${base} ${n}`;
    if (!taken.has(name.toLowerCase())) return name;
  }
}

function setActive(db: TodoDb, userId: number, id: number | null): void {
  db.run(
    'UPDATE dsa_week_plan_profiles SET is_active = CASE WHEN id = ? THEN 1 ELSE 0 END WHERE user_id = ?',
    id,
    userId
  );
}

function insertProfile(
  db: TodoDb,
  userId: number,
  name: string,
  plan: PlanBody,
  summary: string,
  activate: boolean
): number {
  const { lastInsertRowid } = db.run(
    'INSERT INTO dsa_week_plan_profiles (user_id, name, plan_json, summary) VALUES (?, ?, ?, ?)',
    userId,
    name,
    planJson(plan),
    summary
  );
  if (activate) setActive(db, userId, lastInsertRowid);
  return lastInsertRowid;
}

function getRow(db: TodoDb, id: number): Row {
  return db.get('SELECT * FROM dsa_week_plan_profiles WHERE id = ?', id)!;
}

// ── AI ──────────────────────────────────────────────────────────────────────

/**
 * Provider failures come back as one 400 with the underlying error, like the Python endpoint. The one
 * answer the Python never gives is the 504 for running out of time: the providers are tried one after
 * another and each may wait up to a minute, which the Python backend (no function time limit) can ride out.
 */
async function askAi(prompt: string, body: Row, maxTokens: number): Promise<string> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      callAIText(prompt, aiSettings(body), AI_ATTEMPT_TIMEOUT_MS, maxTokens),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new AiDeadlineError()), AI_DEADLINE_MS);
      }),
    ]);
  } catch (err) {
    if (err instanceof AiDeadlineError)
      throw new HttpError(
        504,
        'The AI took too long to answer. Try again, plan fewer weeks, or pick a faster model in Config.'
      );
    const last = err instanceof Error ? err.message : String(err);
    throw new HttpError(
      400,
      `No API key configured or all providers failed. Add a key in Config. Last error: ${last}`
    );
  } finally {
    clearTimeout(timer);
  }
}

// ── Routes ──────────────────────────────────────────────────────────────────

export const routes: TodoRoute[] = [
  {
    // The active plan, or null: no active profile, so the frontend shows its suggested plan.
    method: 'GET',
    path: '/week-plan',
    handler: ({ userId }) =>
      inPlanTx(userId, (db) => {
        const row = activeRow(db, userId);
        return { plan: row ? activePlanOf(row) : null };
      }),
  },
  {
    // Save the active profile's plan; with none active, a new "My plan" is created and activated. A body
    // that names `profileId` (the plan the caller thinks is active; null = none) is refused with a 409
    // unless that is the active plan, so a stale tab can't overwrite another plan.
    method: 'PUT',
    path: '/week-plan',
    handler: async ({ userId, json }) => {
      const body = bodyObject(await json());
      const planIn = planTypes(body);
      const checkExpected = body.profileId !== undefined;
      const expected = body.profileId;
      if (checkExpected && expected !== null && !Number.isInteger(expected))
        throw new HttpError(422, "Field 'profileId' must be an integer or null.");
      const plan = checkedPlan(planIn);
      return inPlanTx(userId, (db) => {
        const row = activeRow(db, userId);
        if (checkExpected && (row?.id ?? null) !== expected)
          throw new HttpError(409, NOT_ACTIVE_MESSAGE);
        if (row) {
          db.run(
            "UPDATE dsa_week_plan_profiles SET plan_json = ?, updated_at = datetime('now') WHERE id = ?",
            planJson(plan),
            row.id
          );
        } else {
          assertRoomForOneMore(db, userId);
          insertProfile(db, userId, firstFreeName(db, userId, DEFAULT_NAME), plan, '', true);
        }
        return { plan: activePlanOf(activeRow(db, userId)!) };
      });
    },
  },
  {
    // "Use the suggested plan": every profile is kept, none stays active.
    method: 'DELETE',
    path: '/week-plan',
    handler: ({ userId }) =>
      inPlanTx(userId, (db) => {
        setActive(db, userId, null);
        return { plan: null };
      }),
  },
  {
    method: 'GET',
    path: '/week-plan/profiles',
    handler: ({ userId }) =>
      inPlanTx(userId, (db) => {
        const rows = db.all(
          'SELECT * FROM dsa_week_plan_profiles WHERE user_id = ? ORDER BY id ASC',
          userId
        );
        return { profiles: rows.map(profileSummary), activeId: activeId(db, userId) };
      }),
  },
  {
    method: 'POST',
    path: '/week-plan/profiles',
    status: 201,
    handler: async ({ userId, json }) => {
      // Same order as the Python: the plan (object, types), name, summary, then the plan's own rules.
      // Only `activate: true` activates; any other value means false.
      const body = bodyObject(await json());
      const planIn = nestedPlan(body.plan);
      const name = nameField(body.name);
      const summary = absent(body.summary) ? '' : summaryField(body.summary);
      const plan = checkedPlan(planIn);
      const activate = body.activate === true;
      return inPlanTx(userId, (db) => {
        assertNameFree(db, userId, name);
        assertRoomForOneMore(db, userId);
        const id = insertProfile(db, userId, name, plan, summary, activate);
        return { profile: profileFull(getRow(db, id)) };
      });
    },
  },
  {
    method: 'GET',
    path: '/week-plan/profiles/:id',
    handler: ({ userId, params, intParam }) => {
      const id = idParam({ params, intParam });
      return inPlanTx(userId, (db) => ({ profile: profileFull(profileOr404(db, userId, id)) }));
    },
  },
  {
    // Any subset of name / summary / plan. A field that isn't sent is left alone; one sent as null is
    // checked like any other value (so it is a 422), as Pydantic's model_fields_set does in the Python.
    method: 'PATCH',
    path: '/week-plan/profiles/:id',
    handler: async ({ req, userId, json, params, intParam }) => {
      const id = idParam({ params, intParam });
      await requireBody(req);
      const body = bodyObject(await json());
      const planIn = body.plan !== undefined ? nestedPlan(body.plan) : null;
      const name = body.name !== undefined ? nameField(body.name) : null;
      const summary = body.summary !== undefined ? summaryField(body.summary) : null;
      const plan = planIn ? checkedPlan(planIn) : null;
      return inPlanTx(userId, (db) => {
        profileOr404(db, userId, id);
        if (name !== null) assertNameFree(db, userId, name, id);
        db.run(
          `UPDATE dsa_week_plan_profiles
              SET name = COALESCE(?, name), summary = COALESCE(?, summary),
                  plan_json = COALESCE(?, plan_json), updated_at = datetime('now')
            WHERE id = ? AND user_id = ?`,
          name,
          summary,
          plan ? planJson(plan) : null,
          id,
          userId
        );
        return { profile: profileFull(getRow(db, id)) };
      });
    },
  },
  {
    method: 'POST',
    path: '/week-plan/profiles/:id/activate',
    handler: ({ userId, params, intParam }) => {
      const id = idParam({ params, intParam });
      return inPlanTx(userId, (db) => {
        profileOr404(db, userId, id);
        setActive(db, userId, id);
        return { plan: activePlanOf(getRow(db, id)) };
      });
    },
  },
  {
    // Deleting the active profile leaves none active (the suggested plan shows).
    method: 'DELETE',
    path: '/week-plan/profiles/:id',
    handler: ({ userId, params, intParam }) => {
      const id = idParam({ params, intParam });
      return inPlanTx(userId, (db) => {
        profileOr404(db, userId, id);
        db.run('DELETE FROM dsa_week_plan_profiles WHERE id = ? AND user_id = ?', id, userId);
        return { deleted: id, activeId: activeId(db, userId) };
      });
    },
  },
  {
    // AI auto organizer: plans the weeks from the learner's answers. The result is NOT saved.
    method: 'POST',
    path: '/week-plan/auto',
    handler: async ({ userId, json }) => {
      // The body's shape first (Pydantic's AutoPlanPayload in the Python), then the legacy migration
      // like every other route (nothing else here touches the DB), then the answers and topics.
      const body = bodyObject(await json());
      checkAiFields(body);
      inPlanTx(userId, () => null);
      const checked = validateAutoRequest(body.answers, body.topics);
      if (checked.error !== null) throw new HttpError(422, checked.error);
      const { answers, topics } = checked.request;

      const prompt = buildAutoPlanPrompt(answers, topics);
      const text = await askAi(prompt, body, autoPlanMaxTokens(answers.weeks, answers.perWeek));
      if (typeof text !== 'string' || !pyStrip(text))
        throw new HttpError(502, 'The AI returned an empty response. Try again.');
      let raw: unknown;
      try {
        raw = extractJsonObject(text);
      } catch (err) {
        const last = err instanceof Error ? err.message : String(err);
        throw new HttpError(502, `The AI response couldn't be parsed. Try again. (${last})`);
      }
      const result = normalizeAutoPlan(
        raw,
        topics.map((t) => t.id),
        answers.weeks,
        answers.perWeek
      );
      if (!result.stats.placed)
        throw new HttpError(502, "The AI didn't return a usable plan. Try again.");
      return result;
    },
  },
];

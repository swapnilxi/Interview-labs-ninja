/**
 * fe-apis/todo/_shared.ts
 *
 * Shared plumbing for the To-Do fe-apis (the TypeScript twin of backend/modules/ai_todo):
 * DB access, auth, AI calls and HTTP errors. Every todo/pareto handler builds on this.
 */

import { getSQLiteDatabase, getUserFromAuthHeader, getDbPath } from '../_shared/db';
import { callAIText, extractJsonObject, type AISettingsPayload } from '../ai';
import { resolveModel } from '../ai';
import { ensureTodoSchema } from './schema';

export type Row = Record<string, any>;

// ── HTTP errors ─────────────────────────────────────────────────────────────

/** Mirrors FastAPI's HTTPException: the dispatcher turns it into `{detail}` with `status`. */
export class HttpError extends Error {
  constructor(public status: number, public detail: string) {
    super(detail);
  }
}

// ── Database ────────────────────────────────────────────────────────────────

export interface TodoDb {
  all<T = Row>(sql: string, ...params: unknown[]): T[];
  get<T = Row>(sql: string, ...params: unknown[]): T | undefined;
  run(sql: string, ...params: unknown[]): { changes: number; lastInsertRowid: number };
  exec(sql: string): void;
  /** BEGIN/COMMIT around fn (ROLLBACK on throw). Like Python's single conn.commit(). */
  transaction<T>(fn: () => T): T;
}

/** node:sqlite only binds null/number/bigint/string/bytes — map Python-ish values the way sqlite3 would. */
function bindable(value: unknown): unknown {
  if (value === undefined) return null;
  if (typeof value === 'boolean') return value ? 1 : 0;
  return value;
}

function wrap(raw: any): TodoDb {
  const db: TodoDb = {
    all: (sql, ...params) => raw.prepare(sql).all(...params.map(bindable)),
    get: (sql, ...params) => raw.prepare(sql).get(...params.map(bindable)) ?? undefined,
    run: (sql, ...params) => {
      const res = raw.prepare(sql).run(...params.map(bindable));
      return { changes: Number(res.changes), lastInsertRowid: Number(res.lastInsertRowid) };
    },
    exec: (sql) => raw.exec(sql),
    transaction: (fn) => {
      if (inTransaction) return fn();
      raw.exec('BEGIN IMMEDIATE');
      inTransaction = true;
      try {
        const out = fn();
        raw.exec('COMMIT');
        return out;
      } catch (err) {
        try { raw.exec('ROLLBACK'); } catch { /* already rolled back */ }
        throw err;
      } finally {
        inTransaction = false;
      }
    },
  };
  return db;
}

let current: TodoDb | null = null;
let inTransaction = false;
let schemaReady = false;

/**
 * Run fn against lab_ninja.sqlite3. Re-entrant: db functions that call other db
 * functions share one connection (node:sqlite is synchronous, so there's no
 * interleaving — keep fn synchronous, never `await` inside it).
 */
export function withTodoDb<T>(fn: (db: TodoDb) => T): T {
  if (current) return fn(current);
  const res = getSQLiteDatabase('lab_ninja');
  if (!res) throw new HttpError(503, 'Database unavailable');
  const raw = res.db;
  // The FastAPI backend can hold the same file locally — wait for its locks instead of failing.
  raw.exec('PRAGMA busy_timeout = 5000');
  raw.exec('PRAGMA foreign_keys = ON');
  current = wrap(raw);
  try {
    if (!schemaReady) {
      ensureTodoSchema(current);
      schemaReady = true;
    }
    return fn(current);
  } finally {
    current = null;
    inTransaction = false;
    try { raw.close(); } catch { /* already closed */ }
  }
}

/** Python's json.loads on a TEXT column that may be NULL/empty/invalid. */
export function parseJson<T>(value: unknown, fallback: T): T {
  if (typeof value !== 'string' || !value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

// ── PATCH bodies ────────────────────────────────────────────────────────────

/**
 * Port of `patch_updates` (backend/modules/ai_todo/shared/patch.py). `sent` holds the validated
 * fields the PATCH body actually contained. A `null` is kept — and so written as NULL — only for
 * columns in `nullable` ("no due date" is a real value); for the required ones (title, status…)
 * it is dropped, so `null` still means "no change" there. Replaces `model_dump(exclude_none=True)`,
 * which could not tell "left out" from "clear it".
 */
export function patchUpdates(sent: Row, nullable: ReadonlySet<string>): Row {
  const out: Row = {};
  for (const [key, value] of Object.entries(sent)) {
    if (value !== null || nullable.has(key)) out[key] = value;
  }
  return out;
}

// ── Dates (Python date.today() / datetime.now() use server-local time) ──────

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/** `date.today().isoformat()` — local YYYY-MM-DD. */
export function todayIso(offsetDays = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** `datetime.now().isoformat()` — local, no timezone suffix (matches the Python backend's stored values). */
export function nowIso(): string {
  const d = new Date();
  return `${todayIso()}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${String(d.getMilliseconds()).padStart(3, '0')}000`;
}

// ── Auth (mirrors modules/auth/dependencies.py get_current_user_id) ─────────

/** Account status from the auth DB; 'approved' when the column/row is missing (older DBs). */
function accountStatus(userId: number): string {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports, no-eval
    const { DatabaseSync } = eval('require')('node:sqlite');
    const conn = new DatabaseSync(getDbPath());
    try {
      const row = conn.prepare('SELECT status FROM users WHERE id = ?').get(userId) as { status?: string } | undefined;
      return row?.status || 'approved';
    } finally {
      conn.close();
    }
  } catch {
    return 'approved';
  }
}

/** 401 without a valid Bearer token, 403 for an account that isn't approved — same as FastAPI. */
export function requireTodoUserId(req: Request): number {
  const header = req.headers.get('authorization');
  // HTTPBearer's own error when there's no Bearer credential at all.
  if (!header || !/^Bearer\s+\S/i.test(header)) throw new HttpError(401, 'Not authenticated');
  const user = getUserFromAuthHeader(header);
  if (!user) throw new HttpError(401, 'Could not validate credentials');
  const status = accountStatus(user.id);
  if (status === 'pending') throw new HttpError(403, 'Your account is pending admin approval.');
  if (status !== 'approved') throw new HttpError(403, 'Your account was not approved.');
  return user.id;
}

// ── AI (mirrors modules/common/ai as used by ai_todo/shared/ai_helpers.py) ──

const AI_SETTING_KEYS: (keyof AISettingsPayload)[] = [
  'model', 'geminiKey', 'openaiKey', 'anthropicKey', 'deepseekKey', 'groqKey', 'openrouterKey',
  'openrouterUrl', 'customKey', 'customBaseUrl', 'customModel', 'ollamaUrl', 'ollamaModel',
];

/** The AISettings fields every AI request body (or GET query string) carries. */
export function aiSettings(source: Row | URLSearchParams | null | undefined): AISettingsPayload {
  const out: AISettingsPayload = {};
  if (!source) return out;
  for (const key of AI_SETTING_KEYS) {
    const value = source instanceof URLSearchParams ? source.get(key) : source[key];
    if (typeof value === 'string' && value) (out as Row)[key] = value;
  }
  return out;
}

/**
 * `call_ai_text(prompt, settings, max_tokens)`. Provider failures surface as Error
 * (handlers that Python wraps in HTTPException(500/502, ...) should do the same).
 */
export async function callAi(prompt: string, settings: AISettingsPayload, maxTokens = 2048): Promise<string> {
  return callAIText(prompt, settings, 55000, maxTokens);
}

/** `extract_json_array` from modules/common/ai/utils.py: first `[...]` in the text, fences stripped. */
export function extractJsonArray(text: string): any[] {
  let t = text.trim();
  t = t.replace(/```[a-z]*\n?/g, '').replace(/^`+|`+$/g, '').trim();
  const start = t.indexOf('[');
  const end = t.lastIndexOf(']');
  // Same check and message as Python, since handlers echo it ("AI Day Plan failed: ...").
  if (start === -1 || end === -1) {
    throw new Error('No JSON array found in response');
  }
  return JSON.parse(t.slice(start, end + 1));
}

export { extractJsonObject };

/** MIME type for an uploaded image's extension (what Gemini's inline_data needs). */
export function imageMimeType(ext: string): string {
  const e = ext.toLowerCase();
  if (e === '.png') return 'image/png';
  if (e === '.webp') return 'image/webp';
  if (e === '.heic') return 'image/heic';
  return 'image/jpeg';
}

/**
 * `call_ai_vision(image_b64, prompt, settings)` — like Python, Gemini or Ollama only
 * (Vertex isn't available in the Next.js backend).
 */
export async function callAiVision(
  imageB64: string,
  prompt: string,
  settings: AISettingsPayload,
  mimeType = 'image/jpeg'
): Promise<string> {
  const model = resolveModel(settings.model);
  if (model.startsWith('ollama') || model.startsWith('llava')) {
    const visionModel = model.startsWith('ollama::') ? model.split('::', 2)[1] : 'llava';
    const base = (settings.ollamaUrl || 'http://localhost:11434').replace(/\/+$/, '');
    const res = await fetch(`${base}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: visionModel, prompt, images: [imageB64], stream: false }),
      signal: AbortSignal.timeout(120000),
    });
    if (!res.ok) throw new Error(`Ollama vision request failed (HTTP ${res.status})`);
    const data = await res.json();
    return String(data.response || '');
  }
  if (model.startsWith('vertex')) {
    throw new Error('Vertex vision is only available on the FastAPI backend.');
  }
  const key = settings.geminiKey || process.env.GEMINI_API_KEY;
  if (!key) throw new Error('No Gemini API key configured. Add one in Config.');
  const geminiModel = model.startsWith('gemini') ? model : 'gemini-2.5-flash';
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent?key=${encodeURIComponent(key)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }, { inline_data: { mime_type: mimeType, data: imageB64 } }] }],
        generationConfig: { temperature: 0.3, maxOutputTokens: 4096 },
      }),
      signal: AbortSignal.timeout(120000),
    }
  );
  if (!res.ok) throw new Error(`Gemini vision request failed (HTTP ${res.status})`);
  const data = await res.json();
  return String(data?.candidates?.[0]?.content?.parts?.[0]?.text || '');
}

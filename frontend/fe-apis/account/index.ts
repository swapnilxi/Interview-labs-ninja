/**
 * fe-apis/account/index.ts
 *
 * Next.js twin (nextjs-api mode) of the per-account routes the Config page and the "request access" flow use:
 *
 *   GET/PUT /auth/profile        backend/modules/auth/router.py (read_profile / update_profile) + auth/db.py
 *   GET  /access-requests/me     backend/modules/auth/access_requests_router.py + auth/db.py
 *   POST /access-requests        (201; 409 when the same request is already pending)
 *
 * Both need an approved account (get_current_active_user). The admin side of access requests and user management
 * (/admin/*) is not ported yet. Keep in sync with the Python code (CLAUDE.md, "Dual deployment modes").
 */

import { withNeonSync } from '@/lib/server/neonSync';
import { HttpError, requireTodoUserId, withTodoDb, type Row, type TodoDb } from '../todo/_shared';

let schemaReady = false;

function ensureAccountSchema(db: TodoDb) {
  if (schemaReady) return;
  db.exec(`
    CREATE TABLE IF NOT EXISTS user_profile (
      user_id INTEGER PRIMARY KEY,
      text_generation_model TEXT DEFAULT NULL,
      answer_model TEXT DEFAULT NULL,
      ai_provider TEXT DEFAULT NULL,
      ollama_url TEXT DEFAULT NULL,
      ollama_model TEXT DEFAULT NULL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )`);
  db.exec(`
    CREATE TABLE IF NOT EXISTS access_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      requested_role TEXT,
      permission TEXT,
      message TEXT DEFAULT '',
      status TEXT NOT NULL DEFAULT 'pending',
      reviewed_by INTEGER,
      review_note TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      decided_at TEXT,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      CHECK ((requested_role IS NOT NULL) + (permission IS NOT NULL) = 1)
    )`);
  schemaReady = true;
}

function withAccountDb<T>(fn: (db: TodoDb) => T): T {
  return withTodoDb((db) => {
    ensureAccountSchema(db);
    return fn(db);
  });
}

function respond(fn: () => { body: unknown; status?: number }): Response {
  try {
    const { body, status } = fn();
    return Response.json(body, { status: status ?? 200 });
  } catch (err) {
    if (err instanceof HttpError) return Response.json({ detail: err.detail }, { status: err.status });
    console.error('[account fe-api] failed:', err);
    return Response.json({ detail: 'Internal Server Error' }, { status: 500 });
  }
}

async function readJson(req: Request): Promise<unknown> {
  const text = await req.text();
  if (!text.trim()) return {};
  try {
    return JSON.parse(text);
  } catch {
    throw new HttpError(422, 'Invalid JSON body');
  }
}

// ── Profile (auth/db.py get_profile / upsert_profile) ────────────────────────────────────────────────────────

const PROFILE_FIELDS = ['text_generation_model', 'answer_model', 'ai_provider', 'ollama_url', 'ollama_model'] as const;

function getProfile(db: TodoDb, userId: number): Row | null {
  const row = db.get(
    `SELECT user_id, text_generation_model, answer_model, ai_provider, ollama_url, ollama_model, updated_at
     FROM user_profile WHERE user_id = ?`,
    userId
  );
  if (!row) return null;
  return {
    user_id: row.user_id,
    text_generation_model: row.text_generation_model,
    answer_model: row.answer_model,
    ai_provider: row.ai_provider,
    ollama_url: row.ollama_url,
    ollama_model: row.ollama_model,
    updated_at: row.updated_at,
  };
}

export function handleProfileGet(req: Request): Response {
  return respond(() => {
    const userId = requireTodoUserId(req);
    return { body: withAccountDb((db) => getProfile(db, userId)) ?? { user_id: userId } };
  });
}

async function profilePut(req: Request): Promise<Response> {
  let body: unknown;
  try {
    requireTodoUserId(req);
    body = await readJson(req);
  } catch (err) {
    return respond(() => {
      throw err;
    });
  }
  return respond(() => {
    const userId = requireTodoUserId(req);
    if (typeof body !== 'object' || body === null || Array.isArray(body)) throw new HttpError(422, 'Input should be a valid dictionary');
    const src = body as Row;
    const updates: [string, string][] = [];
    for (const field of PROFILE_FIELDS) {
      const v = src[field];
      if (v === undefined || v === null) continue;
      if (typeof v !== 'string') throw new HttpError(422, `${field}: Input should be a valid string`);
      updates.push([field, v]);
    }
    const profile = withAccountDb((db) => {
      db.run('INSERT OR IGNORE INTO user_profile (user_id) VALUES (?)', userId);
      if (updates.length) {
        db.run(
          `UPDATE user_profile SET ${updates.map(([k]) => `${k} = ?`).join(', ')}, updated_at = datetime('now') WHERE user_id = ?`,
          ...updates.map(([, v]) => v),
          userId
        );
      }
      return getProfile(db, userId);
    });
    return { body: profile };
  });
}

export const handleProfilePut = withNeonSync(profilePut);

// ── Access requests (auth/db.py) ─────────────────────────────────────────────────────────────────────────────

const ACCESS_COLS = 'id, user_id, requested_role, permission, message, status, reviewed_by, review_note, created_at, decided_at';
const KNOWN_PERMISSIONS = new Set(['ai_lms:edit', 'users:manage', 'users:delete']);

function accessRow(r: Row): Row {
  return {
    id: r.id,
    user_id: r.user_id,
    requested_role: r.requested_role,
    permission: r.permission,
    message: r.message,
    status: r.status,
    reviewed_by: r.reviewed_by,
    review_note: r.review_note,
    created_at: r.created_at,
    decided_at: r.decided_at,
  };
}

function listMine(req: Request): Response {
  return respond(() => {
    const userId = requireTodoUserId(req);
    return {
      body: withAccountDb((db) =>
        db.all(`SELECT ${ACCESS_COLS} FROM access_requests WHERE user_id = ? ORDER BY created_at DESC, id DESC`, userId).map(accessRow)
      ),
    };
  });
}

async function createRequest(req: Request): Promise<Response> {
  let body: unknown;
  try {
    requireTodoUserId(req);
    body = await readJson(req);
  } catch (err) {
    return respond(() => {
      throw err;
    });
  }
  return respond(() => {
    const userId = requireTodoUserId(req);
    if (typeof body !== 'object' || body === null || Array.isArray(body)) throw new HttpError(422, 'Input should be a valid dictionary');
    const src = body as Row;
    const role = src.requested_role ?? null;
    const permission = src.permission ?? null;
    const message = src.message ?? '';
    if (role !== null && typeof role !== 'string') throw new HttpError(422, 'requested_role: Input should be a valid string');
    if (role !== null && !/^(editor|admin|superadmin)$/.test(role))
      throw new HttpError(422, "requested_role: String should match pattern '^(editor|admin|superadmin)$'");
    if (permission !== null && typeof permission !== 'string') throw new HttpError(422, 'permission: Input should be a valid string');
    if (typeof message !== 'string') throw new HttpError(422, 'message: Input should be a valid string');
    if (message.length > 2000) throw new HttpError(422, 'message: String should have at most 2000 characters');
    if ((role === null) === (permission === null)) throw new HttpError(422, 'Value error, Set exactly one of requested_role or permission');
    if (permission !== null && !KNOWN_PERMISSIONS.has(permission)) throw new HttpError(422, `Value error, Unknown permission '${permission}'`);
    const created = withAccountDb((db) => {
      const dup = db.get(
        `SELECT 1 AS hit FROM access_requests WHERE user_id = ? AND status = 'pending'
           AND IFNULL(requested_role, '') = IFNULL(?, '') AND IFNULL(permission, '') = IFNULL(?, '')`,
        userId,
        role,
        permission
      );
      if (dup) throw new HttpError(409, 'You already have a pending request for that');
      let id: number;
      try {
        id = Number(
          db.run('INSERT INTO access_requests (user_id, requested_role, permission, message) VALUES (?, ?, ?, ?)', userId, role, permission, message)
            .lastInsertRowid
        );
      } catch {
        throw new HttpError(409, 'You already have a pending request for that');
      }
      const row = db.get(`SELECT ${ACCESS_COLS} FROM access_requests WHERE id = ?`, id);
      return row ? accessRow(row) : null;
    });
    return { body: created, status: 201 };
  });
}

const createRequestSynced = withNeonSync(createRequest);

/** Entry point for src/app/api/access-requests/[[...path]]/route.ts. */
export function handleAccessRequests(req: Request, segments: string[]): Promise<Response> | Response {
  const path = segments.join('/');
  if (req.method === 'GET' && path === 'me') return listMine(req);
  if (req.method === 'POST' && path === '') return createRequestSynced(req);
  const known = path === 'me' || path === '';
  return Response.json({ detail: known ? 'Method Not Allowed' : 'Not Found' }, { status: known ? 405 : 404 });
}

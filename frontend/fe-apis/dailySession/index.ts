/**
 * fe-apis/dailySession/index.ts
 *
 * Next.js twin (nextjs-api mode) of the DATA routes of backend/modules/daily_session/daily_session.py and the
 * common/db.py functions behind them — what the Daily Session, Question Bank and Progress pages read and save:
 *
 *   POST /sessions                      create_session_endpoint        (login)
 *   GET  /sessions/recent?limit=        recent_sessions_endpoint       (login)
 *   POST /sessions/questions            persist_questions              (login)
 *   GET  /questions?category=&session_date=&topic=   list_questions   (public; a token narrows it to "yours")
 *   GET  /questions/{id}                get_question_detail            (public)
 *   PATCH /questions/{id}/performance   update_performance_endpoint    (login)
 *   POST /session-progress              save_session_progress_endpoint (login)
 *   GET  /session-progress?session_date=  get_session_progress_endpoint (login)
 *   GET  /session-progress/stats        get_progress_stats_endpoint    (login)
 *
 * Not ported yet (FastAPI only): the AI routes (generate-session-questions, generate/evaluate/expand answer, learn
 * chat, flashcards, lab question generation, YouTube), resume upload, deck import, export, the local-Ollama model list,
 * and POST /questions/clear-duplicates (unauthenticated and destructive in FastAPI — deliberately not copied onto a
 * public deployment). Keep in sync with the Python code (CLAUDE.md, "Dual deployment modes").
 */

import { withNeonSync } from '@/lib/server/neonSync';
import { getUserFromAuthHeader } from '@/lib/server/authHelper';
import { compileRoutes, dispatch, type TodoRoute } from '../todo/router';
import { HttpError, withTodoDb, type Row, type TodoDb } from '../todo/_shared';

// ── Schema (copies of common/db.py; the git-tracked database already has these) ──────────────────────────────

let schemaReady = false;

function columnsOf(db: TodoDb, table: string): string[] {
  return db.all<{ name: string }>(`PRAGMA table_info(${table})`).map((c) => c.name);
}

function ensureSessionSchema(db: TodoDb) {
  if (schemaReady) return;
  db.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_date TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      difficulty_hint TEXT,
      cv_present INTEGER NOT NULL DEFAULT 0,
      jd_present INTEGER NOT NULL DEFAULT 0
    )`);
  const sessionCols = columnsOf(db, 'sessions');
  if (!sessionCols.includes('user_id')) db.exec('ALTER TABLE sessions ADD COLUMN user_id INTEGER DEFAULT NULL;');
  if (!sessionCols.includes('deck_json')) db.exec('ALTER TABLE sessions ADD COLUMN deck_json TEXT DEFAULT NULL;');
  db.exec(`
    CREATE TABLE IF NOT EXISTS questions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id INTEGER NOT NULL,
      question_date TEXT NOT NULL,
      section TEXT NOT NULL,
      number INTEGER NOT NULL,
      category TEXT NOT NULL,
      sub_type TEXT NOT NULL,
      difficulty TEXT NOT NULL,
      topics TEXT NOT NULL,
      question_text TEXT NOT NULL,
      FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
    )`);
  const questionCols = columnsOf(db, 'questions');
  for (const [col, type] of [
    ['user_performance', 'INTEGER DEFAULT NULL'],
    ['last_reviewed', 'TEXT DEFAULT NULL'],
    ['question_type', 'TEXT DEFAULT NULL'],
    ['user_id', 'INTEGER DEFAULT NULL'],
    ['raw_json', 'TEXT DEFAULT NULL'],
  ]) {
    if (!questionCols.includes(col)) db.exec(`ALTER TABLE questions ADD COLUMN ${col} ${type};`);
  }
  db.exec(`
    CREATE TABLE IF NOT EXISTS session_progress (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_date TEXT NOT NULL,
      question_id INTEGER NULL,
      question_text TEXT NOT NULL,
      answer_text TEXT NOT NULL,
      category TEXT NOT NULL,
      difficulty TEXT NOT NULL,
      question_type TEXT NOT NULL,
      is_completed INTEGER NOT NULL DEFAULT 0
    )`);
  if (!columnsOf(db, 'session_progress').includes('user_id'))
    db.exec('ALTER TABLE session_progress ADD COLUMN user_id INTEGER DEFAULT NULL;');
  schemaReady = true;
}

function withSessionDb<T>(fn: (db: TodoDb) => T): T {
  return withTodoDb((db) => {
    ensureSessionSchema(db);
    return fn(db);
  });
}

// ── Small Python-isms ────────────────────────────────────────────────────────────────────────────────────────

const pad = (n: number) => String(n).padStart(2, '0');
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** `date.today().isoformat()` — the server's local date. */
function todayIso(d = new Date()): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** `date.isocalendar()[1]`. */
function isoWeek(d: Date): number {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const yearStart = Date.UTC(t.getUTCFullYear(), 0, 1);
  return Math.ceil(((t.getTime() - yearStart) / 86_400_000 + 1) / 7);
}

/** `format_session_code`: W{iso week}/{dd}/{Month}. */
function sessionCode(d: Date): string {
  return `W${isoWeek(d)}/${pad(d.getDate())}/${MONTHS[d.getMonth()]}`;
}

function isDict(v: unknown): v is Row {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function fail(loc: string, msg: string): never {
  throw new HttpError(422, `${loc}: ${msg}`);
}

function reqStr(obj: Row, key: string, at = ''): string {
  if (!(key in obj)) fail(`${at}${key}`, 'Field required');
  if (typeof obj[key] !== 'string') fail(`${at}${key}`, 'Input should be a valid string');
  return obj[key] as string;
}

function optStr(obj: Row, key: string, at = ''): string | null {
  const v = obj[key];
  if (v === undefined || v === null) return null;
  if (typeof v !== 'string') fail(`${at}${key}`, 'Input should be a valid string');
  return v;
}

/** Pydantic int, lax mode (whole numbers and numeric strings). */
function toInt(v: unknown, loc: string): number {
  const n = typeof v === 'string' && v.trim() !== '' ? Number(v) : v;
  if (typeof n !== 'number' || !Number.isFinite(n) || !Number.isInteger(n)) fail(loc, 'Input should be a valid integer');
  return n;
}

function reqInt(obj: Row, key: string, at = ''): number {
  if (!(key in obj)) fail(`${at}${key}`, 'Field required');
  return toInt(obj[key], `${at}${key}`);
}

/** Pydantic bool, lax mode. */
function toBool(v: unknown, loc: string): boolean {
  if (typeof v === 'boolean') return v;
  if (v === 0 || v === 1) return v === 1;
  const s = typeof v === 'string' ? v.toLowerCase() : '';
  if (['true', '1', 'yes', 'on', 't', 'y'].includes(s)) return true;
  if (['false', '0', 'no', 'off', 'f', 'n'].includes(s)) return false;
  fail(loc, 'Input should be a valid boolean');
}

const CATEGORIES = ['interview', 'cv_skill'] as const;

function category(v: unknown, loc: string): string {
  if (typeof v !== 'string' || !(CATEGORIES as readonly string[]).includes(v)) fail(loc, "Input should be 'interview' or 'cv_skill'");
  return v;
}

/** get_optional_user_id: a valid token identifies the caller (whatever their status); anything else is a guest. */
function optionalUserId(req: Request): number | null {
  const header = req.headers.get('authorization');
  if (!header || !/^Bearer\s+\S/i.test(header)) return null;
  return getUserFromAuthHeader(header)?.id ?? null;
}

// ── Questions ────────────────────────────────────────────────────────────────────────────────────────────────

const QUESTION_COLS = `id, session_id, question_date, section, number, category, sub_type, difficulty, topics, question_text,
  user_performance, last_reviewed, question_type`;

/** QuestionOut (same key order as the Pydantic model). */
function questionOut(r: Row): Row {
  return {
    id: r.id || 0,
    session_id: r.session_id,
    question_date: r.question_date,
    section: r.section,
    number: r.number,
    category: r.category,
    sub_type: r.sub_type,
    difficulty: r.difficulty,
    topics: String(r.topics || '').split(',').filter(Boolean),
    question_text: r.question_text,
    user_performance: r.user_performance ?? null,
    last_reviewed: r.last_reviewed ?? null,
    question_type: r.question_type || r.sub_type,
  };
}

function listQuestions(req: Request, query: URLSearchParams): Row[] {
  const userId = optionalUserId(req);
  const cat = query.get('category');
  const sessionDate = query.get('session_date');
  const topic = query.get('topic');
  let sql = `SELECT ${QUESTION_COLS} FROM questions WHERE 1=1`;
  const params: unknown[] = [];
  if (userId !== null) {
    sql += ' AND (user_id = ? OR user_id = 8 OR user_id IS NULL)';
    params.push(userId);
  }
  if (cat !== null) {
    sql += ' AND category = ?';
    params.push(category(cat, 'query.category'));
  }
  if (sessionDate !== null) {
    sql += ' AND question_date = ?';
    params.push(sessionDate);
  }
  if (topic !== null) {
    sql += ' AND (topics = ? OR topics LIKE ? OR topics LIKE ? OR topics LIKE ?)';
    params.push(topic, `${topic},%`, `%,${topic}`, `%,${topic},%`);
  }
  sql += ' ORDER BY session_id DESC, section ASC, number ASC';
  return withSessionDb((db) => db.all(sql, ...params).map(questionOut));
}

function getQuestion(id: number): Row {
  const row = withSessionDb((db) => db.get(`SELECT ${QUESTION_COLS} FROM questions WHERE id = ?`, id));
  if (!row) throw new HttpError(404, 'Question not found');
  return questionOut(row);
}

function updatePerformance(userId: number, id: number, body: unknown): Row {
  if (!isDict(body)) throw new HttpError(422, 'Input should be a valid dictionary');
  const perf = reqInt(body, 'user_performance');
  const changes = withSessionDb(
    (db) =>
      db.run('UPDATE questions SET user_performance = ?, last_reviewed = ? WHERE id = ? AND user_id = ?', perf, todayIso(), id, userId)
        .changes
  );
  if (changes === 0) throw new HttpError(404, 'Question not found');
  return { status: 'success' };
}

function persistQuestions(userId: number, body: unknown): Row {
  if (!isDict(body)) throw new HttpError(422, 'Input should be a valid dictionary');
  const sessionId = reqInt(body, 'session_id');
  if (!('questions' in body)) fail('questions', 'Field required');
  if (!Array.isArray(body.questions)) fail('questions', 'Input should be a valid list');
  const questions = (body.questions as unknown[]).map((q, i) => {
    const at = `questions.${i}.`;
    if (!isDict(q)) fail(`questions.${i}`, 'Input should be a valid dictionary');
    const section = reqStr(q, 'section', at);
    if (section !== 'A' && section !== 'B') fail(`${at}section`, "Input should be 'A' or 'B'");
    const number = reqInt(q, 'number', at);
    if (!('category' in q)) fail(`${at}category`, 'Field required');
    const cat = category(q.category, `${at}category`);
    const subType = reqStr(q, 'sub_type', at);
    const difficulty = reqStr(q, 'difficulty', at);
    let topics: string[] = [];
    if (q.topics !== undefined) {
      if (!Array.isArray(q.topics) || !q.topics.every((t) => typeof t === 'string')) fail(`${at}topics`, 'Input should be a valid list');
      topics = q.topics as string[];
    }
    const questionText = reqStr(q, 'question_text', at);
    const questionType = optStr(q, 'question_type', at);
    return { section, number, category: cat, sub_type: subType, difficulty, topics, question_text: questionText, question_type: questionType };
  });
  if (!questions.length) throw new HttpError(400, 'questions list must not be empty');

  return withSessionDb((db) => {
    const session = db.get<{ session_date: string }>('SELECT session_date FROM sessions WHERE id = ? AND user_id = ?', sessionId, userId);
    if (!session) throw new HttpError(404, 'Session not found');
    const ids: number[] = [];
    db.transaction(() => {
      for (const q of questions) {
        const text = q.question_text.trim();
        if (!text) continue;
        // A session owns its questions: only a repeat inside this same session is reused.
        const existing = db.get<{ id: number }>(
          'SELECT id FROM questions WHERE session_id = ? AND trim(lower(question_text)) = trim(lower(?)) ORDER BY id ASC LIMIT 1',
          sessionId,
          text
        );
        if (existing) {
          ids.push(existing.id);
          continue;
        }
        const { lastInsertRowid } = db.run(
          `INSERT INTO questions (
             session_id, question_date, section, number, category, sub_type, difficulty, topics, question_text, question_type, user_id
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          sessionId, session.session_date, q.section, q.number, q.category, q.sub_type, q.difficulty,
          q.topics.join(','), text, q.question_type, userId
        );
        ids.push(Number(lastInsertRowid));
      }
    });
    return { inserted_ids: ids };
  });
}

// ── Sessions ─────────────────────────────────────────────────────────────────────────────────────────────────

function createSession(userId: number, body: unknown): Row {
  if (!isDict(body)) throw new HttpError(422, 'Input should be a valid dictionary');
  const hint = optStr(body, 'difficulty_hint');
  const cv = body.cv_present === undefined ? false : toBool(body.cv_present, 'cv_present');
  const jd = body.jd_present === undefined ? false : toBool(body.jd_present, 'jd_present');
  const now = new Date();
  const sessionDate = todayIso(now);
  const id = withSessionDb(
    (db) =>
      db.run(
        'INSERT INTO sessions (session_date, difficulty_hint, cv_present, jd_present, user_id) VALUES (?, ?, ?, ?, ?)',
        sessionDate, hint, cv ? 1 : 0, jd ? 1 : 0, userId
      ).lastInsertRowid
  );
  return { session_id: Number(id), session_date: sessionDate, session_code: sessionCode(now) };
}

function recentSessions(userId: number, query: URLSearchParams): Row[] {
  const raw = query.get('limit');
  let limit = 10;
  if (raw !== null) {
    if (!/^\s*-?\d+\s*$/.test(raw)) fail('query.limit', 'Input should be a valid integer, unable to parse string as an integer');
    limit = parseInt(raw, 10);
    if (limit < 1) fail('query.limit', 'Input should be greater than or equal to 1');
    if (limit > 50) fail('query.limit', 'Input should be less than or equal to 50');
  }
  return withSessionDb((db) =>
    db
      .all(
        `SELECT s.id, s.session_date, s.difficulty_hint, s.created_at, COUNT(q.id) AS n_questions
         FROM sessions s JOIN questions q ON q.session_id = s.id
         WHERE s.user_id = ? GROUP BY s.id ORDER BY s.id DESC LIMIT ?`,
        userId,
        limit
      )
      .map((s) => {
        const answered = db.get<{ n: number }>(
          `SELECT COUNT(*) AS n FROM session_progress sp
           WHERE sp.user_id = ? AND sp.session_date = ? AND sp.is_completed = 1
             AND sp.question_text IN (SELECT question_text FROM questions WHERE session_id = ?)`,
          userId,
          s.session_date,
          s.id
        );
        return {
          session_id: s.id,
          session_date: s.session_date,
          difficulty_hint: s.difficulty_hint,
          created_at: s.created_at,
          question_count: s.n_questions,
          answered_count: answered?.n ?? 0,
        };
      })
  );
}

// ── Progress ─────────────────────────────────────────────────────────────────────────────────────────────────

function saveProgress(userId: number, body: unknown): Row {
  if (!Array.isArray(body)) throw new HttpError(422, 'Input should be a valid list');
  const answers = body.map((a, i) => {
    const at = `${i}.`;
    if (!isDict(a)) fail(String(i), 'Input should be a valid dictionary');
    const questionId = optStr(a, 'questionId', at);
    const questionText = reqStr(a, 'questionText', at);
    const answerText = reqStr(a, 'answerText', at);
    const cat = reqStr(a, 'category', at);
    const difficulty = reqStr(a, 'difficulty', at);
    const questionType = reqStr(a, 'questionType', at);
    if (!('isCompleted' in a)) fail(`${at}isCompleted`, 'Field required');
    const isCompleted = toBool(a.isCompleted, `${at}isCompleted`);
    const sessionDate = reqStr(a, 'sessionDate', at);
    return { questionId, questionText, answerText, category: cat, difficulty, questionType, isCompleted, sessionDate };
  });
  withSessionDb((db) =>
    db.transaction(() => {
      for (const a of answers) {
        const qId = a.questionId !== null && /^[0-9]+$/.test(a.questionId) ? parseInt(a.questionId, 10) : null;
        const row =
          qId !== null
            ? db.get<{ id: number }>('SELECT id FROM session_progress WHERE user_id = ? AND session_date = ? AND question_id = ?', userId, a.sessionDate, qId)
            : db.get<{ id: number }>('SELECT id FROM session_progress WHERE user_id = ? AND session_date = ? AND question_text = ?', userId, a.sessionDate, a.questionText);
        const done = a.isCompleted ? 1 : 0;
        if (row) {
          db.run(
            `UPDATE session_progress SET answer_text = ?, is_completed = ?, category = ?, difficulty = ?, question_type = ?
             WHERE id = ? AND user_id = ?`,
            a.answerText, done, a.category, a.difficulty, a.questionType, row.id, userId
          );
        } else {
          db.run(
            `INSERT INTO session_progress (
               session_date, question_id, question_text, answer_text, category, difficulty, question_type, is_completed, user_id
             ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            a.sessionDate, qId, a.questionText, a.answerText, a.category, a.difficulty, a.questionType, done, userId
          );
        }
      }
    })
  );
  return { status: 'success' };
}

function getProgress(userId: number, query: URLSearchParams): Row[] {
  const sessionDate = query.get('session_date');
  if (sessionDate === null) fail('query.session_date', 'Field required');
  return withSessionDb((db) =>
    db
      .all(
        `SELECT id, session_date, question_id, question_text, answer_text, category, difficulty, question_type, is_completed
         FROM session_progress WHERE user_id = ? AND session_date = ?`,
        userId,
        sessionDate
      )
      .map((r) => ({
        id: String(r.id),
        sessionDate: r.session_date,
        questionId: r.question_id !== null && r.question_id !== undefined ? String(r.question_id) : null,
        questionText: r.question_text,
        answerText: r.answer_text,
        category: r.category,
        difficulty: r.difficulty,
        questionType: r.question_type,
        isCompleted: Boolean(r.is_completed),
      }))
  );
}

function progressStats(userId: number): Row {
  const rows = withSessionDb((db) =>
    db.all<{ session_date: string; is_completed: number }>('SELECT session_date, is_completed FROM session_progress WHERE user_id = ?', userId)
  );
  const perDate = new Map<string, { date: string; answered: number; completed: number }>();
  for (const r of rows) {
    const agg = perDate.get(r.session_date) ?? { date: r.session_date, answered: 0, completed: 0 };
    agg.answered += 1;
    agg.completed += r.is_completed === 1 ? 1 : 0;
    perDate.set(r.session_date, agg);
  }
  const desc = (a: string, b: string) => (a < b ? 1 : a > b ? -1 : 0);
  const recentSessions = [...perDate.values()].sort((a, b) => desc(a.date, b.date)).slice(0, 10);
  const uniqueDates = [...perDate.keys()].sort(desc);
  return {
    totalSessions: uniqueDates.length,
    totalAnswered: rows.length,
    completedAnswers: rows.filter((r) => r.is_completed === 1).length,
    recentDates: uniqueDates.slice(0, 7),
    recentSessions,
  };
}

// ── Routing ──────────────────────────────────────────────────────────────────────────────────────────────────

/** Routes behind the login (FastAPI's `router`, with get_current_user_id at router level). */
const PRIVATE: TodoRoute[] = [
  { method: 'POST', path: '/sessions', handler: async (ctx) => createSession(ctx.userId, await ctx.json()) },
  { method: 'GET', path: '/sessions/recent', handler: (ctx) => recentSessions(ctx.userId, ctx.query) },
  { method: 'POST', path: '/sessions/questions', handler: async (ctx) => persistQuestions(ctx.userId, await ctx.json()) },
  {
    method: 'PATCH',
    path: '/questions/:question_id/performance',
    handler: async (ctx) => updatePerformance(ctx.userId, ctx.intParam('question_id'), await ctx.json()),
  },
  {
    method: 'POST',
    path: '/session-progress',
    // POST /session-progress takes a JSON array; ctx.json() turns an empty body into {} (-> 422 here, like FastAPI).
    handler: async (ctx) => saveProgress(ctx.userId, await ctx.json()),
  },
  { method: 'GET', path: '/session-progress', handler: (ctx) => getProgress(ctx.userId, ctx.query) },
  { method: 'GET', path: '/session-progress/stats', handler: (ctx) => progressStats(ctx.userId) },
];
const PRIVATE_ROUTES = compileRoutes(PRIVATE);

function json(data: unknown, status = 200): Response {
  return Response.json(data, { status });
}

/** Public routes (FastAPI's `public_router`: no login needed; a token, when sent, scopes the list). */
async function dispatchPublic(req: Request, segments: string[]): Promise<Response | null> {
  if (req.method !== 'GET' || segments[0] !== 'questions' || segments.length > 2) return null;
  try {
    if (segments.length === 1) return json(listQuestions(req, new URL(req.url).searchParams));
    const raw = segments[1];
    if (!/^-?\d+$/.test(raw)) throw new HttpError(422, "Invalid integer for 'question_id'");
    return json(getQuestion(parseInt(raw, 10)));
  } catch (err) {
    if (err instanceof HttpError) return json({ detail: err.message }, err.status);
    console.error('[dailySession] public route failed:', err);
    return json({ detail: 'Internal Server Error' }, 500);
  }
}

async function dispatchSession(req: Request, segments: string[]): Promise<Response> {
  const pub = await dispatchPublic(req, segments);
  if (pub) return pub;
  return dispatch(PRIVATE_ROUTES, req, segments);
}

const writeSession = withNeonSync(dispatchSession);

/**
 * Entry point for src/app/api/{sessions,questions,session-progress}/[[...path]]/route.ts. `segments` include the
 * first path part ('sessions', 'questions' or 'session-progress'), so they match the Python paths.
 */
export function handleDailySession(req: Request, segments: string[]): Promise<Response> {
  return req.method === 'GET' ? dispatchSession(req, segments) : writeSession(req, segments);
}

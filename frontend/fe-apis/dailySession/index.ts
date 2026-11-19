/**
 * fe-apis/dailySession/index.ts
 *
 * Next.js twin (nextjs-api mode) of the DATA routes of backend/modules/daily_session/daily_session.py and the
 * common/db.py functions behind them — what the Daily Session, Question Bank and Progress pages read and save:
 *
 *   POST /sessions                      create_session_endpoint        (login)
 *   GET  /sessions/recent?limit=        recent_sessions_endpoint       (login)
 *   POST /sessions/questions            persist_questions              (login)
 *   GET  /questions?category=&session_date=&topic=   list_questions   (login; the caller's + shared ones)
 *     Both question reads return the CALLER's own user_performance / last_reviewed (question_user_state, written by
 *     PATCH .../performance); a guest gets the unrated defaults (null), never another user's values.
 *   GET  /questions/{id}                get_question_detail            (login)
 *   GET  /questions/review-list         get_review_list                (login; the user's "Add to review" list)
 *   PUT|DELETE /questions/{id}/review   add_question_to_review / remove_question_from_review  (login)
 *   PATCH /questions/{id}/performance   update_performance_endpoint    (login)
 *   GET|PUT /questions/{id}/workspace   get/save_question_workspace    (login; questionStore.ts, the user's answer + notes)
 *   GET|DELETE /questions/{id}/quiz     get_question_quiz / clear_question_quiz          (login; questionStore.ts)
 *   POST /questions/{id}/quiz/generate  generate_question_quiz         (login; questionQuiz.ts + ../labSections/quiz)
 *   GET  /questions/{id}/study          get_question_study             (login; questionStore.ts, quick/breakdown/deep)
 *   POST /questions/{id}/study/{kind}   generate_question_study        (login; questionStudy.ts)
 *   POST /questions/{id}/study/deep/expand        expand_question_deep_dive  (login; questionStudy.ts)
 *   PUT  /questions/{id}/study/breakdown/progress save_breakdown_progress    (login)
 *   POST /session-progress              save_session_progress_endpoint (login)
 *   GET  /session-progress?session_date=  get_session_progress_endpoint (login)
 *   GET  /session-progress/stats        get_progress_stats_endpoint    (login)
 *   POST /sessions/generate-session-questions  generate_session_questions_endpoint (login; generate.ts + dedup.ts)
 *   POST /sessions/{generate,evaluate,expand}-answer, /sessions/learn-chat   the answer coach (login; coach.ts)
 *   POST /lab/generate-questions        generate_lab_questions         (login; labGenerate.ts, the labs' Generate Practice)
 *   POST /lab/generate-from-youtube     generate_lab_from_youtube      (login; labGenerate.ts + youtube.ts)
 *
 * Every route needs a login (401 without a token), like every FastAPI daily_session route.
 * evaluate-answer and quiz/generate also record weak spots in the shared AI memory, and learn-chat, quiz and study
 * prompts recall them (tutorMemory.ts).
 *
 * Not ported yet (FastAPI only): flashcards, resume upload, deck import, export, the local-Ollama model list,
 * and POST /questions/clear-duplicates (global and destructive: it deletes any user's duplicate rows; FastAPI now
 * requires a login for it, but it is still deliberately not copied onto the deployment). Keep in sync with the
 * Python code (CLAUDE.md, "Dual deployment modes").
 */

import { withNeonRead, withNeonSync } from '@/lib/server/neonSync';
import { compileRoutes, dispatch, type TodoRoute } from '../todo/router';
import { evaluateAnswer, expandAnswer, generateAnswer, learnChat } from './coach';
import { HttpError, aiSettings, callAi, extractJsonArray, withTodoDb, type Row, type TodoDb } from '../todo/_shared';
import { hashesFor } from './dedup';
import { generateSessionQuestions } from './generate';
import { generateLabFromYoutube, generateLabQuestions } from './labGenerate';
import { memoryLines, record as recordMemory } from '../memory/db';
import { normalizeQuestions } from '../labSections/quiz';
import {
  MAX_QUIZ_ANSWER_CHARS,
  MAX_QUIZ_PER_QUESTION,
  MAX_WORKSPACE_FIELD_CHARS,
  QUIZ_MAX_TOKENS,
  buildQuestionQuizPrompt,
  longerThan,
} from './questionQuiz';
import {
  addQuestionQuiz,
  clearQuestionQuiz,
  ensureQuestionStoreSchema,
  fetchQuestionForQuiz,
  fetchQuestionQuiz,
  fetchStudy,
  fetchStudyItem,
  fetchWorkspace,
  questionExists,
  saveStudy,
  saveUserState,
  saveWorkspace,
  addToReview,
  removeFromReview,
  fetchReviewList,
  type QuizQuestionFields,
} from './questionStore';
import { MAX_MISSED, MAX_MISSED_CHARS, MEMORY_MODULE, missedQuizFacts, weakSpotFacts } from './tutorMemory';
import {
  EXPAND_MAX_TOKENS,
  MAX_DEPTH,
  STUDY_KINDS,
  STUDY_LABELS,
  STUDY_MAX_TOKENS,
  asIndex,
  buildExpandPrompt,
  buildStudyPrompt,
  cleanLayer,
  normalizeStudy,
  parseStudyReply,
  type StudyKind,
  type StudyQuestion,
} from './questionStudy';

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
    // Duplicate-check hashes (dedup.ts / dedup.py). Rows saved without them are hashed on the fly when indexed.
    ['fingerprint', 'TEXT DEFAULT NULL'],
    ['simhash', 'INTEGER DEFAULT NULL'],
  ]) {
    if (!questionCols.includes(col)) db.exec(`ALTER TABLE questions ADD COLUMN ${col} ${type};`);
  }
  db.exec('CREATE INDEX IF NOT EXISTS idx_questions_fingerprint ON questions(fingerprint);');
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
  // Per-user workspace and concept quiz for a question (backend/modules/daily_session/schema.py).
  ensureQuestionStoreSchema(db);
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


// ── Questions ────────────────────────────────────────────────────────────────────────────────────────────────

// Rating and last-reviewed are the caller's own: `s` is their question_user_state row (LEFT JOIN ... s.user_id = ?;
// a guest binds NULL, matches nothing and gets the unrated defaults).
const QUESTION_COLS = `q.id, q.session_id, q.question_date, q.section, q.number, q.category, q.sub_type, q.difficulty, q.topics,
  q.question_text, s.performance AS user_performance, s.last_reviewed AS last_reviewed, q.question_type`;
const QUESTION_FROM = 'FROM questions q LEFT JOIN question_user_state s ON s.question_id = q.id AND s.user_id = ?';

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

function listQuestions(userId: number, query: URLSearchParams): Row[] {
  const cat = query.get('category');
  const sessionDate = query.get('session_date');
  const topic = query.get('topic');
  let sql = `SELECT ${QUESTION_COLS} ${QUESTION_FROM} WHERE 1=1`;
  const params: unknown[] = [userId, userId];
  sql += ' AND (q.user_id = ? OR q.user_id = 8 OR q.user_id IS NULL)';
  if (cat !== null) {
    sql += ' AND q.category = ?';
    params.push(category(cat, 'query.category'));
  }
  if (sessionDate !== null) {
    sql += ' AND q.question_date = ?';
    params.push(sessionDate);
  }
  if (topic !== null) {
    sql += ' AND (q.topics = ? OR q.topics LIKE ? OR q.topics LIKE ? OR q.topics LIKE ?)';
    params.push(topic, `${topic},%`, `%,${topic}`, `%,${topic},%`);
  }
  sql += ' ORDER BY q.session_id DESC, q.section ASC, q.number ASC';
  return withSessionDb((db) => db.all(sql, ...params).map(questionOut));
}

function getQuestion(userId: number, id: number): Row {
  const row = withSessionDb((db) => db.get(`SELECT ${QUESTION_COLS} ${QUESTION_FROM} WHERE q.id = ?`, userId, id));
  if (!row) throw new HttpError(404, 'Question not found');
  return questionOut(row);
}

function updatePerformance(userId: number, id: number, body: unknown): Row {
  if (!isDict(body)) throw new HttpError(422, 'Input should be a valid dictionary');
  const perf = reqInt(body, 'user_performance');
  // The caller's own rating (question_user_state): anyone who can see a question can rate it; the shared
  // questions.user_performance / last_reviewed columns are no longer written.
  const saved = withSessionDb((db) => saveUserState(db, userId, id, perf, todayIso()));
  if (!saved) throw new HttpError(404, 'Question not found');
  rememberPerformance(userId, id, perf);
  return { status: 'success' };
}

/**
 * Low (1-2) and high (4-5) star ratings become memory facts about the question's topic. Best effort.
 * Twin: _remember_performance() in backend/modules/daily_session/daily_session.py.
 */
function rememberPerformance(userId: number, questionId: number, rating: number): void {
  if (rating === 3 || rating < 1 || rating > 5) return;
  try {
    // Any user can rate any question now (ratings are per user), so not only the owner's.
    const row = withSessionDb((db) =>
      db.get<{ sub_type: string; question_text: string }>('SELECT sub_type, question_text FROM questions WHERE id = ?', questionId)
    );
    if (!row) return;
    const verb = rating <= 2 ? 'Rated itself low on' : 'Rated itself high on';
    recordMemory(userId, 'daily-session', row.sub_type || '', rating <= 2 ? 'struggle' : 'mastered', `${verb}: "${Array.from(row.question_text).slice(0, 90).join('')}"`);
  } catch (err) {
    console.warn('[memory] could not record performance:', err instanceof Error ? err.message : err);
  }
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
             session_id, question_date, section, number, category, sub_type, difficulty, topics, question_text, question_type,
             user_id, fingerprint, simhash
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          sessionId, session.session_date, q.section, q.number, q.category, q.sub_type, q.difficulty,
          q.topics.join(','), text, q.question_type, userId, ...hashesFor(text)
        );
        ids.push(Number(lastInsertRowid));
      }
    });
    return { inserted_ids: ids };
  });
}

// ── Question Review: per-user workspace and concept quiz ─────────────────────────────────────────────────────
// Twin of the /questions/{id}/workspace and /questions/{id}/quiz routes in daily_session.py: statuses, limits and
// error texts match, and the quiz prompt (questionQuiz.ts) is byte-identical to question_quiz.py.

function getWorkspace(userId: number, questionId: number): Row {
  return withSessionDb((db) => {
    if (!questionExists(db, questionId)) throw new HttpError(404, 'Question not found');
    return { ...fetchWorkspace(db, userId, questionId) };
  });
}

function reviewToggle(userId: number, questionId: number, add: boolean): Row {
  return withSessionDb((db) => {
    if (!questionExists(db, questionId)) throw new HttpError(404, 'Question not found');
    return add ? addToReview(db, userId, questionId) : removeFromReview(db, userId, questionId);
  });
}

/**
 * What the shared AI memory knows about this learner for Daily Session, best effort ([] on any error).
 * Twin: _memory_lines() in daily_session.py.
 */
function memoryLinesSafe(userId: number, topic: string): string[] {
  try {
    return memoryLines(userId, MEMORY_MODULE, topic);
  } catch (err) {
    console.warn('[memory] could not read memory:', err instanceof Error ? err.message : err);
    return [];
  }
}

/** Record weak spots ("struggle" facts) for the tutor memory. Best effort. Twin: _remember_facts() in daily_session.py. */
function rememberFacts(userId: number, topic: string, facts: string[]): void {
  for (const fact of facts) {
    try {
      recordMemory(userId, MEMORY_MODULE, topic, 'struggle', fact);
    } catch (err) {
      console.warn('[memory] could not record a weak spot:', err instanceof Error ? err.message : err);
    }
  }
}

function putWorkspace(userId: number, questionId: number, body: unknown): Row {
  if (!isDict(body)) throw new HttpError(422, 'Input should be a valid dictionary');
  // QuestionWorkspaceIn: null (or left out) = keep the saved value.
  const answer = optStr(body, 'answer');
  const notes = optStr(body, 'notes');
  for (const [field, value] of [['answer', answer], ['notes', notes]] as const) {
    if (value !== null && longerThan(value, MAX_WORKSPACE_FIELD_CHARS))
      throw new HttpError(400, `${field} is too long (max ${MAX_WORKSPACE_FIELD_CHARS} characters).`);
  }
  return withSessionDb((db) => {
    if (!questionExists(db, questionId)) throw new HttpError(404, 'Question not found');
    return { ...saveWorkspace(db, userId, questionId, answer, notes) };
  });
}

/** Generate up to `count` more items about the concepts behind the question. Returns the FULL list after adding. */
async function generateQuestionQuiz(userId: number, questionId: number, body: unknown): Promise<Row> {
  if (!isDict(body)) throw new HttpError(422, 'Input should be a valid dictionary');
  // GenerateQuestionQuizRequest(AISettings): count 1-8 (default 5), optional written answer.
  const rawCount = body.count === undefined || body.count === null ? 5 : body.count;
  if (typeof rawCount !== 'number' || !Number.isInteger(rawCount) || rawCount < 1 || rawCount > 8)
    throw new HttpError(422, "Field 'count' must be an integer from 1 to 8");
  const answer = optStr(body, 'answer') ?? '';
  // missed: stems of quiz questions the user got wrong (<= 8, each <= 300 chars), recorded as weak spots.
  let missed: string[] = [];
  if (body.missed !== undefined && body.missed !== null) {
    if (!Array.isArray(body.missed) || !body.missed.every((m) => typeof m === 'string'))
      fail('missed', 'Input should be a valid list of strings');
    missed = body.missed as string[];
  }
  if (longerThan(answer, MAX_QUIZ_ANSWER_CHARS))
    throw new HttpError(400, `answer is too long (max ${MAX_QUIZ_ANSWER_CHARS} characters).`);
  if (missed.length > MAX_MISSED || missed.some((m) => longerThan(m, MAX_MISSED_CHARS)))
    throw new HttpError(400, `missed takes at most ${MAX_MISSED} question stems of up to ${MAX_MISSED_CHARS} characters each.`);

  const question = withSessionDb((db) => fetchQuestionForQuiz(db, questionId));
  if (!question) throw new HttpError(404, 'Question not found');
  // Tutor memory: record what they missed first, so this quiz (and other questions of the type) can aim at it.
  rememberFacts(userId, question.sub_type, missedQuizFacts(missed));
  const existing = withSessionDb((db) => fetchQuestionQuiz(db, userId, questionId));
  const room = MAX_QUIZ_PER_QUESTION - existing.length;
  if (room <= 0)
    throw new HttpError(
      400,
      `This question already has ${MAX_QUIZ_PER_QUESTION} quiz questions, the most it keeps. ` +
        'Clear the quiz to generate new ones.'
    );
  const count = Math.min(rawCount, room);
  const prompt = buildQuestionQuizPrompt({
    questionText: question.question_text,
    category: question.category,
    subType: question.sub_type,
    topics: question.topics,
    difficulty: question.difficulty,
    answer,
    previousQuestions: existing.map((q) => q.q),
    count,
    memory: memoryLinesSafe(userId, question.sub_type),
  });

  let text: string;
  try {
    text = await callAi(prompt, aiSettings(body), QUIZ_MAX_TOKENS);
  } catch (err) {
    const last = err instanceof Error ? err.message : String(err);
    throw new HttpError(400, `No API key configured or all providers failed. Add a key in Config. Last error: ${last}`);
  }
  let questions;
  try {
    questions = normalizeQuestions(extractJsonArray(text));
  } catch (err) {
    const last = err instanceof Error ? err.message : String(err);
    throw new HttpError(502, `The AI response couldn't be parsed. Try again. (${last})`);
  }
  if (!questions.length) throw new HttpError(502, "The AI didn't return any usable questions. Try again.");

  return withSessionDb((db) => {
    const added = addQuestionQuiz(db, userId, questionId, questions.slice(0, count), MAX_QUIZ_PER_QUESTION);
    if (!added.length) throw new HttpError(502, 'The AI only repeated questions you already have. Try again.');
    return { questions: fetchQuestionQuiz(db, userId, questionId) };
  });
}

// Study content: quick review, breakdown, deep dive (questionStudy.ts). Same twin as above.

async function askAi(prompt: string, body: Row, maxTokens: number): Promise<string> {
  try {
    return await callAi(prompt, aiSettings(body), maxTokens);
  } catch (err) {
    const last = err instanceof Error ? err.message : String(err);
    throw new HttpError(400, `No API key configured or all providers failed. Add a key in Config. Last error: ${last}`);
  }
}

function studyQuestion(db: TodoDb, questionId: number): StudyQuestion {
  const q: QuizQuestionFields | null = fetchQuestionForQuiz(db, questionId);
  if (!q) throw new HttpError(404, 'Question not found');
  return { questionText: q.question_text, category: q.category, subType: q.sub_type, topics: q.topics, difficulty: q.difficulty };
}

function getStudy(userId: number, questionId: number): Row {
  return withSessionDb((db) => {
    studyQuestion(db, questionId);
    return fetchStudy(db, userId, questionId, STUDY_KINDS);
  });
}

/** The stored item of `kind`; generated (and stored) when there is none yet or `refresh` is true. */
async function generateStudy(userId: number, questionId: number, kindParam: string, body: unknown): Promise<Row> {
  if (!isDict(body)) throw new HttpError(422, 'Input should be a valid dictionary');
  // QuestionStudyRequest(AISettings): refresh (bool, default false), optional written answer.
  const refresh = body.refresh === undefined ? false : toBool(body.refresh, 'refresh');
  const answer = optStr(body, 'answer') ?? '';
  if (!(STUDY_KINDS as readonly string[]).includes(kindParam))
    throw new HttpError(400, 'kind must be one of: quick, breakdown, deep.');
  const kind = kindParam as StudyKind;
  if (longerThan(answer, MAX_QUIZ_ANSWER_CHARS))
    throw new HttpError(400, `answer is too long (max ${MAX_QUIZ_ANSWER_CHARS} characters).`);
  const { question, stored } = withSessionDb((db) => ({
    question: studyQuestion(db, questionId),
    stored: refresh ? null : fetchStudyItem(db, userId, questionId, kind),
  }));
  if (stored) return stored;
  const memory = memoryLinesSafe(userId, question.subType);
  const text = await askAi(buildStudyPrompt(kind, question, answer, memory), body, STUDY_MAX_TOKENS[kind]);
  let raw: unknown;
  try {
    raw = parseStudyReply(text);
  } catch (err) {
    const last = err instanceof Error ? err.message : String(err);
    throw new HttpError(502, `The AI response couldn't be parsed. Try again. (${last})`);
  }
  const content = normalizeStudy(kind, raw);
  if (content === null) throw new HttpError(502, `The AI didn't return a usable ${STUDY_LABELS[kind]}. Try again.`);
  return withSessionDb((db) => saveStudy(db, userId, questionId, kind, content));
}

/** Extend one deep-dive section by a deeper layer (appended; what is there stays) and bump its depth. */
async function expandDeepDive(userId: number, questionId: number, body: unknown): Promise<Row> {
  if (!isDict(body)) throw new HttpError(422, 'Input should be a valid dictionary');
  const { question, deep } = withSessionDb((db) => ({
    question: studyQuestion(db, questionId),
    deep: fetchStudyItem(db, userId, questionId, 'deep'),
  }));
  if (!deep) throw new HttpError(404, 'No deep dive saved for this question yet. Generate one first.');
  const sections = deep.sections as { heading: string; body: string; depth: number }[];
  const index = asIndex(body.section);
  if (index === null || !(index >= 0 && index < sections.length))
    throw new HttpError(400, `section must be the index of one of the deep dive's sections (0-${sections.length - 1}).`);
  const target = sections[index];
  if (target.depth >= MAX_DEPTH) throw new HttpError(400, `This section is already at the deepest level (${MAX_DEPTH}).`);
  const prompt = buildExpandPrompt(
    question,
    sections.map((s) => s.heading),
    index,
    target.body,
    target.depth + 1
  );
  const layer = cleanLayer(await askAi(prompt, body, EXPAND_MAX_TOKENS));
  if (!layer) throw new HttpError(502, 'The model returned an empty answer. Try again.');
  target.body = target.body.trimEnd() + '\n\n' + layer;
  target.depth = target.depth + 1;
  return withSessionDb((db) => saveStudy(db, userId, questionId, 'deep', { sections, further: deep.further }));
}

/** Which breakdown chunks the user has read (stored sorted). */
function saveBreakdownProgress(userId: number, questionId: number, body: unknown): Row {
  if (!isDict(body)) throw new HttpError(422, 'Input should be a valid dictionary');
  return withSessionDb((db) => {
    studyQuestion(db, questionId);
    const breakdown = fetchStudyItem(db, userId, questionId, 'breakdown');
    if (!breakdown) throw new HttpError(404, 'No breakdown saved for this question yet. Generate one first.');
    const n = (breakdown.chunks as unknown[]).length;
    const indices = Array.isArray(body.done) ? body.done.map(asIndex) : null;
    if (
      indices === null ||
      indices.some((i) => i === null || !(i >= 0 && i < n)) ||
      new Set(indices).size !== indices.length
    )
      throw new HttpError(400, `done must be a list of unique chunk indices (0-${n - 1}).`);
    const done = (indices as number[]).slice().sort((a, b) => a - b);
    return saveStudy(db, userId, questionId, 'breakdown', { chunks: breakdown.chunks, done });
  });
}

// ── Sessions ─────────────────────────────────────────────────────────────────────────────────────────────────
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
  // Login required since the per-user ratings (401 without a token, like FastAPI's router).
  { method: 'GET', path: '/questions/:question_id', handler: (ctx) => getQuestion(ctx.userId, ctx.intParam('question_id')) },
  {
    method: 'PATCH',
    path: '/questions/:question_id/performance',
    handler: async (ctx) => updatePerformance(ctx.userId, ctx.intParam('question_id'), await ctx.json()),
  },
  { method: 'GET', path: '/questions', handler: (ctx) => listQuestions(ctx.userId, ctx.query) },
  // Review list ("Add to review"). compileRoutes puts this static path before '/questions/:question_id', the same
  // precedence FastAPI gets from declaring it first.
  { method: 'GET', path: '/questions/review-list', handler: (ctx) => ({ items: withSessionDb((db) => fetchReviewList(db, ctx.userId)) }) },
  {
    method: 'PUT',
    path: '/questions/:question_id/review',
    handler: (ctx) => reviewToggle(ctx.userId, ctx.intParam('question_id'), true),
  },
  {
    method: 'DELETE',
    path: '/questions/:question_id/review',
    handler: (ctx) => reviewToggle(ctx.userId, ctx.intParam('question_id'), false),
  },
  // Question Review: the user's own answer + notes and concept quiz for one (shared) question.
  { method: 'GET', path: '/questions/:question_id/workspace', handler: (ctx) => getWorkspace(ctx.userId, ctx.intParam('question_id')) },
  {
    method: 'PUT',
    path: '/questions/:question_id/workspace',
    handler: async (ctx) => putWorkspace(ctx.userId, ctx.intParam('question_id'), await ctx.json()),
  },
  {
    method: 'GET',
    path: '/questions/:question_id/quiz',
    handler: (ctx) => ({ questions: withSessionDb((db) => fetchQuestionQuiz(db, ctx.userId, ctx.intParam('question_id'))) }),
  },
  {
    method: 'POST',
    path: '/questions/:question_id/quiz/generate',
    handler: async (ctx) => generateQuestionQuiz(ctx.userId, ctx.intParam('question_id'), await ctx.json()),
  },
  { method: 'GET', path: '/questions/:question_id/study', handler: (ctx) => getStudy(ctx.userId, ctx.intParam('question_id')) },
  {
    method: 'POST',
    path: '/questions/:question_id/study/:kind',
    handler: async (ctx) => generateStudy(ctx.userId, ctx.intParam('question_id'), ctx.params.kind, await ctx.json()),
  },
  {
    method: 'POST',
    path: '/questions/:question_id/study/deep/expand',
    handler: async (ctx) => expandDeepDive(ctx.userId, ctx.intParam('question_id'), await ctx.json()),
  },
  {
    method: 'PUT',
    path: '/questions/:question_id/study/breakdown/progress',
    handler: async (ctx) => saveBreakdownProgress(ctx.userId, ctx.intParam('question_id'), await ctx.json()),
  },
  {
    method: 'DELETE',
    path: '/questions/:question_id/quiz',
    handler: (ctx) => {
      const questionId = ctx.intParam('question_id');
      withSessionDb((db) => clearQuestionQuiz(db, ctx.userId, questionId));
      return { questions: [] };
    },
  },
  {
    method: 'POST',
    path: '/session-progress',
    // POST /session-progress takes a JSON array; ctx.json() turns an empty body into {} (-> 422 here, like FastAPI).
    handler: async (ctx) => saveProgress(ctx.userId, await ctx.json()),
  },
  { method: 'GET', path: '/session-progress', handler: (ctx) => getProgress(ctx.userId, ctx.query) },
  { method: 'GET', path: '/session-progress/stats', handler: (ctx) => progressStats(ctx.userId) },
  // The answer coach (hint, evaluation, deep dive, learn chat): AI only, nothing is read or written in the database.
  { method: 'POST', path: '/sessions/generate-answer', handler: async (ctx) => generateAnswer(await ctx.json()) },
  {
    method: 'POST',
    path: '/sessions/evaluate-answer',
    handler: async (ctx) => {
      const body = await ctx.json();
      const result = await evaluateAnswer(body);
      // Tutor memory: the 1-2 weak spots it found, keyed by the question type so other questions of it see them.
      rememberFacts(ctx.userId, typeof body.sub_type === 'string' ? body.sub_type : '', weakSpotFacts(result));
      return result;
    },
  },
  { method: 'POST', path: '/sessions/expand-answer', handler: async (ctx) => expandAnswer(await ctx.json()) },
  {
    method: 'POST',
    path: '/sessions/learn-chat',
    handler: async (ctx) => {
      const body = await ctx.json();
      // Tutor memory: weak spots remembered from earlier questions of this type (and the strongest others).
      const topic = body && typeof body.sub_type === 'string' ? body.sub_type : '';
      return learnChat(body, memoryLinesSafe(ctx.userId, topic));
    },
  },
  {
    method: 'POST',
    path: '/sessions/generate-session-questions',
    handler: async (ctx) => {
      const body = await ctx.json();
      const bank = withSessionDb((db) =>
        db.all<{ question_text: string }>('SELECT question_text FROM questions ORDER BY id').map((r) => r.question_text)
      );
      return generateSessionQuestions(body, bank, memoryLines(ctx.userId, 'daily-session', ''));
    },
  },
  // The labs' Generate Practice panel (FastAPI serves these from the same daily_session router).
  { method: 'POST', path: '/lab/generate-questions', handler: async (ctx) => generateLabQuestions(await ctx.json()) },
  { method: 'POST', path: '/lab/generate-from-youtube', handler: async (ctx) => generateLabFromYoutube(await ctx.json()) },
];
const PRIVATE_ROUTES = compileRoutes(PRIVATE);

// Every route needs a login (the app is login-only, like FastAPI's daily_session router): there are no public ones.
async function dispatchSession(req: Request, segments: string[]): Promise<Response> {
  return dispatch(PRIVATE_ROUTES, req, segments);
}

const writeSession = withNeonSync(dispatchSession);
const readSession = withNeonRead(dispatchSession);

/**
 * Entry point for src/app/api/{sessions,questions,session-progress}/[[...path]]/route.ts and src/app/api/lab/[...path].
 * `segments` include the first path part ('sessions', 'questions', 'session-progress' or 'lab'), so they match the
 * Python paths.
 */
export function handleDailySession(req: Request, segments: string[]): Promise<Response> {
  // Generating questions only reads the bank (the session is saved by the POST /sessions/questions that follows),
  // so it skips the Neon snapshot push that wraps the other writes.
  // (evaluate-answer is not one of them any more: it records weak spots in the AI memory, a write.)
  const AI_ONLY = ['generate-session-questions', 'generate-answer', 'expand-answer', 'learn-chat'];
  const readOnly =
    req.method === 'GET' || segments[0] === 'lab' || (segments[0] === 'sessions' && AI_ONLY.includes(segments[1]));
  return readOnly ? readSession(req, segments) : writeSession(req, segments);
}

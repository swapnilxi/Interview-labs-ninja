/**
 * fe-apis/dailySession/questionStore.ts
 *
 * Twin of backend/modules/daily_session/schema.py + question_store.py: the per-user workspace (answer + notes),
 * concept quiz and study content (quick review, breakdown, deep dive) for a Daily Session question (Question Review),
 * plus each user's own rating / last-reviewed date (question_user_state; db.py update_question_performance). `questions` rows are shared, these tables are not:
 * every read and write is scoped by user_id. Each function takes the open connection (index.ts's withSessionDb).
 * Keep in sync with the Python pair.
 */

import { parseJson, type Row, type TodoDb } from '../todo/_shared';

/** schema.py register(): CREATE ... IF NOT EXISTS, so a DB the Python backend already migrated is left alone. */
export function ensureQuestionStoreSchema(db: TodoDb): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS question_workspace (
      user_id INTEGER NOT NULL,
      question_id INTEGER NOT NULL,
      answer TEXT NOT NULL DEFAULT '',
      notes TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (user_id, question_id)
    )`);
  // `options` is a JSON array of 4 strings; `answer` is the index of the correct one.
  db.exec(`
    CREATE TABLE IF NOT EXISTS question_quiz (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      question_id INTEGER NOT NULL,
      q TEXT NOT NULL,
      options TEXT NOT NULL,
      answer INTEGER NOT NULL,
      explanation TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`);
  db.exec('CREATE INDEX IF NOT EXISTS idx_question_quiz_user_question ON question_quiz(user_id, question_id);');
  // Study content (questionStudy.ts): one row per user, question and kind ('quick', 'breakdown', 'deep').
  // `content` is the item's JSON without `kind` / `updated_at`.
  db.exec(`
    CREATE TABLE IF NOT EXISTS question_study (
      user_id INTEGER NOT NULL,
      question_id INTEGER NOT NULL,
      kind TEXT NOT NULL,
      content TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (user_id, question_id, kind)
    )`);
  // Each user's own star rating and last-reviewed date (replaces the shared questions.user_performance /
  // last_reviewed columns, which are no longer written).
  db.exec(`
    CREATE TABLE IF NOT EXISTS question_user_state (
      user_id INTEGER NOT NULL,
      question_id INTEGER NOT NULL,
      performance INTEGER DEFAULT NULL,
      last_reviewed TEXT DEFAULT NULL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (user_id, question_id)
    )`);
  // "Add to review": the questions a user has put on their review list.
  db.exec(`
    CREATE TABLE IF NOT EXISTS question_review_list (
      user_id INTEGER NOT NULL,
      question_id INTEGER NOT NULL,
      added_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (user_id, question_id)
    )`);
  // Ratings made before this table existed sit on the shared questions row: give each one to the row's owner.
  // INSERT OR IGNORE keeps it idempotent (a rating the owner has made since is never overwritten). Rows with no
  // owner (user_id NULL) can't be attributed to anyone and are left out.
  const questionCols = new Set(db.all<{ name: string }>('PRAGMA table_info(questions)').map((c) => c.name));
  if (['user_id', 'user_performance', 'last_reviewed'].every((c) => questionCols.has(c))) {
    db.exec(`
      INSERT OR IGNORE INTO question_user_state (user_id, question_id, performance, last_reviewed)
      SELECT user_id, id, user_performance, last_reviewed FROM questions
      WHERE user_id IS NOT NULL AND (user_performance IS NOT NULL OR last_reviewed IS NOT NULL)`);
  }
}

/** Save userId's own rating and last-reviewed date (twin of update_question_performance). False = no such question. */
export function saveUserState(
  db: TodoDb,
  userId: number,
  questionId: number,
  performance: number,
  lastReviewed: string
): boolean {
  if (!questionExists(db, questionId)) return false;
  db.run(
    `INSERT INTO question_user_state (user_id, question_id, performance, last_reviewed, updated_at)
     VALUES (?, ?, ?, ?, datetime('now'))
     ON CONFLICT(user_id, question_id) DO UPDATE SET
       performance = excluded.performance,
       last_reviewed = excluded.last_reviewed,
       updated_at = excluded.updated_at`,
    userId,
    questionId,
    performance,
    lastReviewed
  );
  return true;
}

export interface QuestionWorkspace {
  question_id: number;
  answer: string;
  notes: string;
  updated_at: string | null;
  /** Whether the question is on the user's review list. */
  in_review: boolean;
}

export interface QuestionQuizItem {
  id: number;
  q: string;
  options: string[];
  answer: number;
  explanation: string;
}

export interface QuizQuestionFields {
  question_text: string;
  category: string;
  sub_type: string;
  difficulty: string;
  topics: string[];
}

/** The fields the quiz prompt uses, or null when there is no such question (any owner: questions are shared). */
export function fetchQuestionForQuiz(db: TodoDb, questionId: number): QuizQuestionFields | null {
  const row = db.get('SELECT question_text, category, sub_type, difficulty, topics FROM questions WHERE id = ?', questionId);
  if (!row) return null;
  return {
    question_text: row.question_text || '',
    category: row.category || '',
    sub_type: row.sub_type || '',
    difficulty: row.difficulty || '',
    topics: String(row.topics || '').split(',').filter(Boolean),
  };
}

export function questionExists(db: TodoDb, questionId: number): boolean {
  return db.get('SELECT 1 AS one FROM questions WHERE id = ?', questionId) !== undefined;
}

/**
 * This user's answer and notes for the question (empty strings and updated_at null when nothing is saved), and
 * whether it is on their review list.
 */
export function fetchWorkspace(db: TodoDb, userId: number, questionId: number): QuestionWorkspace {
  const row = db.get('SELECT answer, notes, updated_at FROM question_workspace WHERE user_id = ? AND question_id = ?', userId, questionId);
  const inReview =
    db.get('SELECT 1 AS one FROM question_review_list WHERE user_id = ? AND question_id = ?', userId, questionId) !== undefined;
  return {
    question_id: questionId,
    answer: row ? row.answer : '',
    notes: row ? row.notes : '',
    updated_at: row ? row.updated_at : null,
    in_review: inReview,
  };
}

/** Partial upsert: a field passed as null keeps its saved value. Nothing to change = nothing written. */
export function saveWorkspace(
  db: TodoDb,
  userId: number,
  questionId: number,
  answer: string | null,
  notes: string | null
): QuestionWorkspace {
  if (answer !== null || notes !== null) {
    db.transaction(() => {
      const current = db.get<{ answer: string; notes: string }>(
        'SELECT answer, notes FROM question_workspace WHERE user_id = ? AND question_id = ?',
        userId,
        questionId
      );
      const newAnswer = answer !== null ? answer : current ? current.answer : '';
      const newNotes = notes !== null ? notes : current ? current.notes : '';
      db.run(
        `INSERT INTO question_workspace (user_id, question_id, answer, notes, updated_at)
         VALUES (?, ?, ?, ?, datetime('now'))
         ON CONFLICT(user_id, question_id) DO UPDATE SET
           answer = excluded.answer, notes = excluded.notes, updated_at = excluded.updated_at`,
        userId,
        questionId,
        newAnswer,
        newNotes
      );
    });
  }
  return fetchWorkspace(db, userId, questionId);
}

function quizItem(row: Row): QuestionQuizItem {
  return {
    id: row.id,
    q: row.q,
    options: parseJson<string[]>(row.options, []),
    answer: row.answer,
    explanation: row.explanation,
  };
}

/** This user's quiz items for the question, oldest first. */
export function fetchQuestionQuiz(db: TodoDb, userId: number, questionId: number): QuestionQuizItem[] {
  return db
    .all(
      `SELECT id, q, options, answer, explanation FROM question_quiz
       WHERE user_id = ? AND question_id = ?
       ORDER BY id`,
      userId,
      questionId
    )
    .map(quizItem);
}

/** Append items, skipping any whose stem is already stored and stopping at `cap` stored items. Returns the added. */
export function addQuestionQuiz(
  db: TodoDb,
  userId: number,
  questionId: number,
  questions: Omit<QuestionQuizItem, 'id'>[],
  cap: number
): QuestionQuizItem[] {
  return db.transaction(() => {
    const stems = db
      .all<{ q: string }>('SELECT q FROM question_quiz WHERE user_id = ? AND question_id = ?', userId, questionId)
      .map((r) => r.q);
    const existing = new Set(stems.map((s) => s.trim().toLowerCase()));
    let stored = stems.length;
    const added: QuestionQuizItem[] = [];
    for (const q of questions) {
      if (stored >= cap) break;
      const key = q.q.trim().toLowerCase();
      if (existing.has(key)) continue;
      existing.add(key);
      const { lastInsertRowid } = db.run(
        `INSERT INTO question_quiz (user_id, question_id, q, options, answer, explanation)
         VALUES (?, ?, ?, ?, ?, ?)`,
        userId,
        questionId,
        q.q,
        JSON.stringify(q.options),
        q.answer,
        q.explanation
      );
      stored += 1;
      added.push({ id: Number(lastInsertRowid), ...q });
    }
    return added;
  });
}

export function clearQuestionQuiz(db: TodoDb, userId: number, questionId: number): void {
  db.run('DELETE FROM question_quiz WHERE user_id = ? AND question_id = ?', userId, questionId);
}

// ── Study content (quick review, breakdown, deep dive) ──────────────────────────────────────────────────────
// `content` is the item's JSON without `kind` / `updated_at`, which come from the row.

function studyItem(kind: string, content: string, updatedAt: string): Row {
  return { kind, ...parseJson<Row>(content, {}), updated_at: updatedAt };
}

/** {kind: item or null} for every kind in `kinds`. */
export function fetchStudy(db: TodoDb, userId: number, questionId: number, kinds: readonly string[]): Row {
  const out: Row = {};
  for (const k of kinds) out[k] = null;
  const rows = db.all<{ kind: string; content: string; updated_at: string }>(
    'SELECT kind, content, updated_at FROM question_study WHERE user_id = ? AND question_id = ?',
    userId,
    questionId
  );
  for (const r of rows) {
    if (Object.prototype.hasOwnProperty.call(out, r.kind)) out[r.kind] = studyItem(r.kind, r.content, r.updated_at);
  }
  return out;
}

export function fetchStudyItem(db: TodoDb, userId: number, questionId: number, kind: string): Row | null {
  const row = db.get<{ content: string; updated_at: string }>(
    'SELECT content, updated_at FROM question_study WHERE user_id = ? AND question_id = ? AND kind = ?',
    userId,
    questionId,
    kind
  );
  return row ? studyItem(kind, row.content, row.updated_at) : null;
}

/** Insert or replace this user's item of `kind` for the question. Returns it as stored. */
export function saveStudy(db: TodoDb, userId: number, questionId: number, kind: string, content: Row): Row {
  db.run(
    `INSERT INTO question_study (user_id, question_id, kind, content, updated_at)
     VALUES (?, ?, ?, ?, datetime('now'))
     ON CONFLICT(user_id, question_id, kind) DO UPDATE SET
       content = excluded.content, updated_at = excluded.updated_at`,
    userId,
    questionId,
    kind,
    JSON.stringify(content)
  );
  return fetchStudyItem(db, userId, questionId, kind) as Row;
}

// ── Review list ("Add to review") ───────────────────────────────────────────────────────────────────────────

export function reviewState(db: TodoDb, userId: number, questionId: number): Row {
  const row = db.get<{ added_at: string }>(
    'SELECT added_at FROM question_review_list WHERE user_id = ? AND question_id = ?',
    userId,
    questionId
  );
  return { question_id: questionId, in_review: row !== undefined, added_at: row ? row.added_at : null };
}

/** Idempotent: adding again keeps the first added_at. */
export function addToReview(db: TodoDb, userId: number, questionId: number): Row {
  db.run(
    "INSERT OR IGNORE INTO question_review_list (user_id, question_id, added_at) VALUES (?, ?, datetime('now'))",
    userId,
    questionId
  );
  return reviewState(db, userId, questionId);
}

export function removeFromReview(db: TodoDb, userId: number, questionId: number): Row {
  db.run('DELETE FROM question_review_list WHERE user_id = ? AND question_id = ?', userId, questionId);
  return { question_id: questionId, in_review: false, added_at: null };
}

/** This user's review list, newest first (questions deleted since are left out). */
export function fetchReviewList(db: TodoDb, userId: number): Row[] {
  return db
    .all<{ question_id: number; added_at: string }>(
      `SELECT r.question_id, r.added_at FROM question_review_list r
       JOIN questions q ON q.id = r.question_id
       WHERE r.user_id = ?
       ORDER BY r.added_at DESC, r.rowid DESC`,
      userId
    )
    .map((r) => ({ question_id: r.question_id, added_at: r.added_at }));
}

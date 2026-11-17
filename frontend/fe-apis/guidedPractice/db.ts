/**
 * fe-apis/guidedPractice/db.ts
 *
 * Port of backend/modules/guided_practice/store.py. Synchronous, run inside `withGuidedDb`
 * (never `await` inside the callback -- node:sqlite is synchronous).
 */

import { withTodoDb, parseJson, type TodoDb } from '../todo/_shared';
import { ensureGuidedPracticeSchema } from './schema';
import type { GuidedLab } from './prompts';

let schemaReady = false;

/** `withTodoDb` (one connection, busy_timeout, re-entrant) plus this module's table, created once per process. */
export function withGuidedDb<T>(fn: (db: TodoDb) => T): T {
  return withTodoDb((db) => {
    if (!schemaReady) {
      ensureGuidedPracticeSchema(db);
      schemaReady = true;
    }
    return fn(db);
  });
}

export interface StoredState {
  version: number;
  state: unknown;
  summary: unknown;
  updatedAt: string;
}

/** The saved document of a page, or null when the learner has not started it. */
export function fetchState(
  userId: number,
  lab: GuidedLab,
  topicId: string,
  subtopicId: string
): StoredState | null {
  return withGuidedDb((db) => {
    const row = db.get(
      `SELECT version, state_json, summary_json, updated_at FROM guided_practice_state
       WHERE user_id = ? AND lab_name = ? AND topic_id = ? AND subtopic_id = ?`,
      userId,
      lab,
      topicId,
      subtopicId
    );
    if (!row) return null;
    return {
      version: row.version,
      state: parseJson<unknown>(row.state_json, null),
      summary: parseJson<unknown>(row.summary_json, null),
      updatedAt: row.updated_at,
    };
  });
}

/** Just the summary (what the topic page's card shows), or null when the page has not been started. */
export function fetchSummary(
  userId: number,
  lab: GuidedLab,
  topicId: string,
  subtopicId: string
): { summary: unknown; updatedAt: string } | null {
  return withGuidedDb((db) => {
    const row = db.get(
      `SELECT summary_json, updated_at FROM guided_practice_state
       WHERE user_id = ? AND lab_name = ? AND topic_id = ? AND subtopic_id = ?`,
      userId,
      lab,
      topicId,
      subtopicId
    );
    return row
      ? { summary: parseJson<unknown>(row.summary_json, null), updatedAt: row.updated_at }
      : null;
  });
}

export type SaveResult = { ok: true; version: number; updatedAt: string } | { ok: false };

/**
 * Save a page's document. `expectedVersion` is the version the caller loaded (0 = it found nothing): a different
 * stored version means another tab or device saved in between, and the save is refused (`ok: false`) rather than
 * overwriting that progress.
 */
export function saveState(
  userId: number,
  lab: GuidedLab,
  topicId: string,
  subtopicId: string,
  expectedVersion: number,
  stateJson: string,
  summaryJson: string
): SaveResult {
  return withGuidedDb((db) =>
    db.transaction((): SaveResult => {
      let changes: number;
      let version: number;
      if (expectedVersion === 0) {
        changes = db.run(
          `INSERT INTO guided_practice_state (user_id, lab_name, topic_id, subtopic_id, version, state_json, summary_json)
           VALUES (?, ?, ?, ?, 1, ?, ?)
           ON CONFLICT(user_id, lab_name, topic_id, subtopic_id) DO NOTHING`,
          userId,
          lab,
          topicId,
          subtopicId,
          stateJson,
          summaryJson
        ).changes;
        version = 1;
      } else {
        changes = db.run(
          `UPDATE guided_practice_state
           SET state_json = ?, summary_json = ?, version = version + 1, updated_at = datetime('now')
           WHERE user_id = ? AND lab_name = ? AND topic_id = ? AND subtopic_id = ? AND version = ?`,
          stateJson,
          summaryJson,
          userId,
          lab,
          topicId,
          subtopicId,
          expectedVersion
        ).changes;
        version = expectedVersion + 1;
      }
      if (!changes) return { ok: false };
      const row = db.get(
        `SELECT updated_at FROM guided_practice_state
         WHERE user_id = ? AND lab_name = ? AND topic_id = ? AND subtopic_id = ?`,
        userId,
        lab,
        topicId,
        subtopicId
      )!;
      return { ok: true, version, updatedAt: row.updated_at as string };
    })
  );
}

/** Forget a page's saved path and progress (the learner starts over). Idempotent. */
export function deleteState(
  userId: number,
  lab: GuidedLab,
  topicId: string,
  subtopicId: string
): void {
  withGuidedDb((db) => {
    db.run(
      'DELETE FROM guided_practice_state WHERE user_id = ? AND lab_name = ? AND topic_id = ? AND subtopic_id = ?',
      userId,
      lab,
      topicId,
      subtopicId
    );
  });
}

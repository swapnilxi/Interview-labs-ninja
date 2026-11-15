/**
 * fe-apis/memory/db.ts
 *
 * Port of backend/modules/memory/{schema,store}.py: per-user AI memory shared by every module. Constants, cleaning and
 * ordering must match the Python store. Synchronous, run inside `withMemoryDb` (never `await` in the callback).
 */

import { withTodoDb, type Row, type TodoDb } from '../todo/_shared';

export const KINDS = ['interest', 'struggle', 'mastered', 'preference'] as const;
export type MemoryKind = (typeof KINDS)[number];
const KIND_LABEL: Record<MemoryKind, string> = {
  interest: 'Likes',
  struggle: 'Struggles with',
  mastered: 'Knows well',
  preference: 'Prefers',
};
const HALF_LIFE_DAYS = 30;
const MAX_WEIGHT = 10;
const MAX_PER_MODULE = 200;
const MAX_FACT_CHARS = 160;
export const DEFAULT_RECALL = 8;
const TOPIC_BOOST = 2;
const MODULE_RE = /^[a-z0-9][a-z0-9_-]{0,39}$/;

/** Invalid input (answered with a 422). */
export class MemoryInputError extends Error {}

export interface MemoryFact {
  id: number;
  module: string;
  topic: string;
  kind: MemoryKind;
  fact: string;
  weight: number;
  hits: number;
  updatedAt: string;
}

let schemaReady = false;

/** Twin of ensureMemorySchema / register() in schema.py: created once per process. */
function ensureMemorySchema(db: TodoDb): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS ai_memory (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      module TEXT NOT NULL,
      topic TEXT NOT NULL DEFAULT '',
      kind TEXT NOT NULL,
      fact TEXT NOT NULL,
      weight REAL NOT NULL DEFAULT 1,
      hits INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(user_id, module, topic, fact)
    );
    CREATE INDEX IF NOT EXISTS idx_ai_memory_user_module ON ai_memory(user_id, module);
  `);
}

export function withMemoryDb<T>(fn: (db: TodoDb) => T): T {
  return withTodoDb((db) => {
    if (!schemaReady) {
      ensureMemorySchema(db);
      schemaReady = true;
    }
    return fn(db);
  });
}

export function clean(value: unknown, limit: number): string {
  if (typeof value !== 'string') return '';
  // eslint-disable-next-line no-control-regex
  return Array.from(value.replace(/[\x00-\x1f\x7f]+/g, ' ').trim()).slice(0, limit).join('').trim();
}

const decay = (ageDays: number) => 0.5 ** (Math.max(ageDays, 0) / HALF_LIFE_DAYS);
const SELECT = "SELECT *, julianday('now') - julianday(updated_at) AS age_days FROM ai_memory";

function fact(r: Row): MemoryFact {
  return {
    id: r.id,
    module: r.module,
    topic: r.topic,
    kind: r.kind,
    fact: r.fact,
    // Rounded like Python's round(x, 3)
    weight: Math.round(r.weight * decay(r.age_days) * 1000) / 1000,
    hits: r.hits,
    updatedAt: r.updated_at,
  };
}

export function record(userId: number, module: unknown, topic: unknown, kind: unknown, factText: unknown): MemoryFact {
  if (typeof module !== 'string' || !MODULE_RE.test(module)) {
    throw new MemoryInputError('module: lowercase letters, digits, - or _ (max 40).');
  }
  if (!KINDS.includes(kind as MemoryKind)) throw new MemoryInputError(`kind: one of ${KINDS.join(', ')}.`);
  const f = clean(factText, MAX_FACT_CHARS);
  if (!f) throw new MemoryInputError('fact: required.');
  const t = clean(topic, 60);
  return withMemoryDb((db) => {
    const row = db.get<Row>(`${SELECT} WHERE user_id = ? AND module = ? AND topic = ? AND fact = ?`, userId, module, t, f);
    let id: number;
    if (row) {
      const weight = Math.min(row.weight * decay(row.age_days) + 1, MAX_WEIGHT);
      db.run("UPDATE ai_memory SET weight = ?, hits = hits + 1, kind = ?, updated_at = datetime('now') WHERE id = ?", weight, kind, row.id);
      id = row.id;
    } else {
      id = db.run('INSERT INTO ai_memory (user_id, module, topic, kind, fact) VALUES (?, ?, ?, ?, ?)', userId, module, t, kind, f)
        .lastInsertRowid;
      const all = db.all<Row>(`${SELECT} WHERE user_id = ? AND module = ?`, userId, module);
      if (all.length > MAX_PER_MODULE) {
        const ranked = [...all].sort((a, b) => a.weight * decay(a.age_days) - b.weight * decay(b.age_days));
        for (const r of ranked.slice(0, all.length - MAX_PER_MODULE)) db.run('DELETE FROM ai_memory WHERE id = ?', r.id);
      }
    }
    return fact(db.get<Row>(`${SELECT} WHERE id = ?`, id) as Row);
  });
}

export function listFacts(userId: number, module?: string | null): MemoryFact[] {
  const facts = withMemoryDb((db) =>
    module
      ? db.all<Row>(`${SELECT} WHERE user_id = ? AND module = ?`, userId, module)
      : db.all<Row>(`${SELECT} WHERE user_id = ?`, userId)
  ).map(fact);
  return facts.sort((a, b) => b.weight - a.weight || b.id - a.id);
}

export function recall(userId: number, module: string, topic = '', limit = DEFAULT_RECALL): MemoryFact[] {
  const t = clean(topic, 60);
  const scored = listFacts(userId, module)
    .filter((f) => f.weight >= 0.05)
    .map((f) => ({ score: f.weight * (t && f.topic === t ? TOPIC_BOOST : 1), f }));
  scored.sort((a, b) => b.score - a.score || b.f.id - a.f.id);
  return scored.slice(0, limit).map((s) => s.f);
}

/** Prompt-ready lines, e.g. 'Struggles with: Got a quiz wrong: "Why use enumerate()?" (python)'. */
export function memoryLines(userId: number, module: string, topic = '', limit = DEFAULT_RECALL): string[] {
  return recall(userId, module, topic, limit).map((f) => `${KIND_LABEL[f.kind]}: ${f.fact}${f.topic ? ` (${f.topic})` : ''}`);
}

export function deleteFact(userId: number, id: number): boolean {
  return withMemoryDb((db) => db.run('DELETE FROM ai_memory WHERE id = ? AND user_id = ?', id, userId).changes > 0);
}

export function clearMemory(userId: number, module?: string | null): number {
  return withMemoryDb((db) =>
    module
      ? db.run('DELETE FROM ai_memory WHERE user_id = ? AND module = ?', userId, module).changes
      : db.run('DELETE FROM ai_memory WHERE user_id = ?', userId).changes
  );
}

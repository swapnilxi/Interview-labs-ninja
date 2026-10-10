/**
 * fe-apis/rag/storage.ts
 *
 * Shared SQLite storage for RAG chunks -- a single table used by every fe-api
 * module that indexes text for retrieval, not just one caller. Rows are
 * namespaced (see each function's docstring) so callers never collide with
 * each other's data while sharing one table/schema.
 *
 * Mirrors backend/modules/common/rag/storage.py exactly (same table shape, same
 * (namespace, owner_id) scoping) so both backend modes behave identically.
 */

import crypto from 'crypto';
import { getSQLiteDatabase } from '../_shared/db';

export interface RagChunkRecord {
  id: string;
  namespace: string;
  owner_id: string;
  chunk_index: number;
  source_label: string;
  content: string;
  embedding: number[];
  created_at: string;
}

/** Create (or migrate) the shared rag_chunks table. Called from ensureRagTables()
 * below on every entry point, the same lazy-migration convention fe-apis/lms/db.ts
 * already uses (no separate central init step on this side). */
export function ensureRagTables(): void {
  const res = getSQLiteDatabase('lab_ninja');
  if (!res) return;
  const { db } = res;
  db.exec(`
    CREATE TABLE IF NOT EXISTS rag_chunks (
      id TEXT PRIMARY KEY,
      namespace TEXT NOT NULL,
      owner_id TEXT NOT NULL,
      chunk_index INTEGER NOT NULL,
      source_label TEXT DEFAULT '',
      content TEXT NOT NULL,
      embedding TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
  `);
  db.exec('CREATE INDEX IF NOT EXISTS idx_rag_chunks_owner ON rag_chunks(namespace, owner_id);');
}

interface StoredChunkInput {
  content: string;
  embedding: number[];
  source_label?: string;
}

/** Replace all chunks for (namespace, ownerId) with a new set. */
export function saveChunks(namespace: string, ownerId: string, chunks: StoredChunkInput[]): void {
  ensureRagTables();
  const res = getSQLiteDatabase('lab_ninja');
  if (!res) return;
  const { db } = res;
  const nowIso = new Date().toISOString();

  db.prepare('DELETE FROM rag_chunks WHERE namespace = ? AND owner_id = ?').run(namespace, ownerId);
  const insert = db.prepare(`
    INSERT INTO rag_chunks (id, namespace, owner_id, chunk_index, source_label, content, embedding, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  chunks.forEach((chunk, idx) => {
    insert.run(
      `rchunk-${crypto.randomBytes(5).toString('hex')}`,
      namespace,
      ownerId,
      idx,
      chunk.source_label || '',
      chunk.content,
      JSON.stringify(chunk.embedding),
      nowIso
    );
  });
}

/** All chunks for (namespace, ownerId), in original order, embeddings decoded back
 * into number arrays. */
export function getChunks(namespace: string, ownerId: string): RagChunkRecord[] {
  ensureRagTables();
  const res = getSQLiteDatabase('lab_ninja');
  if (!res) return [];
  const { db } = res;
  const rows = db
    .prepare(
      `SELECT id, namespace, owner_id, chunk_index, source_label, content, embedding, created_at
       FROM rag_chunks WHERE namespace = ? AND owner_id = ? ORDER BY chunk_index ASC`
    )
    .all(namespace, ownerId) as Record<string, unknown>[];

  return rows.map((row) => {
    let embedding: number[] = [];
    try {
      embedding = JSON.parse(row.embedding as string);
    } catch {
      embedding = [];
    }
    return { ...row, embedding } as RagChunkRecord;
  });
}

/** Clear the index for (namespace, ownerId). Returns the number of chunks removed. */
export function deleteChunks(namespace: string, ownerId: string): number {
  ensureRagTables();
  const res = getSQLiteDatabase('lab_ninja');
  if (!res) return 0;
  const { db } = res;
  const result = db.prepare('DELETE FROM rag_chunks WHERE namespace = ? AND owner_id = ?').run(namespace, ownerId);
  return result.changes;
}

export function countChunks(namespace: string, ownerId: string): number {
  ensureRagTables();
  const res = getSQLiteDatabase('lab_ninja');
  if (!res) return 0;
  const { db } = res;
  const row = db
    .prepare('SELECT COUNT(*) as count FROM rag_chunks WHERE namespace = ? AND owner_id = ?')
    .get(namespace, ownerId) as { count: number };
  return row.count;
}

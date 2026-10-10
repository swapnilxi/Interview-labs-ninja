/**
 * Keeps a local SQLite file durable across Vercel's ephemeral /tmp by storing the
 * whole file as a blob in Neon Postgres (table `sqlite_snapshots`), instead of
 * rewriting every fe-api against a second SQL dialect. No-ops everywhere if
 * DATABASE_URL isn't set, so local dev behaves exactly as before this existed.
 *
 * Python twin: backend/modules/common/neon_sync.py (same table, same semantics) —
 * keep the two in sync.
 */

import fs from 'fs';
import { Client } from '@neondatabase/serverless';
import { getWritablePath } from './sqliteReader';

const DDL = `
CREATE TABLE IF NOT EXISTS sqlite_snapshots (
  db_name TEXT PRIMARY KEY,
  data BYTEA NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by TEXT
)
`;

type DbName = 'lab_ninja' | 'career_studio';

function databaseUrl(): string | undefined {
  return process.env.DATABASE_URL || undefined;
}

async function withClient<T>(fn: (client: Client) => Promise<T>): Promise<T> {
  const client = new Client(databaseUrl());
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

/** Latest stored bytes for dbName, or null if Neon isn't configured or has nothing
 * stored yet (e.g. before the first push). */
export async function downloadSnapshot(dbName: DbName): Promise<Buffer | null> {
  if (!databaseUrl()) return null;
  try {
    return await withClient(async (client) => {
      await client.query(DDL);
      const res = await client.query('SELECT data FROM sqlite_snapshots WHERE db_name = $1', [dbName]);
      return res.rows.length ? (res.rows[0].data as Buffer) : null;
    });
  } catch (err) {
    console.error(`[neonSync] downloadSnapshot(${dbName}) failed:`, err);
    return null;
  }
}

const seededThisProcess: Partial<Record<DbName, boolean>> = {};

/**
 * On the first call per warm process, if /tmp/<dbName>.sqlite3 doesn't exist yet (a true
 * cold start) and Neon has a snapshot, write it there before anything else seeds /tmp
 * from the stale git-committed file (see getWritablePath in sqliteReader.ts, which only
 * seeds from the bundled file when /tmp is still empty — so winning that race here means
 * Neon's copy is what the rest of the request sees). No-ops in local dev, where
 * getWritablePath reads the real file directly instead of /tmp.
 */
export async function ensureSeededFromNeon(dbName: DbName): Promise<void> {
  if (seededThisProcess[dbName]) return;
  seededThisProcess[dbName] = true;
  if (!databaseUrl()) return;
  const tmpPath = `/tmp/${dbName}.sqlite3`;
  if (fs.existsSync(tmpPath)) return;
  const snapshot = await downloadSnapshot(dbName);
  if (snapshot) {
    fs.writeFileSync(tmpPath, snapshot);
  }
}

/** Push filePath's current bytes to Neon as the latest snapshot. Never throws. */
export async function uploadSnapshot(
  dbName: DbName,
  filePath: string,
  updatedBy: string = 'auto-write'
): Promise<boolean> {
  if (!databaseUrl()) return false;
  try {
    const data = fs.readFileSync(filePath);
    await withClient(async (client) => {
      await client.query(DDL);
      await client.query(
        `INSERT INTO sqlite_snapshots (db_name, data, updated_at, updated_by)
         VALUES ($1, $2, now(), $3)
         ON CONFLICT (db_name) DO UPDATE
         SET data = EXCLUDED.data, updated_at = EXCLUDED.updated_at, updated_by = EXCLUDED.updated_by`,
        [dbName, data, updatedBy]
      );
    });
    return true;
  } catch (err) {
    console.error(`[neonSync] uploadSnapshot(${dbName}) failed:`, err);
    return false;
  }
}

/**
 * Wrap a mutating /api/* route handler so lab_ninja.sqlite3 is pushed to Neon once it
 * finishes — mirrors withClassFolderSync in fe-apis/lms/classFolders.ts. Runs even if
 * the handler returned an error response (same as that precedent): a partial write is
 * still worth capturing, and re-uploading unchanged bytes is harmless.
 *
 * The pull side (seeding /tmp from Neon on cold start) is NOT done here — it'd mean
 * wrapping every GET handler too. Instead it's handled once, centrally, for every
 * request kind, by frontend/instrumentation.ts calling ensureSeededFromNeon() at
 * server-instance boot (Next's register() hook) — see that file.
 */
export function withNeonSync<A extends unknown[], R>(
  handler: (...args: A) => Promise<R>
): (...args: A) => Promise<R> {
  return async (...args: A) => {
    try {
      return await handler(...args);
    } finally {
      if (databaseUrl()) {
        try {
          await uploadSnapshot('lab_ninja', getWritablePath('lab_ninja'));
        } catch (err) {
          console.warn('[neonSync] post-write upload failed:', err);
        }
      }
    }
  };
}

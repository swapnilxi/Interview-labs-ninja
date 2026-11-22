/**
 * Keeps a local SQLite file durable across Vercel's ephemeral /tmp by storing the
 * whole file as a blob in Neon Postgres (table `sqlite_snapshots`), instead of
 * rewriting every fe-api against a second SQL dialect.
 *
 * Why the version checks below exist (data loss found 2026-11-19): Vercel runs several
 * warm instances at once, each with its own /tmp copy. The first version only pulled
 * from Neon on a cold start and pushed the whole file after every write, so:
 *   - phone adds a task on instance A, A pushes;
 *   - desktop's request lands on instance B, warm since earlier, whose /tmp copy never
 *     saw A's write; the desktop adds something, B pushes its whole file and the
 *     phone's task is gone from Neon for good (and on the next cold start, everywhere).
 * Now every request first compares the instance's copy with Neon's `updated_at` (a tiny
 * query) and pulls the newer file, and a push is a compare-and-set on `updated_at`: if
 * another instance pushed in between, the request is replayed on the newest copy
 * instead of overwriting it. An instance that could not read Neon never pushes, so a
 * failed cold-start download can no longer push the stale git-committed file over
 * Neon either.
 *
 * Automatic sync runs only on Vercel (where the file is a /tmp copy). In local dev the
 * file is the tracked backend/data/lab_ninja.sqlite3; pushing it over production on
 * every local write was another way to wipe phone data, so local dev never touches Neon
 * automatically (the superadmin push/pull in fe-apis/admin/db.ts still works).
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

/** How often a write that lost the compare-and-set is replayed on the newer copy. */
const MAX_WRITE_ATTEMPTS = 3;

function databaseUrl(): string | undefined {
  return process.env.DATABASE_URL || undefined;
}

/** Automatic pull-before / push-after: only where the DB file is a disposable /tmp copy. */
function autoSyncEnabled(): boolean {
  return Boolean(databaseUrl() && process.env.VERCEL);
}

async function withClient<T>(fn: (client: Client) => Promise<T>): Promise<T> {
  const client = new Client(databaseUrl());
  await client.connect();
  try {
    await client.query(DDL);
    return await fn(client);
  } finally {
    await client.end();
  }
}

// ── What this instance holds ────────────────────────────────────────────────

/**
 * Neon's `updated_at` (as text, so microseconds survive) of the snapshot this instance's
 * file was last pulled from or pushed as. `undefined` = never synced (Neon unreachable so
 * far): such an instance must not push. `null` = Neon has no snapshot yet.
 */
const held: Partial<Record<DbName, string | null>> = {};

/** One sync step (pull, or a whole write + push) at a time per instance. */
let chain: Promise<unknown> = Promise.resolve();
let writesInFlight = 0;

function serialized<T>(fn: () => Promise<T>): Promise<T> {
  const run = chain.then(fn, fn);
  chain = run.catch(() => undefined);
  return run;
}

async function remoteVersion(client: Client, dbName: DbName): Promise<string | null> {
  const res = await client.query(
    'SELECT updated_at::text AS v FROM sqlite_snapshots WHERE db_name = $1',
    [dbName]
  );
  return res.rows.length ? (res.rows[0].v as string) : null;
}

/** Replace the local file without ever leaving a half-written one behind. */
function writeFileAtomic(filePath: string, data: Buffer): void {
  const tmp = `${filePath}.pull-${process.pid}`;
  fs.writeFileSync(tmp, data);
  fs.renameSync(tmp, filePath);
}

/**
 * Pull Neon's snapshot into the local file if it is newer than what this instance holds.
 * Returns false when Neon could not be reached (the instance then keeps serving its copy
 * but will refuse to push).
 */
async function pullIfStale(dbName: DbName): Promise<boolean> {
  try {
    return await withClient(async (client) => {
      const remote = await remoteVersion(client, dbName);
      if (remote === null) {
        if (held[dbName] === undefined) held[dbName] = null;
        return true;
      }
      if (remote === held[dbName]) return true;
      const res = await client.query(
        'SELECT data, updated_at::text AS v FROM sqlite_snapshots WHERE db_name = $1',
        [dbName]
      );
      if (!res.rows.length) return true;
      writeFileAtomic(getWritablePath(dbName), res.rows[0].data as Buffer);
      held[dbName] = res.rows[0].v as string;
      return true;
    });
  } catch (err) {
    console.error(`[neonSync] pull(${dbName}) failed:`, err);
    return false;
  }
}

type PushResult = 'pushed' | 'conflict' | 'failed';

/** Push the local file only if Neon still holds the version this instance is based on. */
async function pushIfUnchanged(dbName: DbName, updatedBy: string): Promise<PushResult> {
  const base = held[dbName];
  if (base === undefined) {
    console.error(`[neonSync] not pushing ${dbName}: this instance never read Neon's copy`);
    return 'failed';
  }
  try {
    const data = fs.readFileSync(getWritablePath(dbName));
    return await withClient(async (client) => {
      const res =
        base === null
          ? await client.query(
              `INSERT INTO sqlite_snapshots (db_name, data, updated_at, updated_by)
               VALUES ($1, $2, clock_timestamp(), $3)
               ON CONFLICT (db_name) DO NOTHING
               RETURNING updated_at::text AS v`,
              [dbName, data, updatedBy]
            )
          : await client.query(
              `UPDATE sqlite_snapshots
               SET data = $2, updated_at = clock_timestamp(), updated_by = $3
               WHERE db_name = $1 AND updated_at::text = $4
               RETURNING updated_at::text AS v`,
              [dbName, data, updatedBy, base]
            );
      if (!res.rows.length) return 'conflict';
      held[dbName] = res.rows[0].v as string;
      return 'pushed';
    });
  } catch (err) {
    console.error(`[neonSync] push(${dbName}) failed:`, err);
    return 'failed';
  }
}

// ── Public API ──────────────────────────────────────────────────────────────

/** Latest stored bytes for dbName, or null if Neon isn't configured or has nothing
 * stored yet (e.g. before the first push). */
export async function downloadSnapshot(dbName: DbName): Promise<Buffer | null> {
  if (!databaseUrl()) return null;
  try {
    return await withClient(async (client) => {
      const res = await client.query('SELECT data FROM sqlite_snapshots WHERE db_name = $1', [
        dbName,
      ]);
      return res.rows.length ? (res.rows[0].data as Buffer) : null;
    });
  } catch (err) {
    console.error(`[neonSync] downloadSnapshot(${dbName}) failed:`, err);
    return null;
  }
}

/**
 * Called once per server instance at boot (src/instrumentation.ts): pull Neon's copy
 * before the first request can seed /tmp from the stale git-committed file. If Neon is
 * unreachable here, every later request retries the pull (see withNeonRead/withNeonSync).
 */
export async function ensureSeededFromNeon(dbName: DbName): Promise<void> {
  if (!autoSyncEnabled()) return;
  await serialized(() => pullIfStale(dbName));
}

/**
 * Unconditional push of filePath's bytes (the superadmin "push" in fe-apis/admin/db.ts).
 * Never throws. Overwrites whatever Neon holds, on purpose.
 */
export async function uploadSnapshot(
  dbName: DbName,
  filePath: string,
  updatedBy: string = 'auto-write'
): Promise<boolean> {
  if (!databaseUrl()) return false;
  try {
    const data = fs.readFileSync(filePath);
    await withClient(async (client) => {
      const res = await client.query(
        `INSERT INTO sqlite_snapshots (db_name, data, updated_at, updated_by)
         VALUES ($1, $2, clock_timestamp(), $3)
         ON CONFLICT (db_name) DO UPDATE
         SET data = EXCLUDED.data, updated_at = EXCLUDED.updated_at, updated_by = EXCLUDED.updated_by
         RETURNING updated_at::text AS v`,
        [dbName, data, updatedBy]
      );
      if (filePath === getWritablePath(dbName)) held[dbName] = res.rows[0].v as string;
    });
    return true;
  } catch (err) {
    console.error(`[neonSync] uploadSnapshot(${dbName}) failed:`, err);
    return false;
  }
}

/** After the superadmin "pull" wrote Neon's bytes over the local file. */
export function markPulled(dbName: DbName): void {
  held[dbName] = undefined;
}

/**
 * Wrap a read-only /api/* handler: before it runs, pull Neon's copy if another instance
 * pushed since this one last synced, so a phone and a desktop see the same data.
 * Skipped while this instance is running a write (that write pulls and pushes itself).
 */
export function withNeonRead<A extends unknown[], R>(
  handler: (...args: A) => Promise<R>,
  dbName: DbName = 'lab_ninja'
): (...args: A) => Promise<R> {
  return async (...args: A) => {
    const now = Date.now();
    if (
      autoSyncEnabled() &&
      writesInFlight === 0 &&
      now - lastReadCheck >= READ_CHECK_INTERVAL_MS
    ) {
      lastReadCheck = now;
      // A failed check is not fatal for a read: serve this instance's copy.
      await serialized(() => pullIfStale(dbName));
    }
    return handler(...args);
  };
}

/** Reads within this window reuse the last version check (a page load fires several GETs at once). */
const READ_CHECK_INTERVAL_MS = 1500;
let lastReadCheck = 0;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Push, retrying a network failure once (a conflict is returned as is). */
async function pushWithRetry(dbName: DbName): Promise<PushResult> {
  const first = await pushIfUnchanged(dbName, 'auto-write');
  if (first !== 'failed' || held[dbName] === undefined) return first;
  await sleep(500);
  return pushIfUnchanged(dbName, 'auto-write');
}

function unavailable(): Response {
  return Response.json(
    {
      detail: "Couldn't reach the database just now, so nothing was saved. Try again in a moment.",
    },
    { status: 503 }
  );
}

/**
 * Wrap a mutating /api/* handler: pull the newest copy, run the handler, push with a
 * compare-and-set. If another instance pushed in between, pull its copy and run the
 * handler again (the request is replayed from a clone, so its body is still readable),
 * so neither write is lost. Writes on one instance run one at a time.
 *
 * A push still happens when the handler returned an error response (a partial write is
 * worth keeping; re-uploading unchanged bytes is harmless).
 */
export function withNeonSync<A extends unknown[], R>(
  handler: (...args: A) => Promise<R>,
  dbName: DbName = 'lab_ninja'
): (...args: A) => Promise<R> {
  return async (...args: A) => {
    if (!autoSyncEnabled()) return handler(...args);

    const original = args[0] instanceof Request ? args[0] : null;
    const pristine = original ? original.clone() : null;
    writesInFlight += 1;
    try {
      return await serialized(async () => {
        let result!: R;
        for (let attempt = 1; attempt <= MAX_WRITE_ATTEMPTS; attempt++) {
          const pulled = await pullIfStale(dbName);
          if (!pulled && held[dbName] === undefined && original) {
            // This instance has never seen Neon's copy (its file is the stale git one): saving here would be
            // lost on the next cold start, or worse, pushed over newer data. Refuse visibly instead.
            return unavailable() as R;
          }
          const callArgs = (
            attempt === 1 || !pristine ? args : [pristine.clone(), ...args.slice(1)]
          ) as A;
          result = await handler(...callArgs);
          const pushed = await pushWithRetry(dbName);
          if (pushed === 'failed') {
            // The write is in this instance's file and goes out with its next successful push.
            console.error(
              '[neonSync] push failed twice; the write stays local until the next push'
            );
          }
          if (pushed !== 'conflict') return result;
          if (!pristine) {
            // Nothing to replay (not a Request handler): keep Neon's newer copy.
            console.warn(
              '[neonSync] write lost a race and could not be replayed; keeping the newer copy'
            );
            await pullIfStale(dbName);
            return result;
          }
          console.warn(
            `[neonSync] another instance pushed first; replaying the write (attempt ${attempt + 1})`
          );
        }
        console.error('[neonSync] write still conflicting after retries; the newer copy wins');
        await pullIfStale('lab_ninja');
        return result;
      });
    } finally {
      writesInFlight -= 1;
    }
  };
}

/**
 * Push a write a read handler made on its own (e.g. GET /todo/routines creating the
 * Dailies group). Must be called right after that write, inside the same request.
 */
export async function pushLocalWrite(): Promise<void> {
  if (!autoSyncEnabled()) return;
  await serialized(async () => {
    const pushed = await pushWithRetry('lab_ninja');
    if (pushed === 'conflict') await pullIfStale('lab_ninja');
  });
}

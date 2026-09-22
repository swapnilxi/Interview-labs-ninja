import path from 'path';
import fs from 'fs';

export interface SqliteDbResult {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any;
  filePath: string;
}

/**
 * Bundled (read-only) source paths — used as the seed on cold start.
 * Vercel mounts the git-tracked files here but the directory is immutable.
 */
function getBundledPath(dbName: string): string | null {
  const cwd = process.cwd();
  const sources = [
    path.join(cwd, 'backend', 'data', `${dbName}.sqlite3`),
    path.join(cwd, '..', 'backend', 'data', `${dbName}.sqlite3`),
    path.join(cwd, 'data', `${dbName}.sqlite3`),
    path.join(cwd, `${dbName}.sqlite3`),
  ];
  return sources.find((p) => fs.existsSync(p)) ?? null;
}

/**
 * Returns a writable path in /tmp, seeding it from the bundled DB on cold start.
 * /tmp is per-Lambda-invocation on Vercel but survives within the same warm instance,
 * so consecutive requests in the same instance share the same writable copy.
 */
function getWritablePath(dbName: string): string {
  const tmpPath = `/tmp/${dbName}.sqlite3`;
  if (!fs.existsSync(tmpPath)) {
    const src = getBundledPath(dbName);
    if (src) {
      fs.copyFileSync(src, tmpPath);
    }
    // If no bundled file exists, DatabaseSync will create a blank DB at tmpPath.
  }
  return tmpPath;
}

/**
 * Open lab_ninja.sqlite3 or career_studio.sqlite3 for reading AND writing.
 *
 * Strategy (both local and Vercel):
 *   1. Try to open the DB from /tmp (writable — seeded from the bundled file on
 *      cold start, or created fresh if none found).
 *   2. Falls back to the bundled read-only path only if /tmp is unavailable.
 */
export function getSQLiteDatabase(dbName: 'lab_ninja' | 'career_studio' = 'lab_ninja'): SqliteDbResult | null {
  // Prefer the writable /tmp copy; fall back to the bundled read-only path.
  const candidates = [
    getWritablePath(dbName),        // /tmp/<dbName>.sqlite3  — writable
    getBundledPath(dbName) ?? '',   // bundled fallback       — read-only
  ].filter(Boolean);

  for (const dbPath of candidates) {
    try {
      // Safe dynamic require for node:sqlite (avoids Webpack bundling the module)
      // eslint-disable-next-line @typescript-eslint/no-require-imports, no-eval
      const sqliteModule = eval('require')('node:sqlite');
      const DatabaseSync = sqliteModule.DatabaseSync;
      if (DatabaseSync) {
        const db = new DatabaseSync(dbPath, { open: true });
        return { db, filePath: dbPath };
      }
    } catch (err) {
      console.warn(`[sqliteReader] Error opening ${dbPath}:`, err);
    }
  }

  return null;
}


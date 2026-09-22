import path from 'path';
import fs from 'fs';

export interface SqliteDbResult {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any;
  filePath: string;
}

/**
 * Server-side helper to open lab_ninja.sqlite3 or career_studio.sqlite3
 * from backend/data/ when available on Vercel or local Next.js runtime.
 */
export function getSQLiteDatabase(dbName: 'lab_ninja' | 'career_studio' = 'lab_ninja'): SqliteDbResult | null {
  const cwd = process.cwd();
  const candidates = [
    path.join(cwd, 'backend', 'data', `${dbName}.sqlite3`),
    path.join(cwd, '..', 'backend', 'data', `${dbName}.sqlite3`),
    path.join(cwd, 'data', `${dbName}.sqlite3`),
    path.join(cwd, `${dbName}.sqlite3`),
  ];

  for (const dbPath of candidates) {
    if (fs.existsSync(dbPath)) {
      try {
        // Safe dynamic require for node:sqlite
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const sqliteModule = require('node:sqlite');
        const DatabaseSync = sqliteModule.DatabaseSync;
        if (DatabaseSync) {
          const db = new DatabaseSync(dbPath, { open: true });
          return { db, filePath: dbPath };
        }
      } catch (err) {
        console.warn(`[sqliteReader] Error opening ${dbPath}:`, err);
      }
    }
  }

  return null;
}

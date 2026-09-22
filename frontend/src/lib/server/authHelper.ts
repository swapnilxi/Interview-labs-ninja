import fs from 'fs';
import path from 'path';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.LABNINJA_JWT_SECRET || 'dev-secret-interview-labs-ninja-key';

export interface UserRecord {
  id: number;
  email: string;
  password_hash: string;
  display_name: string | null;
  role: 'user' | 'admin';
  created_at: string;
  updated_at: string;
}

const TMP_DB = '/tmp/lab_ninja.sqlite3';

/**
 * On cold start, copy the bundled (read-only) DB to /tmp so writes succeed.
 * Vercel mounts git-tracked files as immutable; /tmp is writable per Lambda instance.
 */
function ensureWritableDb(): void {
  if (fs.existsSync(TMP_DB)) return;   // already seeded this warm instance
  const sources = [
    path.join(process.cwd(), 'backend', 'data', 'lab_ninja.sqlite3'),
    path.join(process.cwd(), '..', 'backend', 'data', 'lab_ninja.sqlite3'),
    path.join(process.cwd(), 'data', 'lab_ninja.sqlite3'),
  ];
  const src = sources.find(fs.existsSync);
  if (src) fs.copyFileSync(src, TMP_DB);
  // If no seed exists, DatabaseSync creates a blank DB at TMP_DB automatically.
}

export function getDbPath(): string {
  ensureWritableDb();
  return TMP_DB;
}

function getSqliteConn() {
  const dbPath = getDbPath();
  if (!dbPath) return null;

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports, no-eval
    const { DatabaseSync } = eval('require')('node:sqlite');
    return new DatabaseSync(dbPath);
  } catch (err) {
    console.error('Failed to initialize node:sqlite DatabaseSync:', err);
    return null;
  }
}

export function findUserByEmail(email: string): UserRecord | null {
  const db = getSqliteConn();
  if (!db) return null;
  try {
    const stmt = db.prepare('SELECT id, email, password_hash, display_name, role, created_at, updated_at FROM users WHERE email = ?');
    const row = stmt.get(email.toLowerCase().trim()) as UserRecord | undefined;
    return row || null;
  } catch (err) {
    console.error('Error finding user by email:', err);
    return null;
  } finally {
    try { db.close(); } catch {}
  }
}

export function findUserById(id: number): UserRecord | null {
  const db = getSqliteConn();
  if (!db) return null;
  try {
    const stmt = db.prepare('SELECT id, email, password_hash, display_name, role, created_at, updated_at FROM users WHERE id = ?');
    const row = stmt.get(id) as UserRecord | undefined;
    return row || null;
  } catch (err) {
    console.error('Error finding user by id:', err);
    return null;
  } finally {
    try { db.close(); } catch {}
  }
}

export function createUser(email: string, passwordHash: string, displayName?: string | null): UserRecord | null {
  const db = getSqliteConn();
  if (!db) return null;
  try {
    const insertStmt = db.prepare('INSERT INTO users (email, password_hash, display_name, role) VALUES (?, ?, ?, ?)');
    const res = insertStmt.run(email.toLowerCase().trim(), passwordHash, displayName || null, 'user');
    const userId = Number(res.lastInsertRowid);
    
    try {
      const profileStmt = db.prepare('INSERT OR IGNORE INTO user_profile (user_id) VALUES (?)');
      profileStmt.run(userId);
    } catch {}

    return findUserById(userId);
  } catch (err) {
    console.error('Error creating user:', err);
    return null;
  } finally {
    try { db.close(); } catch {}
  }
}

export function hashPassword(password: string): string {
  return bcrypt.hashSync(password, 10);
}

export function verifyPassword(password: string, hash: string): boolean {
  return bcrypt.compareSync(password, hash);
}

export function createAccessToken(userId: number, email: string): string {
  return jwt.sign({ sub: String(userId), email }, JWT_SECRET, { expiresIn: '30d' });
}

export function verifyAccessToken(token: string): { sub: string; email: string } | null {
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { sub: string; email: string };
    return decoded;
  } catch {
    return null;
  }
}

export function getUserFromAuthHeader(authHeader: string | null): UserRecord | null {
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
  const token = authHeader.substring(7).trim();
  const claims = verifyAccessToken(token);
  if (!claims || !claims.sub) return null;
  const userId = parseInt(claims.sub, 10);
  if (isNaN(userId)) return null;
  return findUserById(userId);
}

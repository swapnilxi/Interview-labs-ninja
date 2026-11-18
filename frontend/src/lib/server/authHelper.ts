import { getWritablePath } from './sqliteReader';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.LABNINJA_JWT_SECRET || 'dev-secret-lab-ninja-key';

export interface UserRecord {
  id: number;
  email: string;
  password_hash: string;
  display_name: string | null;
  role: 'user' | 'editor' | 'admin' | 'superadmin';
  created_at: string;
  updated_at: string;
}

/**
 * Locally this is backend/data/lab_ninja.sqlite3 itself (shared with FastAPI). On Vercel, where the
 * repo is read-only, it is the writable /tmp copy seeded from that file. See getWritablePath.
 */
export function getDbPath(): string {
  return getWritablePath('lab_ninja');
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

// ── Permissions: twin of backend/modules/auth/dependencies.py (DEFAULT_PERMISSIONS, has_permission,
// effective_permissions). Keep the keys and role defaults in step with the Python ones.
const ADMIN_EQUIVALENT_PERMISSIONS = ['users:manage', 'users:delete'];
const KNOWN_PERMISSIONS = ['ai_lms:edit', ...ADMIN_EQUIVALENT_PERMISSIONS];
const DEFAULT_PERMISSIONS: Record<string, string[]> = {
  editor: ['ai_lms:edit'],
  admin: ['ai_lms:edit', ...ADMIN_EQUIVALENT_PERMISSIONS],
  superadmin: ['ai_lms:edit', ...ADMIN_EQUIVALENT_PERMISSIONS],
};

export type AccountStatus = 'pending' | 'approved' | 'rejected';

export interface PublicUser {
  id: number;
  email: string;
  display_name: string | null;
  role: UserRecord['role'];
  status: AccountStatus;
  created_at: string;
  permissions: string[];
}

/**
 * Twin of `_public_user` in backend/modules/auth/router.py: the user object /auth/me, login and signup return.
 * The client gates the admin portal on `permissions` ('users:manage') and shows the pending banner from `status`,
 * so leaving either out made a superadmin look like a plain user in nextjs-api mode.
 */
export function publicUser(user: UserRecord): PublicUser {
  let status: AccountStatus = 'approved';
  const overrides: Record<string, boolean> = {};
  const db = getSqliteConn();
  if (db) {
    try {
      const row = db.prepare('SELECT status FROM users WHERE id = ?').get(user.id) as { status?: string } | undefined;
      if (row?.status === 'pending' || row?.status === 'rejected' || row?.status === 'approved') status = row.status;
    } catch {
      /* an older database without the status column: every account counts as approved, like Python's default */
    }
    try {
      const rows = db.prepare('SELECT permission, allowed FROM user_permissions WHERE user_id = ?').all(user.id) as Array<{
        permission: string;
        allowed: number;
      }>;
      for (const r of rows) overrides[r.permission] = !!r.allowed;
    } catch {
      /* no user_permissions table yet: role defaults only */
    } finally {
      try { db.close(); } catch {}
    }
  }
  const role = user.role || 'user';
  const defaults = DEFAULT_PERMISSIONS[role] ?? [];
  const permissions = KNOWN_PERMISSIONS.filter((p) => (p in overrides ? overrides[p] : defaults.includes(p))).sort();
  return {
    id: user.id,
    email: user.email,
    display_name: user.display_name,
    role,
    status,
    created_at: user.created_at,
    permissions,
  };
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

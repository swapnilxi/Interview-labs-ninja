/**
 * fe-apis/admin/index.ts
 *
 * Next.js-API twin of backend/modules/auth/admin_router.py —
 * stats, user listing, role changes, password resets, approve/reject,
 * per-user permission overrides, and access-request review.
 *
 * The two DB-sync routes (POST /api/admin/db/push and /pull) live separately in
 * fe-apis/admin/db.ts and are served by their own dedicated route files, which take
 * priority over the [...path] catch-all in Next.js App Router.
 *
 * Keep in sync with the Python admin_router.py and auth/db.py whenever either changes
 * (CLAUDE.md, "Dual deployment modes").
 */

import bcryptjs from 'bcryptjs';
import { withTodoDb, HttpError, type TodoDb, type Row } from '../todo/_shared';
import { getUserFromAuthHeader, type UserRecord } from '../_shared/db';

// ── Permission constants (twin of backend/modules/auth/dependencies.py) ──────

const ADMIN_EQUIVALENT_PERMISSIONS = new Set(['users:manage', 'users:delete']);
const KNOWN_PERMISSIONS = ['ai_lms:edit', 'users:manage', 'users:delete'];
const DEFAULT_PERMISSIONS: Record<string, string[]> = {
  editor: ['ai_lms:edit'],
  admin: ['ai_lms:edit', 'users:manage', 'users:delete'],
  superadmin: ['ai_lms:edit', 'users:manage', 'users:delete'],
};

type AdminUser = UserRecord & { status: string };

// ── Schema bootstrap ──────────────────────────────────────────────────────────

let schemaReady = false;

function ensureAdminSchema(db: TodoDb) {
  if (schemaReady) return;
  // user_permissions may not exist on older DBs
  db.exec(`
    CREATE TABLE IF NOT EXISTS user_permissions (
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      permission TEXT NOT NULL,
      allowed INTEGER NOT NULL DEFAULT 1,
      granted_by INTEGER,
      PRIMARY KEY (user_id, permission)
    )
  `);
  // access_requests may not exist either
  db.exec(`
    CREATE TABLE IF NOT EXISTS access_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      requested_role TEXT,
      permission TEXT,
      message TEXT DEFAULT '',
      status TEXT NOT NULL DEFAULT 'pending',
      reviewed_by INTEGER,
      review_note TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      decided_at TEXT,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);
  // users.status column (may be missing on older DBs)
  try {
    const cols = db.all<{ name: string }>('PRAGMA table_info(users)').map((c) => c.name);
    if (!cols.includes('status')) {
      db.exec("ALTER TABLE users ADD COLUMN status TEXT NOT NULL DEFAULT 'approved'");
    }
  } catch {}
  schemaReady = true;
}

function withAdminDb<T>(fn: (db: TodoDb) => T): T {
  return withTodoDb((db) => {
    ensureAdminSchema(db);
    return fn(db);
  });
}

// ── Permission helpers (twin of auth/dependencies.py) ─────────────────────────

function getPermissionOverrides(db: TodoDb, userId: number): Record<string, boolean> {
  try {
    const rows = db.all<{ permission: string; allowed: number }>(
      'SELECT permission, allowed FROM user_permissions WHERE user_id = ?',
      userId
    );
    return Object.fromEntries(rows.map((r) => [r.permission, r.allowed !== 0]));
  } catch {
    return {};
  }
}

function hasPermission(user: AdminUser, overrides: Record<string, boolean>, permission: string): boolean {
  if (permission in overrides) return overrides[permission];
  return (DEFAULT_PERMISSIONS[user.role] ?? []).includes(permission);
}

function effectivePermissions(user: AdminUser, overrides: Record<string, boolean>): string[] {
  return KNOWN_PERMISSIONS.filter((p) => hasPermission(user, overrides, p)).sort();
}

// ── DB helpers ────────────────────────────────────────────────────────────────

function getUserById(db: TodoDb, userId: number): AdminUser | null {
  return (
    db.get<AdminUser>(
      'SELECT id, email, password_hash, display_name, role, created_at, updated_at, IFNULL(status, \'approved\') as status FROM users WHERE id = ?',
      userId
    ) ?? null
  );
}

function countAdmins(db: TodoDb): number {
  return db.get<{ c: number }>("SELECT COUNT(*) as c FROM users WHERE role IN ('admin', 'superadmin')")?.c ?? 0;
}

const NON_DATA_USER_TABLES = new Set(['users', 'user_profile']);

function getUserScopedTables(db: TodoDb): string[] {
  const tables = db
    .all<{ name: string }>("SELECT name FROM sqlite_master WHERE type = 'table'")
    .map((r) => r.name);
  const scoped: string[] = [];
  for (const name of tables) {
    if (NON_DATA_USER_TABLES.has(name) || name.startsWith('sqlite_')) continue;
    try {
      const cols = db.all<{ name: string }>(`PRAGMA table_info(${name})`).map((c) => c.name);
      if (cols.includes('user_id')) scoped.push(name);
    } catch {}
  }
  return scoped;
}

// ── Auth guard ────────────────────────────────────────────────────────────────

function requirePermission(
  req: Request,
  permission: string
): { admin: AdminUser; overrides: Record<string, boolean> } {
  const baseUser = getUserFromAuthHeader(req.headers.get('authorization'));
  if (!baseUser) throw new HttpError(401, 'Log in to use this feature.');
  return withAdminDb((db) => {
    const admin = getUserById(db, baseUser.id);
    if (!admin) throw new HttpError(401, 'Log in to use this feature.');
    if (admin.status === 'pending') throw new HttpError(403, 'Your account is pending admin approval.');
    if (admin.status !== 'approved') throw new HttpError(403, 'Your account was not approved.');
    const overrides = getPermissionOverrides(db, admin.id);
    if (!hasPermission(admin, overrides, permission)) {
      throw new HttpError(403, `'${permission}' permission required`);
    }
    return { admin, overrides };
  });
}

function requireSuperadminForAdminEquivalent(admin: AdminUser, permission: string) {
  if (ADMIN_EQUIVALENT_PERMISSIONS.has(permission) && admin.role !== 'superadmin') {
    throw new HttpError(403, 'Only a superadmin can grant or revoke that permission');
  }
}

// ── Response helpers ──────────────────────────────────────────────────────────

function ok(body: unknown, status = 200): Response {
  return Response.json(body, { status });
}

function wrap(fn: () => unknown): Response {
  try {
    return ok(fn());
  } catch (err) {
    if (err instanceof HttpError) return Response.json({ detail: err.detail }, { status: err.status });
    console.error('[admin fe-api]', err);
    return Response.json({ detail: 'Internal Server Error' }, { status: 500 });
  }
}

async function wrapAsync(fn: () => Promise<unknown>): Promise<Response> {
  try {
    return ok(await fn());
  } catch (err) {
    if (err instanceof HttpError) return Response.json({ detail: err.detail }, { status: err.status });
    console.error('[admin fe-api]', err);
    return Response.json({ detail: 'Internal Server Error' }, { status: 500 });
  }
}

// ── Handlers ──────────────────────────────────────────────────────────────────

// GET /admin/stats
function handleStats(req: Request): Response {
  return wrap(() => {
    requirePermission(req, 'users:manage');
    return withAdminDb((db) => {
      const row = db.get<{ total: number; admins: number; pending: number }>(
        "SELECT COUNT(*) as total, " +
          "SUM(CASE WHEN role IN ('admin','superadmin') THEN 1 ELSE 0 END) as admins, " +
          "SUM(CASE WHEN IFNULL(status,'approved') = 'pending' THEN 1 ELSE 0 END) as pending " +
          "FROM users"
      );
      const new7d =
        db.get<{ c: number }>(
          "SELECT COUNT(*) as c FROM users WHERE created_at >= datetime('now', '-7 days')"
        )?.c ?? 0;

      const resources: Record<string, number> = {};
      let totalResources = 0;
      for (const table of getUserScopedTables(db)) {
        try {
          const n =
            db.get<{ c: number }>(`SELECT COUNT(*) as c FROM ${table} WHERE user_id IS NOT NULL`)?.c ?? 0;
          resources[table] = n;
          totalResources += n;
        } catch {}
      }

      return {
        total_users: row?.total ?? 0,
        admin_users: row?.admins ?? 0,
        pending_users: row?.pending ?? 0,
        new_users_7d: new7d,
        total_resources: totalResources,
        resources_by_table: Object.fromEntries(
          Object.entries(resources).sort(([, a], [, b]) => b - a)
        ),
      };
    });
  });
}

// GET /admin/users[?search=...]
function handleListUsers(req: Request): Response {
  return wrap(() => {
    requirePermission(req, 'users:manage');
    const search = new URL(req.url).searchParams.get('search');
    return withAdminDb((db) => {
      let sql =
        "SELECT id, email, display_name, role, created_at, updated_at, IFNULL(status,'approved') as status FROM users ";
      const params: unknown[] = [];
      if (search?.trim()) {
        sql += "WHERE email LIKE ? OR IFNULL(display_name, '') LIKE ? ";
        const like = `%${search.trim()}%`;
        params.push(like, like);
      }
      sql += 'ORDER BY created_at DESC, id DESC';
      const rows = db.all<AdminUser>(sql, ...params);

      // Per-user resource totals (one scan per table)
      const totals: Record<number, number> = {};
      for (const table of getUserScopedTables(db)) {
        try {
          for (const { user_id, c } of db.all<{ user_id: number; c: number }>(
            `SELECT user_id, COUNT(*) as c FROM ${table} WHERE user_id IS NOT NULL GROUP BY user_id`
          )) {
            totals[user_id] = (totals[user_id] ?? 0) + c;
          }
        } catch {}
      }

      // All permission overrides in one query
      const allOverrides: Record<number, Record<string, boolean>> = {};
      try {
        for (const { user_id, permission, allowed } of db.all<{
          user_id: number;
          permission: string;
          allowed: number;
        }>('SELECT user_id, permission, allowed FROM user_permissions')) {
          allOverrides[user_id] ??= {};
          allOverrides[user_id][permission] = allowed !== 0;
        }
      } catch {}

      return rows.map((u) => {
        const ov = allOverrides[u.id] ?? {};
        return {
          id: u.id,
          email: u.email,
          display_name: u.display_name,
          role: u.role,
          status: u.status,
          created_at: u.created_at,
          updated_at: u.updated_at,
          resource_count: totals[u.id] ?? 0,
          permission_overrides: ov,
          permissions: effectivePermissions(u, ov),
        };
      });
    });
  });
}

// PATCH /admin/users/:user_id/role
async function handleSetRole(req: Request, userId: number): Promise<Response> {
  return wrapAsync(async () => {
    const { admin } = requirePermission(req, 'users:manage');
    const body = (await req.json()) as { role?: string };
    const role = body.role;
    if (!role || !['user', 'editor', 'instructor', 'admin', 'superadmin'].includes(role)) {
      throw new HttpError(422, 'Invalid role');
    }
    return withAdminDb((db) => {
      const target = getUserById(db, userId);
      if (!target) throw new HttpError(404, 'User not found');
      if (
        admin.role !== 'superadmin' &&
        (['admin', 'superadmin'].includes(role) || ['admin', 'superadmin'].includes(target.role))
      ) {
        throw new HttpError(403, 'Only a superadmin can change admin-level roles');
      }
      if (
        !['admin', 'superadmin'].includes(role) &&
        ['admin', 'superadmin'].includes(target.role) &&
        countAdmins(db) <= 1
      ) {
        throw new HttpError(400, 'Cannot demote the last remaining admin');
      }
      // Promoting to any non-user role also approves the account (matches Python set_user_role).
      if (role !== 'user') {
        db.run(
          "UPDATE users SET role = ?, status = 'approved', updated_at = datetime('now') WHERE id = ?",
          role,
          userId
        );
      } else {
        db.run(
          "UPDATE users SET role = ?, updated_at = datetime('now') WHERE id = ?",
          role,
          userId
        );
      }
      const updated = getUserById(db, userId)!;
      return { id: updated.id, email: updated.email, display_name: updated.display_name, role: updated.role };
    });
  });
}

// POST /admin/users/:user_id/reset-password
async function handleResetPassword(req: Request, userId: number): Promise<Response> {
  return wrapAsync(async () => {
    const { admin } = requirePermission(req, 'users:manage');
    const body = (await req.json()) as { password?: string };
    if (!body.password || body.password.length < 8) {
      throw new HttpError(422, 'Password must be at least 8 characters');
    }
    return withAdminDb((db) => {
      const target = getUserById(db, userId);
      if (!target) throw new HttpError(404, 'User not found');
      if (
        ['admin', 'superadmin'].includes(target.role) &&
        admin.role !== 'superadmin' &&
        target.id !== admin.id
      ) {
        throw new HttpError(403, 'Only a superadmin can reset an admin-level password');
      }
      const hash = bcryptjs.hashSync(body.password!, 10);
      db.run(
        "UPDATE users SET password_hash = ?, updated_at = datetime('now') WHERE id = ?",
        hash,
        userId
      );
      return { ok: true };
    });
  });
}

// DELETE /admin/users/:user_id
function handleDeleteUser(req: Request, userId: number): Response {
  return wrap(() => {
    const { admin } = requirePermission(req, 'users:delete');
    if (userId === admin.id) throw new HttpError(400, 'You cannot delete your own account here');
    return withAdminDb((db) => {
      const target = getUserById(db, userId);
      if (!target) throw new HttpError(404, 'User not found');
      if (['admin', 'superadmin'].includes(target.role) && admin.role !== 'superadmin') {
        throw new HttpError(403, 'Only a superadmin can delete an admin-level account');
      }
      if (['admin', 'superadmin'].includes(target.role) && countAdmins(db) <= 1) {
        throw new HttpError(400, 'Cannot delete the last remaining admin');
      }
      // Manual cascade across every user-scoped table (no FK ON DELETE CASCADE there)
      for (const table of getUserScopedTables(db)) {
        try {
          db.run(`DELETE FROM ${table} WHERE user_id = ?`, userId);
        } catch {}
      }
      db.run('DELETE FROM user_profile WHERE user_id = ?', userId);
      db.run('DELETE FROM users WHERE id = ?', userId);
      return { ok: true };
    });
  });
}

// POST /admin/users/:user_id/approve
function handleApproveAccount(req: Request, userId: number): Response {
  return wrap(() => {
    const { admin } = requirePermission(req, 'users:manage');
    return withAdminDb((db) => {
      const target = getUserById(db, userId);
      if (!target) throw new HttpError(404, 'User not found');
      if (['admin', 'superadmin'].includes(target.role) && admin.role !== 'superadmin') {
        throw new HttpError(403, 'Only a superadmin can approve an admin-level account');
      }
      db.run(
        "UPDATE users SET status = 'approved', updated_at = datetime('now') WHERE id = ?",
        userId
      );
      const updated = getUserById(db, userId)!;
      return { id: updated.id, email: updated.email, status: updated.status };
    });
  });
}

// POST /admin/users/:user_id/reject
function handleRejectAccount(req: Request, userId: number): Response {
  return wrap(() => {
    const { admin } = requirePermission(req, 'users:manage');
    if (userId === admin.id) throw new HttpError(400, 'You cannot reject your own account here');
    return withAdminDb((db) => {
      const target = getUserById(db, userId);
      if (!target) throw new HttpError(404, 'User not found');
      if (['admin', 'superadmin'].includes(target.role) && admin.role !== 'superadmin') {
        throw new HttpError(403, 'Only a superadmin can reject an admin-level account');
      }
      if (['admin', 'superadmin'].includes(target.role) && countAdmins(db) <= 1) {
        throw new HttpError(400, 'Cannot reject the last remaining admin');
      }
      db.run(
        "UPDATE users SET status = 'rejected', updated_at = datetime('now') WHERE id = ?",
        userId
      );
      const updated = getUserById(db, userId)!;
      return { id: updated.id, email: updated.email, status: updated.status };
    });
  });
}

// POST /admin/users/:user_id/permissions
async function handleSetPermission(req: Request, userId: number): Promise<Response> {
  return wrapAsync(async () => {
    const { admin } = requirePermission(req, 'users:manage');
    const body = (await req.json()) as { permission?: string; allowed?: boolean };
    const { permission, allowed } = body;
    if (!permission || !KNOWN_PERMISSIONS.includes(permission)) {
      throw new HttpError(422, `Unknown permission '${permission}'`);
    }
    requireSuperadminForAdminEquivalent(admin, permission);
    return withAdminDb((db) => {
      const target = getUserById(db, userId);
      if (!target) throw new HttpError(404, 'User not found');
      // UPSERT — works in SQLite 3.24+ (shipped with Node 22 / Vercel)
      db.run(
        'INSERT INTO user_permissions (user_id, permission, allowed, granted_by) VALUES (?, ?, ?, ?) ' +
          'ON CONFLICT(user_id, permission) DO UPDATE SET allowed = excluded.allowed, granted_by = excluded.granted_by',
        userId,
        permission,
        allowed ? 1 : 0,
        admin.id
      );
      return { ok: true, permission_overrides: getPermissionOverrides(db, userId) };
    });
  });
}

// DELETE /admin/users/:user_id/permissions/:permission
function handleClearPermission(req: Request, userId: number, permission: string): Response {
  return wrap(() => {
    const { admin } = requirePermission(req, 'users:manage');
    requireSuperadminForAdminEquivalent(admin, permission);
    return withAdminDb((db) => {
      db.run('DELETE FROM user_permissions WHERE user_id = ? AND permission = ?', userId, permission);
      return { ok: true, permission_overrides: getPermissionOverrides(db, userId) };
    });
  });
}

// GET /admin/access-requests[?status=...]
function handleListAccessRequests(req: Request): Response {
  return wrap(() => {
    requirePermission(req, 'users:manage');
    const statusFilter = new URL(req.url).searchParams.get('status');
    return withAdminDb((db) => {
      let sql =
        'SELECT id, user_id, requested_role, permission, message, status, reviewed_by, review_note, created_at, decided_at ' +
        'FROM access_requests';
      const params: unknown[] = [];
      if (statusFilter) {
        sql += ' WHERE status = ?';
        params.push(statusFilter);
      }
      sql += ' ORDER BY created_at DESC, id DESC';
      const requests = db.all<Row>(sql, ...params);

      const users: Record<number, AdminUser> = {};
      for (const u of db.all<AdminUser>(
        "SELECT id, email, display_name, role, IFNULL(status,'approved') as status FROM users"
      )) {
        users[u.id] = u;
      }

      return requests.map((r) => {
        const requester = users[r.user_id as number];
        return {
          ...r,
          user_email: requester?.email ?? null,
          user_display_name: requester?.display_name ?? null,
          user_status: requester?.status ?? null,
        };
      });
    });
  });
}

// POST /admin/access-requests/:id/approve
async function handleApproveRequest(req: Request, requestId: number): Promise<Response> {
  return wrapAsync(async () => {
    const { admin } = requirePermission(req, 'users:manage');
    const body = await req.json().catch(() => ({})) as { review_note?: string };
    const reviewNote = body.review_note ?? '';
    return withAdminDb((db) => {
      const ar = db.get<Row>(
        'SELECT id, user_id, requested_role, permission, status FROM access_requests WHERE id = ?',
        requestId
      );
      if (!ar) throw new HttpError(404, 'Request not found');
      if (ar.status !== 'pending') throw new HttpError(400, `Request was already ${ar.status}`);

      const uid = ar.user_id as number;
      if (ar.requested_role) {
        const role = ar.requested_role as string;
        const target = getUserById(db, uid);
        if (!target) throw new HttpError(404, 'User not found');
        if (
          admin.role !== 'superadmin' &&
          (['admin', 'superadmin'].includes(role) || ['admin', 'superadmin'].includes(target.role))
        ) {
          throw new HttpError(403, 'Only a superadmin can change admin-level roles');
        }
        if (role !== 'user') {
          db.run(
            "UPDATE users SET role = ?, status = 'approved', updated_at = datetime('now') WHERE id = ?",
            role,
            uid
          );
        } else {
          db.run(
            "UPDATE users SET role = ?, updated_at = datetime('now') WHERE id = ?",
            role,
            uid
          );
        }
      } else if (ar.permission) {
        requireSuperadminForAdminEquivalent(admin, ar.permission as string);
        db.run(
          'INSERT OR REPLACE INTO user_permissions (user_id, permission, allowed, granted_by) VALUES (?, ?, 1, ?)',
          uid,
          ar.permission,
          admin.id
        );
      }

      const result = db.run(
        "UPDATE access_requests SET status = 'approved', reviewed_by = ?, review_note = ?, decided_at = datetime('now') WHERE id = ? AND status = 'pending'",
        admin.id,
        reviewNote,
        requestId
      );
      if (result.changes === 0) throw new HttpError(409, 'Request was already decided');
      return db.get('SELECT * FROM access_requests WHERE id = ?', requestId);
    });
  });
}

// POST /admin/access-requests/:id/deny
async function handleDenyRequest(req: Request, requestId: number): Promise<Response> {
  return wrapAsync(async () => {
    const { admin } = requirePermission(req, 'users:manage');
    const body = await req.json().catch(() => ({})) as { review_note?: string };
    const reviewNote = body.review_note ?? '';
    return withAdminDb((db) => {
      const ar = db.get<Row>('SELECT id, status FROM access_requests WHERE id = ?', requestId);
      if (!ar) throw new HttpError(404, 'Request not found');
      if (ar.status !== 'pending') throw new HttpError(400, `Request was already ${ar.status}`);
      const result = db.run(
        "UPDATE access_requests SET status = 'rejected', reviewed_by = ?, review_note = ?, decided_at = datetime('now') WHERE id = ? AND status = 'pending'",
        admin.id,
        reviewNote,
        requestId
      );
      if (result.changes === 0) throw new HttpError(409, 'Request was already decided');
      return db.get('SELECT * FROM access_requests WHERE id = ?', requestId);
    });
  });
}

// ── Main dispatcher ───────────────────────────────────────────────────────────

export async function handleAdmin(req: Request, segments: string[]): Promise<Response> {
  const method = req.method.toUpperCase();
  const [seg0, seg1, seg2, seg3] = segments;

  // GET /admin/stats
  if (method === 'GET' && seg0 === 'stats' && !seg1) return handleStats(req);

  // GET /admin/users[?search=...]
  if (method === 'GET' && seg0 === 'users' && !seg1) return handleListUsers(req);

  // /admin/users/:user_id/...
  if (seg0 === 'users' && seg1) {
    const userId = parseInt(seg1, 10);
    if (isNaN(userId)) return Response.json({ detail: "Invalid integer for 'user_id'" }, { status: 422 });

    if (method === 'PATCH' && seg2 === 'role' && !seg3) return handleSetRole(req, userId);
    if (method === 'POST' && seg2 === 'reset-password' && !seg3) return handleResetPassword(req, userId);
    if (method === 'DELETE' && !seg2) return handleDeleteUser(req, userId);
    if (method === 'POST' && seg2 === 'approve' && !seg3) return handleApproveAccount(req, userId);
    if (method === 'POST' && seg2 === 'reject' && !seg3) return handleRejectAccount(req, userId);
    if (method === 'POST' && seg2 === 'permissions' && !seg3) return handleSetPermission(req, userId);
    if (method === 'DELETE' && seg2 === 'permissions' && seg3) {
      return handleClearPermission(req, userId, decodeURIComponent(seg3));
    }
  }

  // GET /admin/access-requests[?status=...]
  if (method === 'GET' && seg0 === 'access-requests' && !seg1) return handleListAccessRequests(req);

  // /admin/access-requests/:id/...
  if (seg0 === 'access-requests' && seg1) {
    const requestId = parseInt(seg1, 10);
    if (isNaN(requestId))
      return Response.json({ detail: "Invalid integer for 'request_id'" }, { status: 422 });
    if (method === 'POST' && seg2 === 'approve' && !seg3) return handleApproveRequest(req, requestId);
    if (method === 'POST' && seg2 === 'deny' && !seg3) return handleDenyRequest(req, requestId);
  }

  return Response.json({ detail: 'Not Found' }, { status: 404 });
}

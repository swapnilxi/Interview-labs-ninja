/**
 * fe-apis/_shared/db.ts
 *
 * Re-exports shared server-side DB helpers so every fe-api module can import
 * from a single, predictable location instead of reaching into lib/server directly.
 */

export {
  getSQLiteDatabase,
  type SqliteDbResult,
} from '@/lib/server/sqliteReader';

export {
  getDbPath,
  findUserByEmail,
  findUserById,
  createUser,
  hashPassword,
  verifyPassword,
  createAccessToken,
  verifyAccessToken,
  getUserFromAuthHeader,
  type UserRecord,
} from '@/lib/server/authHelper';

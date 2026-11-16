/**
 * Tables of class membership and class updates, and what deleting a class removes.
 *
 * Kept in a file of its own so both db.ts (table creation, deleteClass) and updates.ts (the logic) can import it
 * without importing each other. Twin of `ensure_tables` / `purge_class` in backend/modules/ai_lms/updates.py:
 * the same statements, so both backends build the same schema. Change both.
 */

export const UPDATES_DDL = `
  CREATE TABLE IF NOT EXISTS lms_class_members (
      class_id TEXT NOT NULL,
      user_id INTEGER NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('enrolled', 'interested')),
      joined_at TEXT NOT NULL,
      PRIMARY KEY (class_id, user_id)
  );
  CREATE INDEX IF NOT EXISTS idx_lms_class_members_user ON lms_class_members(user_id);
  CREATE TABLE IF NOT EXISTS lms_notifications (
      id TEXT PRIMARY KEY,
      scope TEXT NOT NULL CHECK (scope IN ('class', 'ai-lms')),
      class_id TEXT,
      title TEXT NOT NULL,
      body TEXT NOT NULL DEFAULT '',
      link TEXT NOT NULL DEFAULT '',
      sender_id INTEGER NOT NULL,
      created_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_lms_notifications_class ON lms_notifications(class_id, created_at);
  CREATE INDEX IF NOT EXISTS idx_lms_notifications_sender ON lms_notifications(sender_id, created_at);
  CREATE TABLE IF NOT EXISTS lms_notification_recipients (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      notification_id TEXT NOT NULL,
      user_id INTEGER NOT NULL,
      UNIQUE (notification_id, user_id)
  );
  CREATE INDEX IF NOT EXISTS idx_lms_notif_recipients_user ON lms_notification_recipients(user_id, id);
`;

/** The slice of a node:sqlite connection the purge needs. */
interface RawDb {
  prepare(sql: string): { run(...params: unknown[]): unknown };
}

/**
 * Remove what a deleted class leaves behind. Its own updates go with it; a module-wide update that was merely
 * sent from this class stays (and loses the class). Call it where the class row is deleted, tables already created.
 */
export function purgeClassUpdates(db: RawDb, classId: string): void {
  db.prepare(
    "DELETE FROM lms_notification_recipients WHERE notification_id IN " +
      "(SELECT id FROM lms_notifications WHERE scope = 'class' AND class_id = ?)"
  ).run(classId);
  db.prepare("DELETE FROM lms_notifications WHERE scope = 'class' AND class_id = ?").run(classId);
  db.prepare('UPDATE lms_notifications SET class_id = NULL WHERE class_id = ?').run(classId);
  db.prepare('DELETE FROM lms_class_members WHERE class_id = ?').run(classId);
}

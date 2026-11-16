/**
 * The table of personal video links on lab pages.
 *
 * Kept in a file of its own so schema.ts (table creation) and videos.ts (the logic) can import it without importing
 * each other. Twin of `ensure_table` in backend/modules/lab_sections/videos.py: the same statements, so both backends
 * build the same schema. Change both.
 */

export const LAB_VIDEOS_DDL = `
  CREATE TABLE IF NOT EXISTS lab_page_videos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      lab_name TEXT NOT NULL,
      topic_id TEXT NOT NULL,
      subtopic_id TEXT NOT NULL DEFAULT '',
      url TEXT NOT NULL,
      title TEXT NOT NULL DEFAULT '',
      order_index INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_lab_page_videos_page ON lab_page_videos(user_id, lab_name, topic_id, subtopic_id, order_index);
`;

/**
 * The tables of link and video items on lab pages: the links (with an admin's preview image and card shape) and the
 * AI-written video script of a page.
 *
 * Kept in a file of its own so schema.ts (table creation) and videos.ts / videoScript.ts (the logic) can import it without
 * importing each other. Twin of `ensure_table` in backend/modules/lab_sections/videos.py and video_script.py: the same
 * statements, so both backends build the same schema. Change both.
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
      created_at TEXT NOT NULL,
      preview_image TEXT NOT NULL DEFAULT '',
      shape TEXT NOT NULL DEFAULT 'wide'
  );
  CREATE INDEX IF NOT EXISTS idx_lab_page_videos_page ON lab_page_videos(user_id, lab_name, topic_id, subtopic_id, order_index);
`;

/** Columns a `lab_page_videos` made before preview images and shapes existed is missing (ALTER TABLE ... ADD COLUMN). */
export const LAB_VIDEOS_ADDED_COLUMNS: readonly [name: string, definition: string][] = [
  ['preview_image', "TEXT NOT NULL DEFAULT ''"],
  ['shape', "TEXT NOT NULL DEFAULT 'wide'"],
];

export const LAB_VIDEO_SCRIPTS_DDL = `
  CREATE TABLE IF NOT EXISTS lab_video_scripts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      lab_name TEXT NOT NULL,
      topic_id TEXT NOT NULL,
      subtopic_id TEXT NOT NULL DEFAULT '',
      content TEXT NOT NULL,
      project_id INTEGER DEFAULT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(user_id, lab_name, topic_id, subtopic_id)
  );
`;

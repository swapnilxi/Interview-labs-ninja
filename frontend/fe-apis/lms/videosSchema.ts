/**
 * Tables of the video links on classes and subjects, what deleting them removes, and how an outline entry's links
 * are read back.
 *
 * Kept in a file of its own so both db.ts (table creation, deleteClass/deleteSubject, parsePlanItem) and videos.ts
 * (the logic) can import it without importing each other. Twin of `ensure_tables` / `purge_class` / `purge_subject` /
 * `clean_plan_videos` in backend/modules/ai_lms/videos.py: the same statements and rules, so both backends build the
 * same schema and read a stored outline the same way. Change both.
 */

import { VIDEO_MAX_PER_ITEM, cleanVideoTitle, normalizeVideoUrl } from '@/lib/video/videoLinks';

export const VIDEOS_DDL = `
  CREATE TABLE IF NOT EXISTS lms_videos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      scope TEXT NOT NULL CHECK (scope IN ('class', 'subject')),
      ref TEXT NOT NULL,
      url TEXT NOT NULL,
      title TEXT NOT NULL DEFAULT '',
      order_index INTEGER NOT NULL DEFAULT 0,
      created_by INTEGER,
      created_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_lms_videos_item ON lms_videos(scope, ref, order_index);
`;

/** The slice of a node:sqlite connection the purges need. */
interface RawDb {
  prepare(sql: string): { run(...params: unknown[]): unknown };
}

/** A deleted class takes its own links and those of its subjects with it. Call before the subjects are removed. */
export function purgeClassVideos(db: RawDb, classId: string): void {
  db.prepare(
    "DELETE FROM lms_videos WHERE scope = 'subject' AND ref IN (SELECT id FROM lms_subjects WHERE class_id = ?)"
  ).run(classId);
  db.prepare("DELETE FROM lms_videos WHERE scope = 'class' AND ref = ?").run(classId);
}

export function purgeSubjectVideos(db: RawDb, subjectId: string): void {
  db.prepare("DELETE FROM lms_videos WHERE scope = 'subject' AND ref = ?").run(subjectId);
}

export interface PlanVideo {
  url: string;
  title: string;
}

/**
 * What a stored outline entry's `videos` becomes when it is read: valid, de-duplicated, at most 20. An entry that no
 * longer passes the rules is dropped quietly (reading never fails). Used by db.ts's `parsePlanItem`.
 */
export function cleanPlanVideos(raw: unknown): PlanVideo[] {
  if (!Array.isArray(raw)) return [];
  const videos: PlanVideo[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
    const record = item as Record<string, unknown>;
    const url = normalizeVideoUrl(record.url);
    const title = cleanVideoTitle(record.title);
    if (!url.ok || !title.ok) continue;
    if (videos.some((v) => v.url === url.url)) continue;
    videos.push({ url: url.url, title: title.title });
    if (videos.length >= VIDEO_MAX_PER_ITEM) break;
  }
  return videos;
}

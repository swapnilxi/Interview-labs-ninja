/**
 * fe-apis/labSections/videos.ts
 *
 * Personal video links on lab pages (a topic's page, or one of its subtopics). Twin of
 * backend/modules/lab_sections/videos.py: the same table, limits, validation texts and status codes, so change both.
 * The link rules are the shared src/lib/video/videoLinks.ts (Python's mirror: backend/modules/common/video_links.py).
 *
 * They belong to the signed-in user alone, like their saved sections and progress: another user's id answers 404.
 * `subtopic_id` is '' for the topic's own page. The route table entries that call these are at the end of
 * handlers.ts (they use its lab/page validation).
 */

import {
  VIDEO_DUPLICATE_ERROR,
  VIDEO_LIMIT_ERROR,
  VIDEO_MAX_PER_ITEM,
  cleanVideoTitle,
  normalizeVideoUrl,
} from '@/lib/video/videoLinks';
import { HttpError, type Row } from '../todo/_shared';
import { withLabDb } from './db';

function rowOut(row: Row) {
  return {
    id: Number(row.id),
    url: row.url as string,
    title: row.title as string,
    order_index: Number(row.order_index),
    created_at: row.created_at as string,
  };
}

function pageRows(
  db: { all<T = Row>(sql: string, ...params: unknown[]): T[] },
  userId: number,
  lab: string,
  topicId: string,
  subtopicId: string
) {
  return db
    .all<Row>(
      `SELECT * FROM lab_page_videos
       WHERE user_id = ? AND lab_name = ? AND topic_id = ? AND subtopic_id = ?
       ORDER BY order_index ASC, id ASC`,
      userId,
      lab,
      topicId,
      subtopicId
    )
    .map(rowOut);
}

export function listPageVideos(userId: number, lab: string, topicId: string, subtopicId: string) {
  return withLabDb((db) => ({ videos: pageRows(db, userId, lab, topicId, subtopicId) }));
}

/** Checks run in this order in both twins (after the route has checked lab and page ids): url, title, limit, duplicate. */
export function addPageVideo(
  userId: number,
  lab: string,
  topicId: string,
  subtopicId: string,
  urlRaw: unknown,
  titleRaw: unknown
) {
  const url = normalizeVideoUrl(urlRaw);
  if (!url.ok) throw new HttpError(422, url.error);
  const title = cleanVideoTitle(titleRaw);
  if (!title.ok) throw new HttpError(422, title.error);
  return withLabDb((db) =>
    db.transaction(() => {
      const existing = pageRows(db, userId, lab, topicId, subtopicId);
      if (existing.length >= VIDEO_MAX_PER_ITEM) throw new HttpError(422, VIDEO_LIMIT_ERROR);
      if (existing.some((v) => v.url === url.url)) throw new HttpError(409, VIDEO_DUPLICATE_ERROR);
      const orderIndex = existing.length ? existing[existing.length - 1].order_index + 1 : 0;
      const { lastInsertRowid } = db.run(
        `INSERT INTO lab_page_videos (user_id, lab_name, topic_id, subtopic_id, url, title, order_index, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        userId,
        lab,
        topicId,
        subtopicId,
        url.url,
        title.title,
        orderIndex,
        new Date().toISOString()
      );
      return rowOut(db.get<Row>('SELECT * FROM lab_page_videos WHERE id = ?', lastInsertRowid) as Row);
    })
  );
}

/** Own rows only: someone else's id is a 404, exactly like an id that does not exist. */
export function deletePageVideo(userId: number, videoId: number) {
  return withLabDb((db) => {
    if (db.run('DELETE FROM lab_page_videos WHERE id = ? AND user_id = ?', videoId, userId).changes === 0) {
      throw new HttpError(404, 'Video not found.');
    }
    return { message: 'Video removed' };
  });
}

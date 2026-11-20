/**
 * fe-apis/labSections/videos.ts
 *
 * Video links on lab pages (a topic's page, or one of its subtopics). Twin of
 * backend/modules/lab_sections/videos.py: the same table, limits, validation texts and status codes, so change both.
 * The link rules are the shared src/lib/video/videoLinks.ts (Python's mirror: backend/modules/common/video_links.py).
 *
 * They belong to the signed-in user alone, like their saved sections and progress: another user's id answers 404; an
 * admin can also add one for everyone (user_id 0), and give any link a preview image and a card shape. `subtopic_id` is
 * '' for the topic's own page. The route table entries that call these are at the end of
 * handlers.ts (they use its lab/page validation).
 */

import {
  VIDEO_DUPLICATE_ERROR,
  VIDEO_LIMIT_ERROR,
  VIDEO_MAX_PER_ITEM,
  VIDEO_SHAPE_DEFAULT,
  VIDEO_SHARED_ERROR,
  cleanVideoTitle,
  normalizePreviewImage,
  normalizeVideoShape,
  normalizeVideoUrl,
} from '@/lib/video/videoLinks';
import { HttpError, type Row } from '../todo/_shared';
import { withLabDb } from './db';

/** user_id of a link an admin added for everyone (backend/modules/lab_sections/videos.py SHARED_USER). */
const SHARED_USER = 0;

const NOTHING_TO_CHANGE = 'Send a title, a preview image, a shape, an icon or shared to change.';
const NOT_ADMIN_SHARE = 'Only an admin can add a video for everyone.';
const NOT_ADMIN_PATCH = 'Only an admin can change who sees a link.';

/** The icons a card can show for its kind of link; '' = guess from the url. Same list as LINK_ICONS in videos.py. */
export const LINK_ICONS = [
  'link', 'video', 'article', 'doc', 'pdf', 'code', 'repo', 'slides', 'sheet', 'book', 'course', 'image', 'audio', 'tool',
] as const;
const ICON_ERROR = `icon must be one of: ${LINK_ICONS.join(', ')} (or empty).`;

/** null = not sent; '' = automatic. */
function cleanIcon(raw: unknown): string | null {
  if (raw === undefined || raw === null) return null;
  if (typeof raw !== 'string' || (raw !== '' && !(LINK_ICONS as readonly string[]).includes(raw))) {
    throw new HttpError(422, ICON_ERROR);
  }
  return raw;
}

function isAdmin(db: { get<T = Row>(sql: string, ...params: unknown[]): T | undefined }, userId: number): boolean {
  const role = db.get<{ role?: string }>('SELECT role FROM users WHERE id = ?', userId)?.role;
  return role === 'admin' || role === 'superadmin';
}

function rowOut(row: Row) {
  return {
    shared: Number(row.user_id) === SHARED_USER,
    id: Number(row.id),
    url: row.url as string,
    title: row.title as string,
    order_index: Number(row.order_index),
    created_at: row.created_at as string,
    preview_image: row.preview_image as string,
    shape: row.shape as string,
    icon: (row.icon as string) ?? '',
  };
}

function pageRows(
  db: { all<T = Row>(sql: string, ...params: unknown[]): T[] },
  userId: number,
  lab: string,
  topicId: string,
  subtopicId: string,
  onlyUser = false
) {
  // The shared links first, then the caller's own; `onlyUser` = just the rows of `userId` (what the limit counts).
  const users = onlyUser ? [userId] : [SHARED_USER, userId];
  return db
    .all<Row>(
      `SELECT * FROM lab_page_videos
       WHERE user_id IN (${users.map(() => '?').join(',')}) AND lab_name = ? AND topic_id = ? AND subtopic_id = ?
       ORDER BY (user_id = ${SHARED_USER}) DESC, order_index ASC, id ASC`,
      ...users,
      lab,
      topicId,
      subtopicId
    )
    .map(rowOut);
}

export function listPageVideos(userId: number, lab: string, topicId: string, subtopicId: string) {
  return withLabDb((db) => ({ videos: pageRows(db, userId, lab, topicId, subtopicId) }));
}

/**
 * Checks run in this order in both twins (after the route has checked lab and page ids): url, title, shape, preview image,
 * icon (all 422), admin (403: `shared`), limit (422), duplicate (409). The limit counts the
 * bucket being added to (the caller's own, or the shared one); the duplicate check looks at everything the caller sees.
 * `previewRaw` undefined, null or '' and `shapeRaw` undefined or null mean "not sent".
 */
export function addPageVideo(
  userId: number,
  lab: string,
  topicId: string,
  subtopicId: string,
  urlRaw: unknown,
  titleRaw: unknown,
  shared = false,
  previewRaw: unknown = null,
  shapeRaw: unknown = null,
  iconRaw: unknown = null
) {
  const url = normalizeVideoUrl(urlRaw);
  if (!url.ok) throw new HttpError(422, url.error);
  const title = cleanVideoTitle(titleRaw);
  if (!title.ok) throw new HttpError(422, title.error);
  const shape = normalizeVideoShape(shapeRaw);
  if (!shape.ok) throw new HttpError(422, shape.error);
  const preview = normalizePreviewImage(previewRaw);
  if (!preview.ok) throw new HttpError(422, preview.error);
  const icon = cleanIcon(iconRaw) ?? '';
  return withLabDb((db) =>
    db.transaction(() => {
      if (shared && !isAdmin(db, userId)) throw new HttpError(403, NOT_ADMIN_SHARE);
      const owner = shared ? SHARED_USER : userId;
      const existing = pageRows(db, owner, lab, topicId, subtopicId, true);
      if (existing.length >= VIDEO_MAX_PER_ITEM) throw new HttpError(422, VIDEO_LIMIT_ERROR);
      if (pageRows(db, userId, lab, topicId, subtopicId).some((v) => v.url === url.url)) {
        throw new HttpError(409, VIDEO_DUPLICATE_ERROR);
      }
      const orderIndex = existing.length ? existing[existing.length - 1].order_index + 1 : 0;
      const { lastInsertRowid } = db.run(
        `INSERT INTO lab_page_videos
           (user_id, lab_name, topic_id, subtopic_id, url, title, order_index, created_at, preview_image, shape, icon)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        owner,
        lab,
        topicId,
        subtopicId,
        url.url,
        title.title,
        orderIndex,
        new Date().toISOString(),
        preview.image,
        shape.shape ?? VIDEO_SHAPE_DEFAULT,
        icon
      );
      return rowOut(db.get<Row>('SELECT * FROM lab_page_videos WHERE id = ?', lastInsertRowid) as Row);
    })
  );
}

/**
 * Change one link. A field that is undefined or null (not sent) is left alone; a title of '' clears the title, a preview
 * image of '' removes the image and an icon of '' goes back to automatic. Checks, in this order in both twins: nothing sent
 * (422), title, shape, preview image, icon, shared (422), the link is the caller's own or an admin's shared one (404
 * otherwise, like a missing id), admin for shared (403), then for a change of audience: limit of the target bucket (422),
 * duplicate (409).
 */
export function updatePageVideo(
  userId: number,
  videoId: number,
  titleRaw: unknown,
  previewRaw: unknown,
  shapeRaw: unknown,
  sharedRaw: unknown,
  iconRaw: unknown = null
) {
  const sent = (v: unknown) => v !== undefined && v !== null;
  if (!sent(titleRaw) && !sent(previewRaw) && !sent(shapeRaw) && !sent(sharedRaw) && !sent(iconRaw)) {
    throw new HttpError(422, NOTHING_TO_CHANGE);
  }
  const title = sent(titleRaw) ? cleanVideoTitle(titleRaw) : null;
  if (title && !title.ok) throw new HttpError(422, title.error);
  const shape = normalizeVideoShape(shapeRaw);
  if (!shape.ok) throw new HttpError(422, shape.error);
  const preview = sent(previewRaw) ? normalizePreviewImage(previewRaw) : null;
  if (preview && !preview.ok) throw new HttpError(422, preview.error);
  const icon = cleanIcon(iconRaw);
  if (sent(sharedRaw) && typeof sharedRaw !== 'boolean') {
    throw new HttpError(422, VIDEO_SHARED_ERROR);
  }
  return withLabDb((db) =>
    db.transaction(() => {
      const admin = isAdmin(db, userId);
      const owners = admin ? [userId, SHARED_USER] : [userId];
      const row = db.get<Row>(
        `SELECT * FROM lab_page_videos WHERE id = ? AND user_id IN (${owners.map(() => '?').join(',')})`,
        videoId,
        ...owners
      );
      if (!row) throw new HttpError(404, 'Video not found.');
      if (sent(sharedRaw) && !admin) {
        throw new HttpError(403, NOT_ADMIN_PATCH);
      }
      let owner = Number(row.user_id);
      let orderIndex = Number(row.order_index);
      if (sent(sharedRaw) && sharedRaw !== (owner === SHARED_USER)) {
        const target = sharedRaw ? SHARED_USER : userId;
        const labName = row.lab_name as string;
        const pageTopic = row.topic_id as string;
        const pageSub = row.subtopic_id as string;
        const bucket = pageRows(db, target, labName, pageTopic, pageSub, true);
        if (bucket.length >= VIDEO_MAX_PER_ITEM) throw new HttpError(422, VIDEO_LIMIT_ERROR);
        const seen = pageRows(db, userId, labName, pageTopic, pageSub);
        if (seen.some((v) => v.url === row.url && v.id !== videoId)) {
          throw new HttpError(409, VIDEO_DUPLICATE_ERROR);
        }
        owner = target;
        orderIndex = bucket.length ? bucket[bucket.length - 1].order_index + 1 : 0;
      }
      db.run(
        'UPDATE lab_page_videos SET user_id = ?, order_index = ?, title = ?, preview_image = ?, shape = ?, icon = ? WHERE id = ?',
        owner,
        orderIndex,
        title === null ? (row.title as string) : title.title,
        preview === null ? (row.preview_image as string) : preview.image,
        shape.shape === null ? (row.shape as string) : shape.shape,
        icon === null ? (row.icon as string) : icon,
        videoId
      );
      return rowOut(db.get<Row>('SELECT * FROM lab_page_videos WHERE id = ?', videoId) as Row);
    })
  );
}

/** Own rows only (an admin also the shared ones): someone else's id is a 404, exactly like an id that does not exist. */
export function deletePageVideo(userId: number, videoId: number) {
  return withLabDb((db) => {
    const owners = isAdmin(db, userId) ? [userId, SHARED_USER] : [userId];
    if (
      db.run(`DELETE FROM lab_page_videos WHERE id = ? AND user_id IN (${owners.map(() => '?').join(',')})`, videoId, ...owners)
        .changes === 0
    ) {
      throw new HttpError(404, 'Video not found.');
    }
    return { message: 'Video removed' };
  });
}

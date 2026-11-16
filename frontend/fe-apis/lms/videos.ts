/**
 * fe-apis/lms/videos.ts
 *
 * Video links on AI LMS classes, subjects and the modules of a project. Twin of backend/modules/ai_lms/videos.py:
 * the same tables, limits, validation texts and status codes, so change both. The link rules themselves are the
 * shared src/lib/video/videoLinks.ts (Python's mirror: backend/modules/common/video_links.py).
 *
 * Shared content: an instructor or admin adds links (every write goes through `requireUserId`, which demands an
 * editor for any POST/PUT/PATCH/DELETE that is not in NON_EDIT_WRITES; none of these paths is) and every signed-in
 * user reads them.
 *   - class / subject (a project is a subject with kind='project'): rows of `lms_videos`, ordered by `order_index`.
 *   - project module / sub-step: the `videos` key of its entry in `lms_subjects.project_plan`, so the links move with
 *     the entry (db.ts's `parsePlanItem` keeps the key through every read).
 */

import { NextResponse } from 'next/server';
import { withNeonSync } from '@/lib/server/neonSync';
import {
  VIDEO_DUPLICATE_ERROR,
  VIDEO_LIMIT_ERROR,
  VIDEO_MAX_PER_ITEM,
  cleanVideoTitle,
  normalizeVideoUrl,
} from '@/lib/video/videoLinks';
import { HttpError, withTodoDb, type TodoDb } from '../todo/_shared';
import { ensureLmsTables, getSubjectByIdAnyClass, getSubjectByIdOrSlug, saveProjectPlan } from './db';
import { requireUserId } from './index';
import type { PlanVideo } from './videosSchema';

const SCOPES = ['class', 'subject'] as const;
type Scope = (typeof SCOPES)[number];
const SCOPE_ERROR = "Field 'scope' must be one of: class, subject";
const REF_ERROR = "Field 'ref' is required";
const REF_MAX = 100;
const NOTHING_TO_CHANGE = 'Send a url or a title to change.';
const MODULE_NOT_FOUND = "Module not found in this project's outline.";
const SUBLESSON_NOT_FOUND = 'Sublesson not found in this module.';
const LIST_ERROR = "Field 'videos' must be a list.";
const IDS_ERROR = "Field 'ids' must be a list of video ids.";

type Row = Record<string, any>;
type PlanItem = Record<string, unknown>;

/** Length in code points, like Python's len(). */
const cpLength = (value: string): number => Array.from(value).length;

// ── Helpers ────────────────────────────────────────────────────────────────────

/** YYYY-MM-DDTHH:MM:SS.mmmZ, the same text Python's now_iso() writes. */
const nowIso = (): string => new Date().toISOString();

function rowOut(row: Row) {
  return {
    id: Number(row.id),
    url: row.url as string,
    title: row.title as string,
    order_index: Number(row.order_index),
    created_at: row.created_at as string,
  };
}

function checkScope(scope: unknown): Scope {
  if (typeof scope !== 'string' || !(SCOPES as readonly string[]).includes(scope)) {
    throw new HttpError(422, SCOPE_ERROR);
  }
  return scope as Scope;
}

function checkRef(ref: unknown): string {
  if (typeof ref !== 'string' || !ref.trim() || cpLength(ref) > REF_MAX) throw new HttpError(422, REF_ERROR);
  return ref.trim();
}

function urlOrThrow(value: unknown): string {
  const result = normalizeVideoUrl(value);
  if (!result.ok) throw new HttpError(422, result.error);
  return result.url;
}

function titleOrThrow(value: unknown): string {
  const result = cleanVideoTitle(value);
  if (!result.ok) throw new HttpError(422, result.error);
  return result.title;
}

/** The canonical id of the class (id or slug) or subject (id) a link hangs on; 404 when it does not exist. */
function resolveRef(db: TodoDb, scope: Scope, ref: string): string {
  if (scope === 'class') {
    const row = db.get<Row>('SELECT id FROM lms_classes WHERE id = ? OR slug = ?', ref, ref);
    if (!row) throw new HttpError(404, 'Class not found.');
    return row.id as string;
  }
  const row = db.get<Row>('SELECT id FROM lms_subjects WHERE id = ?', ref);
  if (!row) throw new HttpError(404, 'Subject not found.');
  return row.id as string;
}

function listRows(db: TodoDb, scope: Scope, refId: string) {
  return db
    .all<Row>('SELECT * FROM lms_videos WHERE scope = ? AND ref = ? ORDER BY order_index ASC, id ASC', scope, refId)
    .map(rowOut);
}

// ── Class and subject links ────────────────────────────────────────────────────

export function listVideos(scope: unknown, ref: unknown) {
  const checkedScope = checkScope(scope);
  const checkedRef = checkRef(ref);
  ensureLmsTables();
  return withTodoDb((db) => ({ videos: listRows(db, checkedScope, resolveRef(db, checkedScope, checkedRef)) }));
}

/** Checks run in this order in both twins: scope, ref, url, title, existence (404), limit (422), duplicate (409). */
export function addVideo(payload: Row, userId: number | null) {
  const scope = checkScope(payload.scope);
  const ref = checkRef(payload.ref);
  const url = urlOrThrow(payload.url);
  const title = titleOrThrow(payload.title);
  ensureLmsTables();
  return withTodoDb((db) =>
    db.transaction(() => {
      const refId = resolveRef(db, scope, ref);
      const existing = listRows(db, scope, refId);
      if (existing.length >= VIDEO_MAX_PER_ITEM) throw new HttpError(422, VIDEO_LIMIT_ERROR);
      if (existing.some((v) => v.url === url)) throw new HttpError(409, VIDEO_DUPLICATE_ERROR);
      const orderIndex = existing.length ? existing[existing.length - 1].order_index + 1 : 0;
      const { lastInsertRowid } = db.run(
        'INSERT INTO lms_videos (scope, ref, url, title, order_index, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
        scope,
        refId,
        url,
        title,
        orderIndex,
        userId,
        nowIso()
      );
      return rowOut(db.get<Row>('SELECT * FROM lms_videos WHERE id = ?', lastInsertRowid) as Row);
    })
  );
}

export function updateVideo(videoId: number, payload: Row) {
  const hasUrl = Object.prototype.hasOwnProperty.call(payload, 'url');
  const hasTitle = Object.prototype.hasOwnProperty.call(payload, 'title');
  if (!hasUrl && !hasTitle) throw new HttpError(422, NOTHING_TO_CHANGE);
  const url = hasUrl ? urlOrThrow(payload.url) : null;
  const title = hasTitle ? titleOrThrow(payload.title) : null;
  ensureLmsTables();
  return withTodoDb((db) =>
    db.transaction(() => {
      const current = db.get<Row>('SELECT * FROM lms_videos WHERE id = ?', videoId);
      if (!current) throw new HttpError(404, 'Video not found.');
      if (url !== null && url !== current.url) {
        const clash = db.get<Row>(
          'SELECT 1 AS hit FROM lms_videos WHERE scope = ? AND ref = ? AND url = ? AND id != ?',
          current.scope,
          current.ref,
          url,
          videoId
        );
        if (clash) throw new HttpError(409, VIDEO_DUPLICATE_ERROR);
      }
      db.run('UPDATE lms_videos SET url = ?, title = ? WHERE id = ?', url ?? current.url, title ?? current.title, videoId);
      return rowOut(db.get<Row>('SELECT * FROM lms_videos WHERE id = ?', videoId) as Row);
    })
  );
}

export function deleteVideo(videoId: number) {
  ensureLmsTables();
  return withTodoDb((db) => {
    if (db.run('DELETE FROM lms_videos WHERE id = ?', videoId).changes === 0) {
      throw new HttpError(404, 'Video not found.');
    }
    return { message: 'Video removed' };
  });
}

/**
 * The listed ids first, in the order given (ids that are not this item's, or repeated, are ignored); every link not
 * listed keeps its relative order after them. Answers with the new list.
 */
export function reorderVideos(payload: Row) {
  const scope = checkScope(payload.scope);
  const ref = checkRef(payload.ref);
  const ids = payload.ids;
  if (!Array.isArray(ids) || !ids.every((i) => typeof i === 'number' && Number.isInteger(i))) {
    throw new HttpError(422, IDS_ERROR);
  }
  ensureLmsTables();
  return withTodoDb((db) =>
    db.transaction(() => {
      const refId = resolveRef(db, scope, ref);
      const current = listRows(db, scope, refId);
      const known = new Set(current.map((v) => v.id));
      const first = [...new Set((ids as number[]).filter((i) => known.has(i)))];
      const listed = new Set(first);
      const order = [...first, ...current.map((v) => v.id).filter((id) => !listed.has(id))];
      order.forEach((id, index) => db.run('UPDATE lms_videos SET order_index = ? WHERE id = ?', index, id));
      return { videos: listRows(db, scope, refId) };
    })
  );
}

// ── Project module / sub-step links (inside the outline) ───────────────────────

/** The body of a module's `PUT .../videos`: the whole new list, checked. Errors say which video (1-based). */
export function validateVideoList(raw: unknown): PlanVideo[] {
  if (!Array.isArray(raw)) throw new HttpError(422, LIST_ERROR);
  if (raw.length > VIDEO_MAX_PER_ITEM) throw new HttpError(422, VIDEO_LIMIT_ERROR);
  const videos: PlanVideo[] = [];
  raw.forEach((item, position) => {
    const index = position + 1;
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      throw new HttpError(422, `Video ${index}: send an object with a url.`);
    }
    const record = item as Row;
    const url = normalizeVideoUrl(record.url);
    if (!url.ok) throw new HttpError(422, `Video ${index}: ${url.error}`);
    const title = cleanVideoTitle(record.title);
    if (!title.ok) throw new HttpError(422, `Video ${index}: ${title.error}`);
    if (videos.some((v) => v.url === url.url)) throw new HttpError(409, VIDEO_DUPLICATE_ERROR);
    videos.push({ url: url.url, title: title.title });
  });
  return videos;
}

/** The outline with one module's (or one sub-step's) `videos` replaced. Everything else in the entry is untouched. */
export function setPlanItemVideos(
  plan: PlanItem[],
  moduleIndex: number,
  subIndex: number | null,
  rawVideos: unknown
): PlanItem[] {
  if (moduleIndex < 0 || moduleIndex >= plan.length) throw new HttpError(404, MODULE_NOT_FOUND);
  const module = plan[moduleIndex];
  if (subIndex === null) {
    plan[moduleIndex] = { ...module, videos: validateVideoList(rawVideos) };
    return plan;
  }
  const subs = ((module.sublessons as PlanItem[]) || []).slice();
  if (subIndex < 0 || subIndex >= subs.length) throw new HttpError(404, SUBLESSON_NOT_FOUND);
  subs[subIndex] = { ...subs[subIndex], videos: validateVideoList(rawVideos) };
  plan[moduleIndex] = { ...module, sublessons: subs };
  return plan;
}

// ── HTTP handlers (the route files under src/app/api/lms/ call these) ──────────

function errorResponse(err: unknown, fallback: string): NextResponse {
  if (err instanceof HttpError) return NextResponse.json({ detail: err.detail }, { status: err.status });
  return NextResponse.json({ detail: (err as Error)?.message || fallback }, { status: 500 });
}

async function jsonObject(req: Request): Promise<Row> {
  const body = await req.json().catch(() => null);
  return body && typeof body === 'object' && !Array.isArray(body) ? (body as Row) : {};
}

/** A path segment that must be a whole number (FastAPI answers 422 for anything else). */
function intSegment(value: string, name: string): number {
  if (!/^-?\d+$/.test(value)) throw new HttpError(422, `Invalid integer for '${name}'`);
  return parseInt(value, 10);
}

export async function handleListVideos(req: Request): Promise<NextResponse> {
  try {
    const auth = requireUserId(req);
    if (auth instanceof NextResponse) return auth;
    const params = new URL(req.url).searchParams;
    return NextResponse.json(listVideos(params.get('scope'), params.get('ref')));
  } catch (err) {
    return errorResponse(err, 'Failed to load videos');
  }
}

async function createVideoImpl(req: Request): Promise<NextResponse> {
  try {
    const auth = requireUserId(req);
    if (auth instanceof NextResponse) return auth;
    return NextResponse.json(addVideo(await jsonObject(req), auth), { status: 201 });
  } catch (err) {
    return errorResponse(err, 'Failed to add the video');
  }
}

async function reorderVideosImpl(req: Request): Promise<NextResponse> {
  try {
    const auth = requireUserId(req);
    if (auth instanceof NextResponse) return auth;
    return NextResponse.json(reorderVideos(await jsonObject(req)));
  } catch (err) {
    return errorResponse(err, 'Failed to reorder the videos');
  }
}

async function updateVideoImpl(videoId: string, req: Request): Promise<NextResponse> {
  try {
    const auth = requireUserId(req);
    if (auth instanceof NextResponse) return auth;
    return NextResponse.json(updateVideo(intSegment(videoId, 'video_id'), await jsonObject(req)));
  } catch (err) {
    return errorResponse(err, 'Failed to update the video');
  }
}

async function deleteVideoImpl(videoId: string, req: Request): Promise<NextResponse> {
  try {
    const auth = requireUserId(req);
    if (auth instanceof NextResponse) return auth;
    return NextResponse.json(deleteVideo(intSegment(videoId, 'video_id')));
  } catch (err) {
    return errorResponse(err, 'Failed to remove the video');
  }
}

async function putPlanVideosImpl(
  projectId: string,
  moduleIndex: string,
  subIndex: string | null,
  req: Request
): Promise<NextResponse> {
  try {
    const auth = requireUserId(req);
    if (auth instanceof NextResponse) return auth;
    const moduleNumber = intSegment(moduleIndex, 'module_index');
    const subNumber = subIndex === null ? null : intSegment(subIndex, 'sub_index');
    const project = getSubjectByIdAnyClass(projectId);
    if (!project || project.kind !== 'project') throw new HttpError(404, 'Project not found.');
    const body = await jsonObject(req);
    const plan = ((project.project_plan as PlanItem[]) || []).slice();
    saveProjectPlan(project.id as string, setPlanItemVideos(plan, moduleNumber, subNumber, body.videos));
    const cls = project.class as Record<string, unknown>;
    return NextResponse.json(getSubjectByIdOrSlug(cls.id as string, project.id as string));
  } catch (err) {
    return errorResponse(err, 'Failed to save the videos');
  }
}

async function putModuleVideosImpl(projectId: string, moduleIndex: string, req: Request) {
  return putPlanVideosImpl(projectId, moduleIndex, null, req);
}

async function putSublessonVideosImpl(projectId: string, moduleIndex: string, subIndex: string, req: Request) {
  return putPlanVideosImpl(projectId, moduleIndex, subIndex, req);
}

// These write, but not to what the class folders show, so they only need the Neon push (no folder sync).
export const handleCreateVideo = withNeonSync(createVideoImpl);
export const handleReorderVideos = withNeonSync(reorderVideosImpl);
export const handleUpdateVideo = withNeonSync(updateVideoImpl);
export const handleDeleteVideo = withNeonSync(deleteVideoImpl);
export const handlePutModuleVideos = withNeonSync(putModuleVideosImpl);
export const handlePutSublessonVideos = withNeonSync(putSublessonVideosImpl);

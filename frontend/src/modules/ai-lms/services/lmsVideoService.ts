import { apiJson } from '@/lib/http/apiClient';
import type { LmsSubject } from '../types';

/**
 * Video links in AI LMS: shared content that instructors and admins add and every signed-in user sees.
 * Served by backend/modules/ai_lms/videos.py (router.py) and its twin fe-apis/lms/videos.ts. Every function rejects
 * with the server's plain message ("That video is already added.").
 *
 * - A class or a subject (a project is a subject) keeps its links in rows: `list/create/update/delete/reorder`.
 * - A project's module or sub-step keeps its links inside its outline entry: `putModuleVideos` replaces the list and
 *   answers with the project, like the module endpoints beside it.
 *
 * The shared link rules (what a link may be, how each kind is shown) are in `@/lib/video/videoLinks`.
 */

export type LmsVideoScope = 'class' | 'subject';

export interface LmsVideo {
  id: number;
  url: string;
  title: string;
  order_index: number;
  created_at: string;
}

export interface ModuleVideo {
  url: string;
  title: string;
}

/** `ref` is a class id or slug (scope 'class') or a subject id (scope 'subject'). */
export async function listLmsVideos(scope: LmsVideoScope, ref: string): Promise<LmsVideo[]> {
  const qs = new URLSearchParams({ scope, ref });
  const data = await apiJson<{ videos?: LmsVideo[] }>(`/api/lms/videos?${qs}`);
  return data.videos ?? [];
}

export function createLmsVideo(
  scope: LmsVideoScope,
  ref: string,
  url: string,
  title = ''
): Promise<LmsVideo> {
  return apiJson<LmsVideo>('/api/lms/videos', {
    method: 'POST',
    body: JSON.stringify({ scope, ref, url, title }),
  });
}

export function updateLmsVideo(
  id: number,
  patch: { url?: string; title?: string }
): Promise<LmsVideo> {
  return apiJson<LmsVideo>(`/api/lms/videos/${id}`, { method: 'PATCH', body: JSON.stringify(patch) });
}

export async function deleteLmsVideo(id: number): Promise<void> {
  await apiJson(`/api/lms/videos/${id}`, { method: 'DELETE' });
}

/** The listed ids come first, in this order; any link not listed keeps its place after them. Answers with the new list. */
export async function reorderLmsVideos(
  scope: LmsVideoScope,
  ref: string,
  ids: number[]
): Promise<LmsVideo[]> {
  const data = await apiJson<{ videos?: LmsVideo[] }>('/api/lms/videos/reorder', {
    method: 'POST',
    body: JSON.stringify({ scope, ref, ids }),
  });
  return data.videos ?? [];
}

/** Replaces the links of a project's module (or, with `subIndex`, of one of its sub-steps). Answers with the project. */
export function putModuleVideos(
  projectId: string,
  moduleIndex: number,
  subIndex: number | undefined,
  videos: ModuleVideo[]
): Promise<LmsSubject> {
  const base = `/api/lms/projects/${encodeURIComponent(projectId)}/modules/${moduleIndex}`;
  const path = subIndex === undefined ? `${base}/videos` : `${base}/sublessons/${subIndex}/videos`;
  return apiJson<LmsSubject>(path, { method: 'PUT', body: JSON.stringify({ videos }) });
}

import { apiJson } from '@/lib/http/apiClient';
import type { LabName } from '@/lib/services/labSectionsService';

/**
 * Personal video links on lab pages (a topic's page, or one of its subtopics): `/lab-sections/videos`, served by
 * backend/modules/lab_sections/videos.py and its twin fe-apis/labSections/videos.ts. They belong to the signed-in
 * user. Every function rejects with the server's plain message ("That video is already added.").
 *
 * The shared link rules (what a link may be, how each kind is shown) are in `@/lib/video/videoLinks`.
 */

export interface PageVideo {
  id: number;
  url: string;
  title: string;
  order_index: number;
  created_at: string;
  /** Added by an admin for everyone (only an admin can remove it). */
  shared?: boolean;
}

/** '' for the topic's own page. */
export async function fetchLabPageVideos(
  lab: LabName,
  topicId: string,
  subtopicId: string
): Promise<PageVideo[]> {
  const qs = new URLSearchParams({ lab, topic_id: topicId, subtopic_id: subtopicId });
  const data = await apiJson<{ videos?: PageVideo[] }>(`/lab-sections/videos?${qs}`);
  return data.videos ?? [];
}

export function addLabPageVideo(
  lab: LabName,
  topicId: string,
  subtopicId: string,
  url: string,
  title = '',
  shared = false
): Promise<PageVideo> {
  return apiJson<PageVideo>('/lab-sections/videos', {
    method: 'POST',
    body: JSON.stringify({ lab, topic_id: topicId, subtopic_id: subtopicId, url, title, shared }),
  });
}

export async function removeLabPageVideo(id: number): Promise<void> {
  await apiJson(`/lab-sections/videos/${id}`, { method: 'DELETE' });
}

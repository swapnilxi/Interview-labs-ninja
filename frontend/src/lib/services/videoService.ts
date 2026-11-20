import { apiJson } from '@/lib/http/apiClient';
import { AI_TIMEOUT_MS } from '@/lib/http/backendAvailability';
import type { LabName, LabPage } from '@/lib/services/labSectionsService';
import { defaultAIRequestFields } from '@/lib/services/settingsService';
import type { VideoShape } from '@/lib/video/videoLinks';

/**
 * Link and video items on lab pages (a topic's page, or one of its subtopics): `/lab-sections/videos`, served by
 * backend/modules/lab_sections/videos.py and its twin fe-apis/labSections/videos.ts. A user's own are private to them; an
 * admin can add one for everyone and give any link a preview image and a card shape. Every function rejects with the
 * server's plain message ("That video is already added.").
 *
 * Also the AI-written video script of the page (`/lab-sections/video-script`, backend/modules/lab_sections/video_script.py
 * and fe-apis/labSections/videoScript.ts).
 *
 * The shared link rules (what a link may be, how each kind is shown) are in `@/lib/video/videoLinks`.
 */

export interface PageVideo {
  id: number;
  url: string;
  title: string;
  order_index: number;
  created_at: string;
  /** Added by an admin for everyone (only an admin can change or remove it). */
  shared?: boolean;
  /** An https link or a data URL; '' = none (a YouTube video then shows its own thumbnail). */
  preview_image?: string;
  /** The card shape; absent on an older server = wide. */
  shape?: VideoShape;
  /** A LINK_ICONS slug the owner picked; '' = guessed from the url. */
  icon?: string;
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

/** How a link's card looks: set by its owner (or an admin on a shared one). */
export interface PageVideoLook {
  preview_image?: string;
  shape?: VideoShape;
  icon?: string;
}

export function addLabPageVideo(
  lab: LabName,
  topicId: string,
  subtopicId: string,
  url: string,
  title = '',
  shared = false,
  look: PageVideoLook = {}
): Promise<PageVideo> {
  return apiJson<PageVideo>('/lab-sections/videos', {
    method: 'POST',
    body: JSON.stringify({
      lab,
      topic_id: topicId,
      subtopic_id: subtopicId,
      url,
      title,
      shared,
      ...(look.preview_image ? { preview_image: look.preview_image } : {}),
      ...(look.shape ? { shape: look.shape } : {}),
      ...(look.icon ? { icon: look.icon } : {}),
    }),
  });
}

export interface PageVideoPatch extends PageVideoLook {
  title?: string;
  /** Admin only. */
  shared?: boolean;
}

/** Only the fields present are changed; `preview_image: ''` removes the image, `icon: ''` goes back to automatic. */
export function updateLabPageVideo(id: number, patch: PageVideoPatch): Promise<PageVideo> {
  return apiJson<PageVideo>(`/lab-sections/videos/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  });
}

export async function removeLabPageVideo(id: number): Promise<void> {
  await apiJson(`/lab-sections/videos/${id}`, { method: 'DELETE' });
}

// ── The page's video script ──────────────────────────────────────────────────────────────────────────────────────

export interface VideoScript {
  /** Markdown. */
  content: string;
  /** "2026-11-18 07:38:11" (server, UTC). */
  updatedAt: string;
  /** The Labs Project it was written for (null = none). */
  projectId: number | null;
}

/** The saved script for the page, or null before one was generated. Never generates. */
export async function fetchLabVideoScript(
  lab: LabName,
  topicId: string,
  subtopicId: string
): Promise<VideoScript | null> {
  const qs = new URLSearchParams({ lab, topic_id: topicId, subtopic_id: subtopicId });
  const data = await apiJson<{ script?: VideoScript | null }>(`/lab-sections/video-script?${qs}`);
  return data.script ?? null;
}

/**
 * Writes (and saves, server-side) the page's video script with the model chosen in Config; the key and model ride along
 * with the request and are never stored. The wait is a model call, so it is cut off only after AI_TIMEOUT_MS.
 */
export async function generateLabVideoScript(args: {
  lab: LabName;
  topic: LabPage;
  subtopic: LabPage | null;
  /** What the lab-wide and topic settings say about the learner. */
  standingContext?: string;
  /** The learner's add-ons from the lab and topic settings. */
  promptAddon?: string;
  projectId?: number | null;
}): Promise<VideoScript> {
  const { lab, topic, subtopic, standingContext, promptAddon, projectId } = args;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), AI_TIMEOUT_MS);
  try {
    return await apiJson<VideoScript>('/lab-sections/video-script', {
      method: 'POST',
      signal: controller.signal,
      body: JSON.stringify({
        lab,
        topic_id: topic.id,
        topic_name: topic.name,
        topic_brief: topic.brief,
        subtopic_id: subtopic?.id ?? '',
        subtopic_name: subtopic?.name ?? '',
        subtopic_brief: subtopic?.brief ?? '',
        standing_context: standingContext ?? '',
        prompt_addon: promptAddon ?? '',
        ...(projectId ? { project_id: projectId } : {}),
        ...defaultAIRequestFields(),
      }),
    });
  } catch (err) {
    if (controller.signal.aborted) throw new Error('The AI took too long to answer. Try again.');
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

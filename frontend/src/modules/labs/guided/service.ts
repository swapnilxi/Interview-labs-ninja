import { apiFetch, parseApiError } from '@/lib/http/apiClient';
import { defaultAIRequestFields } from '@/lib/services/settingsService';
import type { GuidedLab } from './labs';
import type { GuidedSummary } from './types';

/**
 * Guided Practice's endpoints (fe-apis/guidedPractice in nextjs-api mode, backend/modules/guided_practice with FastAPI):
 * the saved document of a page, and the AI calls. The AI endpoints return the model's raw text; parse.ts reads it.
 * Plain fetch() would 401 (every endpoint needs the Bearer token), hence apiFetch throughout.
 */

export class GuidedApiError extends Error {
  constructor(
    message: string,
    public status: number
  ) {
    super(message);
  }
}

async function request(path: string, init?: RequestInit): Promise<Response> {
  let res: Response;
  try {
    res = await apiFetch(`/guided-practice/${path}`, init);
  } catch {
    throw new GuidedApiError('Could not reach the server. Check your connection and try again.', 0);
  }
  if (!res.ok) throw new GuidedApiError(await parseApiError(res), res.status);
  return res;
}

// ── The saved document ──────────────────────────────────────────────────────

export interface LoadedState {
  exists: boolean;
  /** What a save has to quote (0 = nothing saved yet). */
  version: number;
  state: unknown;
}

export async function loadGuided(
  lab: GuidedLab,
  topicId: string,
  subId: string
): Promise<LoadedState> {
  const qs = new URLSearchParams({ lab, topic_id: topicId, subtopic_id: subId });
  const body = await (await request(`state?${qs}`)).json();
  return { exists: !!body.exists, version: Number(body.version) || 0, state: body.state ?? null };
}

export async function saveGuided(
  lab: GuidedLab,
  topicId: string,
  subId: string,
  expectedVersion: number,
  state: unknown,
  summary: GuidedSummary
): Promise<{ version: number }> {
  const res = await request('state', {
    method: 'PUT',
    body: JSON.stringify({
      lab,
      topic_id: topicId,
      subtopic_id: subId,
      expected_version: expectedVersion,
      state,
      summary,
    }),
  });
  const body = await res.json();
  return { version: Number(body.version) };
}

export async function deleteGuided(lab: GuidedLab, topicId: string, subId: string): Promise<void> {
  const qs = new URLSearchParams({ lab, topic_id: topicId, subtopic_id: subId });
  await request(`state?${qs}`, { method: 'DELETE' });
}

/** What the topic page's card shows; null when the learner has not started that page. */
export async function fetchGuidedSummary(
  lab: GuidedLab,
  topicId: string,
  subId: string
): Promise<GuidedSummary | null> {
  const qs = new URLSearchParams({ lab, topic_id: topicId, subtopic_id: subId });
  const body = await (await request(`summary?${qs}`)).json();
  return body.exists && body.summary ? (body.summary as GuidedSummary) : null;
}

// ── AI ──────────────────────────────────────────────────────────────────────

export interface AiReply {
  text: string;
  model: string;
}

async function ai(path: string, body: Record<string, unknown>): Promise<AiReply> {
  const res = await request(path, {
    method: 'POST',
    body: JSON.stringify({ ...body, ...defaultAIRequestFields() }),
  });
  return res.json();
}

export const aiCurriculum = (body: Record<string, unknown>) => ai('curriculum', body);
/** The plan of a path (phase titles and goals, the boss), and then one phase of it at a time: the path is written in pages. */
export const aiOutline = (body: Record<string, unknown>) => ai('outline', body);
export const aiPhase = (body: Record<string, unknown>) => ai('phase', body);
export const aiLesson = (body: Record<string, unknown>) => ai('question', body);
export const aiBreakdown = (body: Record<string, unknown>) => ai('breakdown', body);
export const aiDeeper = (body: Record<string, unknown>) => ai('deeper', body);
export const aiTutor = (body: Record<string, unknown>) => ai('tutor', body);
export const aiStar = (body: Record<string, unknown>) => ai('star', body);

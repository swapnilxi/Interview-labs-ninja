import { apiFetch } from '@/lib/http/apiClient';
import { defaultAIRequestFields } from '@/lib/services/settingsService';

/** Lab keys as stored server-side (match `lab_sections.lab_name`). */
export type LabName = 'dsa' | 'cv' | 'system_design';
export type ContextMode = 'update' | 'regenerate';
/** `generate` writes a section from the topic alone (no learner context). */
export type SectionMode = 'generate' | ContextMode;

export interface SavedSection {
  content: string;
  context: string;
  mode: ContextMode;
  updatedAt: string;
}

/** A topic or subtopic, reduced to what the generator needs. */
export interface LabPage {
  id: string;
  name: string;
  brief: string;
}

async function errorMessage(res: Response): Promise<string> {
  const body = await res.json().catch(() => ({}));
  const detail = body?.detail;
  return typeof detail === 'string' ? detail : `Server error ${res.status}`;
}

/** Sections the user previously generated with context for this topic page, keyed by section id. */
export async function fetchSavedSections(
  lab: LabName,
  topicId: string,
  subtopicId: string
): Promise<Record<string, SavedSection>> {
  const qs = new URLSearchParams({ lab, topic_id: topicId, subtopic_id: subtopicId });
  const res = await apiFetch(`/lab-sections?${qs}`);
  if (!res.ok) throw new Error(await errorMessage(res));
  return (await res.json()).sections ?? {};
}

/** Generates (and saves, server-side) a section body from the topic and, for update/regenerate, the learner's context. Throws with a readable message. */
export async function generateSectionWithContext(args: {
  lab: LabName;
  topic: LabPage;
  subtopic: LabPage | null;
  section: { id: string; label: string; subtitle?: string; guidance?: string };
  mode: SectionMode;
  context: string;
  existingContent: string;
}): Promise<SavedSection> {
  const { lab, topic, subtopic, section, mode, context, existingContent } = args;
  const res = await apiFetch('/lab-sections/generate', {
    method: 'POST',
    body: JSON.stringify({
      lab,
      topic_id: topic.id,
      topic_name: topic.name,
      topic_brief: topic.brief,
      subtopic_id: subtopic?.id ?? '',
      subtopic_name: subtopic?.name ?? '',
      subtopic_brief: subtopic?.brief ?? '',
      section_id: section.id,
      section_label: section.label,
      section_subtitle: section.subtitle ?? '',
      section_guidance: section.guidance ?? '',
      mode,
      context,
      existing_content: mode === 'update' ? existingContent : '',
      ...defaultAIRequestFields(),
    }),
  });
  if (!res.ok) throw new Error(await errorMessage(res));
  return res.json();
}

export interface QuizQuestion {
  id?: number;
  q: string;
  options: string[];
  /** Index into `options` of the correct answer. */
  answer: number;
  explanation: string;
}

/** Every quiz question generated so far for this topic page, oldest first. */
export async function fetchSavedQuiz(
  lab: LabName,
  topicId: string,
  subtopicId: string
): Promise<QuizQuestion[]> {
  const qs = new URLSearchParams({ lab, topic_id: topicId, subtopic_id: subtopicId });
  const res = await apiFetch(`/lab-sections/quiz?${qs}`);
  if (!res.ok) throw new Error(await errorMessage(res));
  return (await res.json()).questions ?? [];
}

/**
 * Generates `count` more questions about the topic and the concepts around it. They are saved
 * server-side and only the newly added ones are returned. Throws with a readable message.
 */
export async function generateQuiz(args: {
  lab: LabName;
  topic: LabPage;
  subtopic: LabPage | null;
  category: string;
  prerequisites: string[];
  relatedTopics: string[];
  count?: number;
}): Promise<QuizQuestion[]> {
  const { lab, topic, subtopic, category, prerequisites, relatedTopics, count = 4 } = args;
  const res = await apiFetch('/lab-sections/quiz/generate', {
    method: 'POST',
    body: JSON.stringify({
      lab,
      topic_id: topic.id,
      topic_name: topic.name,
      topic_brief: topic.brief,
      category,
      prerequisites,
      related_topics: relatedTopics,
      subtopic_id: subtopic?.id ?? '',
      subtopic_name: subtopic?.name ?? '',
      subtopic_brief: subtopic?.brief ?? '',
      count,
      ...defaultAIRequestFields(),
    }),
  });
  if (!res.ok) throw new Error(await errorMessage(res));
  return (await res.json()).questions ?? [];
}

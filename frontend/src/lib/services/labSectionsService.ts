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
  /** The Labs Project this body was written for (null/absent = no project). */
  projectId?: number | null;
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
  /** What the learner's lab settings say about them (lab-wide + this section). */
  standingContext?: string;
  /** Custom prompt addon (appended to section instructions). */
  promptAddon?: string;
  /** Custom prompt override (replaces built-in guidance). */
  customGuidance?: string;
  /** Write for this Labs Project (its context and relevant saved sections are added server-side). */
  projectId?: number | null;
}): Promise<SavedSection> {
  const {
    lab,
    topic,
    subtopic,
    section,
    mode,
    context,
    existingContent,
    standingContext,
    promptAddon,
    customGuidance,
    projectId,
  } = args;
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
      section_guidance: customGuidance !== undefined ? customGuidance : (section.guidance ?? ''),
      standing_context: standingContext ?? '',
      prompt_addon: promptAddon ?? '',
      mode,
      context,
      existing_content: mode === 'update' ? existingContent : '',
      ...(projectId ? { project_id: projectId } : {}),
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
  /** Learner-written requirements for the quiz (their prompt/add-on from lab settings). */
  guidance?: string;
  standingContext?: string;
  /** Write the questions for this Labs Project (see generateSectionWithContext). */
  projectId?: number | null;
}): Promise<QuizQuestion[]> {
  const {
    lab,
    topic,
    subtopic,
    category,
    prerequisites,
    relatedTopics,
    count = 4,
    guidance,
    standingContext,
    projectId,
  } = args;
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
      section_guidance: guidance ?? '',
      standing_context: standingContext ?? '',
      ...(projectId ? { project_id: projectId } : {}),
      ...defaultAIRequestFields(),
    }),
  });
  if (!res.ok) throw new Error(await errorMessage(res));
  return (await res.json()).questions ?? [];
}

export interface LabProgressItem {
  topicId: string;
  /** '' for the topic's own page. */
  subtopicId: string;
  /** Server time (UTC, "YYYY-MM-DD HH:MM:SS"). */
  completedAt: string;
}

/** Every page of the lab the user has marked complete. */
export async function fetchLabProgress(lab: LabName): Promise<LabProgressItem[]> {
  const res = await apiFetch(`/lab-sections/progress?${new URLSearchParams({ lab })}`);
  if (!res.ok) throw new Error(await errorMessage(res));
  return (await res.json()).completed ?? [];
}

/** Marks one page (a topic, or a subtopic of it) complete or not. Throws with a readable message. */
export async function setPageCompleted(
  lab: LabName,
  topicId: string,
  subtopicId: string,
  completed: boolean
): Promise<{ completed: boolean; completedAt: string | null }> {
  const res = await apiFetch('/lab-sections/progress', {
    method: 'PUT',
    body: JSON.stringify({ lab, topic_id: topicId, subtopic_id: subtopicId, completed }),
  });
  if (!res.ok) throw new Error(await errorMessage(res));
  return res.json();
}

/** What a user changed about how one section (or, as '*', the whole lab) is generated. */
export interface SectionSettings {
  /** Replaces the section's built-in instructions when non-empty. */
  prompt: string;
  /** Appended to whichever instructions are in force. */
  addon: string;
  /** Standing context about the learner. */
  context: string;
}

/** Section id of the lab-wide settings row. */
export const LAB_WIDE_SECTION = '*';

/** The user's customised sections for a lab, keyed by section id ('*' = lab-wide). */
export async function fetchLabSettings(lab: LabName): Promise<Record<string, SectionSettings>> {
  const res = await apiFetch(`/lab-sections/settings?${new URLSearchParams({ lab })}`);
  if (!res.ok) throw new Error(await errorMessage(res));
  return (await res.json()).settings ?? {};
}

/** Saves one section's settings; all three empty resets it to the defaults. Throws with a readable message. */
export async function saveLabSettings(
  lab: LabName,
  sectionId: string,
  values: SectionSettings
): Promise<SectionSettings> {
  const res = await apiFetch('/lab-sections/settings', {
    method: 'PUT',
    body: JSON.stringify({ lab, section_id: sectionId, ...values }),
  });
  if (!res.ok) throw new Error(await errorMessage(res));
  const saved = await res.json();
  return { prompt: saved.prompt, addon: saved.addon, context: saved.context };
}

/** Reset one section's settings or all settings for a lab back to defaults. */
export async function resetLabSettings(
  lab: LabName,
  sectionId: string = 'all'
): Promise<{ ok: boolean }> {
  const res = await apiFetch(
    `/lab-sections/settings?lab=${lab}&section_id=${encodeURIComponent(sectionId)}`,
    {
      method: 'DELETE',
    }
  );
  if (!res.ok) throw new Error(await errorMessage(res));
  return res.json();
}

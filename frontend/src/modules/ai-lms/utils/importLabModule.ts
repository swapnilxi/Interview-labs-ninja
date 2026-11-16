import { apiFetch } from '@/lib/http/apiClient';
import {
  fetchLabSettings,
  fetchSavedQuiz,
  fetchSavedSections,
  generateSectionWithContext,
  LAB_WIDE_SECTION,
  type QuizQuestion,
  type SavedSection,
  type SectionSettings,
} from '@/lib/services/labSectionsService';
import type { LabModuleSource } from '@/modules/labs/common/labModules';
import type { SectionDef } from '@/modules/labs/common/labSectionDefaults';
import { markdownToHtml, stripLeadingTitle } from '@/modules/labs/common/markdownToHtml';
import { templateSectionContent } from '@/modules/labs/common/topicLabContent';
import type { TopicLabTopic } from '@/modules/labs/common/topicLabTypes';
import { composeInstructions } from '@/modules/labs/common/useLabSettings';
import { fetchLabPageVideos } from '@/lib/services/videoService';
import { createLmsVideo } from '../services/lmsVideoService';
import { lmsService } from '../services/lmsService';
import type { LmsClass, LmsLesson, LmsSubject } from '../types';
import { buildLabLessonHtml, estimateReadMinutes, type LabLessonSection } from './labLessonHtml';

/**
 * "Import module from labs": turns one lab topic (a module) into a Subject of a class.
 *
 *   lab topic              ->  Subject      (name, description, the lab's accent)
 *   the topic's own page   ->  first Lesson (its sections, then the list of subtopics)
 *   each subtopic page     ->  one Lesson   (its sections)
 *
 * What goes into a page's sections is what the lab itself shows for it: the text saved for the user (AI-written,
 * per user), else the lab's template where it has one (the topic's own page only: a template is per topic, not per
 * subtopic), else, when asked, a section written by the AI now (saved in the lab too, exactly as pressing Generate
 * there would). It only uses endpoints that already exist (the lab's topic and saved-section routes, and the LMS
 * subject and lesson routes), so it works in both backend modes and is limited to instructors by the LMS's own gate.
 */

const QUIZ_SECTION_ID = 'quiz';
const NO_SETTINGS: SectionSettings = { prompt: '', addon: '', context: '' };
const AI_CONCURRENCY = 2;

export interface ImportOptions {
  /** Ids of the sections to import (the Quiz is the `includeQuiz` switch, not a section). */
  sectionIds: string[];
  /** Fill the topic's own page from the lab's templates where it has one. */
  useTemplates: boolean;
  /** Write every selected section that has no saved text and no template with the AI. */
  writeMissingWithAi: boolean;
  /** Add the quiz questions saved for a page as an interactive quiz. */
  includeQuiz: boolean;
}

export type SectionKind = 'saved' | 'template' | 'ai';

export interface PlannedSection {
  def: SectionDef;
  kind: SectionKind;
  /** The section's Markdown; '' for an `ai` section until it has been written. */
  markdown: string;
}

export interface PlannedPage {
  /** '' for the topic's own page. */
  subtopicId: string;
  name: string;
  brief: string;
  isOverview: boolean;
  sections: PlannedSection[];
  quiz: QuizQuestion[];
}

export interface ModulePlan {
  topic: TopicLabTopic;
  pages: PlannedPage[];
  counts: { lessons: number; saved: number; template: number; ai: number; quiz: number };
}

export interface ImportProgress {
  /** What is being done now, in words ("Writing Core Concepts for Decorators"). */
  label: string;
  done: number;
  total: number;
}

export interface ImportResult {
  subject: LmsSubject;
  lessons: LmsLesson[];
  /** Sections the AI could not write: the lesson was still created without them. */
  warnings: string[];
}

/** Every topic of a lab (the lab's own route; a lab with built-in topics keeps them when the server has none). */
export async function fetchLabTopics(source: LabModuleSource): Promise<TopicLabTopic[]> {
  const { config } = source;
  try {
    const res = await apiFetch(`${config.apiPrefix}/topics`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const list = Array.isArray(data) ? (data as TopicLabTopic[]) : [];
    if (list.length === 0 && config.fallbackTopics) return [...config.fallbackTopics];
    return list;
  } catch (err) {
    if (config.fallbackTopics) return [...config.fallbackTopics];
    throw err instanceof Error ? err : new Error(`Could not load the ${config.labName}.`);
  }
}

/** A module the class already has (same name as a subject of it): the import would only add a copy. */
export function isAlreadyInClass(subjects: LmsSubject[], topic: TopicLabTopic): boolean {
  const name = topic.name.trim().toLowerCase();
  return subjects.some((subject) => subject.name.trim().toLowerCase() === name);
}

/** The sections of a lab that can be imported as text (everything but the Quiz). */
export function importableSections(source: LabModuleSource): readonly SectionDef[] {
  return source.config.sectionDefs.filter((def) => def.id !== QUIZ_SECTION_ID);
}

/** What the lab holds for one page of a module (the topic's own page, or one subtopic). */
export interface PageContent {
  /** '' for the topic's own page. */
  subtopicId: string;
  name: string;
  brief: string;
  isOverview: boolean;
  saved: Record<string, SavedSection>;
  quiz: QuizQuestion[];
}

export interface ModuleContent {
  topic: TopicLabTopic;
  pages: PageContent[];
}

/** Reads, once, everything the lab has saved for a module: the AI-written sections and the quiz of each page. */
export async function loadModuleContent(
  source: LabModuleSource,
  topic: TopicLabTopic
): Promise<ModuleContent> {
  const { lab } = source;
  const specs = [
    { id: '', name: topic.name, brief: topic.brief, isOverview: true },
    ...topic.subtopics.map((s) => ({ id: s.id, name: s.name, brief: s.brief, isOverview: false })),
  ];
  const pages = await Promise.all(
    specs.map(async (spec): Promise<PageContent> => {
      const [saved, quiz] = await Promise.all([
        fetchSavedSections(lab, topic.id, spec.id).catch((): Record<string, SavedSection> => ({})),
        fetchSavedQuiz(lab, topic.id, spec.id).catch((): QuizQuestion[] => []),
      ]);
      return {
        subtopicId: spec.id,
        name: spec.name,
        brief: spec.brief,
        isOverview: spec.isOverview,
        saved,
        quiz,
      };
    })
  );
  return { topic, pages };
}

/** What the import would create for a module with these options. Pure: no requests. */
export function planModuleImport(
  source: LabModuleSource,
  content: ModuleContent,
  options: ImportOptions
): ModulePlan {
  const { config } = source;
  const { topic } = content;
  const defs = importableSections(source).filter((def) => options.sectionIds.includes(def.id));

  const pages = content.pages.map((page): PlannedPage => {
    const sections: PlannedSection[] = [];
    for (const def of defs) {
      const stored = page.saved[def.id]?.content?.trim();
      if (stored) {
        sections.push({ def, kind: 'saved', markdown: stored });
        continue;
      }
      // A template belongs to the topic, so only the topic's own page takes it (else every subtopic would repeat it).
      if (options.useTemplates && page.isOverview && !def.aiGenerated) {
        const template = templateSectionContent(config, topic, def.id).trim();
        if (template) {
          sections.push({ def, kind: 'template', markdown: template });
          continue;
        }
      }
      if (options.writeMissingWithAi) sections.push({ def, kind: 'ai', markdown: '' });
    }
    return {
      subtopicId: page.subtopicId,
      name: page.name,
      brief: page.brief,
      isOverview: page.isOverview,
      sections,
      quiz: options.includeQuiz ? page.quiz : [],
    };
  });

  // A subtopic with nothing to show would be an empty lesson; the topic's own page is always kept.
  const kept = pages.filter((p) => p.isOverview || p.sections.length > 0 || p.quiz.length > 0);
  const all = kept.flatMap((p) => p.sections);
  return {
    topic,
    pages: kept,
    counts: {
      lessons: kept.length,
      saved: all.filter((s) => s.kind === 'saved').length,
      template: all.filter((s) => s.kind === 'template').length,
      ai: all.filter((s) => s.kind === 'ai').length,
      quiz: kept.reduce((sum, p) => sum + p.quiz.length, 0),
    },
  };
}

const clip = (text: string, max: number) =>
  text.length > max ? `${text.slice(0, max - 1)}…` : text;

function lessonTitle(topic: TopicLabTopic, page: PlannedPage): string {
  return clip(page.isOverview ? `${topic.name} overview` : page.name, 200);
}

/** Runs `worker` over `items`, `limit` at a time. */
async function inPool<T>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<void>
): Promise<void> {
  let next = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const item = items[next++];
      await worker(item);
    }
  });
  await Promise.all(runners);
}

export async function runModuleImport(args: {
  source: LabModuleSource;
  plan: ModulePlan;
  targetClass: LmsClass;
  onProgress?: (progress: ImportProgress) => void;
  /** Checked between steps; the import stops and adds nothing if it returns true before the subject is created. */
  isCancelled?: () => boolean;
}): Promise<ImportResult> {
  const { source, plan, targetClass, onProgress, isCancelled } = args;
  const { lab, config } = source;
  const { topic } = plan;
  const warnings: string[] = [];

  const pending = plan.pages.flatMap((page) =>
    page.sections.filter((s) => s.kind === 'ai').map((section) => ({ page, section }))
  );
  // AI sections + preparing each page + the subject + adding each lesson.
  const total = pending.length + plan.pages.length * 2 + 1;
  let done = 0;
  const report = (label: string) => onProgress?.({ label, done, total });

  // 1. The sections the AI is asked to write, with the same instructions the lab page would send.
  if (pending.length > 0) {
    let settings: Record<string, SectionSettings> = {};
    try {
      settings = await fetchLabSettings(lab);
    } catch {
      /* the lab's built-in instructions are used */
    }
    await inPool(pending, AI_CONCURRENCY, async ({ page, section }) => {
      if (isCancelled?.()) return;
      const { def } = section;
      report(`Writing ${def.label} for ${page.name}`);
      try {
        const instructions = composeInstructions(
          def.guidance ?? '',
          settings[def.id] ?? NO_SETTINGS,
          settings[LAB_WIDE_SECTION] ?? NO_SETTINGS
        );
        const written = await generateSectionWithContext({
          lab,
          topic: { id: topic.id, name: topic.name, brief: topic.brief },
          subtopic: page.isOverview
            ? null
            : { id: page.subtopicId, name: page.name, brief: page.brief },
          section: {
            id: def.id,
            label: def.label,
            subtitle: def.subtitle,
            guidance: instructions.guidance,
          },
          standingContext: instructions.standingContext,
          mode: 'generate',
          context: '',
          existingContent: '',
        });
        section.markdown = written.content;
      } catch (err) {
        const reason = err instanceof Error ? err.message : 'unknown error';
        warnings.push(`${page.name}: ${def.label} was not written (${reason})`);
      }
      done += 1;
      report(`Wrote ${def.label} for ${page.name}`);
    });
  }
  if (isCancelled?.()) throw new Error('Import cancelled. Nothing was added to the class.');

  // 2. One HTML document per page.
  const documents: { page: PlannedPage; title: string; html: string }[] = [];
  for (const page of plan.pages) {
    const sections: LabLessonSection[] = [];
    for (const { def, markdown } of page.sections) {
      if (!markdown.trim()) continue;
      sections.push({
        id: def.id,
        label: def.label,
        subtitle: def.subtitle,
        html: await markdownToHtml(stripLeadingTitle(markdown, def.label)),
      });
    }
    const title = lessonTitle(topic, page);
    documents.push({
      page,
      title,
      html: buildLabLessonHtml({
        title,
        labName: source.catalog.label,
        chips: page.isOverview
          ? ['Overview', topic.category, topic.difficulty]
          : [topic.name, topic.category],
        brief: page.brief,
        sections,
        outline: page.isOverview
          ? topic.subtopics.map((s) => ({ name: s.name, brief: s.brief }))
          : undefined,
        quiz: page.quiz,
      }),
    });
    done += 1;
    report(`Prepared ${title}`);
  }

  // 3. The subject, then its lessons in order. If a lesson fails the subject is removed again, so a retry starts clean.
  report(`Creating ${topic.name} in ${targetClass.name}`);
  const subject = await lmsService.createSubject(targetClass.id, {
    name: clip(topic.name, 120),
    description: clip(topic.brief, 1000),
    accent_color: source.accent,
  });
  done += 1;

  const lessons: LmsLesson[] = [];
  try {
    for (const doc of documents) {
      report(`Adding ${doc.title}`);
      lessons.push(
        await lmsService.createLesson({
          class_id: targetClass.id,
          subject_id: subject.id,
          title: doc.title,
          generated_html: doc.html,
          summary: clip(doc.page.brief, 280),
          read_time_minutes: estimateReadMinutes(doc.html),
        })
      );
      done += 1;
    }
  } catch (err) {
    await lmsService.deleteSubject(subject.id).catch(() => undefined);
    const reason = err instanceof Error ? err.message : 'unknown error';
    throw new Error(`Could not add the lessons of ${config.labName} › ${topic.name}: ${reason}`);
  }

  // The user's own video links for the module's pages become the subject's videos (best effort: never fails the import).
  try {
    const pageIds = ['', ...topic.subtopics.map((st) => st.id)];
    const lists = await Promise.all(
      pageIds.map((id) => fetchLabPageVideos(lab, topic.id, id).catch(() => []))
    );
    const seen = new Set<string>();
    for (const video of lists.flat()) {
      if (seen.size >= 20 || seen.has(video.url)) continue;
      seen.add(video.url);
      await createLmsVideo('subject', subject.id, video.url, video.title).catch((err: unknown) => {
        warnings.push(
          `A video link was not copied (${err instanceof Error ? err.message : 'unknown error'})`
        );
      });
    }
  } catch {
    /* videos are an extra */
  }
  return { subject, lessons, warnings };
}

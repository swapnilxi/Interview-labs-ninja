export interface LmsClass {
  id: string;
  name: string;
  slug: string;
  description: string;
  ai_context?: string;
  icon?: string;
  is_system: number;
  subject_count: number;
  lesson_count: number;
  subjects?: LmsSubject[];
  direct_lessons?: LmsLesson[];
  created_at: string;
  updated_at: string;
}

/** A module or sublesson entry in a Project's implementation outline. Populated by
 * `POST /projects/{id}/plan` (modules) and `POST /projects/{id}/modules/{i}/breakdown`
 * (sublessons, on demand). `lesson_id` is set once that entry's lesson has been generated. */
export interface LmsProjectPlanItem {
  title: string;
  focus: string;
  /** User-supplied notes/findings/documents for this step, fed into its lesson generation. */
  context?: string;
  lesson_id: string | null;
  sublessons: LmsProjectPlanItem[];
}

export interface LmsSubject {
  id: string;
  class_id: string;
  name: string;
  slug: string;
  description: string;
  ai_context?: string;
  /** 'subject' (default, existing Class -> Subject -> Lessons flow) or 'project' (Class ->
   * Project -> AI-planned implementation modules, reusing this same row + lesson schema). */
  kind?: 'subject' | 'project';
  /** Project-only: the README/context the AI decomposes into implementation modules. */
  project_context?: string;
  /** Comma-joined names of every file the context was extracted from, if any (project's
   * project_context, or a subject's ai_context). */
  context_source_name?: string;
  /** Project-only: the AI-planned implementation module outline. */
  project_plan?: LmsProjectPlanItem[];
  /** AI-condensed version of this row's long-form context (project_context for a
   * project, ai_context for a subject). When present, generation prefers it over a raw
   * prefix of the full text -- see POST/DELETE /subjects/{id}/summarize-context. */
  context_summary?: string;
  order_index: number;
  lesson_count: number;
  lessons?: LmsLesson[];
  class?: LmsClass;
  class_name?: string;
  class_slug?: string;
  created_at: string;
  updated_at: string;
}

export interface LmsLesson {
  id: string;
  class_id: string;
  subject_id: string | null;
  title: string;
  slug: string;
  order_index: number;
  source_type: 'topic' | 'text' | 'file' | 'manual';
  source_content?: string;
  generated_html?: string;
  summary: string;
  read_time_minutes: number;
  class_name?: string;
  class_slug?: string;
  subject_name?: string | null;
  subject_slug?: string | null;
  /** sha256 of generated_html; send it back as base_hash when saving an edit. */
  content_hash?: string;
  /** Where this lesson's .html lives, relative to frontend/src/modules/ai-lms/classes/
   * ('' until the class-folder sync has written it). */
  file_path?: string;
  created_at: string;
  updated_at: string;
}

/** A class landing page: classes/<class>/landingpage.html, as the app renders it. */
export interface LmsLandingSection {
  id: string;
  source: 'manual' | 'ai';
  title: string;
  html: string;
}

export interface LmsLandingSaved extends LmsLanding {
  sections: LmsLandingSection[];
}

export interface LmsLandingAiResult {
  html: string;
  base_hash: string;
  section_id: string | null;
  mode: 'generate' | 'edit' | 'section';
}

export interface LmsLanding {
  class_id: string;
  class_slug: string;
  html: string;
  hash: string;
  /** Relative to the classes folder, e.g. "computer-vision/landingpage.html". */
  file_path: string;
  /** False when there is no classes folder (e.g. a backend-only deploy): DB copy only. */
  file_sync: boolean;
}

/** Response of the lesson / landing status endpoints used by the dev auto-refresh. */
export interface LmsContentStatus {
  content_hash: string;
  file_sync: boolean;
}

/** What a classes-folder path points at (GET /api/lms/resolve-path). */
export interface LmsPathTarget {
  kind: 'class' | 'landing' | 'subject' | 'lesson';
  class_slug: string;
  subject_slug?: string | null;
  lesson_id?: string;
  lesson_slug?: string;
}

export interface LmsSiblingLesson {
  id: string;
  slug: string;
  title: string;
  order_index: number;
}

export interface LmsNavigation {
  current_index: number;
  total_lessons: number;
  previous: LmsSiblingLesson | null;
  next: LmsSiblingLesson | null;
}

export interface ContinueLearningItem {
  lesson_id: string;
  lesson_title: string;
  lesson_slug: string;
  class_id: string;
  class_name: string;
  class_slug: string;
  subject_id: string | null;
  subject_name: string | null;
  subject_slug: string | null;
  current_index: number;
  total_lessons: number;
}

export interface GenerateLessonRequest {
  class_id: string;
  subject_id?: string | null;
  input_type: 'topic' | 'text' | 'file';
  content: string;
  title?: string;
}

export interface LmsSearchResult {
  query: string;
  classes: LmsClass[];
  subjects: (LmsSubject & { class_name?: string; class_slug?: string })[];
  lessons: (LmsLesson & {
    class_name?: string;
    class_slug?: string;
    subject_name?: string | null;
    subject_slug?: string | null;
  })[];
}

export interface VisualExplanationResult {
  visual_type: string;
  title: string;
  explanation: string;
  visual_html: string;
}

export interface EasyReadResult {
  title: string;
  summary: string;
  easy_read_html: string;
}

export interface DeeperExplanationResult {
  title: string;
  summary: string;
  deeper_html: string;
}

export interface BreakdownResult {
  title: string;
  summary: string;
  chunk_count?: number;
  breakdown_html: string;
}

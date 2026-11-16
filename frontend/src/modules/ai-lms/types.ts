export interface LmsClass {
  id: string;
  name: string;
  slug: string;
  description: string;
  ai_context?: string;
  icon?: string;
  accent_color?: string;
  is_system: number;
  subject_count: number;
  lesson_count: number;
  subjects?: LmsSubject[];
  direct_lessons?: LmsLesson[];
  created_at: string;
  updated_at: string;
}

export interface LmsInstructor {
  id: string;
  name: string;
  slug: string;
  type: 'real' | 'ai';
  title: string;
  bio: string;
  email?: string;
  avatar?: string;
  expertise: string[];
  learning_style?: string;
  learning_style_prompt?: string;
  ai_persona?: string;
  ai_chatbot_enabled?: number | boolean;
  rating?: number;
  assigned_class_ids?: string[];
  assigned_classes?: { id: string; name: string; slug: string; icon?: string }[];
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
  /** Video links of this module or sub-step (PUT .../videos; the outline carries them, so they move with the entry). */
  videos?: { url: string; title: string }[];
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
  accent_color?: string;
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

/** The AI LMS module-root landing page (classes/landingpage.html): the home/intro page,
 * not tied to any one class. Same shape as LmsLanding minus the class identity fields. */
export interface LmsModuleLanding {
  html: string;
  hash: string;
  file_path: string;
  file_sync: boolean;
}

export interface LmsModuleLandingSaved extends LmsModuleLanding {
  sections: LmsLandingSection[];
}

/** What LandingEditorPanel needs from either a class or the module-root landing page. */
export interface LandingEditorApi<T extends { html: string; hash: string }> {
  listSections: () => Promise<{ hash: string; sections: LmsLandingSection[] }>;
  saveLanding: (html: string, baseHash?: string) => Promise<T>;
  addSection: (payload: {
    title: string;
    body_html: string;
    after_section_id?: string;
    position?: 'start' | 'end';
  }) => Promise<T>;
  updateSection: (id: string, payload: { html?: string; move?: 'up' | 'down' }) => Promise<T>;
  deleteSection: (id: string) => Promise<T>;
  landingAi: (
    instruction: string,
    mode: 'generate' | 'edit' | 'section',
    placement?: { after_section_id?: string } | { position: 'start' | 'end' }
  ) => Promise<LmsLandingAiResult>;
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
  completed?: boolean;
  next_lesson?: {
    id: string;
    title: string;
    slug: string;
  } | null;
  read_time_minutes?: number;
  last_viewed_at?: string | null;
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

// ── Class membership and class updates (announcements). See backend/modules/ai_lms/updates.py. ──

/** `enrolled` = joined the class; `interested` = turned on its practice reminders without joining. */
export type LmsMembershipStatus = 'enrolled' | 'interested';

/** `class` reaches the people of one class; `ai-lms` reaches everyone who is in any class. */
export type LmsUpdateScope = 'class' | 'ai-lms';

/** GET / PUT / DELETE /api/lms/classes/{class}/membership: the caller's place in a class and who else is in it. */
export interface LmsMembership {
  status: LmsMembershipStatus | null;
  enrolled_count: number;
  interested_count: number;
  /** enrolled + interested: the people a class update reaches. */
  member_count: number;
  /** People in any class: who a module-wide update reaches. */
  module_member_count: number;
  /** The two counts above without the caller: what an update *they* send would reach. */
  audience_count: number;
  module_audience_count: number;
}

/** One update an instructor or admin sent from a class (GET /api/lms/classes/{class}/notifications). */
export interface LmsSentUpdate {
  id: string;
  title: string;
  body: string;
  link: string;
  scope: LmsUpdateScope;
  created_at: string;
  sender_name: string;
  recipient_count: number;
}

/** POST /api/lms/classes/{class}/notifications. `push` counts device pushes the server accepted (Next.js layer only). */
export interface LmsUpdateResult {
  id: string;
  scope: LmsUpdateScope;
  recipients: number;
  push: { web: number; android: number };
}

/** One update in the caller's own inbox (GET /api/lms/notifications). `cursor` is what to pass as `after` next time. */
export interface LmsInboxItem {
  cursor: number;
  id: string;
  scope: LmsUpdateScope;
  class_slug: string | null;
  class_name: string | null;
  title: string;
  body: string;
  link: string;
  created_at: string;
  sender_name: string;
}

export interface LmsInbox {
  items: LmsInboxItem[];
  cursor: number;
}

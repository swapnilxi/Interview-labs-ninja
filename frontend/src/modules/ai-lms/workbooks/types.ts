/**
 * AI Interactive Workbooks: the shapes the workbook endpoints answer with (backend/modules/ai_lms/workbooks.py and its
 * twin fe-apis/lms/workbooks.ts). A workbook is a template (shared) plus each learner's private progress.
 */

export type WorkbookVisibility = 'private' | 'class';
export type WorkbookStatus = 'draft' | 'published' | 'archived';

export interface WorkbookSummary {
  id: string;
  class_id: string;
  title: string;
  description: string;
  icon: string;
  source_name: string;
  visibility: WorkbookVisibility;
  status: WorkbookStatus;
  template_version: number;
  section_count: number;
  estimated_minutes: number | null;
  is_owner: boolean;
  can_edit: boolean;
  /** The caller's own progress; null until they start the workbook. Never anyone else's. */
  my_progress: { percent: number; last_accessed_at: string } | null;
  created_at: string;
  updated_at: string;
}

// ── The generated template (backend/modules/ai_lms/workbook_gen.py describes it; the server cleans every field) ──

export interface QuizQuestionBase {
  id: string;
  prompt: string;
  explanation: string;
}
export type QuizQuestion =
  | (QuizQuestionBase & { kind: 'mcq'; options: string[]; answer: number })
  | (QuizQuestionBase & { kind: 'scenario'; scenario: string; options: string[]; answer: number })
  | (QuizQuestionBase & { kind: 'true_false'; answer: boolean })
  | (QuizQuestionBase & { kind: 'fill_blank'; answer: string; accept: string[] })
  | (QuizQuestionBase & { kind: 'matching'; pairs: Array<{ left: string; right: string }> });

export type WorkbookBlock =
  | { id: string; type: 'reading'; title: string; body: string }
  | { id: string; type: 'key_points'; title: string; items: string[] }
  | { id: string; type: 'reflection' | 'short_answer'; prompt: string; hint: string }
  | { id: string; type: 'checklist'; title: string; items: Array<{ id: string; text: string }> }
  | { id: string; type: 'planner'; title: string; fields: Array<{ id: string; label: string }> }
  | { id: string; type: 'habit_tracker'; habit: string; days: number; why: string }
  | {
      id: string;
      type: 'scale';
      prompt: string;
      min_label: string;
      max_label: string;
      max: 5 | 10;
    }
  | { id: string; type: 'action'; title: string; text: string }
  | { id: string; type: 'quiz'; title: string; questions: QuizQuestion[] };

export interface WorkbookSection {
  id: string;
  title: string;
  summary: string;
  goals: string[];
  minutes: number;
  /** The run of source parts the chapter was written from (1-based, inclusive). */
  from: number;
  to: number;
  status: 'pending' | 'ready';
  blocks: WorkbookBlock[];
}

export interface WorkbookContent {
  schema: number;
  summary: string;
  outcomes: string[];
  estimated_minutes: number;
  sections: WorkbookSection[];
}

export interface WorkbookDetail extends WorkbookSummary {
  class_slug: string;
  class_name: string;
  content: WorkbookContent | null;
  /** Only sent to someone who may edit the workbook. */
  source_text?: string;
  instructions?: string;
}

export interface WorkbookCreate {
  title: string;
  description?: string;
  icon?: string;
  source_name?: string;
  source_text: string;
  instructions?: string;
  visibility?: WorkbookVisibility;
}

export type WorkbookUpdate = Partial<WorkbookCreate> & { status?: WorkbookStatus };

/** Limits, the same as the server's (it re-checks them with its own texts). */
export const WORKBOOK_LIMITS = {
  title: 120,
  description: 1000,
  instructions: 4000,
  source: 1_000_000,
} as const;

// ── A learner's own progress (GET/PUT/DELETE /api/lms/workbooks/<id>/progress) ─────────────────────────────────

export interface ProgressSummary {
  percent: number;
  done: number;
  total: number;
}

export interface ProgressView {
  workbook_id: string;
  /** The learner's own document (progress.ts reads it). */
  state: Record<string, unknown>;
  /** What the next save must quote; 0 before the first save. */
  version: number;
  template_version: number;
  summary: ProgressSummary;
  started_at: string | null;
  last_accessed_at: string | null;
}

/** One row of an instructor's learner list: never any answers. */
export interface LearnerRow extends ProgressSummary {
  user_id: number;
  name: string;
  started_at: string;
  last_accessed_at: string;
}

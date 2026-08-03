/**
 * Shared types for the Career Studio feature. Mirrors the backend
 * career_studio module's JSON shapes (raw objects, no {data,meta} envelope).
 */

export type SectionType =
  | 'personal_info'
  | 'summary'
  | 'experience'
  | 'education'
  | 'skills'
  | 'projects'
  | 'certifications'
  | 'awards'
  | 'achievements'
  | 'research'
  | 'languages'
  | 'volunteer'
  | 'custom';

export interface ResumeSection {
  id: string;
  version_id: string;
  master_id: string;
  section_type: SectionType | string;
  title: string | null;
  content: any;
  sort_order: number;
  is_hidden: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface Resume {
  id: string;
  title: string;
  current_version_id: string | null;
  current_draft_id: string;
  sections: ResumeSection[];
  section_count?: number;
  version_count?: number;
  created_at?: string;
  updated_at?: string;
}

export interface ResumeVersion {
  id: string;
  master_id: string;
  parent_version_id: string | null;
  branch_name: string | null;
  label: string | null;
  is_immutable: boolean;
  is_draft: boolean;
  source: string;
  section_count?: number;
  created_at: string;
  sections?: Array<Partial<ResumeSection>>;
}

export interface AnalysisReport {
  overall_score?: number;
  ats_score?: number;
  grammar_score?: number;
  readability_score?: number;
  achievement_score?: number;
  impact_score?: number;
  action_verb_score?: number;
  formatting_score?: number;
  technical_skills_score?: number;
  soft_skills_score?: number;
  keyword_match?: { matched?: string[]; missing?: string[] };
  resume_length?: string;
  missing_skills?: Array<{ text?: string; suggestion?: string }>;
  missing_sections?: Array<{ text?: string; suggestion?: string }>;
  weak_bullets?: Array<{ text?: string; suggestion?: string }>;
  passive_voice_instances?: Array<{ text?: string; suggestion?: string }>;
  repetitive_words?: Array<{ text?: string; suggestion?: string }>;
  cliches?: Array<{ text?: string; suggestion?: string }>;
  red_flags?: Array<{ text?: string; suggestion?: string }>;
  summary?: string;
  top_suggestions?: Array<{ title?: string; severity?: string; explanation?: string; suggested_rewrite?: string }>;
  [key: string]: any;
}

export interface AnalysisRecord {
  id: string;
  resume_version_id: string;
  master_id?: string;
  report: AnalysisReport;
  overall_score: number | null;
  ats_score: number | null;
  created_at: string;
}

/** Section kinds a user can add, with friendly labels + icons (Heroicons v2 names). */
export const SECTION_LIBRARY: { type: SectionType; label: string; icon: string }[] = [
  { type: 'summary', label: 'Summary', icon: 'DocumentTextIcon' },
  { type: 'experience', label: 'Experience', icon: 'BriefcaseIcon' },
  { type: 'projects', label: 'Projects', icon: 'RocketLaunchIcon' },
  { type: 'education', label: 'Education', icon: 'AcademicCapIcon' },
  { type: 'skills', label: 'Skills', icon: 'WrenchScrewdriverIcon' },
  { type: 'certifications', label: 'Certifications', icon: 'CheckBadgeIcon' },
  { type: 'awards', label: 'Awards', icon: 'TrophyIcon' },
  { type: 'achievements', label: 'Achievements', icon: 'StarIcon' },
  { type: 'research', label: 'Research', icon: 'BeakerIcon' },
  { type: 'languages', label: 'Languages', icon: 'LanguageIcon' },
  { type: 'volunteer', label: 'Volunteer', icon: 'HeartIcon' },
  { type: 'custom', label: 'Custom', icon: 'PlusCircleIcon' },
];

export const SECTION_LABELS: Record<string, string> = {
  personal_info: 'Personal Info',
  ...Object.fromEntries(SECTION_LIBRARY.map((s) => [s.type, s.label])),
};

// ── Portfolio ─────────────────────────────────────────────────────────────────

export type WidgetType =
  | 'hero'
  | 'about'
  | 'projects'
  | 'experience'
  | 'education'
  | 'skills'
  | 'gallery'
  | 'testimonials'
  | 'stats'
  | 'contact'
  | 'custom';

export interface PortfolioTheme {
  accent: string; // violet | emerald | blue | rose | amber | slate
  font: string; // sans | serif
  layout: string; // stack
}

export interface PortfolioWidget {
  id: string;
  version_id: string;
  master_id: string;
  widget_type: WidgetType | string;
  title: string | null;
  content: any;
  sort_order: number;
  is_hidden: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface Portfolio {
  id: string;
  title: string;
  current_version_id: string | null;
  current_draft_id: string;
  theme: PortfolioTheme;
  widgets: PortfolioWidget[];
  widget_count?: number;
  version_count?: number;
  created_at?: string;
  updated_at?: string;
}

export interface PortfolioVersion {
  id: string;
  master_id: string;
  parent_version_id: string | null;
  branch_name: string | null;
  label: string | null;
  is_immutable: boolean;
  is_draft: boolean;
  source: string;
  widget_count?: number;
  created_at: string;
  widgets?: Array<Partial<PortfolioWidget>>;
}

export const WIDGET_LIBRARY: { type: WidgetType; label: string; icon: string }[] = [
  { type: 'hero', label: 'Hero', icon: 'SparklesIcon' },
  { type: 'about', label: 'About', icon: 'UserIcon' },
  { type: 'projects', label: 'Projects', icon: 'RocketLaunchIcon' },
  { type: 'experience', label: 'Experience', icon: 'BriefcaseIcon' },
  { type: 'education', label: 'Education', icon: 'AcademicCapIcon' },
  { type: 'skills', label: 'Skills', icon: 'WrenchScrewdriverIcon' },
  { type: 'gallery', label: 'Gallery', icon: 'PhotoIcon' },
  { type: 'testimonials', label: 'Testimonials', icon: 'ChatBubbleLeftRightIcon' },
  { type: 'stats', label: 'Stats', icon: 'ChartBarIcon' },
  { type: 'contact', label: 'Contact', icon: 'EnvelopeIcon' },
  { type: 'custom', label: 'Custom', icon: 'PlusCircleIcon' },
];

export const WIDGET_LABELS: Record<string, string> = Object.fromEntries(WIDGET_LIBRARY.map((w) => [w.type, w.label]));

export const ACCENTS: { id: string; label: string; dot: string }[] = [
  { id: 'violet', label: 'Violet', dot: 'bg-violet-500' },
  { id: 'emerald', label: 'Emerald', dot: 'bg-emerald-500' },
  { id: 'blue', label: 'Blue', dot: 'bg-blue-500' },
  { id: 'rose', label: 'Rose', dot: 'bg-rose-500' },
  { id: 'amber', label: 'Amber', dot: 'bg-amber-500' },
  { id: 'slate', label: 'Slate', dot: 'bg-slate-500' },
];

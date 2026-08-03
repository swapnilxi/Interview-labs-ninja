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

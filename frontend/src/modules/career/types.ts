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
  | 'publications'
  | 'interests'
  | 'patents'
  | 'career_goals'
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
  template_key?: string | null;
  is_profile?: boolean;
  is_archived?: boolean;
  origin?: string | null;
  description?: string | null;
  primary_role?: string | null;
  experience_level?: string | null;
  target_industry?: string | null;
  target_roles?: string[];
  target_companies?: string[];
  tech_stack?: string[];
  tags?: string[];
  confidence_score?: number | null;
  last_used_at?: string | null;
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
  // section_id/content present only when this fix maps cleanly to one section
  // (same shape as a TailorChange) — lets the UI offer a one-click Apply that
  // writes straight back via viewsService.applyTailor.
  top_suggestions?: Array<{ title?: string; severity?: string; explanation?: string; suggested_rewrite?: string; section_id?: string; content?: any }>;
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

// ── Master Profiles + live template-driven views ────────────────────────────────

/** A Master Profile is a Resume tree with is_profile=1 (reusable data source). */
export type Profile = Resume;

/** A single section as returned by the profile-import preview / accepted by import. */
export interface ImportedSection {
  section_type: string;
  title: string;
  content: any;
  is_hidden?: boolean;
  sort_order?: number;
}

export interface ProfileImportPreview {
  sections: ImportedSection[];
  count: number;
  mapping_notes: string[];
}

/**
 * Where a profile import pulls its sections from. Exactly one of the payload
 * fields is used, matching `source`: 'resume' → resume_id, 'json' → sections,
 * 'text' → raw_text (AI-parsed).
 */
export type ProfileImportSource =
  | { source: 'resume'; resume_id: string }
  | { source: 'json'; sections: ImportedSection[] }
  | { source: 'text'; raw_text: string };

// ── Profile Enrichment: merge another document into an EXISTING profile, with
// AI-assisted duplicate/conflict detection (distinct from plain import, which
// trusts the source wholesale). `kind` is a label for both the UI and the
// source-attribution tag stored on the sections it touches.
export type EnrichmentKind =
  | 'resume' | 'certificates' | 'research_papers' | 'project_documentation'
  | 'github_readme' | 'linkedin_export' | 'context' | 'json'
  | 'experience_letter' | 'offer_letter' | 'transcript' | 'multiple';

export interface EnrichmentAddition {
  section_type: string;
  title?: string | null;
  content: any;
  rationale?: string;
  confidence?: number;
}

export interface EnrichmentDuplicate {
  existing_section_id: string;
  incoming_summary?: string;
  reason?: string;
  confidence?: number;
}

export interface EnrichmentConflict {
  existing_section_id: string;
  existing_summary?: string;
  incoming_summary?: string;
  incoming_content: any;
  suggested_content: any;
  rationale?: string;
  confidence?: number;
}

export interface EnrichmentPreview {
  additions: EnrichmentAddition[];
  duplicates: EnrichmentDuplicate[];
  conflicts: EnrichmentConflict[];
}

export interface EnrichmentApplyResult {
  profile: Resume;
  added: number;
  resolved: number;
}

export type ViewKind = 'resume' | 'portfolio';

export interface CareerViewConfigItem {
  section_id: string;
  hidden: boolean;
}

/** A resume/portfolio "view" — a live, template-driven rendering of a profile. */
export interface CareerView {
  id: string;
  profile_id: string;
  kind: ViewKind;
  title: string;
  template?: string | null;
  accent?: string | null;
  font?: string | null;
  layout?: string | null;
  config?: { items: CareerViewConfigItem[] };
  profile_title?: string | null;
  /** Resolved profile sections (with a per-view `hidden` flag), in display order. */
  sections?: Array<ResumeSection & { hidden: boolean }>;
  section_count?: number;
  created_at?: string;
  updated_at?: string;
}

export interface GapAnalysis {
  fit_score: number;
  matched_skills: string[];
  missing_skills: string[];
  missing_certifications: string[];
  ats_keywords_missing: string[];
  experience_gap: string;
  recommendations: string[];
}

/** Result of generating a job-tailored resume from a profile + a job target. */
export interface GenerateResumeResult {
  view: CareerView;
  profile_id: string;
  summary?: string | null;
  keywords_added?: string[];
  sections_tailored?: number;
  new_sections_added?: string[];
  gap_analysis?: GapAnalysis | null;
  job?: JobDescription | null;
}

// ── Job descriptions + JD tailoring ─────────────────────────────────────────────

/** A structured Job Profile extraction — returned by the preview-only /career/jobs/extract endpoint. */
export interface JobExtraction {
  title: string | null;
  company: string | null;
  location: string | null;
  employment_type: string | null;
  experience_level: string | null;
  education: string | null;
  salary: string | null;
  required_skills: string[];
  preferred_skills: string[];
  responsibilities: string[];
  benefits: string[];
  certifications: string[];
  confidence: number;
}

export interface JobDescription {
  id: string;
  title: string | null;
  company: string | null;
  url: string | null;
  raw_text: string;
  created_at: string;
  updated_at: string;
  location?: string | null;
  employment_type?: string | null;
  experience_level?: string | null;
  education?: string | null;
  salary?: string | null;
  required_skills?: string[];
  preferred_skills?: string[];
  responsibilities?: string[];
  benefits?: string[];
  certifications?: string[];
  extraction_confidence?: number | null;
}

export interface TailorChange {
  section_id: string;
  section_type: string;
  title: string | null;
  before_text: string;
  after_text: string;
  content: any;
  rationale?: string | null;
}

export interface TailorProposal {
  summary?: string | null;
  keywords_added?: string[];
  changes: TailorChange[];
  job: JobDescription | null;
}

export interface TailorApplyResult {
  mode: 'copy' | 'in_place';
  applied: number;
  resume: Resume;
}

/** Result of applying a tailor proposal to a view (content writes back to the profile). */
export interface ViewTailorApplyResult {
  mode: 'new_profile' | 'in_place';
  applied: number;
  profile_id: string;
  view_id: string;
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
  { type: 'publications', label: 'Publications', icon: 'BookOpenIcon' },
  { type: 'interests', label: 'Interests', icon: 'FaceSmileIcon' },
  { type: 'patents', label: 'Patents', icon: 'LightBulbIcon' },
  { type: 'career_goals', label: 'Career Goals', icon: 'FlagIcon' },
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
  layout: string; // stack | centered | card
  template?: string; // visual style: minimal | isometric | aurora | blueprint
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

export interface PublishStatus {
  slug: string;
  master_id: string;
  title: string | null;
  view_count: number;
  is_public: boolean;
  created_at: string;
  updated_at: string;
  kind?: 'portfolio' | 'resume';
}

export interface PublicPortfolio {
  slug: string;
  master_id: string;
  title: string | null;
  widgets: PortfolioWidget[];
  theme: PortfolioTheme;
  view_count: number;
  is_public: boolean;
}

/** Public read of a published resume view (/r/{slug}) — pre-rendered HTML,
 * same as the authenticated export, dropped into an iframe. */
export interface PublicResume {
  slug: string;
  title: string | null;
  html: string;
  view_count: number;
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

/** Distinct visual portfolio templates (decorative background + card treatment). */
export const PORTFOLIO_STYLE_TEMPLATES: { id: string; name: string; desc: string }[] = [
  { id: 'minimal', name: 'Minimal', desc: 'Clean light, solid cards' },
  { id: 'isometric', name: 'Isometric', desc: '3D isometric cube pattern' },
  { id: 'aurora', name: 'Aurora', desc: 'Soft gradient-mesh glow' },
  { id: 'blueprint', name: 'Blueprint', desc: 'Accent grid, technical look' },
  { id: 'dots', name: 'Dots', desc: 'Accent polka-dot field' },
  { id: 'mesh', name: 'Mesh', desc: 'Vibrant multi-colour gradient' },
  { id: 'carbon', name: 'Carbon', desc: 'Subtle diagonal hatch, crisp cards' },
];

export const ACCENTS: { id: string; label: string; dot: string }[] = [
  { id: 'violet', label: 'Violet', dot: 'bg-violet-500' },
  { id: 'emerald', label: 'Emerald', dot: 'bg-emerald-500' },
  { id: 'blue', label: 'Blue', dot: 'bg-blue-500' },
  { id: 'rose', label: 'Rose', dot: 'bg-rose-500' },
  { id: 'amber', label: 'Amber', dot: 'bg-amber-500' },
  { id: 'slate', label: 'Slate', dot: 'bg-slate-500' },
];

export const ACCENT_HEX: Record<string, string> = {
  violet: '#7c3aed', emerald: '#059669', blue: '#2563eb', rose: '#e11d48', amber: '#d97706', slate: '#334155',
};

// ── User-designed templates (Template Designer & Manager) ───────────────────────
//
// A template's `spec` is a structured set of visual knobs the designer edits;
// the backend (render.py) compiles it to PDF-safe CSS. Shapes mirror
// backend/modules/career_studio/template_presets.py.

export type FontChoice = 'serif' | 'sans' | 'mono';

export interface ResumeHeadingSpec {
  color: 'ink' | 'accent' | 'muted';
  rule: 'none' | 'under' | 'leftbar';
  align: 'left' | 'center';
  font?: FontChoice;
  uppercase: boolean;
  spacing: 'normal' | 'wide';
}

export interface ResumeTemplateSpec {
  font: FontChoice;
  nameFont?: FontChoice;
  accent: string;
  density: 'compact' | 'normal' | 'relaxed';
  headerAlign: 'left' | 'center';
  headerStyle: 'plain' | 'rule' | 'band' | 'sidebar';
  nameColor: 'ink' | 'accent';
  heading: ResumeHeadingSpec;
}

export interface PortfolioTemplateSpec {
  font: 'sans' | 'serif';
  accent: string;
  layout: 'stack' | 'centered' | 'card';
  background: string; // one of PORTFOLIO_STYLE_TEMPLATES ids
}

export type TemplateSpec = ResumeTemplateSpec | PortfolioTemplateSpec;

export interface CareerTemplate {
  id: string;
  kind: ViewKind;
  name: string;
  spec: any;
  source?: string | null;
  created_at?: string;
  updated_at?: string;
}

export const DEFAULT_RESUME_SPEC: ResumeTemplateSpec = {
  font: 'sans', accent: 'violet', density: 'normal', headerAlign: 'left', headerStyle: 'rule', nameColor: 'accent',
  heading: { color: 'accent', rule: 'under', align: 'left', uppercase: true, spacing: 'normal' },
};

export const DEFAULT_PORTFOLIO_SPEC: PortfolioTemplateSpec = {
  font: 'sans', accent: 'violet', layout: 'card', background: 'minimal',
};

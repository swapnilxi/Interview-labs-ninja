export type CareerServiceTab =
  | 'overview'
  | 'profiles'
  | 'jobfinder'
  | 'tracker'
  | 'analyzer'
  | 'generate'
  | 'match'
  | 'coverletters'
  | 'resumes'
  | 'portfolios'
  | 'templates';

export interface CareerServiceGroup {
  id: string;
  label: string;
  description: string;
}

export interface CareerServiceItem {
  id: string;
  tab: CareerServiceTab;
  title: string;
  badge: string;
  hint: string;
  description: string;
  icon: string;
  color: string;
  secondaryColor?: string;
  features: string[];
  actionLabel: string;
  category: 'document' | 'intelligence' | 'showcase';
}

export const CAREER_SERVICE_GROUPS: readonly CareerServiceGroup[] = [
  {
    id: 'foundation',
    label: 'Profile & Document Hub',
    description: 'Build your single source of truth, generate polished resumes, and craft tailored cover letters.',
  },
  {
    id: 'intelligence',
    label: 'AI Intelligence & Optimization',
    description: 'Score against ATS parsers, match target job requirements, and generate tailored applications.',
  },
  {
    id: 'showcase',
    label: 'Web Showcase & Visual Design',
    description: 'Publish live interactive web portfolios and design bespoke layout and styling presets.',
  },
];

export const CAREER_SERVICES: readonly CareerServiceItem[] = [
  // Suite 1: Profile & Document Hub
  {
    id: 'profiles',
    tab: 'profiles',
    category: 'document',
    title: 'Data Profiles',
    badge: 'Foundation',
    hint: 'Master Career Records',
    description:
      'Your single source of truth for work experience, skills, education, and portfolio projects. Import from LinkedIn, PDF resumes, or JSON — every resume and portfolio updates automatically.',
    icon: 'IdentificationIcon',
    color: '#3B82F6',
    secondaryColor: '#60A5FA',
    features: ['LinkedIn & PDF Import', 'Single Source of Truth', 'Real-Time Sync'],
    actionLabel: 'Open Profiles',
  },
  {
    id: 'resumes',
    tab: 'resumes',
    category: 'document',
    title: 'Resumes Workspace',
    badge: 'Core Studio',
    hint: 'Multi-Version Document Studio',
    description:
      'Create and manage targeted resumes across 10+ professional layout themes. Live-linked to your profiles with one-click export to PDF, Word (DOCX), HTML, and Markdown.',
    icon: 'DocumentTextIcon',
    color: '#6366F1',
    secondaryColor: '#818CF8',
    features: ['10+ Professional Templates', 'PDF & DOCX Export', 'Live Visual Preview'],
    actionLabel: 'Open Resumes',
  },
  {
    id: 'coverletters',
    tab: 'coverletters',
    category: 'document',
    title: 'Cover Letter Studio',
    badge: 'Narrative',
    hint: 'Targeted Pitch Letters',
    description:
      'Draft persuasive, role-tailored cover letters that connect your background directly to job requirements. Adjust persuasion angles, tone of voice, and narrative depth.',
    icon: 'EnvelopeIcon',
    color: '#8B5CF6',
    secondaryColor: '#A78BFA',
    features: ['Job-Tailored Pitch', 'Tone Calibration', 'One-Click Download'],
    actionLabel: 'Open Cover Letters',
  },

  {
    id: 'tracker',
    tab: 'tracker',
    category: 'intelligence',
    title: 'Job & People Tracker',
    badge: 'Pipeline',
    hint: 'Applications & Network',
    description:
      'Track every application and the people behind them. Switch between a drag-and-drop Kanban board, an Excel-like table, a compact list and a date timeline — your filters stay put.',
    icon: 'ViewColumnsIcon',
    color: '#6366F1',
    secondaryColor: '#A5B4FC',
    features: ['Kanban / Table / List / Timeline', 'Drag to Change Stage', 'Deadlines & Follow-ups'],
    actionLabel: 'Open Tracker',
  },

  // Suite 2: AI Intelligence & Optimization
  {
    id: 'jobfinder',
    tab: 'jobfinder',
    category: 'intelligence',
    title: 'AI Job Finder',
    badge: 'Agentic Search',
    hint: 'Autonomous Job Discovery',
    description:
      'Autonomous UI agent that searches live company career portals and the web for matching roles. Features a 10-job daily curated feed plus on-demand deep scouting with 1-click ATS resume tailoring.',
    icon: 'MagnifyingGlassIcon',
    color: '#0EA5E9',
    secondaryColor: '#38BDF8',
    features: ['10 Daily Curated Leads', 'Live Web Search Agent', '1-Click ATS Tailor & Apply'],
    actionLabel: 'Launch Job Finder',
  },
  {
    id: 'analyzer',
    tab: 'analyzer',
    category: 'intelligence',
    title: 'Resume Analyzer',
    badge: 'ATS Scoring',
    hint: 'Quality & Impact Audit',
    description:
      'Deep audit against modern Applicant Tracking Systems. Evaluate metric quantification, power verb usage, brevity, and section completeness with actionable rewrite suggestions.',
    icon: 'MagnifyingGlassCircleIcon',
    color: '#10B981',
    secondaryColor: '#34D399',
    features: ['0–100 ATS Score', 'Impact Verb Detection', 'Section-by-Section Fixes'],
    actionLabel: 'Run Analysis',
  },
  {
    id: 'match',
    tab: 'match',
    category: 'intelligence',
    title: 'Job Matcher & Gap Analysis',
    badge: 'Role Fit',
    hint: 'Alignment & Skill Detection',
    description:
      'Paste any job description or listing URL to calculate match percentage, surface missing hard & soft skills, and receive targeted interview preparation recommendations.',
    icon: 'ScaleIcon',
    color: '#F59E0B',
    secondaryColor: '#FBBF24',
    features: ['Match Percentage %', 'Missing Keyword Map', 'Interview Readiness'],
    actionLabel: 'Match a Job',
  },
  {
    id: 'generate',
    tab: 'generate',
    category: 'intelligence',
    title: 'AI Resume Generator',
    badge: 'AI Tailoring',
    hint: 'One-Click Custom Tailoring',
    description:
      'Instantly generate a tailored, ATS-optimized resume directly from your master profile for a specific company and job title, emphasizing your most relevant achievements.',
    icon: 'SparklesIcon',
    color: '#EC4899',
    secondaryColor: '#F472B6',
    features: ['Target Company Customization', 'Optimized Bullet Points', 'Instant Creation'],
    actionLabel: 'Generate Resume',
  },

  // Suite 3: Web Showcase & Visual Design
  {
    id: 'portfolios',
    tab: 'portfolios',
    category: 'showcase',
    title: 'Interactive Portfolios',
    badge: 'Web Presence',
    hint: 'Public Online Showcase',
    description:
      'Create and publish interactive web portfolios with customizable widgets (Hero, Projects, Tech Stack, Timeline). Share live with a custom public URL (/p/username).',
    icon: 'GlobeAltIcon',
    color: '#14B8A6',
    secondaryColor: '#2DD4BF',
    features: ['Custom Public Link (/p/slug)', 'Modular Widget Palette', 'Testimonials & Feedback'],
    actionLabel: 'Open Portfolios',
  },
  {
    id: 'templates',
    tab: 'templates',
    category: 'showcase',
    title: 'Template Designer',
    badge: 'Design Lab',
    hint: 'Bespoke Styles & Layouts',
    description:
      'Visual styling studio to design and tweak custom resume and portfolio templates. Customize font pairings, margin scales, accent palettes, and CSS layouts with real-time preview.',
    icon: 'SwatchIcon',
    color: '#F43F5E',
    secondaryColor: '#FB7185',
    features: ['Visual Style Customizer', 'Font & Margin Tuning', 'Reusable Theme Presets'],
    actionLabel: 'Launch Designer',
  },
];

export function servicesInGroup(groupId: string): CareerServiceItem[] {
  const categoryMap: Record<string, CareerServiceItem['category']> = {
    foundation: 'document',
    intelligence: 'intelligence',
    showcase: 'showcase',
  };
  const category = categoryMap[groupId];
  return CAREER_SERVICES.filter((s) => s.category === category);
}

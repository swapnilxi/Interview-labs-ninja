import type { ComponentType, SVGProps } from 'react';
import {
  AcademicCapIcon,
  ArrowRightCircleIcon,
  BanknotesIcon,
  BookOpenIcon,
  BookmarkIcon,
  BoltIcon,
  BriefcaseIcon,
  CalendarDaysIcon,
  CameraIcon,
  CheckBadgeIcon,
  CheckCircleIcon,
  CheckIcon,
  ClipboardDocumentCheckIcon,
  ClipboardDocumentListIcon,
  ClockIcon,
  CommandLineIcon,
  CpuChipIcon,
  DocumentTextIcon,
  ExclamationTriangleIcon,
  FireIcon,
  FolderIcon,
  GlobeAmericasIcon,
  HeartIcon,
  HomeIcon,
  LightBulbIcon,
  MagnifyingGlassIcon,
  MapIcon,
  MoonIcon,
  QuestionMarkCircleIcon,
  QueueListIcon,
  SparklesIcon,
  StarIcon,
  EyeIcon,
  TrashIcon,
  TrophyIcon,
  UserGroupIcon,
  ArrowPathRoundedSquareIcon,
} from '@heroicons/react/24/solid';

type Glyph = ComponentType<SVGProps<SVGSVGElement>>;

/**
 * The To-Do UI's illustrative icons: one solid glyph per meaning, tinted with a colour that carries that meaning
 * (an SF Symbols-style system), and the same on every device (emoji are not — they change with the OS and cannot be
 * recoloured). Until 2026-11 these were react-icons' multicolour "Flat Color Icons"; the names and the stored
 * project icons ("fc:<name>") are unchanged.
 *
 * Components name what an icon MEANS (`star`, `idea`, `folder`), never the pictogram, so the mapping lives in
 * one place. Use `Icon` (components/ui/AppIcon, the outline Heroicons) for plain controls — chevrons, close,
 * plus, trash, arrows — which must follow the text colour; use this for the things emoji used to be.
 * Emoji remain only where the *user* picks one (a project's icon).
 */
const ICONS = {
  star: [StarIcon, 'text-amber-500 dark:text-amber-400'], // Top 20% / 80-20
  pin: [BookmarkIcon, 'text-orange-500 dark:text-orange-400'], // a manual pin
  brain: [CpuChipIcon, 'text-violet-500 dark:text-violet-400'], // Smart To-Do, brain dump
  idea: [LightBulbIcon, 'text-amber-500 dark:text-amber-300'], // an intention, an idea, an empty state
  quick: [BoltIcon, 'text-amber-500 dark:text-amber-400'], // Quick Daily, an action, "chunk it"
  folder: [FolderIcon, 'text-sky-500 dark:text-sky-400'], // a project, a topic
  roadmap: [MapIcon, 'text-teal-600 dark:text-teal-400'],
  plan: [ClipboardDocumentListIcon, 'text-indigo-500 dark:text-indigo-400'], // Plan & Project
  warning: [ExclamationTriangleIcon, 'text-orange-500 dark:text-orange-400'],
  ai: [SparklesIcon, 'lab-ink'],
  search: [MagnifyingGlassIcon, 'text-sky-600 dark:text-sky-400'], // explore, dive deeper
  explore: [EyeIcon, 'text-teal-600 dark:text-teal-400'],
  calendar: [CalendarDaysIcon, 'text-rose-500 dark:text-rose-400'],
  trash: [TrashIcon, 'text-slate-500 dark:text-slate-400'],
  delegate: [UserGroupIcon, 'text-sky-600 dark:text-sky-400'],
  dayPlan: [ClipboardDocumentCheckIcon, 'text-emerald-600 dark:text-emerald-400'],
  done: [CheckBadgeIcon, 'text-emerald-600 dark:text-emerald-400'], // definition of done
  notes: [DocumentTextIcon, 'text-slate-500 dark:text-slate-400'],
  details: [QueueListIcon, 'text-slate-500 dark:text-slate-400'],
  phase: [ArrowPathRoundedSquareIcon, 'text-indigo-500 dark:text-indigo-400'],
  trophy: [TrophyIcon, 'text-amber-500 dark:text-amber-400'],
  camera: [CameraIcon, 'text-slate-500 dark:text-slate-400'],
  night: [MoonIcon, 'text-indigo-500 dark:text-indigo-300'], // end of the day
  ok: [CheckCircleIcon, 'text-emerald-600 dark:text-emerald-400'], // all clear, completed
  question: [QuestionMarkCircleIcon, 'text-sky-600 dark:text-sky-400'],
  celebrate: [HeartIcon, 'text-pink-500 dark:text-pink-400'],
  check: [CheckIcon, 'text-emerald-600 dark:text-emerald-400'],
  clock: [ClockIcon, 'text-orange-500 dark:text-orange-400'],
  next: [ArrowRightCircleIcon, 'text-sky-600 dark:text-sky-400'],
  // Project icons (saved as "fc:<name>" on the project; see projects/ProjectIcon.tsx)
  briefcase: [BriefcaseIcon, 'text-amber-700 dark:text-amber-400'],
  home: [HomeIcon, 'text-sky-600 dark:text-sky-400'],
  study: [AcademicCapIcon, 'text-indigo-500 dark:text-indigo-400'],
  reading: [BookOpenIcon, 'text-orange-500 dark:text-orange-400'],
  fitness: [FireIcon, 'text-rose-500 dark:text-rose-400'],
  money: [BanknotesIcon, 'text-emerald-600 dark:text-emerald-400'],
  code: [CommandLineIcon, 'text-slate-600 dark:text-slate-300'],
  travel: [GlobeAmericasIcon, 'text-teal-600 dark:text-teal-400'],
} as const satisfies Record<string, readonly [Glyph, string]>;

export type FlatIconName = keyof typeof ICONS;

export function isFlatIconName(name: string): name is FlatIconName {
  return Object.prototype.hasOwnProperty.call(ICONS, name);
}

interface FlatIconProps {
  name: FlatIconName;
  size?: number;
  className?: string;
  /** Only when the icon stands alone and carries meaning. Next to text it is decorative and stays hidden. */
  label?: string;
}

export default function FlatIcon({ name, size = 16, className = '', label }: FlatIconProps) {
  const [Glyph, tone] = ICONS[name];
  return (
    <Glyph
      width={size}
      height={size}
      className={`shrink-0 ${tone} ${className}`}
      aria-hidden={label ? undefined : true}
      role={label ? 'img' : undefined}
      aria-label={label}
      focusable="false"
    />
  );
}

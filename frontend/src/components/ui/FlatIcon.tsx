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
  RectangleStackIcon,
  SparklesIcon,
  StarIcon,
  EyeIcon,
  TrashIcon,
  TrophyIcon,
  UserGroupIcon,
  ArrowPathRoundedSquareIcon,
  SpeakerWaveIcon,
  SpeakerXMarkIcon,
  MusicalNoteIcon,
  BellIcon,
  CloudIcon,
  MicrophoneIcon,
  ChatBubbleLeftRightIcon,
  FaceSmileIcon,
  FlagIcon,
  ArrowUpTrayIcon,
  ArrowsRightLeftIcon,
  ChartBarIcon,
  InboxIcon,
  LockClosedIcon,
  ShieldCheckIcon,
  PencilSquareIcon,
  CubeTransparentIcon,
  SunIcon,
  KeyIcon,
} from '@heroicons/react/24/solid';

type Glyph = ComponentType<SVGProps<SVGSVGElement>>;

/** Heroicons has no headphones; drawn here in the same solid 24px style. */
function HeadphonesGlyph(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" {...props}>
      <path d="M12 3a9 9 0 0 0-9 9v5.25A2.75 2.75 0 0 0 5.75 20h1.5c.69 0 1.25-.56 1.25-1.25v-5.5c0-.69-.56-1.25-1.25-1.25H4.6a7.4 7.4 0 0 1 14.8 0h-2.65c-.69 0-1.25.56-1.25 1.25v5.5c0 .69.56 1.25 1.25 1.25h1.5A2.75 2.75 0 0 0 21 17.25V12a9 9 0 0 0-9-9Z" />
    </svg>
  );
}

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
  // Daily Session (companion sounds and voices, the AI tutor, My Space)
  sound: [SpeakerWaveIcon, 'text-sky-600 dark:text-sky-400'],
  mute: [SpeakerXMarkIcon, 'text-slate-500 dark:text-slate-400'],
  music: [MusicalNoteIcon, 'text-violet-500 dark:text-violet-400'], // a drone / tone
  bell: [BellIcon, 'text-amber-500 dark:text-amber-400'],
  cloud: [CloudIcon, 'text-sky-500 dark:text-sky-300'], // calm
  mic: [MicrophoneIcon, 'text-rose-500 dark:text-rose-400'],
  chat: [ChatBubbleLeftRightIcon, 'text-teal-600 dark:text-teal-400'], // a tutor conversation
  smile: [FaceSmileIcon, 'text-amber-500 dark:text-amber-400'],
  headphones: [HeadphonesGlyph, 'text-slate-500 dark:text-slate-400'],
  target: [FlagIcon, 'text-rose-500 dark:text-rose-400'], // a goal, a dream role
  upload: [ArrowUpTrayIcon, 'text-sky-600 dark:text-sky-400'],
  shuffle: [ArrowsRightLeftIcon, 'text-indigo-500 dark:text-indigo-400'],
  chart: [ChartBarIcon, 'text-emerald-600 dark:text-emerald-400'], // progress
  inbox: [InboxIcon, 'text-slate-500 dark:text-slate-400'],
  lock: [LockClosedIcon, 'text-slate-500 dark:text-slate-400'], // private
  shield: [ShieldCheckIcon, 'text-emerald-600 dark:text-emerald-400'], // verified
  write: [PencilSquareIcon, 'text-indigo-500 dark:text-indigo-400'],
  design: [CubeTransparentIcon, 'text-teal-600 dark:text-teal-400'], // system design sketch
  sun: [SunIcon, 'text-amber-500 dark:text-amber-400'],
  key: [KeyIcon, 'text-amber-600 dark:text-amber-400'],
  cards: [RectangleStackIcon, 'text-violet-500 dark:text-violet-400'], // a deck of quick-read cards (SwipeLearn)
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

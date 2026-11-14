import type { IconType } from 'react-icons';
import {
  FcAdvance,
  FcAlarmClock,
  FcApproval,
  FcAssistant,
  FcBinoculars,
  FcBookmark,
  FcBriefcase,
  FcCalendar,
  FcCamera,
  FcCheckmark,
  FcCollaboration,
  FcCommandLine,
  FcDocument,
  FcEmptyTrash,
  FcFlashOn,
  FcFolder,
  FcGraduationCap,
  FcHighPriority,
  FcHome,
  FcIcons8Cup,
  FcIdea,
  FcLandscape,
  FcLike,
  FcMindMap,
  FcMoneyTransfer,
  FcNightLandscape,
  FcOk,
  FcPlanner,
  FcProcess,
  FcQuestions,
  FcRating,
  FcReading,
  FcSearch,
  FcSportsMode,
  FcTimeline,
  FcTodoList,
  FcViewDetails,
} from 'react-icons/fc';

/**
 * The To-Do UI's illustrative icons: flat, colourful, and the same on every device (emoji are not — they
 * change with the OS, cannot be recoloured, and one of them vanished in dark mode). Backed by react-icons'
 * "Flat Color Icons".
 *
 * Components name what an icon MEANS (`star`, `idea`, `folder`), never the pictogram, so the mapping lives in
 * one place. Use `Icon` (components/ui/AppIcon, the outline Heroicons) for plain controls — chevrons, close,
 * plus, trash, arrows — which must follow the text colour; use this for the things emoji used to be.
 * Emoji remain only where the *user* picks one (a project's icon).
 */
const ICONS = {
  star: FcRating, // Top 20% / 80-20
  pin: FcBookmark, // a manual pin
  brain: FcMindMap, // Smart To-Do, brain dump
  idea: FcIdea, // an intention, an idea, an empty state
  quick: FcFlashOn, // Quick Daily, an action, "chunk it"
  folder: FcFolder, // a project, a topic
  roadmap: FcTimeline,
  plan: FcPlanner, // Plan & Project
  warning: FcHighPriority,
  ai: FcAssistant,
  search: FcSearch, // explore, dive deeper
  explore: FcBinoculars,
  calendar: FcCalendar,
  trash: FcEmptyTrash,
  delegate: FcCollaboration,
  dayPlan: FcTodoList,
  done: FcApproval, // definition of done
  notes: FcDocument,
  details: FcViewDetails,
  phase: FcProcess,
  trophy: FcIcons8Cup,
  camera: FcCamera,
  night: FcNightLandscape, // end of the day
  ok: FcOk, // all clear, completed
  question: FcQuestions,
  celebrate: FcLike,
  check: FcCheckmark,
  clock: FcAlarmClock,
  next: FcAdvance,
  // Project icons (saved as "fc:<name>" on the project; see projects/ProjectIcon.tsx)
  briefcase: FcBriefcase,
  home: FcHome,
  study: FcGraduationCap,
  reading: FcReading,
  fitness: FcSportsMode,
  money: FcMoneyTransfer,
  code: FcCommandLine,
  travel: FcLandscape,
} as const satisfies Record<string, IconType>;

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
  const Glyph = ICONS[name];
  return (
    <Glyph
      size={size}
      className={`shrink-0 ${className}`}
      aria-hidden={label ? undefined : true}
      role={label ? 'img' : undefined}
      aria-label={label}
      focusable="false"
    />
  );
}

/**
 * Small presentational pieces shared across the DSA lab (sidebar, wiki, week view, organizer, wizard, topic pages),
 * so a difficulty or a LeetCode number looks the same everywhere. Difficulty tags live in the shared lab module
 * (`common/lab/LabTags`, one colour per difficulty for every lab: Easy emerald, Medium amber, Medium-Hard orange, Hard rose,
 * Mixed and unknown slate) and are re-exported here. Tags are soft tinted pills with a hairline ring; interactive colour is
 * the Settings accent (`lab-ink` text, `lab-tint` fill), never a hard-coded hue.
 */
import { LAB_PILL_BASE } from '@/modules/common/lab/LabTags';
import { lcNumber } from './weekPlan';

export { DifficultyTag, difficultyDotClass } from '@/modules/common/lab/LabTags';

/**
 * Menu styling shared by every popover menu in the lab (plan menu, week menu, organizer "More" menu), so they read the
 * same: `dsa-type` makes the portalled popover Poppins/Montserrat 500 like the page it floats over (a Popover renders
 * in <body>, outside the lab's own `dsa-type` root). Add `items-center` to an item with a single line of text.
 */
export const menuPopoverClass = 'todo-popover dsa-type rounded-xl p-1.5 shadow-lg';
export const menuItemClass =
  'flex w-full items-start gap-2.5 rounded-md px-2.5 py-2 text-left text-sm font-medium transition-colors hover:mix-bg-foreground/[0.05] focus-visible:outline-none focus-visible:mix-bg-foreground/[0.05] disabled:cursor-not-allowed disabled:opacity-50 aria-disabled:cursor-not-allowed aria-disabled:opacity-60';
export const menuSeparatorClass = 'mx-2.5 my-1 h-px bg-border';

export type TagTone = 'neutral' | 'accent';

const TAG_TONE: Record<TagTone, string> = {
  neutral: 'mix-text-foreground/[0.78] mix-bg-foreground/[0.05] mix-ring-foreground/[0.1]',
  accent: 'lab-ink lab-tint mix-ring-primary/25',
};

/**
 * Class string of the lab's generic meta pill (category, "Subtopic", "Custom", prerequisites, "Optimal", the week):
 * neutral for plain labels, accent for the lab's own tint. Put it on a `<button>` for a clickable pill (`interactive`
 * adds the hover), and `wrap` for names that may run over two lines (a subtopic's title). Difficulty and the LeetCode
 * number have their own tags below, so every pill in the lab shares one shape: rounded-full, hairline inset ring.
 */
export function tagClass(
  tone: TagTone = 'neutral',
  { interactive = false, wrap = false }: { interactive?: boolean; wrap?: boolean } = {}
): string {
  const shape = wrap
    ? 'inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium leading-snug ring-1 ring-inset'
    : `${LAB_PILL_BASE} px-2 py-[0.1875rem] text-xs`;
  const hover = interactive ? ' transition-smooth hover:lab-tint hover:lab-ink' : '';
  return `${shape} ${TAG_TONE[tone]}${hover}`;
}

/** A plain label as a soft tinted pill (see `tagClass`). */
export function Tag({
  tone = 'neutral',
  title,
  className = '',
  children,
}: {
  tone?: TagTone;
  title?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <span title={title} className={`${tagClass(tone)} ${className}`}>
      {children}
    </span>
  );
}

/** "#560" (the LeetCode number from a topic's brief) as a quiet neutral pill, semibold; nothing when the brief has none. */
export function LcTag({ brief, className = '' }: { brief: string; className?: string }) {
  const n = lcNumber(brief);
  if (n === null) return null;
  return (
    <span
      title={`LeetCode problem ${n}`}
      className={`${LAB_PILL_BASE} px-2 py-[0.1875rem] text-xs font-semibold tabular-nums mix-text-foreground/[0.78] mix-bg-foreground/[0.05] mix-ring-foreground/[0.1] ${className}`}
    >
      <span className="sr-only">LeetCode </span>#{n}
    </span>
  );
}

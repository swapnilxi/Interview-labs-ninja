'use client';

import { useSettledSelect } from '../useSettledSelect';
import { blockCount, blockLabel, blockWeeks, WEEK_CAP } from '../weekPlan';

/**
 * "Jump to week": scrolls the board to a week and puts focus on its title, so a keyboard user does not have
 * to tab through every card of the weeks before it. Jumping moves focus out of the select, so it waits for
 * Enter or a click on an option instead of acting on every arrow key (and leaving the select without
 * choosing does nothing).
 */
export default function WeekJump({
  weeks,
  counts,
  onJump,
}: {
  weeks: number;
  /** Questions per week (index 0 = week 1). */
  counts: number[];
  onJump: (week: number) => void;
}) {
  const select = useSettledSelect(
    '',
    (next) => {
      const week = Number(next);
      if (week) onJump(week);
    },
    { commitOnBlur: false }
  );
  return (
    <select
      aria-label="Jump to week"
      {...select}
      className="todo-input todo-input-quiet h-8 w-auto max-w-[10rem] cursor-pointer px-2 text-xs"
    >
      <option value="">Jump to week</option>
      {Array.from({ length: blockCount(weeks) }, (_, b) => (
        <optgroup key={b} label={blockLabel(b, weeks)}>
          {blockWeeks(b, weeks).map((w) => (
            <option key={w} value={w}>
              {`Week ${w} (${counts[w - 1] ?? 0}/${WEEK_CAP})`}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  );
}

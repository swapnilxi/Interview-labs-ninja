import { confirmDialog } from '@/lib/ui/confirm';
import { paretoService, type ParetoScope } from '@/lib/services/paretoService';

/**
 * The one question before an 80/20 analysis. It used to be two native `confirm()`s in a row ("You
 * already ran analysis today…", then "AI will analyze…"); now it is a single dialog that says what is
 * about to happen and, when it applies, that today's result will probably match this morning's.
 *
 * `what` completes "AI will analyze …" ("all your tasks", "today's tasks"). With `onlyIfRepeat` the
 * question is skipped on the first run of the day (the Your 20% sidebar never asked then).
 */
export function confirmParetoRun(
  scope: ParetoScope,
  what: string,
  options: { onlyIfRepeat?: boolean } = {}
): Promise<boolean> {
  const repeat = paretoService.hasAnalyzedToday(scope);
  if (options.onlyIfRepeat && !repeat) return Promise.resolve(true);
  return confirmDialog({
    title: 'Find your top 20%?',
    message: `AI will analyze ${what} and mark the few that drive most of your results. This takes a few seconds.`,
    note: repeat ? 'You already ran this today, so the result may be similar.' : undefined,
    confirmLabel: 'Run analysis',
  });
}

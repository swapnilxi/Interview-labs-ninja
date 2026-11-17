'use client';

import { useState } from 'react';
import Icon from '@/components/ui/AppIcon';
import Markdown from '@/modules/labs/common/Markdown';
import { highlightFence } from './highlight';
import type { Question, QuestionProgress } from './types';

/**
 * Hint, explanation and solution controls of a question. Hints come one at a time, "Explain it differently" hands the
 * question to the AI Tutor, and the solution opens only after an explicit, confirmed request (it is not on the page
 * until then). Opening a hint or the solution is remembered: it decides whether an answer counts as independent.
 */
export default function HelpPanel({
  question,
  progress,
  onHint,
  onExplain,
  onReveal,
}: {
  question: Question;
  progress: QuestionProgress;
  onHint: () => void;
  onExplain: () => void;
  onReveal: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const content = question.content;
  if (!content) return null;
  const hints = content.hints;
  const used = Math.min(progress.hintsUsed, hints.length);
  const hasSolution = !!content.exercise?.solution || !!content.solutionExplanation;
  if (!hints.length && !hasSolution) return null;

  return (
    <section className="gp-card p-4 sm:p-[1.25rem]" aria-label="Help">
      <h3 className="mb-2.5 text-sm font-semibold text-foreground">Need a hand?</h3>

      <div className="flex flex-wrap items-center gap-2">
        {hints.length > 0 && (
          <button
            type="button"
            onClick={onHint}
            disabled={used >= hints.length}
            className="todo-btn todo-btn-quiet"
          >
            <Icon name="LightBulbIcon" size={14} />
            {used >= hints.length ? 'No more hints' : `Show hint ${used + 1} of ${hints.length}`}
          </button>
        )}
        <button type="button" onClick={onExplain} className="todo-btn todo-btn-quiet">
          <Icon name="SparklesIcon" size={14} />
          Explain it differently
        </button>
        {hasSolution && !progress.solutionRevealed && !confirming && (
          <button
            type="button"
            onClick={() => setConfirming(true)}
            className="todo-btn todo-btn-ghost"
          >
            <Icon name="EyeIcon" size={14} />
            Reveal solution
          </button>
        )}
      </div>

      {confirming && !progress.solutionRevealed && (
        <div
          role="alertdialog"
          aria-label="Reveal the solution"
          className="mt-3 flex flex-wrap items-center gap-2 rounded-[12px] p-3 text-sm mix-bg-warning/10"
        >
          <p className="min-w-0 flex-1 text-sm leading-snug text-foreground">
            Reveal the solution? A hint is a smaller step, and a solution you opened is not counted
            as an independent answer.
          </p>
          <button
            type="button"
            onClick={() => {
              onReveal();
              setConfirming(false);
            }}
            className="todo-btn todo-btn-secondary"
          >
            Reveal
          </button>
          <button
            type="button"
            onClick={() => setConfirming(false)}
            className="todo-btn todo-btn-ghost"
          >
            Keep trying
          </button>
        </div>
      )}

      {used > 0 && (
        <ol className="mt-3 space-y-2">
          {hints.slice(0, used).map((hint, i) => (
            <li
              key={i}
              className="flex gap-2.5 rounded-[12px] p-3 text-sm leading-relaxed mix-bg-foreground/[0.04]"
            >
              <span className="mt-px shrink-0 text-xs font-semibold tabular-nums text-muted-foreground">
                Hint {i + 1}
              </span>
              <span className="min-w-0 flex-1">{hint}</span>
            </li>
          ))}
        </ol>
      )}

      {progress.solutionRevealed && (
        <div className="mt-4 space-y-3 border-t pt-4">
          <h4 className="text-xs font-semibold text-muted-foreground">Solution</h4>
          {content.exercise?.solution && (
            <Markdown
              content={`\`\`\`python\n${content.exercise.solution}\n\`\`\``}
              highlight={highlightFence}
            />
          )}
          {content.solutionExplanation && (
            <Markdown
              content={content.solutionExplanation}
              highlight={highlightFence}
              className="text-sm"
            />
          )}
        </div>
      )}

      {!progress.completed && (used > 0 || progress.solutionRevealed) && (
        <p className="mt-3 text-xs leading-snug text-muted-foreground">
          Using hints or the solution means this answer will not count as independent.
        </p>
      )}
    </section>
  );
}

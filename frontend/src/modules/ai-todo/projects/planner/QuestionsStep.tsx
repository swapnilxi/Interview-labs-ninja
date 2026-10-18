'use client';

import Icon from '@/components/ui/AppIcon';
import type { PlannerState } from '@/lib/services/projectPlannerService';

interface QuestionsStepProps {
  state: PlannerState;
  busy: boolean;
  onAnswer: (id: string, answer: string) => void;
  onAskMore: () => void;
  onContinue: () => void;
}

export default function QuestionsStep({ state, busy, onAnswer, onAskMore, onContinue }: QuestionsStepProps) {
  const { questions } = state;
  const answered = questions.filter((q) => q.answer.trim()).length;

  if (!questions.length) {
    return (
      <section className="todo-glass flex flex-col items-center gap-4 px-[1.5rem] py-[2.5rem] text-center" aria-labelledby="planner-questions-title">
        <span className="todo-icon-chip h-[3.5rem] w-[3.5rem]">
          <Icon name="ChatBubbleLeftRightIcon" size={26} />
        </span>
        <div>
          <h3 id="planner-questions-title" className="font-heading text-base font-semibold text-foreground">
            {state.questions_ready ? 'The AI has what it needs' : 'No questions yet'}
          </h3>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
            {state.questions_ready
              ? state.questions_note || 'Your brief already covers the scope, the people and the constraints.'
              : 'Ask the AI to read your brief and tell you what it still needs to know, or go straight to the timeline.'}
          </p>
        </div>
        <div className="flex flex-wrap justify-center gap-2">
          <button type="button" onClick={onAskMore} disabled={busy} className="todo-btn todo-btn-secondary px-4 py-2">
            {busy ? 'Reading…' : state.questions_ready ? 'Ask anyway' : 'Ask me questions'}
          </button>
          <button type="button" onClick={onContinue} disabled={busy} className="todo-btn todo-btn-primary px-4 py-2">
            Continue to timeline
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="flex flex-col gap-[1rem]" aria-labelledby="planner-questions-title">
      <div className="todo-glass flex flex-col gap-1.5 p-[1.25rem]">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 id="planner-questions-title" className="font-heading text-base font-semibold text-foreground">A few questions first</h3>
          <span className="text-xs text-muted-foreground" aria-live="polite">{answered} of {questions.length} answered</span>
        </div>
        {state.questions_note && <p className="text-sm text-muted-foreground">{state.questions_note}</p>}
        <p className="text-xs text-muted-foreground">Answer what you can in a sentence or two. Anything you skip, the AI plans around and lists as an assumption.</p>
      </div>

      <ol className="flex flex-col gap-[0.75rem]">
        {questions.map((q, index) => (
          <li key={q.id} className="todo-glass p-[1.25rem]">
            <div className="flex items-start gap-3">
              <span className="todo-icon-chip mt-0.5 h-[1.75rem] w-[1.75rem] text-xs font-bold" aria-hidden="true">{index + 1}</span>
              <div className="min-w-0 flex-1">
                <label htmlFor={`planner-q-${q.id}`} className="block text-sm font-semibold leading-snug text-foreground">{q.question}</label>
                {q.why && <p className="mt-0.5 text-xs text-muted-foreground">{q.why}</p>}

                {q.suggestions.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5" role="group" aria-label="Quick answers">
                    {q.suggestions.map((suggestion) => (
                      <button
                        key={suggestion}
                        type="button"
                        onClick={() => onAnswer(q.id, suggestion)}
                        aria-pressed={q.answer.trim() === suggestion}
                        className="todo-btn todo-btn-quiet rounded-full px-2.5 py-1 font-medium aria-pressed:text-primary"
                      >
                        {suggestion}
                      </button>
                    ))}
                  </div>
                )}

                <textarea
                  id={`planner-q-${q.id}`}
                  value={q.answer}
                  onChange={(e) => onAnswer(q.id, e.target.value)}
                  rows={2}
                  placeholder="Your answer (optional)"
                  className="todo-input mt-2 resize-y px-3 py-2 text-sm"
                />
              </div>
            </div>
          </li>
        ))}
      </ol>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <button type="button" onClick={onAskMore} disabled={busy} className="todo-btn todo-btn-secondary px-3 py-2">
          {busy ? (
            <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden="true" />
          ) : (
            <Icon name="ArrowPathIcon" size={14} />
          )}
          {busy ? 'Reading your answers…' : 'Ask follow-up questions'}
        </button>
        <button type="button" onClick={onContinue} disabled={busy} className="todo-btn todo-btn-primary px-4 py-2">
          Continue to timeline <Icon name="ArrowRightIcon" size={14} />
        </button>
      </div>
    </section>
  );
}

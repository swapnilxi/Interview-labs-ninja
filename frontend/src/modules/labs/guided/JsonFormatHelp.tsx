'use client';

import Icon from '@/components/ui/AppIcon';
import { MAX_PHASES, MAX_QUESTIONS_PER_PHASE } from './parse';

/**
 * The info icon beside "Import from JSON" and the note it opens: which JSON is accepted and what happens to it. The parent owns the
 * open state, so the button can sit beside the import button and the note below the row. What is described here is what
 * importPath.ts accepts; keep the two in step.
 */

const PATH_EXAMPLE = `{
  "phases": [
    {
      "title": "The basics",
      "goal": "Say what a dictionary is.",
      "questions": [
        {
          "title": "What is a dictionary and what is it for?",
          "kind": "concept",
          "difficulty": "easy",
          "effort": "5 min",
          "exercise": false
        }
      ]
    }
  ],
  "boss": { "title": "Build a word counter", "story": "..." }
}`;

const LIST_EXAMPLE = `[
  "What is a linked list?",
  "Why use a dictionary here instead of a list?",
  { "title": "When does a dictionary lookup fail?", "kind": "scenario" }
]`;

export function FormatHelpButton({
  open,
  onToggle,
  controlsId,
}: {
  open: boolean;
  onToggle: () => void;
  controlsId: string;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      aria-controls={controlsId}
      aria-label="About the JSON format"
      title="What JSON can I import?"
      className="todo-btn todo-btn-quiet h-11 w-11 px-0 aria-expanded:todo-btn-active"
    >
      <Icon name="InformationCircleIcon" size={18} aria-hidden="true" />
    </button>
  );
}

export function FormatHelp({ id, existing }: { id: string; existing: boolean }) {
  return (
    <div
      id={id}
      role="note"
      className="mt-4 rounded-xl border bg-[var(--color-fill)] p-4 text-[13px] leading-relaxed text-muted-foreground"
    >
      <p className="font-medium text-foreground">What JSON can I import?</p>
      <p className="mt-1">Either of these. Only each question’s title is required.</p>

      <p className="mt-3 font-medium text-foreground">1. A path, with phases</p>
      <pre className="mt-1 overflow-x-auto rounded-lg bg-[var(--color-fill-strong)] p-3 font-mono text-[12px] leading-snug text-foreground">
        {PATH_EXAMPLE}
      </pre>

      <p className="mt-3 font-medium text-foreground">2. Just a list of questions</p>
      <pre className="mt-1 overflow-x-auto rounded-lg bg-[var(--color-fill-strong)] p-3 font-mono text-[12px] leading-snug text-foreground">
        {LIST_EXAMPLE}
      </pre>
      <p className="mt-1">
        A flat list becomes phases of {MAX_QUESTIONS_PER_PHASE} questions (“Part 1”, “Part 2”…). A
        question can be a plain string.
      </p>

      <p className="mt-3 font-medium text-foreground">Rules</p>
      <ul className="mt-1 list-disc space-y-0.5 pl-5">
        <li>A title is at least 6 characters. Repeated titles are skipped.</li>
        <li>
          <code className="font-mono text-foreground">kind</code>: concept, implementation,
          algorithm or scenario. <code className="font-mono text-foreground">difficulty</code>:
          easy, medium or hard. <code className="font-mono text-foreground">exercise</code>: true
          when the learner writes code.
        </li>
        <li>
          Up to {MAX_PHASES} phases of {MAX_QUESTIONS_PER_PHASE} questions; the rest is left out,
          and you are told how much.
        </li>
        <li>
          The <code className="font-mono text-foreground">boss</code> is optional (the lab’s own is
          used when it is missing). JSON inside a Markdown code fence is fine.
        </li>
      </ul>

      <p className="mt-3 font-medium text-foreground">What happens to it</p>
      <p className="mt-1">
        {existing
          ? 'You choose: add its phases at the end of your path (what you have done stays), or replace the whole path (your progress and XP on this page are lost).'
          : 'It becomes your path, with no AI call. Later you can add more questions from JSON, or have the AI write more.'}
      </p>
    </div>
  );
}

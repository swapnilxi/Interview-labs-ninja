'use client';

import Icon from '@/components/ui/AppIcon';
import { BLOCK_META } from './ChapterPreview';
import QuizBlock from './QuizBlock';
import DictateButton from './voice/DictateButton';
import ExplainPanel from './voice/ExplainPanel';
import ReadAloudControls from './voice/ReadAloudControls';
import { useReadAloud } from './voice/useReadAloud';
import { TEXT_MAX, type ProgressState } from './progress';
import type { WorkbookBlock } from './types';

type Update = (change: (prev: ProgressState) => ProgressState) => void;

const asRecord = (value: unknown): Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

const paragraphsOf = (text: string) => text.split(/\n{2,}/).filter((p) => p.trim());

/** The paragraphs of a reading; the one being read aloud is highlighted. */
function Paragraphs({ paragraphs, current }: { paragraphs: string[]; current: number | null }) {
  return (
    <div className="wb-prose">
      {paragraphs.map((paragraph, i) => (
        <p key={i} className={`whitespace-pre-line ${current === i ? 'wb-reading-now' : ''}`}>
          {paragraph}
        </p>
      ))}
    </div>
  );
}

/** "Mark as read" style toggle for blocks that are read or done in real life rather than filled in. */
function DoneToggle({
  done,
  label,
  onToggle,
}: {
  done: boolean;
  label: string;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      className={`wb-btn wb-btn-sm ${done ? 'wb-btn-done' : ''}`}
      aria-pressed={done}
      onClick={onToggle}
    >
      <Icon
        name={done ? 'CheckCircleIcon' : 'CheckIcon'}
        size={14}
        variant={done ? 'solid' : 'outline'}
      />
      {done ? 'Done' : label}
    </button>
  );
}

/**
 * One block of a chapter, filled in by the learner. Every change goes through `update`, which applies it at once and
 * saves the learner's private document shortly after (useWorkbookProgress).
 */
export default function InteractiveBlock({
  workbookId,
  block,
  state,
  update,
}: {
  workbookId: string;
  block: WorkbookBlock;
  state: ProgressState;
  update: Update;
}) {
  const reader = useReadAloud();
  const meta = BLOCK_META[block.type];
  const answer = state.answers[block.id];
  const done = !!state.done[block.id];
  const title = 'title' in block ? block.title : '';
  const setAnswer = (value: unknown) =>
    update((prev) => ({ ...prev, answers: { ...prev.answers, [block.id]: value } }));
  const headingId = `${block.id}-label`;

  let body: React.ReactNode;
  switch (block.type) {
    case 'reading':
    case 'key_points':
    case 'action': {
      // What Listen reads: the title, then each paragraph (or key point), highlighted as it is read.
      const pieces =
        block.type === 'key_points'
          ? block.items
          : paragraphsOf(block.type === 'reading' ? block.body : block.text);
      const offset = title ? 1 : 0;
      const current = reader.current === null ? null : reader.current - offset;
      body = (
        <>
          {block.type === 'key_points' ? (
            <ul className="wb-prose list-disc space-y-1.5 pl-5">
              {block.items.map((item, i) => (
                <li key={i} className={current === i ? 'wb-reading-now' : ''}>
                  {item}
                </li>
              ))}
            </ul>
          ) : (
            <Paragraphs paragraphs={pieces} current={current} />
          )}
          <div className="flex flex-wrap items-center gap-2">
            <DoneToggle
              done={done}
              label={block.type === 'action' ? 'I did this' : 'Mark as read'}
              onToggle={() => setAnswer(answer === true ? false : true)}
            />
            <ReadAloudControls reader={reader} paragraphs={title ? [title, ...pieces] : pieces} />
          </div>
          <ExplainPanel workbookId={workbookId} blockId={block.id} />
        </>
      );
      break;
    }
    case 'reflection':
    case 'short_answer': {
      const id = `${block.id}-text`;
      body = (
        <>
          <label htmlFor={id} className="block font-medium text-foreground">
            {block.prompt}
          </label>
          {block.hint && <p className="wb-hint">{block.hint}</p>}
          <textarea
            id={id}
            className="wb-field"
            rows={block.type === 'reflection' ? 5 : 2}
            maxLength={TEXT_MAX}
            value={typeof answer === 'string' ? answer : ''}
            placeholder={
              block.type === 'reflection' ? 'Write freely. Only you can see this.' : 'Your answer'
            }
            onChange={(e) => setAnswer(e.target.value)}
          />
          <DictateButton
            onAccept={(spoken) => {
              const before = typeof answer === 'string' ? answer.trimEnd() : '';
              setAnswer((before ? `${before} ${spoken}` : spoken).slice(0, TEXT_MAX));
            }}
          />
        </>
      );
      break;
    }
    case 'checklist': {
      const ticks = asRecord(answer);
      body = (
        <ul className="space-y-1.5">
          {block.items.map((item) => (
            <li key={item.id}>
              <label className="wb-check">
                <input
                  type="checkbox"
                  checked={ticks[item.id] === true}
                  onChange={(e) => setAnswer({ ...ticks, [item.id]: e.target.checked })}
                />
                <span className="min-w-0 break-words">{item.text}</span>
              </label>
            </li>
          ))}
        </ul>
      );
      break;
    }
    case 'planner': {
      const values = asRecord(answer);
      body = (
        <div className="grid gap-3 sm:grid-cols-2">
          {block.fields.map((field) => (
            <label key={field.id} className="block">
              <span className="wb-label">{field.label}</span>
              <input
                type="text"
                className="wb-field"
                maxLength={500}
                value={typeof values[field.id] === 'string' ? (values[field.id] as string) : ''}
                onChange={(e) => setAnswer({ ...values, [field.id]: e.target.value })}
              />
            </label>
          ))}
        </div>
      );
      break;
    }
    case 'habit_tracker': {
      const days = Array.isArray(answer)
        ? (answer as unknown[]).filter((d) => typeof d === 'number')
        : [];
      body = (
        <>
          <p className="font-medium text-foreground">{block.habit}</p>
          {block.why && <p className="wb-hint">{block.why}</p>}
          <div
            className="flex flex-wrap gap-1.5"
            role="group"
            aria-label={`${block.days}-day tracker`}
          >
            {Array.from({ length: block.days }, (_, i) => {
              const day = i + 1;
              const on = days.includes(day);
              return (
                <button
                  key={day}
                  type="button"
                  className="wb-day wb-day-button"
                  aria-pressed={on}
                  aria-label={`Day ${day}${on ? ', done' : ''}`}
                  onClick={() =>
                    setAnswer(
                      on
                        ? days.filter((d) => d !== day)
                        : [...days, day].sort((a, b) => (a as number) - (b as number))
                    )
                  }
                >
                  {on ? <Icon name="CheckIcon" size={14} /> : day}
                </button>
              );
            })}
          </div>
          <p className="wb-hint">
            {days.length} of {block.days} days
          </p>
        </>
      );
      break;
    }
    case 'scale': {
      const value = typeof answer === 'number' ? answer : null;
      body = (
        <>
          <p className="font-medium text-foreground">{block.prompt}</p>
          <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label={block.prompt}>
            {Array.from({ length: block.max }, (_, i) => (
              <button
                key={i}
                type="button"
                role="radio"
                aria-checked={value === i + 1}
                className="wb-day wb-day-button"
                onClick={() => setAnswer(i + 1)}
              >
                {i + 1}
              </button>
            ))}
          </div>
          <p className="wb-hint">
            1 = {block.min_label}, {block.max} = {block.max_label}
          </p>
        </>
      );
      break;
    }
    case 'quiz':
      body = <QuizBlock block={block} state={state} update={update} />;
      break;
  }

  return (
    <section
      className={`wb-block wb-block-live ${done ? 'wb-block-done' : ''}`}
      aria-labelledby={headingId}
    >
      <div className="flex items-start justify-between gap-3">
        <h3 id={headingId} className="wb-block-label">
          <Icon name={meta.icon} size={14} />
          {meta.label}
          {title && <span className="font-semibold text-foreground">· {title}</span>}
        </h3>
        {done && (
          <span className="wb-done-mark">
            <Icon name="CheckCircleIcon" size={16} variant="solid" />
            <span className="sr-only">Done</span>
          </span>
        )}
      </div>
      <div className="space-y-3 text-sm leading-relaxed text-foreground">{body}</div>
    </section>
  );
}

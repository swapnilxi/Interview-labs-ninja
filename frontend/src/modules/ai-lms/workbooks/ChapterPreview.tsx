import Icon from '@/components/ui/AppIcon';
import type { QuizQuestion, WorkbookBlock } from './types';

/** What each block type is called and its icon (shared with the interactive renderer that comes next). */
export const BLOCK_META: Record<WorkbookBlock['type'], { label: string; icon: string }> = {
  reading: { label: 'Reading', icon: 'BookOpenIcon' },
  key_points: { label: 'Key points', icon: 'LightBulbIcon' },
  reflection: { label: 'Reflection', icon: 'PencilSquareIcon' },
  short_answer: { label: 'Short answer', icon: 'ChatBubbleBottomCenterTextIcon' },
  checklist: { label: 'Checklist', icon: 'ListBulletIcon' },
  planner: { label: 'Planner', icon: 'CalendarDaysIcon' },
  habit_tracker: { label: 'Habit tracker', icon: 'FireIcon' },
  scale: { label: 'Self-check', icon: 'AdjustmentsHorizontalIcon' },
  action: { label: 'Try this', icon: 'BoltIcon' },
  quiz: { label: 'Quiz', icon: 'QuestionMarkCircleIcon' },
};

const QUESTION_LABEL: Record<QuizQuestion['kind'], string> = {
  mcq: 'Multiple choice',
  scenario: 'Scenario',
  true_false: 'True or false',
  fill_blank: 'Fill in the blank',
  matching: 'Matching',
};

function Paragraphs({ text }: { text: string }) {
  return (
    <div className="space-y-2.5">
      {text.split(/\n{2,}/).map((paragraph, i) => (
        <p key={i} className="whitespace-pre-line">
          {paragraph}
        </p>
      ))}
    </div>
  );
}

function Answer({ children }: { children: React.ReactNode }) {
  return (
    <span className="wb-answer">
      <Icon name="CheckIcon" size={12} />
      {children}
    </span>
  );
}

function Question({ question, number }: { question: QuizQuestion; number: number }) {
  return (
    <li className="space-y-2">
      <p className="wb-hint">
        {number}. {QUESTION_LABEL[question.kind]}
      </p>
      {question.kind === 'scenario' && (
        <p className="whitespace-pre-line italic text-muted-foreground">{question.scenario}</p>
      )}
      <p className="font-medium text-foreground">{question.prompt}</p>
      {(question.kind === 'mcq' || question.kind === 'scenario') && (
        <ul className="space-y-1">
          {question.options.map((option, i) => (
            <li key={i}>
              {i === question.answer ? (
                <Answer>{option}</Answer>
              ) : (
                <span className="text-muted-foreground">{option}</span>
              )}
            </li>
          ))}
        </ul>
      )}
      {question.kind === 'true_false' && <Answer>{question.answer ? 'True' : 'False'}</Answer>}
      {question.kind === 'fill_blank' && (
        <Answer>{[question.answer, ...question.accept].join(' / ')}</Answer>
      )}
      {question.kind === 'matching' && (
        <ul className="space-y-1">
          {question.pairs.map((pair, i) => (
            <li key={i} className="flex flex-wrap items-center gap-1.5">
              <span>{pair.left}</span>
              <Icon name="ArrowRightIcon" size={12} className="text-muted-foreground" />
              <Answer>{pair.right}</Answer>
            </li>
          ))}
        </ul>
      )}
      {question.explanation && <p className="wb-hint">{question.explanation}</p>}
    </li>
  );
}

function BlockBody({ block }: { block: WorkbookBlock }) {
  switch (block.type) {
    case 'reading':
      return <Paragraphs text={block.body} />;
    case 'key_points':
      return (
        <ul className="list-disc space-y-1 pl-5">
          {block.items.map((item, i) => (
            <li key={i}>{item}</li>
          ))}
        </ul>
      );
    case 'reflection':
    case 'short_answer':
      return (
        <>
          <p className="font-medium text-foreground">{block.prompt}</p>
          {block.hint && <p className="wb-hint">{block.hint}</p>}
          <div className="wb-blank" aria-hidden="true" />
        </>
      );
    case 'checklist':
      return (
        <ul className="space-y-1.5">
          {block.items.map((item) => (
            <li key={item.id} className="flex items-start gap-2">
              <span className="wb-box" aria-hidden="true" />
              {item.text}
            </li>
          ))}
        </ul>
      );
    case 'planner':
      return (
        <dl className="grid gap-2 sm:grid-cols-2">
          {block.fields.map((field) => (
            <div key={field.id}>
              <dt className="wb-hint">{field.label}</dt>
              <dd className="wb-blank wb-blank-line" aria-hidden="true" />
            </div>
          ))}
        </dl>
      );
    case 'habit_tracker':
      return (
        <>
          <p className="font-medium text-foreground">{block.habit}</p>
          {block.why && <p className="wb-hint">{block.why}</p>}
          <div className="flex flex-wrap gap-1.5" aria-label={`${block.days} days`}>
            {Array.from({ length: block.days }, (_, i) => (
              <span key={i} className="wb-day">
                {i + 1}
              </span>
            ))}
          </div>
        </>
      );
    case 'scale':
      return (
        <>
          <p className="font-medium text-foreground">{block.prompt}</p>
          <div className="flex flex-wrap gap-1.5" aria-hidden="true">
            {Array.from({ length: block.max }, (_, i) => (
              <span key={i} className="wb-day">
                {i + 1}
              </span>
            ))}
          </div>
          <p className="wb-hint">
            1 = {block.min_label}, {block.max} = {block.max_label}
          </p>
        </>
      );
    case 'action':
      return <Paragraphs text={block.text} />;
    case 'quiz':
      return (
        <ol className="space-y-4">
          {block.questions.map((question, i) => (
            <Question key={question.id} question={question} number={i + 1} />
          ))}
        </ol>
      );
  }
}

/**
 * A written chapter as its author sees it before publishing: every block, read-only, with the quiz answers marked.
 * Learners never get this view (it shows the answers); they get the interactive chapter.
 */
export default function ChapterPreview({ blocks }: { blocks: WorkbookBlock[] }) {
  return (
    <ol className="space-y-3">
      {blocks.map((block) => {
        const meta = BLOCK_META[block.type];
        const title = 'title' in block ? block.title : '';
        return (
          <li key={block.id} className="wb-block">
            <p className="wb-block-label">
              <Icon name={meta.icon} size={14} />
              {meta.label}
              {title && <span className="font-semibold text-foreground">· {title}</span>}
            </p>
            <div className="space-y-2 text-sm leading-relaxed text-foreground">
              <BlockBody block={block} />
            </div>
          </li>
        );
      })}
    </ol>
  );
}

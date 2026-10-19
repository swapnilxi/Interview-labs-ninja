'use client';

import type { CSSProperties, Ref } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { DoneMark } from '@/modules/common/lab/LabProgressUi';
import type { DSATopic } from '../types';
import { DifficultyTag, LcTag } from '../ui';
import { useSettledSelect } from '../useSettledSelect';
import { WEEK_CAP } from '../weekPlan';
import { cardId, guardKeyDown } from './dnd';
import GripIcon from './GripIcon';

/** Props spread on the card's grip: the only element that starts a drag (so lists still scroll on touch). */
export type GripProps = Record<string, unknown> & {
  ref?: Ref<HTMLButtonElement>;
  style?: CSSProperties;
};

/** Attribute that finds a card's week dropdown again after the card has moved (see WeekOrganizer's refocus). */
export const MOVE_SELECT_ATTR = 'data-move-select';

/**
 * The per-question week dropdown the learner asked to keep: "Week n (x/7)" for every week, full weeks
 * disabled, and "Not in a week" (value 0). On the board it is also the keyboard / touch fallback for
 * dragging, and on phones it is the way to move a card between the Queue and Weeks panes.
 *
 * The width is the caller's: a card is either one clean inline row or the select on its own full-width row (see the call site).
 *
 * An arrow key on a CLOSED select only previews a week (browsers change the value on every key press, which
 * would move the card, and its focus with it, on the first press); Enter, a click on an option or leaving
 * the select moves it (useSettledSelect).
 */
export function MoveSelect({
  topicId,
  name,
  week,
  counts,
  onMove,
  className = '',
}: {
  topicId: string;
  name: string;
  week: number | null;
  /** Questions per week in the saved plan (index 0 = week 1). */
  counts: number[];
  onMove: (week: number | null) => void;
  className?: string;
}) {
  const select = useSettledSelect(String(week ?? 0), (next) => {
    const to = Number(next);
    onMove(to === 0 ? null : to);
  });
  return (
    <select
      aria-label={`Move ${name} to a week`}
      {...{ [MOVE_SELECT_ATTR]: topicId }}
      {...select}
      className={`todo-input todo-input-quiet h-8 max-w-full shrink-0 cursor-pointer py-0 pl-2 pr-7 text-xs tabular-nums ${className}`}
    >
      {counts.map((n, i) => {
        const w = i + 1;
        const full = w !== week && n >= WEEK_CAP;
        return (
          <option key={w} value={w} disabled={full}>
            {`Week ${w} (${n}/${WEEK_CAP})${full ? ' · full' : ''}`}
          </option>
        );
      })}
      <option value={0}>Not in a week</option>
    </select>
  );
}

interface CardViewProps {
  topic: DSATopic;
  week: number | null;
  counts: number[];
  onOpenTopic: (id: string) => void;
  onMove: (topicId: string, week: number | null) => void;
  grip?: GripProps;
  /** The source card while its clone is being dragged. */
  dragging?: boolean;
  /** The floating clone inside DragOverlay: glass surface, no controls. */
  overlay?: boolean;
}

/** One question as a draggable object: grip, name (opens the topic), pattern, difficulty, LC number, done mark, week dropdown. */
export function QuestionCardView({
  topic,
  week,
  counts,
  onOpenTopic,
  onMove,
  grip,
  dragging = false,
  overlay = false,
}: CardViewProps) {
  const surface = overlay
    ? 'dsa-glass rounded-xl rotate-[0.6deg] shadow-lg'
    : `todo-row-card border-border transition-smooth ${
        dragging ? 'opacity-40' : 'hover:mix-border-primary/40'
      }`;
  return (
    <div className={`${surface} flex items-stretch gap-1.5 ${overlay ? 'px-2 py-2' : 'pr-2'}`}>
      {overlay ? (
        <span
          aria-hidden
          className="mt-0.5 flex h-7 w-[1.5rem] shrink-0 cursor-grabbing items-center justify-center text-muted-foreground"
        >
          <GripIcon />
        </span>
      ) : (
        // A full-height strip down the card's left edge: a big, easy target that reads as "the handle" (not a menu icon).
        <button
          type="button"
          {...grip}
          aria-label={`Drag ${topic.name}`}
          title="Drag to another week or back to the queue"
          className="todo-focus flex w-[1.5rem] shrink-0 cursor-grab items-center justify-center self-stretch rounded-l-lg text-muted-foreground transition-smooth hover:mix-bg-foreground/[0.06] hover:text-foreground active:cursor-grabbing [@media(pointer:coarse)]:w-9"
        >
          <GripIcon />
        </button>
      )}

      <div className={`min-w-0 flex-1 ${overlay ? 'py-0.5' : 'py-2'}`}>
        <div className="flex items-start gap-1.5">
          {overlay ? (
            <span className="dsa-heading min-w-0 flex-1 break-words text-[13px] font-medium leading-snug text-foreground">
              {topic.name}
            </span>
          ) : (
            <button
              type="button"
              onClick={() => onOpenTopic(topic.id)}
              title={`Open ${topic.name}`}
              className="todo-focus dsa-heading min-w-0 flex-1 break-words rounded-sm text-left text-[13px] font-medium leading-snug text-foreground transition-colors hover:lab-ink"
            >
              {topic.name}
            </button>
          )}
          <DoneMark lab="dsa" topicId={topic.id} className="mt-0.5" />
        </div>
        <p
          className="mt-0.5 break-words text-[13px] font-medium leading-snug mix-text-foreground/[0.74]"
          title={topic.category}
        >
          {topic.category}
        </p>
        <div className="mt-2 flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1.5">
          <DifficultyTag difficulty={topic.difficulty} />
          <LcTag brief={topic.brief} />
          {!overlay && (
            <MoveSelect
              topicId={topic.id}
              name={topic.name}
              week={week}
              counts={counts}
              onMove={(w) => onMove(topic.id, w)}
              className="w-full min-[1800px]:ml-auto min-[1800px]:w-[9.5rem]"
            />
          )}
        </div>
      </div>
    </div>
  );
}

/** A question card registered with dnd-kit (inside the queue's or a week's SortableContext). */
export function SortableQuestionCard({
  container,
  dropDisabled,
  ...view
}: Omit<CardViewProps, 'grip' | 'dragging' | 'overlay'> & {
  /** The container id the card is listed in (`queue` or `week:N`). */
  container: string;
  /** True while a whole week is being dragged: cards are not drop targets then. */
  dropDisabled: boolean;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: cardId(view.topic.id),
    data: { kind: 'card', container, topicId: view.topic.id },
    disabled: { droppable: dropDisabled },
  });
  const grip: GripProps = {
    ...attributes,
    ...guardKeyDown(listeners as Record<string, unknown> | undefined),
    ref: setActivatorNodeRef,
    style: { touchAction: 'none' },
  };
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={isDragging ? 'relative z-[1]' : undefined}
    >
      <QuestionCardView {...view} grip={grip} dragging={isDragging} />
    </li>
  );
}

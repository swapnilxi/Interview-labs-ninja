'use client';

import { useEffect, useRef, useState } from 'react';
import { useDroppable } from '@dnd-kit/core';
import { SortableContext } from '@dnd-kit/sortable';
import Icon from '@/components/ui/AppIcon';
import type { DSATopic } from '../types';
import { difficultyDotClass } from '../ui';
import type { DifficultyGroup } from '../weekPlan';
import { noShiftStrategy, QUEUE_ID, topicOfCard, type DragKind } from './dnd';
import { SortableQuestionCard } from './QuestionCard';

export type QueueSort = 'recommended' | 'learning' | 'difficulty' | 'pattern';

export const QUEUE_SORTS: { value: QueueSort; label: string }[] = [
  { value: 'recommended', label: 'Recommended' },
  { value: 'learning', label: 'Learning order' },
  { value: 'difficulty', label: 'Difficulty' },
  { value: 'pattern', label: 'Pattern' },
];

/** An unselected chip: a hairline ring and readable text, so it still looks like a control. Selected ones use `todo-btn-active`. */
const INACTIVE_CHIP =
  'ring-1 ring-inset mix-ring-foreground/[0.12] mix-text-foreground/[0.8] hover:mix-bg-foreground/[0.07] hover:text-foreground';

const DIFFICULTY_CHIPS: { value: DifficultyGroup; label: string }[] = [
  { value: 'easy', label: 'Easy' },
  { value: 'medium', label: 'Medium' },
  { value: 'hard', label: 'Hard' },
];

export interface QueueFilters {
  search: string;
  pattern: string;
  difficulties: ReadonlySet<DifficultyGroup>;
  hideDone: boolean;
  sort: QueueSort;
}

export interface QueuePanelProps {
  filters: QueueFilters;
  onFilters: (patch: Partial<QueueFilters>) => void;
  onClearFilters: () => void;
  /** `card:<id>` ids shown, in display order (includes the live drag preview). */
  items: string[];
  /** How many questions pass the filters (ignoring a card that is mid-drag). */
  shownCount: number;
  /** Questions in no week at all (before filters). */
  total: number;
  patterns: { key: string; name: string; count: number }[];
  topicsById: ReadonlyMap<string, DSATopic>;
  counts: number[];
  /** The week "Recommended" sorts for (the first week with room), or null when every week is full. */
  recommendFor: number | null;
  /** A card from a week is being dragged over the panel. */
  dropActive: boolean;
  dragKind: DragKind | null;
  loading: boolean;
  onOpenTopic: (id: string) => void;
  onMoveCard: (topicId: string, week: number | null) => void;
  className?: string;
}

/**
 * The question queue: every question that is in no week, filtered and sorted, as draggable cards. The
 * whole panel is the `queue` drop target, so dropping a week's card anywhere on it takes the question
 * out of its week. A plain hairline card: nothing scrolls under it, so it needs no glass.
 */
export default function QueuePanel({
  filters,
  onFilters,
  onClearFilters,
  items,
  shownCount,
  total,
  patterns,
  topicsById,
  counts,
  recommendFor,
  dropActive,
  dragKind,
  loading,
  onOpenTopic,
  onMoveCard,
  className = '',
}: QueuePanelProps) {
  const { setNodeRef } = useDroppable({
    id: QUEUE_ID,
    data: { kind: 'container' },
    disabled: dragKind === 'week',
  });
  const filtered =
    !!filters.search.trim() ||
    !!filters.pattern ||
    filters.difficulties.size > 0 ||
    filters.hideDone;
  const shown = shownCount;

  // The visible count is not a live region: it changes after every card moved in or out of the queue. What a
  // screen-reader user needs is the result of a search or filter, said once typing has paused.
  const [filterNote, setFilterNote] = useState('');
  const latest = useRef({ shown, total, filtered });
  latest.current = { shown, total, filtered };
  const firstRun = useRef(true);
  useEffect(() => {
    if (firstRun.current) {
      firstRun.current = false;
      return;
    }
    const timer = window.setTimeout(() => {
      const now = latest.current;
      setFilterNote(
        !now.filtered
          ? `Showing all ${now.total} ${now.total === 1 ? 'question' : 'questions'}.`
          : now.shown === 0
            ? 'No questions match these filters.'
            : `${now.shown} of ${now.total} questions match.`
      );
    }, 600);
    return () => window.clearTimeout(timer);
  }, [filters.search, filters.pattern, filters.difficulties, filters.hideDone]);

  const toggleDifficulty = (g: DifficultyGroup) => {
    const next = new Set(filters.difficulties);
    if (next.has(g)) next.delete(g);
    else next.add(g);
    onFilters({ difficulties: next });
  };

  return (
    <aside
      ref={setNodeRef}
      aria-labelledby="org-queue-title"
      data-org-pane="queue"
      className={`relative flex min-h-0 flex-col rounded-lg border bg-card transition-shadow duration-200 ${
        dropActive ? 'ring-2 mix-ring-primary/60' : ''
      } ${className}`}
    >
      <div className="space-y-3 border-b px-4 pb-3.5 pt-4">
        <div className="flex items-baseline justify-between gap-2">
          <h2
            id="org-queue-title"
            tabIndex={-1}
            className="font-heading text-sm font-semibold text-foreground outline-none"
          >
            Question queue
          </h2>
          <span className="text-xs tabular-nums text-muted-foreground">
            {filtered
              ? `${shown} of ${total}`
              : `${total} ${total === 1 ? 'question' : 'questions'}`}
          </span>
          <span role="status" className="sr-only">
            {filterNote}
          </span>
        </div>

        <div className="relative">
          <label htmlFor="org-queue-search" className="sr-only">
            Search questions
          </label>
          <Icon
            name="MagnifyingGlassIcon"
            size={15}
            className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
          />
          <input
            id="org-queue-search"
            type="search"
            value={filters.search}
            onChange={(e) => onFilters({ search: e.target.value })}
            placeholder="Name, pattern or LC number"
            autoComplete="off"
            className="todo-input todo-input-quiet h-9 pl-8 pr-8 text-sm [&::-webkit-search-cancel-button]:hidden"
          />
          {filters.search && (
            <button
              type="button"
              onClick={() => onFilters({ search: '' })}
              aria-label="Clear search"
              className="todo-focus absolute right-1.5 top-1/2 flex h-[1.5rem] w-[1.5rem] -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <Icon name="XMarkIcon" size={14} />
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 gap-2">
          <select
            aria-label="Filter by pattern"
            value={filters.pattern}
            onChange={(e) => onFilters({ pattern: e.target.value })}
            className="todo-input todo-input-quiet h-9 min-w-0 cursor-pointer py-0 pl-2.5 pr-7 text-xs"
          >
            <option value="">All patterns</option>
            {patterns.map((p) => (
              <option key={p.key} value={p.key}>
                {`${p.name} (${p.count})`}
              </option>
            ))}
          </select>
          <select
            aria-label="Sort questions"
            value={filters.sort}
            onChange={(e) => onFilters({ sort: e.target.value as QueueSort })}
            className="todo-input todo-input-quiet h-9 min-w-0 cursor-pointer py-0 pl-2.5 pr-7 text-xs"
          >
            {QUEUE_SORTS.map((s) => (
              <option key={s.value} value={s.value}>
                {`Sort: ${s.label}`}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-wrap items-center gap-1">
          <div role="group" aria-label="Difficulty" className="flex flex-wrap gap-1">
            {DIFFICULTY_CHIPS.map((chip) => {
              const on = filters.difficulties.has(chip.value);
              return (
                <button
                  key={chip.value}
                  type="button"
                  aria-pressed={on}
                  onClick={() => toggleDifficulty(chip.value)}
                  className={`todo-btn px-2 py-1 font-medium [@media(pointer:coarse)]:min-h-[2.25rem] ${
                    on ? 'todo-btn-active' : INACTIVE_CHIP
                  }`}
                >
                  <span
                    aria-hidden
                    className={`h-1.5 w-1.5 rounded-full ${difficultyDotClass(chip.label)}`}
                  />
                  {chip.label}
                </button>
              );
            })}
          </div>
          <button
            type="button"
            aria-pressed={filters.hideDone}
            onClick={() => onFilters({ hideDone: !filters.hideDone })}
            className={`todo-btn ml-auto px-2 py-1 font-medium [@media(pointer:coarse)]:min-h-[2.25rem] ${
              filters.hideDone ? 'todo-btn-active' : INACTIVE_CHIP
            }`}
          >
            Hide done
          </button>
        </div>

        {filters.sort === 'recommended' && recommendFor !== null && total > 0 && (
          <p className="text-[13px] font-medium mix-text-foreground/[0.74]">
            Best fit for Week {recommendFor} first.
          </p>
        )}
      </div>

      {dropActive && (
        <p className="mx-3 mt-3 rounded-lg px-3 py-2 text-xs lab-tint lab-ink">
          Drop to take it out of its week.
        </p>
      )}

      <div
        data-org-scroll="queue"
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-3 scrollbar-clean"
      >
        {loading ? (
          <ul aria-hidden className="space-y-2">
            {Array.from({ length: 5 }, (_, i) => (
              <li
                key={i}
                className="h-[5.25rem] rounded-lg mix-bg-foreground/[0.05] motion-safe:animate-pulse"
              />
            ))}
          </ul>
        ) : shown === 0 ? (
          <div className="flex flex-col items-center gap-2 px-3 py-[2.5rem] text-center">
            <Icon
              name={total ? 'FunnelIcon' : 'CheckCircleIcon'}
              size={24}
              className="text-muted-foreground"
            />
            <p className="text-sm font-medium text-foreground">
              {total ? 'No questions match these filters' : 'Every question is in a week'}
            </p>
            <p className="max-w-[16rem] text-[13px] font-medium leading-relaxed mix-text-foreground/[0.74]">
              {total
                ? 'Try another pattern or difficulty, or clear the filters.'
                : 'Drag a card here, or pick "Not in a week" in its menu, to take it out of the plan.'}
            </p>
            {total > 0 && filtered && (
              <button
                type="button"
                onClick={onClearFilters}
                className="todo-btn todo-btn-quiet mt-1"
              >
                Clear filters
              </button>
            )}
          </div>
        ) : (
          <SortableContext id={QUEUE_ID} items={items} strategy={noShiftStrategy}>
            <ul aria-label="Questions in no week" className="space-y-2">
              {items.map((id) => {
                const topic = topicsById.get(topicOfCard(id) ?? '');
                if (!topic) return null;
                return (
                  <SortableQuestionCard
                    key={id}
                    topic={topic}
                    week={null}
                    counts={counts}
                    container={QUEUE_ID}
                    dropDisabled={dragKind === 'week'}
                    onOpenTopic={onOpenTopic}
                    onMove={onMoveCard}
                  />
                );
              })}
            </ul>
          </SortableContext>
        )}
      </div>
    </aside>
  );
}

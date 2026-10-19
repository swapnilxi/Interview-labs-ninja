'use client';

import { useEffect, useRef, useState } from 'react';
import { useDroppable } from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import Icon from '@/components/ui/AppIcon';
import Popover from '@/components/ui/Popover';
import type { DSATopic } from '../types';
import { difficultyDotClass, menuItemClass, menuPopoverClass, menuSeparatorClass } from '../ui';
import { difficultyGroup, LABEL_MAX, MAX_WEEKS, WEEK_CAP } from '../weekPlan';
import { guardKeyDown, topicOfCard, weekContainerId, weekSortId, type DragKind } from './dnd';
import GripIcon from './GripIcon';
import { SortableQuestionCard } from './QuestionCard';

/** How a week column looks while a card is dragged: not involved, a valid target, or a full week. */
export type DropState = 'idle' | 'over' | 'full';

export const weekAnchorId = (week: number) => `org-week-${week}`;
export const weekTitleId = (week: number) => `org-week-${week}-title`;

/** Empty slots drawn in a week with room: enough to show it can take more, not a wall of seven dashed boxes. */
const MAX_SLOTS_SHOWN = 3;

/** "2 Easy · 1 Medium · 3 done": what is in the week, then how much of it is solved. Empty when there is nothing to say. */
function weekStatus(topics: DSATopic[], done: number): string {
  const mix = { easy: 0, medium: 0, hard: 0 };
  for (const t of topics) mix[difficultyGroup(t.difficulty)]++;
  const parts = [
    mix.easy ? `${mix.easy} Easy` : '',
    mix.medium ? `${mix.medium} Medium` : '',
    mix.hard ? `${mix.hard} Hard` : '',
    done ? `${done} done` : '',
  ].filter(Boolean);
  return parts.join(' · ');
}

// The same item look as the plan menu (14px medium, soft tint hover); every item here is one line, so centred.
const menuBase = `${menuItemClass} items-center`;
const menuItem = `${menuBase} text-foreground`;

export interface WeekColumnProps {
  week: number;
  weeks: number;
  /** `card:<id>` ids in this week, as shown right now (includes the live drag preview). */
  items: string[];
  topicsById: ReadonlyMap<string, DSATopic>;
  /** Saved label, or '' (then `theme` is shown as a hint). */
  label: string;
  /** The patterns the week mostly covers, from its questions (shown when there is no label). */
  theme: string;
  done: number;
  /** Questions per week in the saved plan (for the card dropdowns). */
  counts: number[];
  /** Up to 3 queue questions that suit this week (empty when the week is full). */
  suggestions: string[];
  queueEmpty: boolean;
  dropState: DropState;
  dragKind: DragKind | null;
  highlighted: boolean;
  onOpenTopic: (id: string) => void;
  onMoveCard: (topicId: string, week: number | null) => void;
  onAddSuggestion: (topicId: string) => void;
  onRename: (label: string) => void;
  onFill: () => void;
  onClear: () => void;
  onMoveWeek: (to: number) => void;
  onInsertAfter: () => void;
  onRemove: () => void;
}

/**
 * One week on the board: a sortable column (dragged by the grip in its header to reorder weeks) that is
 * also the drop target for question cards. Shows `n/7` with a capacity bar, a status line (difficulty mix and
 * what is done), up to three suggestions, the cards in order, and at most three dashed empty slots plus an
 * "N more open" note, so the capacity is visible without a wall of boxes.
 */
export default function WeekColumn(props: WeekColumnProps) {
  const {
    week,
    weeks,
    items,
    topicsById,
    label,
    theme,
    done,
    counts,
    suggestions,
    queueEmpty,
    dropState,
    dragKind,
    highlighted,
    onOpenTopic,
    onMoveCard,
    onAddSuggestion,
    onRename,
    onFill,
    onClear,
    onMoveWeek,
    onInsertAfter,
    onRemove,
  } = props;

  const sortable = useSortable({
    id: weekSortId(week),
    data: { kind: 'week', week },
    disabled: { droppable: dragKind === 'card' },
  });
  const { setNodeRef: setDropRef } = useDroppable({
    id: weekContainerId(week),
    data: { kind: 'container', week },
    disabled: dragKind === 'week',
  });

  const [menuOpen, setMenuOpen] = useState(false);
  const menuBtn = useRef<HTMLButtonElement>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(label);
  const labelBtn = useRef<HTMLButtonElement>(null);
  /** Set once Enter or Escape has finished the edit, so the blur that follows doesn't finish it again. */
  const handled = useRef(false);
  const refocus = useRef(false);

  useEffect(() => {
    if (!editing && refocus.current) {
      refocus.current = false;
      labelBtn.current?.focus({ preventScroll: true });
    }
  }, [editing]);

  const startEdit = () => {
    handled.current = false;
    setDraft(label);
    setEditing(true);
  };
  /** `fromKeyboard`: Enter / Escape hand focus back to the label; a click elsewhere keeps it there. */
  const finishEdit = (save: boolean, fromKeyboard: boolean) => {
    if (!editing) return;
    refocus.current = fromKeyboard;
    setEditing(false);
    if (save && draft.trim() !== label) onRename(draft);
  };

  const topics = items
    .map((id) => topicsById.get(topicOfCard(id) ?? ''))
    .filter((t): t is DSATopic => !!t);
  const count = items.length;
  const full = count >= WEEK_CAP;
  const slots = Math.max(0, WEEK_CAP - count);
  const slotsShown = Math.min(slots, MAX_SLOTS_SHOWN);
  const status = weekStatus(topics, done);
  const savedCount = counts[week - 1] ?? 0;
  const savedFull = savedCount >= WEEK_CAP;

  const frame =
    dropState === 'full'
      ? 'mix-border-warning/60 mix-bg-warning/[0.06]'
      : dropState === 'over'
        ? 'mix-border-primary/55 mix-bg-primary/[0.06]'
        : 'mix-bg-foreground/[0.03]';

  const grip = {
    ...sortable.attributes,
    ...guardKeyDown(sortable.listeners as Record<string, unknown> | undefined),
    ref: sortable.setActivatorNodeRef,
    style: { touchAction: 'none' as const },
  };

  const run = (fn: () => void) => () => {
    setMenuOpen(false);
    fn();
  };

  return (
    <div
      ref={sortable.setNodeRef}
      style={{
        transform: CSS.Translate.toString(sortable.transform),
        transition: sortable.transition,
      }}
      className={`min-w-0 ${sortable.isDragging ? 'relative z-[2] opacity-40' : ''}`}
    >
      <div
        ref={setDropRef}
        id={weekAnchorId(week)}
        role="group"
        data-drop-state={dropState}
        aria-labelledby={weekTitleId(week)}
        className={`flex h-full scroll-mt-[4.5rem] flex-col rounded-lg border transition-[border-color,background-color,box-shadow] duration-200 ${frame} ${
          highlighted ? 'ring-2 ring-primary ring-offset-2 ring-offset-background' : ''
        }`}
      >
        <header className="px-3 pb-3 pt-2.5">
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              {...grip}
              aria-label={`Drag Week ${week} to reorder weeks`}
              title="Drag to reorder weeks"
              className="todo-focus -ml-1 flex h-7 w-[1.5rem] shrink-0 cursor-grab items-center justify-center rounded-md text-muted-foreground transition-smooth hover:mix-bg-foreground/[0.06] hover:text-foreground active:cursor-grabbing"
            >
              <GripIcon variant="week" size={16} />
            </button>
            <h3
              id={weekTitleId(week)}
              tabIndex={-1}
              className="rounded-sm text-sm font-semibold lab-ink outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Week {week}
            </h3>
            <span className="ml-auto flex items-center gap-1.5">
              {dropState === 'full' ? (
                <span className="text-xs font-semibold text-warning">Week full</span>
              ) : (
                full && <span className="text-xs font-medium mix-text-foreground/[0.74]">Full</span>
              )}
              <span
                aria-hidden
                className={`text-xs tabular-nums ${full ? 'font-semibold text-foreground' : 'font-medium text-muted-foreground'}`}
              >
                {count}/{WEEK_CAP}
              </span>
              <span className="sr-only">{`${count} of ${WEEK_CAP} questions`}</span>
            </span>
            <button
              ref={menuBtn}
              type="button"
              data-week-menu={week}
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              aria-label={`Week ${week} actions`}
              onClick={() => setMenuOpen((o) => !o)}
              className="todo-focus -mr-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-smooth hover:mix-bg-foreground/[0.06] hover:text-foreground"
            >
              <Icon name="EllipsisHorizontalIcon" size={18} />
            </button>
          </div>

          <div className="mt-1 min-h-[1.75rem]">
            {editing ? (
              <input
                autoFocus
                value={draft}
                maxLength={LABEL_MAX}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handled.current = true;
                    finishEdit(true, true);
                  } else if (e.key === 'Escape') {
                    e.preventDefault();
                    e.stopPropagation();
                    handled.current = true;
                    finishEdit(false, true);
                  }
                }}
                onBlur={() => {
                  if (!handled.current) finishEdit(true, false);
                }}
                aria-label={`Focus for Week ${week}`}
                placeholder={theme || 'What this week trains'}
                className="todo-input todo-input-quiet h-7 px-2 text-[13px]"
              />
            ) : (
              <button
                ref={labelBtn}
                type="button"
                onClick={startEdit}
                title={
                  label
                    ? `${label} (click to rename)`
                    : theme
                      ? `${theme} (click to name this week)`
                      : 'Name this week'
                }
                aria-label={
                  label
                    ? `Week ${week} focus: ${label}. Rename`
                    : theme
                      ? `Name the focus of Week ${week} (suggested: ${theme})`
                      : `Add a focus for Week ${week}`
                }
                className="todo-focus -mx-1 block w-[calc(100%+0.5rem)] break-words rounded-md px-1 py-1 text-left text-[13px] font-medium leading-snug transition-colors hover:mix-bg-foreground/[0.05]"
              >
                {label ? (
                  <span className="text-foreground">{label}</span>
                ) : theme ? (
                  <span className="mix-text-foreground/[0.74]">{theme}</span>
                ) : (
                  <span className="mix-text-foreground/[0.74]">Add a focus</span>
                )}
              </button>
            )}
          </div>

          <div className="mt-2">
            <span
              className="block h-1.5 overflow-hidden rounded-full mix-bg-foreground/10"
              aria-hidden
            >
              <span
                className="block h-full rounded-full bg-primary transition-[width] duration-300"
                style={{ width: `${(Math.min(count, WEEK_CAP) / WEEK_CAP) * 100}%` }}
              />
            </span>
          </div>
          {/* One line, always there (empty for an empty week), so the cards don't shift under the pointer while dragging. */}
          <p
            className={`mt-1.5 min-h-[1.25rem] break-words text-[13px] font-medium leading-snug tabular-nums ${
              dropState === 'full' ? 'text-warning' : 'mix-text-foreground/[0.74]'
            }`}
          >
            {dropState === 'full' ? 'Drop on a question to swap places' : status}
          </p>
        </header>

        {/* Above the cards and the empty slots, so an empty week offers its next steps first instead of below a wall of boxes. */}
        {!savedFull && suggestions.length > 0 && (
          <div className="px-2.5 pb-2">
            <p className="dsa-caption px-1 pb-1 text-muted-foreground">Suggested</p>
            <ul
              aria-label={`Suggested for Week ${week}`}
              data-suggested-for={week}
              className="flex flex-col gap-0.5"
            >
              {suggestions.map((id) => {
                const t = topicsById.get(id);
                if (!t) return null;
                return (
                  <li key={id}>
                    <button
                      type="button"
                      onClick={() => onAddSuggestion(id)}
                      aria-label={`Add ${t.name} (${t.difficulty}, ${t.category}) to Week ${week}`}
                      title={`Add to Week ${week}`}
                      className="todo-focus group flex w-full items-center gap-2 rounded-md px-1.5 py-1.5 text-left text-xs text-foreground transition-colors hover:lab-tint [@media(pointer:coarse)]:min-h-[2.5rem]"
                    >
                      <Icon
                        name="PlusIcon"
                        size={14}
                        className="shrink-0 text-muted-foreground transition-colors group-hover:text-primary"
                      />
                      <span className="min-w-0 flex-1 break-words leading-snug">{t.name}</span>
                      <span
                        aria-hidden
                        data-semantic="difficulty"
                        className={`h-1.5 w-1.5 shrink-0 rounded-full ${difficultyDotClass(t.difficulty)}`}
                      />
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        <SortableContext
          id={weekContainerId(week)}
          items={items}
          strategy={verticalListSortingStrategy}
        >
          <ol
            aria-label={`Questions in Week ${week}`}
            className="flex flex-1 flex-col gap-2 px-2.5 pb-2.5"
          >
            {topics.map((topic) => (
              <SortableQuestionCard
                key={topic.id}
                topic={topic}
                week={week}
                counts={counts}
                container={weekContainerId(week)}
                dropDisabled={dragKind === 'week'}
                onOpenTopic={onOpenTopic}
                onMove={onMoveCard}
              />
            ))}
            {Array.from({ length: slotsShown }, (_, i) => (
              <li
                key={`slot-${i}`}
                aria-hidden
                className="flex min-h-[1.75rem] items-center justify-center rounded-md border border-dashed border-border px-2"
              >
                {i === 0 && count === 0 && (
                  <span className="text-[13px] font-medium mix-text-foreground/[0.74]">
                    Drag questions here
                  </span>
                )}
              </li>
            ))}
            {slots > slotsShown && (
              <li
                aria-hidden
                data-slot-caption
                className="px-1 text-center text-xs font-medium tabular-nums mix-text-foreground/[0.74]"
              >
                {slots - slotsShown} more open
              </li>
            )}
          </ol>
        </SortableContext>
      </div>

      <Popover
        open={menuOpen}
        anchorRef={menuBtn}
        onClose={() => setMenuOpen(false)}
        label={`Week ${week} actions`}
        className={`${menuPopoverClass} min-w-[13rem]`}
      >
        <button type="button" role="menuitem" className={menuItem} onClick={run(startEdit)}>
          <Icon name="PencilSquareIcon" size={15} className="text-muted-foreground" />
          Rename focus
        </button>
        <button
          type="button"
          role="menuitem"
          className={menuItem}
          disabled={savedFull || queueEmpty}
          onClick={run(onFill)}
        >
          <Icon name="SparklesIcon" size={15} className="text-muted-foreground" />
          Fill with suggestions
        </button>
        <button
          type="button"
          role="menuitem"
          className={menuItem}
          disabled={savedCount === 0}
          onClick={run(onClear)}
        >
          <Icon name="MinusCircleIcon" size={15} className="text-muted-foreground" />
          Clear week
        </button>
        <div role="separator" className={menuSeparatorClass} />
        <button
          type="button"
          role="menuitem"
          className={menuItem}
          disabled={week <= 1}
          onClick={run(() => onMoveWeek(week - 1))}
        >
          <Icon name="ArrowLeftIcon" size={15} className="text-muted-foreground" />
          Move earlier
        </button>
        <button
          type="button"
          role="menuitem"
          className={menuItem}
          disabled={week >= weeks}
          onClick={run(() => onMoveWeek(week + 1))}
        >
          <Icon name="ArrowRightIcon" size={15} className="text-muted-foreground" />
          Move later
        </button>
        <button
          type="button"
          role="menuitem"
          className={menuItem}
          disabled={weeks >= MAX_WEEKS}
          title={weeks >= MAX_WEEKS ? `A plan can have at most ${MAX_WEEKS} weeks.` : undefined}
          onClick={run(onInsertAfter)}
        >
          <Icon name="PlusIcon" size={15} className="text-muted-foreground" />
          Insert week after
        </button>
        <div role="separator" className={menuSeparatorClass} />
        <button
          type="button"
          role="menuitem"
          className={`${menuBase} text-error`}
          disabled={weeks <= 1}
          title={weeks <= 1 ? 'A plan needs at least one week.' : undefined}
          onClick={run(onRemove)}
        >
          <Icon name="TrashIcon" size={15} />
          Remove week
        </button>
      </Popover>
    </div>
  );
}

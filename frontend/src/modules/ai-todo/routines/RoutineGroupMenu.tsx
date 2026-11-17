'use client';

import { useEffect, useState } from 'react';
import Icon from '@/components/ui/AppIcon';
import { routineService, type RoutineGroup } from '@/lib/services/routineService';
import { daysLabel } from './routineDays';

interface RoutineGroupMenuProps {
  /** Shown in the header next to Back, e.g. "Move to a routine". */
  title: string;
  onBack: () => void;
  onPick: (group: RoutineGroup) => void;
  /** Groups to leave out (the one an item is already in). */
  excludeId?: number;
  /** Groups already loaded by the caller; otherwise they are fetched. */
  groups?: RoutineGroup[];
  disabled?: boolean;
}

/**
 * The second page of a "Move to…" menu: the user's routine groups as menu items, with a Back row. Used for tasks
 * (Today, Smart To-Do), Quick Daily tasks and routine items. Lives inside a components/ui/Popover.
 */
export default function RoutineGroupMenu({
  title,
  onBack,
  onPick,
  excludeId,
  groups: given,
  disabled,
}: RoutineGroupMenuProps) {
  const [groups, setGroups] = useState<RoutineGroup[] | null>(given ?? null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (given) {
      setGroups(given);
      return;
    }
    let live = true;
    routineService
      .list()
      .then((list) => live && setGroups(list))
      .catch(
        (err) =>
          live && setError(err instanceof Error ? err.message : 'Couldn’t load your routines.')
      );
    return () => {
      live = false;
    };
  }, [given]);

  const shown = (groups ?? []).filter((g) => g.id !== excludeId);

  return (
    <div className="min-w-[13.5rem] max-w-[18rem]">
      <div
        className="mb-1 flex items-center gap-1 border-b px-1 pb-1"
        style={{ borderColor: 'var(--color-separator)' }}
      >
        <button
          type="button"
          role="menuitem"
          onClick={onBack}
          className="todo-btn todo-btn-ghost h-8 w-8 shrink-0 px-0"
          aria-label="Back"
        >
          <Icon name="ChevronLeftIcon" size={14} />
        </button>
        <span className="text-[13px] font-medium text-muted-foreground">{title}</span>
      </div>
      {error ? (
        <p className="px-2.5 py-2 text-xs text-error">{error}</p>
      ) : groups === null ? (
        <p className="flex items-center gap-2 px-2.5 py-2 text-xs text-muted-foreground">
          <span
            className="h-3 w-3 animate-spin rounded-full border border-current border-t-transparent"
            aria-hidden
          />
          Loading routines…
        </p>
      ) : shown.length === 0 ? (
        <p className="px-2.5 py-2 text-xs text-muted-foreground">
          No other routine groups yet. Make one in the Routines tab.
        </p>
      ) : (
        shown.map((group) => {
          const when = daysLabel(group);
          return (
            <button
              key={group.id}
              type="button"
              role="menuitem"
              disabled={disabled}
              onClick={() => onPick(group)}
              className="todo-focus flex min-h-[2.75rem] w-full items-center gap-2.5 rounded-md px-2.5 text-left text-sm text-foreground hover:bg-muted disabled:opacity-50"
            >
              <Icon
                name="ArrowPathRoundedSquareIcon"
                size={16}
                className="shrink-0 text-muted-foreground"
              />
              <span className="min-w-0 flex-1 break-words">{group.name}</span>
              {when && <span className="shrink-0 text-xs text-muted-foreground">{when}</span>}
            </button>
          );
        })
      )}
    </div>
  );
}

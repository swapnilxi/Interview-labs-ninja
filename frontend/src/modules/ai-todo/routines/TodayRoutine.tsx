'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import Icon from '@/components/ui/AppIcon';
import FlatIcon from '@/components/ui/FlatIcon';
import { ymd } from '@/lib/reminders/smartParse';
import { reportFailure } from '@/lib/services/mutationFeedback';
import {
  ROUTINES_CHANGED_EVENT,
  routineService,
  type RoutineGroup,
  type RoutineItem,
} from '@/lib/services/routineService';
import RoutineItemRow from './RoutineItemRow';
import { isDoneToday, isOnToday } from './routineDays';

const COLLAPSED_KEY = 'labninja.todo.today.routine-collapsed';

function readCollapsed(): boolean {
  try {
    return window.localStorage.getItem(COLLAPSED_KEY) === '1';
  } catch {
    return false;
  }
}

/**
 * Today's routine on the Today tab: Dailies plus every group that is on today (its weekday, or switched on for today),
 * ticked off right here. Shows nothing until a group on today has an item; editing lives in the Routines tab.
 */
export default function TodayRoutine({ now }: { now: Date }) {
  const [groups, setGroups] = useState<RoutineGroup[] | null>(null);
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => setCollapsed(readCollapsed()), []);

  const load = useCallback(async () => {
    try {
      setGroups(await routineService.list());
    } catch {
      // Today still works without it; the Routines tab shows the error.
      setGroups((prev) => prev ?? []);
    }
  }, []);

  useEffect(() => {
    void load();
    const onChange = () => void load();
    const onVisible = () => document.visibilityState === 'visible' && void load();
    window.addEventListener(ROUTINES_CHANGED_EVENT, onChange);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.removeEventListener(ROUTINES_CHANGED_EVENT, onChange);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [load]);

  const onToday = useMemo(
    () => (groups ?? []).filter((g) => isOnToday(g, now) && g.items.length > 0),
    [groups, now]
  );
  const items = onToday.flatMap((g) => g.items);
  const done = items.filter((i) => isDoneToday(i, now)).length;

  if (!items.length) return null;

  const toggleCollapsed = () => {
    setCollapsed((v) => {
      try {
        window.localStorage.setItem(COLLAPSED_KEY, v ? '0' : '1');
      } catch {
        /* private mode: it just won't be remembered */
      }
      return !v;
    });
  };

  const toggle = async (item: RoutineItem, isDone: boolean) => {
    const today = ymd(new Date());
    const patch = (doneOn: string | null) =>
      setGroups(
        (list) =>
          list?.map((g) => ({
            ...g,
            items: g.items.map((i) => (i.id === item.id ? { ...i, done_on: doneOn } : i)),
          })) ?? list
      );
    patch(isDone ? today : null);
    try {
      await routineService.updateItem(item.id, { done_on: isDone ? today : null });
    } catch (err) {
      reportFailure('save that tick', err);
      patch(item.done_on);
    }
  };

  return (
    <section aria-labelledby="agenda-routine" className="agenda-group" data-group="routine">
      <header className="agenda-head">
        <button
          type="button"
          onClick={toggleCollapsed}
          aria-expanded={!collapsed}
          aria-controls="agenda-routine-list"
          className="todo-focus -ml-1 flex min-w-0 flex-1 items-center gap-2 rounded-lg px-1 text-left"
        >
          <FlatIcon name="phase" size={18} quiet className="text-muted-foreground" />
          <h3 id="agenda-routine" className="agenda-title">
            Routine
          </h3>
          <span className="agenda-count">
            {done === items.length ? 'All done' : `${done} of ${items.length} done`}
          </span>
          <Icon
            name="ChevronDownIcon"
            size={14}
            className={`text-muted-foreground transition-transform ${collapsed ? '-rotate-90' : ''}`}
          />
        </button>
        <Link
          href="/ai-todo?tab=routines"
          className="todo-btn todo-btn-ghost ml-auto h-8 shrink-0 px-2.5 text-[13px]"
        >
          Edit
        </Link>
      </header>
      {!collapsed && (
        <div id="agenda-routine-list">
          {onToday.map((group) => (
            <div key={group.id}>
              {onToday.length > 1 && <p className="rt-today-sub">{group.name}</p>}
              <ul className="agenda-list">
                {group.items.map((item) => (
                  <RoutineItemRow
                    key={item.id}
                    item={item}
                    done={isDoneToday(item, now)}
                    onToggle={(d) => void toggle(item, d)}
                  />
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

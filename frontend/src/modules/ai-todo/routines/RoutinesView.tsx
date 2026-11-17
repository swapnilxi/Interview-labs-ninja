'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Icon from '@/components/ui/AppIcon';
import FlatIcon from '@/components/ui/FlatIcon';
import Modal from '@/components/ui/Modal';
import Popover from '@/components/ui/Popover';
import { confirmDialog } from '@/lib/ui/confirm';
import { toast } from '@/lib/ui/toast';
import { ymd } from '@/lib/reminders/smartParse';
import { reportFailure } from '@/lib/services/mutationFeedback';
import type { TaskPriority } from '@/lib/services/todoService';
import { routineService, type RoutineGroup, type RoutineItem } from '@/lib/services/routineService';
import RoutineGroupEditor, { type GroupDraft } from './RoutineGroupEditor';
import RoutineItemRow, { MenuItem } from './RoutineItemRow';
import {
  DAILIES_RESET_HOUR,
  WEEKDAYS,
  WEEKEND,
  daysLabel,
  isDoneToday,
  isOnToday,
  isSwitchedOn,
  tickDay,
} from './routineDays';

/**
 * To-Do → Routines: lists you tick off each day. Dailies is on every day; the groups you make are on their weekdays
 * (Weekdays, Weekend) or on a day you switch them on (the day before a deployment). Ticks are per day, so a routine is
 * fresh again tomorrow without anything being reset. The groups on today also show on the Today tab.
 */

type EditorState =
  { mode: 'new'; initial: GroupDraft } | { mode: 'edit'; group: RoutineGroup; initial: GroupDraft };

const STARTERS: { name: string; days: number[] }[] = [
  { name: 'Weekdays', days: WEEKDAYS },
  { name: 'Weekend', days: WEEKEND },
  { name: 'Deployment eve', days: [] },
];

export default function RoutinesView() {
  const router = useRouter();
  const [groups, setGroups] = useState<RoutineGroup[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [now, setNow] = useState(() => new Date());
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [saving, setSaving] = useState(false);
  const [editorError, setEditorError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setGroups(await routineService.list());
      setLoadError(null);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Couldn’t load your routines.');
      setGroups((prev) => prev ?? []);
    }
    setNow(new Date());
  }, []);

  useEffect(() => {
    void load();
    // A new day turns yesterday's ticks off and other groups on: re-check once a minute, and when the tab comes back.
    const tick = setInterval(() => setNow(new Date()), 60_000);
    const onVisible = () => document.visibilityState === 'visible' && void load();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(tick);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [load]);

  const { onToday, others } = useMemo(() => {
    const list = groups ?? [];
    return {
      onToday: list.filter((g) => isOnToday(g, now)),
      others: list.filter((g) => !isOnToday(g, now)),
    };
  }, [groups, now]);
  const hasCustom = (groups ?? []).some((g) => g.kind === 'custom');

  // ── Local edits (optimistic; a failed save reloads and says why) ──────────────────────────────────────────────
  const patchItem = (id: number, fn: (item: RoutineItem) => RoutineItem) =>
    setGroups(
      (list) =>
        list?.map((g) => ({ ...g, items: g.items.map((i) => (i.id === id ? fn(i) : i)) })) ?? list
    );
  const dropItem = (id: number) =>
    setGroups(
      (list) => list?.map((g) => ({ ...g, items: g.items.filter((i) => i.id !== id) })) ?? list
    );
  const failed = (action: string, err: unknown) => {
    reportFailure(action, err);
    void load();
  };

  const toggle = async (item: RoutineItem, done: boolean) => {
    // A Dailies tick belongs to the day that started at 8 am (tickDay); every other group's to the calendar date.
    const group = (groups ?? []).find((g) => g.id === item.group_id);
    const today = group ? tickDay(group, new Date()) : ymd(new Date());
    patchItem(item.id, (i) => ({ ...i, done_on: done ? today : null }));
    try {
      await routineService.updateItem(item.id, { done_on: done ? today : null });
    } catch (err) {
      failed('save that tick', err);
    }
  };

  const rename = async (item: RoutineItem, title: string) => {
    patchItem(item.id, (i) => ({ ...i, title }));
    try {
      await routineService.updateItem(item.id, { title });
    } catch (err) {
      failed('rename it', err);
    }
  };

  const setPriority = async (item: RoutineItem, priority: TaskPriority) => {
    patchItem(item.id, (i) => ({ ...i, priority }));
    try {
      await routineService.updateItem(item.id, { priority });
    } catch (err) {
      failed('change the priority', err);
    }
  };

  const moveToGroup = async (item: RoutineItem, target: RoutineGroup) => {
    setGroups(
      (list) =>
        list?.map((g) =>
          g.id === item.group_id
            ? { ...g, items: g.items.filter((i) => i.id !== item.id) }
            : g.id === target.id
              ? { ...g, items: [...g.items, { ...item, group_id: target.id }] }
              : g
        ) ?? list
    );
    try {
      await routineService.updateItem(item.id, { group_id: target.id });
      toast.success(`Moved to ${target.name}`);
    } catch (err) {
      failed('move it', err);
    }
  };

  const moveOut = async (item: RoutineItem, to: 'task' | 'quick') => {
    dropItem(item.id);
    try {
      await routineService.moveOut(item.id, to, ymd(new Date()));
      toast.success(
        to === 'task'
          ? `“${item.title}” is in your To-Do for today`
          : `“${item.title}” is in Quick Daily`,
        {
          action: {
            label: 'Open',
            onClick: () => router.push(`/ai-todo?tab=${to === 'task' ? 'today' : 'quick'}`),
          },
        }
      );
    } catch (err) {
      failed('move it', err);
    }
  };

  const removeItem = async (item: RoutineItem) => {
    dropItem(item.id);
    try {
      await routineService.deleteItem(item.id);
      toast.info(`Deleted “${item.title}”`);
    } catch (err) {
      failed('delete it', err);
    }
  };

  const addItem = async (group: RoutineGroup, title: string): Promise<boolean> => {
    try {
      const item = await routineService.createItem(group.id, title);
      setGroups(
        (list) =>
          list?.map((g) => (g.id === group.id ? { ...g, items: [...g.items, item] } : g)) ?? list
      );
      return true;
    } catch (err) {
      reportFailure('add it', err);
      return false;
    }
  };

  const setSwitchedOn = async (group: RoutineGroup, on: boolean) => {
    const activeOn = on ? ymd(new Date()) : null;
    setGroups(
      (list) => list?.map((g) => (g.id === group.id ? { ...g, active_on: activeOn } : g)) ?? list
    );
    try {
      await routineService.updateGroup(group.id, { active_on: activeOn });
      if (on) toast.success(`${group.name} is on for today`);
    } catch (err) {
      failed(on ? 'turn it on' : 'turn it off', err);
    }
  };

  const removeGroup = async (group: RoutineGroup) => {
    const n = group.items.length;
    const ok = await confirmDialog({
      title: `Delete “${group.name}”?`,
      message: n ? `Its ${n} item${n === 1 ? '' : 's'} will be deleted too.` : 'It has no items.',
      confirmLabel: 'Delete group',
      tone: 'danger',
    });
    if (!ok) return;
    setGroups((list) => list?.filter((g) => g.id !== group.id) ?? list);
    try {
      await routineService.deleteGroup(group.id);
      toast.info(`Deleted “${group.name}”`);
    } catch (err) {
      failed('delete the group', err);
    }
  };

  const saveEditor = async (draft: GroupDraft) => {
    if (!editor) return;
    setSaving(true);
    setEditorError(null);
    try {
      if (editor.mode === 'new') {
        const group = await routineService.createGroup(
          draft.name,
          draft.days.length ? draft.days : null
        );
        setGroups((list) => [...(list ?? []), group]);
        toast.success(`${group.name} is ready. Add what you do on those days.`);
      } else {
        const isDailies = editor.group.kind === 'dailies';
        const updated = await routineService.updateGroup(
          editor.group.id,
          isDailies
            ? { name: draft.name }
            : { name: draft.name, days: draft.days.length ? draft.days : null }
        );
        setGroups(
          (list) =>
            list?.map((g) => (g.id === updated.id ? { ...updated, items: g.items } : g)) ?? list
        );
      }
      setEditor(null);
    } catch (err) {
      setEditorError(err instanceof Error ? err.message : 'Couldn’t save the group.');
    } finally {
      setSaving(false);
    }
  };

  const openNew = (initial: GroupDraft = { name: '', days: [] }) => {
    setEditorError(null);
    setEditor({ mode: 'new', initial });
  };

  const renderGroup = (group: RoutineGroup) => (
    <RoutineGroupCard
      key={group.id}
      group={group}
      groups={groups ?? []}
      now={now}
      onEdit={() => {
        setEditorError(null);
        setEditor({ mode: 'edit', group, initial: { name: group.name, days: group.days ?? [] } });
      }}
      onSwitch={(on) => void setSwitchedOn(group, on)}
      onDelete={() => void removeGroup(group)}
      onAdd={(title) => addItem(group, title)}
      onToggle={(item, done) => void toggle(item, done)}
      onRename={(item, title) => void rename(item, title)}
      onPriority={(item, p) => void setPriority(item, p)}
      onMoveToGroup={(item, target) => void moveToGroup(item, target)}
      onMoveOut={(item, to) => void moveOut(item, to)}
      onDeleteItem={(item) => void removeItem(item)}
    />
  );

  return (
    <div className="rt-view">
      <div className="todo-section-head mb-[1.25rem] items-start">
        <div className="min-w-0">
          <h2 className="todo-section-title">Routines</h2>
          <p className="todo-section-sub max-w-[36rem]">
            Lists you tick off each day. Dailies are on every day; give a group its own days, or
            switch it on for one day.
          </p>
        </div>
        <button
          type="button"
          onClick={() => openNew()}
          className="todo-btn todo-btn-quiet h-9 shrink-0 px-3 text-sm"
        >
          <Icon name="PlusIcon" size={15} />
          New group
        </button>
      </div>

      {loadError && (
        <div role="alert" className="todo-alert todo-alert-error mb-4">
          <Icon name="ExclamationTriangleIcon" size={14} className="mt-px shrink-0" />
          <p className="flex-1">{loadError}</p>
          <button
            type="button"
            onClick={() => void load()}
            className="todo-btn todo-btn-ghost h-8 px-2"
          >
            Retry
          </button>
        </div>
      )}

      {groups === null ? (
        <div className="rt-grid" aria-hidden>
          <div className="skeleton h-[12rem] rounded-[1.25rem]" />
          <div className="skeleton h-[12rem] rounded-[1.25rem]" />
        </div>
      ) : (
        <div className="flex flex-col gap-[1.75rem]">
          {onToday.length > 0 && (
            <section aria-labelledby="rt-today">
              <h3 id="rt-today" className="rt-section-label">
                On today · {now.toLocaleDateString(undefined, { weekday: 'long' })}
              </h3>
              <div className="rt-grid">{onToday.map(renderGroup)}</div>
            </section>
          )}

          {others.length > 0 && (
            <section aria-labelledby="rt-others">
              <h3 id="rt-others" className="rt-section-label">
                Other groups
              </h3>
              <div className="rt-grid">{others.map(renderGroup)}</div>
            </section>
          )}

          {!hasCustom && groups.length > 0 && (
            <div className="rt-starters">
              <p className="text-sm font-medium text-foreground">
                Different days, different routines
              </p>
              <p className="mt-0.5 text-[13px] text-muted-foreground">
                Start a group for the days that run differently.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {STARTERS.map((s) => (
                  <button
                    key={s.name}
                    type="button"
                    onClick={() => openNew({ name: s.name, days: s.days })}
                    className="todo-btn todo-btn-secondary h-9 px-3 text-sm"
                  >
                    <Icon name="PlusIcon" size={14} />
                    {s.name}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <Modal
        isOpen={!!editor}
        onClose={() => setEditor(null)}
        label={editor?.mode === 'edit' ? 'Edit group' : 'New routine group'}
        closeOnBackdrop={false}
        className="rt-editor-modal max-h-[90vh] w-full max-w-[28rem] overflow-y-auto"
      >
        {editor && (
          <RoutineGroupEditor
            key={editor.mode === 'edit' ? `edit-${editor.group.id}` : `new-${editor.initial.name}`}
            heading={
              editor.mode === 'edit'
                ? editor.group.kind === 'dailies'
                  ? 'Rename Dailies'
                  : 'Edit group'
                : 'New routine group'
            }
            initial={editor.initial}
            isDailies={editor.mode === 'edit' && editor.group.kind === 'dailies'}
            saving={saving}
            error={editorError}
            saveLabel={editor.mode === 'edit' ? 'Save' : 'Create group'}
            onSave={(draft) => void saveEditor(draft)}
            onCancel={() => setEditor(null)}
          />
        )}
      </Modal>
    </div>
  );
}

// ── One group ──────────────────────────────────────────────────────────────────────────────────────────────────

interface RoutineGroupCardProps {
  group: RoutineGroup;
  groups: RoutineGroup[];
  now: Date;
  onEdit: () => void;
  onSwitch: (on: boolean) => void;
  onDelete: () => void;
  onAdd: (title: string) => Promise<boolean>;
  onToggle: (item: RoutineItem, done: boolean) => void;
  onRename: (item: RoutineItem, title: string) => void;
  onPriority: (item: RoutineItem, priority: TaskPriority) => void;
  onMoveToGroup: (item: RoutineItem, group: RoutineGroup) => void;
  onMoveOut: (item: RoutineItem, to: 'task' | 'quick') => void;
  onDeleteItem: (item: RoutineItem) => void;
}

function RoutineGroupCard({
  group,
  groups,
  now,
  onEdit,
  onSwitch,
  onDelete,
  onAdd,
  onToggle,
  onRename,
  onPriority,
  onMoveToGroup,
  onMoveOut,
  onDeleteItem,
}: RoutineGroupCardProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLButtonElement>(null);
  const [text, setText] = useState('');
  const [adding, setAdding] = useState(false);
  const isDailies = group.kind === 'dailies';
  const on = isOnToday(group, now);
  const switchedOn = isSwitchedOn(group, now);
  // A switch only matters for a group its days don't already put on today.
  const canSwitch = !isDailies && !(group.days ?? []).includes(now.getDay());
  const done = group.items.filter((i) => isDoneToday(i, group, now)).length;
  const when = daysLabel(group);
  const headId = `rt-group-${group.id}`;

  const submit = async () => {
    const title = text.trim();
    if (!title || adding) return;
    setAdding(true);
    if (await onAdd(title)) setText('');
    setAdding(false);
  };

  return (
    <section className="rt-card" aria-labelledby={headId} data-on={on ? 'true' : undefined}>
      <header className="rt-card-head">
        <div className="min-w-0 flex-1">
          <h4 id={headId} className="rt-card-title">
            {group.name}
          </h4>
          <p className="rt-card-sub">
            {when ?? 'No fixed days'}
            {isDailies && ` · starts over at ${DAILIES_RESET_HOUR} am`}
            {switchedOn && ' · on for today'}
            {on && group.items.length > 0 && ` · ${done} of ${group.items.length} done`}
          </p>
        </div>
        {canSwitch && (
          <button
            type="button"
            aria-pressed={switchedOn}
            onClick={() => onSwitch(!switchedOn)}
            className="rt-switch"
            title={switchedOn ? 'Turn off for today' : 'Show it on Today, for today only'}
          >
            {switchedOn ? (
              <Icon name="CheckIcon" size={14} />
            ) : (
              <FlatIcon name="sun" size={14} quiet className="text-current" />
            )}
            {switchedOn ? 'On today' : 'Use today'}
          </button>
        )}
        <button
          ref={menuRef}
          type="button"
          onClick={() => setMenuOpen((v) => !v)}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          aria-label={`More for ${group.name}`}
          className="todo-btn todo-btn-ghost h-9 w-9 shrink-0 px-0"
        >
          <Icon name="EllipsisHorizontalIcon" size={18} />
        </button>
        <Popover
          open={menuOpen}
          anchorRef={menuRef}
          onClose={() => setMenuOpen(false)}
          label={`Actions for ${group.name}`}
          className="todo-popover min-w-[14rem] p-1"
        >
          <MenuItem
            icon="PencilSquareIcon"
            label={isDailies ? 'Rename' : 'Edit name and days'}
            onClick={() => (setMenuOpen(false), onEdit())}
          />
          {canSwitch && (
            <MenuItem
              icon={switchedOn ? 'XMarkIcon' : 'SunIcon'}
              label={switchedOn ? 'Turn off for today' : 'Turn on for today'}
              onClick={() => (setMenuOpen(false), onSwitch(!switchedOn))}
            />
          )}
          {!isDailies && (
            <MenuItem
              icon="TrashIcon"
              label="Delete group"
              danger
              onClick={() => (setMenuOpen(false), onDelete())}
            />
          )}
        </Popover>
      </header>

      {group.items.length > 0 ? (
        <ul className="agenda-list">
          {group.items.map((item) => (
            <RoutineItemRow
              key={item.id}
              item={item}
              done={isDoneToday(item, group, now)}
              groups={groups}
              onToggle={(d) => onToggle(item, d)}
              onRename={(title) => onRename(item, title)}
              onPriority={(p) => onPriority(item, p)}
              onMoveToGroup={(target) => onMoveToGroup(item, target)}
              onMoveOut={(to) => onMoveOut(item, to)}
              onDelete={() => onDeleteItem(item)}
            />
          ))}
        </ul>
      ) : (
        <p className="px-3 pb-1 pt-0.5 text-[13px] text-muted-foreground">
          {isDailies
            ? 'What do you do every day? Water, a walk, ten minutes of reading.'
            : 'Nothing in this group yet.'}
        </p>
      )}

      <form
        className="rt-add"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <Icon name="PlusIcon" size={16} className="shrink-0 text-muted-foreground" />
        <input
          type="text"
          value={text}
          maxLength={200}
          onChange={(e) => setText(e.target.value)}
          placeholder={`Add to ${group.name}`}
          aria-label={`Add an item to ${group.name}`}
          className="rt-add-input"
          enterKeyHint="done"
        />
        {text.trim() && (
          <button
            type="submit"
            disabled={adding}
            className="todo-btn todo-btn-primary h-8 shrink-0 px-3 text-[13px]"
          >
            {adding ? 'Adding…' : 'Add'}
          </button>
        )}
      </form>
    </section>
  );
}

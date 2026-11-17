'use client';

import React, { useRef, useState } from 'react';
import Icon from '@/components/ui/AppIcon';
import Popover from '@/components/ui/Popover';
import type { TaskPriority } from '@/lib/services/todoService';
import type { RoutineGroup, RoutineItem } from '@/lib/services/routineService';
import { PRIORITY_META } from '../capture/VoiceCapture';
import RoutineGroupMenu from './RoutineGroupMenu';

interface RoutineItemRowProps {
  item: RoutineItem;
  done: boolean;
  onToggle: (done: boolean) => void;
  /** Left out on Today, where a row only ticks; the Routines tab passes the rest. */
  groups?: RoutineGroup[];
  onRename?: (title: string) => void;
  onPriority?: (priority: TaskPriority) => void;
  onMoveToGroup?: (group: RoutineGroup) => void;
  onMoveOut?: (to: 'task' | 'quick') => void;
  onDelete?: () => void;
  /** A small note under the title (Today shows which group an item is from). */
  hint?: string;
}

const PRIORITIES: TaskPriority[] = ['p1', 'p2', 'p3', 'p4'];

export default function RoutineItemRow({
  item,
  done,
  onToggle,
  groups,
  onRename,
  onPriority,
  onMoveToGroup,
  onMoveOut,
  onDelete,
  hint,
}: RoutineItemRowProps) {
  const prio = PRIORITY_META[item.priority] ?? PRIORITY_META.p3;
  const [menu, setMenu] = useState<'closed' | 'main' | 'priority' | 'move'>('closed');
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(item.title);
  const menuRef = useRef<HTMLButtonElement>(null);
  const hasMenu = !!(onRename || onPriority || onMoveToGroup || onMoveOut || onDelete);
  const close = () => setMenu('closed');

  const commit = () => {
    setEditing(false);
    const title = draft.trim();
    if (title && title !== item.title) onRename?.(title);
    else setDraft(item.title);
  };

  return (
    <li className="todo-row agenda-row" data-done={done ? 'true' : undefined}>
      <button
        type="button"
        role="checkbox"
        aria-checked={done}
        aria-label={done ? `Mark “${item.title}” not done today` : `Done today: “${item.title}”`}
        onClick={() => onToggle(!done)}
        className="prio-check"
        style={{ '--prio': prio.ring } as React.CSSProperties}
      >
        <span className="prio-check-dot" aria-hidden>
          <Icon name="CheckIcon" size={12} className="prio-check-mark" />
        </span>
      </button>

      <div className="min-w-0 flex-1">
        {editing ? (
          <input
            type="text"
            autoFocus
            value={draft}
            maxLength={200}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                commit();
              } else if (e.key === 'Escape') {
                e.preventDefault();
                setDraft(item.title);
                setEditing(false);
              }
            }}
            aria-label={`Rename “${item.title}”`}
            className="todo-input mt-1 h-9 px-2.5 text-[15px]"
            enterKeyHint="done"
          />
        ) : onRename ? (
          <button
            type="button"
            onClick={() => (setDraft(item.title), setEditing(true))}
            className="agenda-task-title todo-focus rounded text-left"
            title="Rename"
          >
            {item.title}
          </button>
        ) : (
          <p className="agenda-task-title">{item.title}</p>
        )}
        {(hint || item.priority !== 'p3') && !editing && (
          <div className="agenda-meta">
            {hint && <span className="agenda-parent">{hint}</span>}
            {item.priority !== 'p3' && (
              <span className="vc-chip" data-set="true" title={`${prio.label} priority`}>
                <Icon name="FlagIcon" size={13} variant="solid" className={prio.className} />
                {prio.label}
              </span>
            )}
          </div>
        )}
      </div>

      {hasMenu && (
        <>
          <button
            ref={menuRef}
            type="button"
            onClick={() => setMenu((m) => (m === 'closed' ? 'main' : 'closed'))}
            aria-haspopup="menu"
            aria-expanded={menu !== 'closed'}
            aria-label={`More for “${item.title}”`}
            className="todo-btn todo-btn-ghost todo-reveal h-9 w-9 shrink-0 px-0"
          >
            <Icon name="EllipsisHorizontalIcon" size={18} />
          </button>
          <Popover
            open={menu !== 'closed'}
            anchorRef={menuRef}
            onClose={close}
            label={`Actions for ${item.title}`}
            className="todo-popover p-1"
          >
            {menu === 'priority' ? (
              <div className="min-w-[12rem]">
                <SubHead title="Priority" onBack={() => setMenu('main')} />
                {PRIORITIES.map((p) => (
                  <MenuItem
                    key={p}
                    icon="FlagIcon"
                    iconClass={PRIORITY_META[p].className}
                    solid
                    label={PRIORITY_META[p].label}
                    checked={item.priority === p}
                    onClick={() => (close(), p !== item.priority && onPriority?.(p))}
                  />
                ))}
              </div>
            ) : menu === 'move' ? (
              <RoutineGroupMenu
                title="Move to another group"
                groups={groups}
                excludeId={item.group_id}
                onBack={() => setMenu('main')}
                onPick={(group) => (close(), onMoveToGroup?.(group))}
              />
            ) : (
              <div className="min-w-[14rem]">
                {onRename && (
                  <MenuItem
                    icon="PencilSquareIcon"
                    label="Rename"
                    onClick={() => (close(), setDraft(item.title), setEditing(true))}
                  />
                )}
                {onPriority && (
                  <MenuItem
                    icon="FlagIcon"
                    label="Priority"
                    trailing={prio.label}
                    onClick={() => setMenu('priority')}
                  />
                )}
                {onMoveToGroup && (
                  <MenuItem
                    icon="ArrowPathRoundedSquareIcon"
                    label="Move to another group"
                    chevron
                    onClick={() => setMenu('move')}
                  />
                )}
                {onMoveOut && (
                  <>
                    <MenuItem
                      icon="CalendarDaysIcon"
                      label="Move to To-Do, due today"
                      onClick={() => (close(), onMoveOut('task'))}
                    />
                    <MenuItem
                      icon="BoltIcon"
                      label="Move to Quick Daily"
                      onClick={() => (close(), onMoveOut('quick'))}
                    />
                  </>
                )}
                {onDelete && (
                  <MenuItem
                    icon="TrashIcon"
                    label="Delete"
                    danger
                    onClick={() => (close(), onDelete())}
                  />
                )}
              </div>
            )}
          </Popover>
        </>
      )}
    </li>
  );
}

function SubHead({ title, onBack }: { title: string; onBack: () => void }) {
  return (
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
  );
}

interface MenuItemProps {
  icon: string;
  label: string;
  onClick: () => void;
  danger?: boolean;
  chevron?: boolean;
  trailing?: string;
  checked?: boolean;
  iconClass?: string;
  solid?: boolean;
}

export function MenuItem({
  icon,
  label,
  onClick,
  danger,
  chevron,
  trailing,
  checked,
  iconClass,
  solid,
}: MenuItemProps) {
  return (
    <button
      type="button"
      role={checked === undefined ? 'menuitem' : 'menuitemradio'}
      aria-checked={checked}
      onClick={onClick}
      className={`todo-focus flex min-h-[2.75rem] w-full items-center gap-2.5 rounded-md px-2.5 text-left text-sm hover:bg-muted ${danger ? 'text-error' : 'text-foreground'}`}
    >
      <Icon
        name={icon}
        size={16}
        variant={solid ? 'solid' : 'outline'}
        className={iconClass ?? (danger ? '' : 'text-muted-foreground')}
      />
      <span className="min-w-0 flex-1">{label}</span>
      {trailing && <span className="text-xs text-muted-foreground">{trailing}</span>}
      {checked && <Icon name="CheckIcon" size={14} className="text-primary" />}
      {chevron && <Icon name="ChevronRightIcon" size={14} className="text-muted-foreground" />}
    </button>
  );
}

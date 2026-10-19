'use client';

/**
 * Pieces of the left (topics) sidebar shared by the DSA, CV and System Design labs: the header with its collapse control,
 * the dashed "add" row, the inline add form, and the collapsible "Recent" list. Row geometry and the active state come from
 * the `.lab-row` / `.lab-caption` / `.lab-tile` classes in tailwind.css; the accent comes from `--lab-accent*`, so every
 * Settings accent follows live in light and dark.
 *
 * A name is never cut with an ellipsis (a topic, the header subtitle, a Recent entry): it wraps and the row grows. Controls
 * that sit inside the scrolling nav draw their focus ring inset (an offset ring would be clipped at the nav's edge).
 */
import { useEffect, useId, useState, type ReactNode } from 'react';
import Icon from '@/components/ui/AppIcon';

/**
 * A row's secondary control (a "+", a remove "x"): hidden until the row is hovered or has keyboard focus, on devices that
 * can hover. Touch screens can't hover, so there it is always shown. The row must carry `group`.
 */
export const LAB_REVEAL =
  '[@media(hover:hover)]:opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100 aria-expanded:opacity-100 transition-opacity';

/** Inset focus ring for a control inside the scrolling nav (`todo-focus` alone draws an offset ring that the nav would clip). */
const INSET_FOCUS = 'focus-visible:ring-inset focus-visible:ring-offset-0';

/* ───────────────────────────── header ───────────────────────────── */

/**
 * Lab identity at the top of the sidebar: tile, title, subtitle, an optional settings control and the collapse button.
 * Collapsed (the 48px rail) it is the tile with an expand button under it. No bottom border: spacing separates it.
 */
export function LabSidebarHeader({
  icon,
  title,
  subtitle,
  expanded,
  onCollapse,
  onExpand,
  settings,
  onOpenGuide,
  collapseLabel = 'Collapse sidebar',
}: {
  icon: string;
  title: string;
  subtitle: string;
  expanded: boolean;
  onCollapse: () => void;
  onExpand: () => void;
  /** The lab's settings button; only shown while expanded. */
  settings?: ReactNode;
  /** Callback to open the lab guide reading modal */
  onOpenGuide?: () => void;
  /** Name of the collapse button. Say "Close sidebar" where the sidebar is a phone sheet. */
  collapseLabel?: string;
}) {
  if (!expanded) {
    return (
      <div className="flex flex-col items-center gap-2 px-1 pb-2 pt-3">
        <span aria-hidden="true" className="lab-tile h-8 w-8">
          <Icon name={icon} size={18} />
        </span>
        {onOpenGuide && (
          <button
            type="button"
            onClick={onOpenGuide}
            aria-label={`Guide: How to use ${title}`}
            title={`Guide: How to use ${title}`}
            className="todo-btn todo-btn-ghost h-8 w-8 px-0 text-muted-foreground hover:text-foreground"
          >
            <Icon name="BookOpenIcon" size={16} />
          </button>
        )}
        <button
          type="button"
          onClick={onExpand}
          aria-label="Expand sidebar"
          title="Expand sidebar"
          className="todo-btn todo-btn-ghost h-8 w-8 px-0"
        >
          <Icon name="ChevronRightIcon" size={16} />
        </button>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-2.5 px-3 pb-2 pt-3">
      <span aria-hidden="true" className="lab-tile h-8 w-8">
        <Icon name={icon} size={18} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 flex-wrap">
          <h2 className="break-words text-sm font-semibold leading-tight tracking-tight text-foreground">
            {title}
          </h2>
          {onOpenGuide && (
            <button
              type="button"
              onClick={onOpenGuide}
              aria-label={`Guide: How to use ${title}`}
              title={`Guide: How to use ${title}`}
              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-medium bg-muted/80 hover:bg-muted text-muted-foreground hover:text-foreground border border-border/70 transition-colors flex-shrink-0 cursor-pointer"
            >
              <Icon name="BookOpenIcon" size={11} className="text-primary flex-shrink-0" />
              <span>Guide</span>
            </button>
          )}
        </div>
        <p className="mt-0.5 break-words text-[13px] font-medium leading-snug tabular-nums mix-text-foreground/[0.74]">
          {subtitle}
        </p>
      </div>
      {settings}
      <button
        type="button"
        onClick={onCollapse}
        aria-label={collapseLabel}
        title={collapseLabel}
        className="todo-btn todo-btn-ghost h-8 w-8 flex-shrink-0 px-0"
      >
        <Icon name="ChevronLeftIcon" size={16} />
      </button>
    </div>
  );
}

/* ───────────────────────────── add row + inline add ───────────────────────────── */

/** The dashed "Add ..." row at the end of a sidebar group. */
export function LabAddRow({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="todo-focus flex min-h-[2rem] w-full items-center gap-2 rounded-md border border-dashed border-border px-2.5 py-1.5 text-left text-xs font-medium text-muted-foreground transition-smooth hover:mix-border-primary/40 hover:lab-tint hover:lab-ink"
    >
      <Icon name="PlusIcon" size={14} className="flex-shrink-0" />
      <span className="min-w-0 break-words leading-snug">{label}</span>
    </button>
  );
}

/** A one-line add form: input plus submit and cancel. Enter submits, Escape cancels. */
export function LabInlineAdd({
  value,
  onChange,
  onSubmit,
  onCancel,
  placeholder,
  ariaLabel,
  busy = false,
  submitLabel = 'Add',
  iconOnly = false,
  className = '',
}: {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  onCancel: () => void;
  placeholder: string;
  ariaLabel: string;
  busy?: boolean;
  submitLabel?: string;
  /** Show a check icon instead of the text label (for a narrow row). */
  iconOnly?: boolean;
  className?: string;
}) {
  return (
    <div className={`flex gap-1.5 ${className}`}>
      <input
        autoFocus
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.nativeEvent.isComposing) return;
          if (e.key === 'Enter') {
            e.preventDefault();
            onSubmit();
          } else if (e.key === 'Escape') {
            e.preventDefault();
            onCancel();
          }
        }}
        placeholder={placeholder}
        aria-label={ariaLabel}
        className="todo-input todo-input-quiet min-w-0 flex-1 px-2.5 py-1.5 text-xs"
      />
      {iconOnly ? (
        <button
          type="button"
          onClick={onSubmit}
          disabled={busy}
          aria-label={submitLabel}
          title={submitLabel}
          className="todo-btn todo-btn-quiet w-8 px-0"
        >
          <Icon name="CheckIcon" size={14} />
        </button>
      ) : (
        <button
          type="button"
          onClick={onSubmit}
          disabled={busy}
          className="todo-btn todo-btn-primary"
        >
          {submitLabel}
        </button>
      )}
      <button
        type="button"
        onClick={onCancel}
        aria-label="Cancel"
        title="Cancel"
        className="todo-btn todo-btn-ghost w-8 px-0"
      >
        <Icon name="XMarkIcon" size={14} />
      </button>
    </div>
  );
}

/* ───────────────────────────── recent ───────────────────────────── */

export interface RecentItem {
  /** Stable id (a topic or subtopic id). */
  key: string;
  label: string;
  onOpen: () => void;
}

/**
 * The collapsible "Recent" list. Shows `visibleCount` (default 4) with a "Show N more" toggle; the header collapses the
 * whole list and remembers that in `localStorage[storageKey]` ('1' open, '0' closed; open by default; SSR-safe: the saved
 * choice is read after mount). The items themselves (and how many are stored) belong to the lab. Renders nothing for an
 * empty list.
 */
export function LabRecentList({
  items,
  onRemove,
  storageKey,
  visibleCount = 4,
}: {
  items: RecentItem[];
  onRemove: (key: string) => void;
  storageKey: string;
  visibleCount?: number;
}) {
  const listId = useId();
  const [open, setOpen] = useState(true);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    try {
      if (window.localStorage.getItem(storageKey) === '0') setOpen(false);
    } catch {
      /* storage blocked: stay open */
    }
  }, [storageKey]);

  if (items.length === 0) return null;

  const toggle = () => {
    const next = !open;
    setOpen(next);
    try {
      window.localStorage.setItem(storageKey, next ? '1' : '0');
    } catch {
      /* storage blocked: the choice still holds for this visit */
    }
  };

  const shown = showAll ? items : items.slice(0, visibleCount);
  const hidden = items.length - shown.length;

  return (
    <div>
      {/* Inset like every other sidebar row (px-1.5), so the hover fill and the icon line up with the Wiki and section rows. */}
      <div className="px-1.5">
        <button
          type="button"
          onClick={toggle}
          aria-expanded={open}
          aria-controls={open ? listId : undefined}
          className="lab-row gap-1.5"
        >
          <Icon name="ClockIcon" size={12} className="flex-shrink-0 text-muted-foreground" />
          <span className="lab-caption">Recent</span>
          <span className="text-xs font-medium tabular-nums text-muted-foreground">
            {items.length}
          </span>
          <Icon
            name="ChevronDownIcon"
            size={12}
            className={`ml-auto flex-shrink-0 text-muted-foreground transition-transform ${open ? '' : '-rotate-90'}`}
          />
        </button>
      </div>
      {open && (
        <>
          <ul id={listId} className="mt-0.5 px-1.5">
            {shown.map((item) => (
              <li
                key={item.key}
                className="group flex min-h-[2rem] items-stretch rounded-md hover:mix-bg-foreground/[0.05]"
              >
                <button
                  type="button"
                  onClick={item.onOpen}
                  className={`todo-focus ${INSET_FOCUS} min-w-0 flex-1 break-words rounded-md py-[0.4375rem] pl-3 pr-1 text-left text-xs font-medium leading-snug text-foreground`}
                >
                  {item.label}
                </button>
                <button
                  type="button"
                  onClick={() => onRemove(item.key)}
                  aria-label={`Remove ${item.label} from Recent`}
                  className={`todo-focus ${INSET_FOCUS} mr-1 flex-shrink-0 self-center rounded-md p-1.5 text-muted-foreground hover:text-foreground ${LAB_REVEAL}`}
                >
                  <Icon name="XMarkIcon" size={12} />
                </button>
              </li>
            ))}
          </ul>
          {(hidden > 0 || (showAll && items.length > visibleCount)) && (
            <button
              type="button"
              onClick={() => setShowAll((v) => !v)}
              className="todo-focus ml-[1.125rem] mt-0.5 rounded-sm py-1 text-xs font-semibold lab-ink hover:underline"
            >
              {showAll ? 'Show fewer' : `Show ${hidden} more`}
            </button>
          )}
        </>
      )}
    </div>
  );
}

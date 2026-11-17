'use client';

import { useId, type ReactNode } from 'react';
import Icon from '@/components/ui/AppIcon';
import Modal from '@/components/ui/Modal';
import { ACHIEVEMENT_NOTES } from './constants';
import { setPref, usePrefs, type FontSize } from './prefs';
import { SwitchRow } from './Switch';
import { ProgressBar } from './ui';
import { achievementStatuses } from './xp';
import type { GuidedState } from './types';

/**
 * The three sheets of the page: Achievements, Preferences, Shortcuts. They use the app's Modal, so on a phone each is a
 * bottom sheet with a grabber (drag down to dismiss) and on a desktop a centred panel. They are portalled to <body>, so the
 * panel carries the page's accent and the lab hairline itself.
 */
function Sheet({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}) {
  const titleId = useId();
  return (
    <Modal
      isOpen={open}
      onClose={onClose}
      labelledBy={titleId}
      className="gp-accent lab-page dsa-type flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-[20px] border bg-popover text-popover-foreground"
    >
      <div className="ios-sheet-head flex items-center justify-between gap-3 px-5 pb-3 pt-4">
        <h2 id={titleId} className="text-lg font-semibold tracking-tight">
          {title}
        </h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          data-autofocus=""
          className="todo-btn todo-btn-quiet h-9 w-9 shrink-0 px-0"
        >
          <Icon name="XMarkIcon" size={16} />
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-5">{children}</div>
    </Modal>
  );
}

// ── Achievements ────────────────────────────────────────────────────────────

const MEDAL = 56;
const MEDAL_R = 25;
const MEDAL_C = 2 * Math.PI * MEDAL_R;

/** A medal: the achievement's icon inside a ring that fills as the learner gets closer. */
export function Medal({
  icon,
  value,
  target,
  earned,
}: {
  icon: string;
  value: number;
  target: number;
  earned: boolean;
}) {
  const fraction = earned ? 1 : target ? Math.min(1, value / target) : 0;
  return (
    <span
      className="gp-medal relative inline-flex shrink-0"
      data-earned={earned}
      style={{ width: MEDAL, height: MEDAL }}
    >
      <svg
        width={MEDAL}
        height={MEDAL}
        viewBox={`0 0 ${MEDAL} ${MEDAL}`}
        className="absolute inset-0"
        aria-hidden="true"
      >
        <g transform={`rotate(-90 ${MEDAL / 2} ${MEDAL / 2})`}>
          <circle
            className="gp-medal-track"
            cx={MEDAL / 2}
            cy={MEDAL / 2}
            r={MEDAL_R}
            strokeWidth={4}
          />
          {fraction > 0 && (
            <circle
              className="gp-medal-arc"
              cx={MEDAL / 2}
              cy={MEDAL / 2}
              r={MEDAL_R}
              strokeWidth={4}
              strokeDasharray={MEDAL_C}
              strokeDashoffset={MEDAL_C * (1 - fraction)}
            />
          )}
        </g>
      </svg>
      <span className="gp-medal-face absolute" style={{ inset: 7 }}>
        <Icon name={icon} size={20} variant={earned ? 'solid' : 'outline'} aria-hidden="true" />
      </span>
    </span>
  );
}

export function AchievementsSheet({
  open,
  onClose,
  state,
}: {
  open: boolean;
  onClose: () => void;
  state: GuidedState;
}) {
  const statuses = achievementStatuses(state);
  const earned = statuses.filter((s) => s.earnedAt).length;
  return (
    <Sheet open={open} onClose={onClose} title="Achievements">
      <div className="mb-4 flex items-center gap-3">
        <p className="text-sm tabular-nums text-muted-foreground">
          <span className="font-semibold text-foreground">{earned}</span> of {statuses.length}{' '}
          earned
        </p>
        <ProgressBar
          value={earned}
          max={statuses.length}
          label={`${earned} of ${statuses.length} achievements earned`}
          className="flex-1"
        />
      </div>
      <ul className="gp-group">
        {statuses.map(({ def, value, target, earnedAt }) => (
          <li key={def.id} className="flex items-center gap-3.5 px-4 py-3">
            <Medal icon={def.icon} value={value} target={target} earned={!!earnedAt} />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-foreground">
                {def.title}
                {earnedAt && <span className="sr-only"> (earned)</span>}
              </p>
              <p className="mt-0.5 text-xs leading-snug text-muted-foreground">{def.description}</p>
              <p
                className={`mt-1 text-xs tabular-nums ${earnedAt ? 'text-success' : 'text-muted-foreground'}`}
              >
                {earnedAt
                  ? `Earned ${new Date(earnedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`
                  : `${value} of ${target}`}
              </p>
            </div>
          </li>
        ))}
      </ul>
      <ul className="mt-4 space-y-1.5 text-xs leading-snug text-muted-foreground">
        {ACHIEVEMENT_NOTES.map((note) => (
          <li key={note}>{note}</li>
        ))}
      </ul>
    </Sheet>
  );
}

// ── Preferences ─────────────────────────────────────────────────────────────

// Not generic on purpose: the app's JSX tagger cannot parse a JSX element that carries a type argument.
function Segmented({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string | number;
  options: { value: string | number; label: string }[];
  onChange: (v: string | number) => void;
}) {
  return (
    <div className="todo-segmented" role="group" aria-label={label}>
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          aria-pressed={o.value === value}
          onClick={() => onChange(o.value)}
          className="todo-segment todo-focus min-w-[2.25rem] px-3 py-1.5 text-xs font-medium"
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function GroupTitle({ children }: { children: ReactNode }) {
  return (
    <h3 className="mb-1.5 mt-5 px-1 text-xs font-medium text-muted-foreground first:mt-0">
      {children}
    </h3>
  );
}

export function PrefsSheet({
  open,
  onClose,
  onStartOver,
}: {
  open: boolean;
  onClose: () => void;
  onStartOver: () => void;
}) {
  const prefs = usePrefs();
  return (
    <Sheet open={open} onClose={onClose} title="Preferences">
      <GroupTitle>Game</GroupTitle>
      <div className="gp-group">
        <SwitchRow
          title="Game mode"
          description="XP, levels, rings, streaks, badges and rewards. Progress is tracked either way."
          checked={prefs.game}
          onChange={(v) => setPref('game', v)}
        />
        <SwitchRow
          title="Celebrations"
          description="Reward banners and the small animations that go with them."
          checked={prefs.celebrate}
          disabled={!prefs.game}
          onChange={(v) => setPref('celebrate', v)}
        />
        <SwitchRow
          title="Sound and haptics"
          description="A short tone and a tap when you earn something."
          checked={prefs.feedback}
          disabled={!prefs.game}
          onChange={(v) => setPref('feedback', v)}
        />
        <div className="gp-group-row justify-between">
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-medium text-foreground">Daily goal</span>
            <span className="mt-0.5 block text-xs text-muted-foreground">
              Questions a day for the Today ring.
            </span>
          </span>
          <Segmented
            label="Daily goal"
            value={prefs.dailyGoal}
            onChange={(v) => setPref('dailyGoal', Number(v))}
            options={[1, 2, 3, 5].map((n) => ({ value: n, label: String(n) }))}
          />
        </div>
      </div>

      <GroupTitle>Path</GroupTitle>
      <div className="gp-group">
        <SwitchRow
          title="Compact rows"
          description="Tighter spacing in the list of questions."
          checked={prefs.compact}
          onChange={(v) => setPref('compact', v)}
        />
        <SwitchRow
          title="Hide completed"
          description="Only the questions that are still to do."
          checked={prefs.todoOnly}
          onChange={(v) => setPref('todoOnly', v)}
        />
        <SwitchRow
          title="Focus mode"
          description="Only the workspace: no dashboard, no path."
          checked={prefs.focus}
          onChange={(v) => setPref('focus', v)}
        />
      </div>

      <GroupTitle>Editor</GroupTitle>
      <div className="gp-group">
        <SwitchRow
          title="Line numbers"
          checked={prefs.lineNumbers}
          onChange={(v) => setPref('lineNumbers', v)}
        />
        <div className="gp-group-row justify-between">
          <span className="text-sm font-medium text-foreground">Text size</span>
          <Segmented
            label="Editor text size"
            value={prefs.fontSize}
            onChange={(v) => setPref('fontSize', v as FontSize)}
            options={[
              { value: 's', label: 'S' },
              { value: 'm', label: 'M' },
              { value: 'l', label: 'L' },
            ]}
          />
        </div>
      </div>

      <GroupTitle>This path</GroupTitle>
      <div className="gp-group">
        <button
          type="button"
          onClick={() => {
            onClose();
            onStartOver();
          }}
          className="gp-group-row todo-focus w-full text-left text-sm font-medium text-error"
        >
          Start over…
        </button>
      </div>
      <p className="mt-4 px-1 text-xs leading-snug text-muted-foreground">
        Preferences are saved in this browser. Your path, progress and answers are saved to your
        account.
      </p>
    </Sheet>
  );
}

// ── Shortcuts ───────────────────────────────────────────────────────────────

export const SHORTCUTS: { keys: string[]; label: string }[] = [
  { keys: ['J'], label: 'Next question' },
  { keys: ['K'], label: 'Previous question' },
  { keys: ['T'], label: 'Open or close the AI Tutor' },
  { keys: ['S'], label: 'Open or close the STAR answer' },
  { keys: ['B'], label: 'Break the question down' },
  { keys: ['D'], label: 'Dive deeper' },
  { keys: ['R'], label: 'Run the tests' },
  { keys: ['F'], label: 'Focus mode' },
  { keys: ['Ctrl', 'Enter'], label: 'Run the tests from the editor' },
  { keys: ['Esc', 'Tab'], label: 'Leave the editor with the keyboard' },
  { keys: ['?'], label: 'This list' },
];

export function ShortcutsSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Sheet open={open} onClose={onClose} title="Keyboard shortcuts">
      <ul className="gp-group">
        {SHORTCUTS.map((s) => (
          <li key={s.label} className="gp-group-row justify-between">
            <span className="text-sm text-foreground">{s.label}</span>
            <span className="flex items-center gap-1">
              {s.keys.map((k, i) => (
                <span key={k} className="flex items-center gap-1">
                  {i > 0 && <span className="text-xs text-muted-foreground">then</span>}
                  <kbd className="gp-key">{k}</kbd>
                </span>
              ))}
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-4 px-1 text-xs leading-snug text-muted-foreground">
        Letter shortcuts work when the cursor is not in a text field. On a Mac, Ctrl+Enter is also
        Cmd+Enter.
      </p>
    </Sheet>
  );
}

'use client';

import { useEffect, useState, type RefObject } from 'react';
import Link from 'next/link';
import Icon from '@/components/ui/AppIcon';
import BackButton from '@/components/ui/BackButton';
import { DifficultyTag } from '@/modules/labs/common/LabTags';
import { LcTag, Spinner, Tag } from './ui';
import type { SaveStatus } from './useGuidedStore';
import type { TopicRef } from './types';

/** What happened to the last change: quiet, and only when there is something to say. */
export function SaveState({ status, onRetry }: { status: SaveStatus; onRetry: () => void }) {
  if (status === 'idle') return null;
  return (
    <span
      role={status === 'error' ? 'alert' : 'status'}
      aria-live="polite"
      className={`inline-flex items-center gap-1.5 text-xs font-medium ${status === 'error' ? 'text-error' : 'text-muted-foreground'}`}
    >
      {status === 'saving' ? (
        <>
          <Spinner size={11} /> Saving…
        </>
      ) : status === 'saved' ? (
        <>
          <Icon name="CheckCircleIcon" variant="solid" size={14} className="text-success" /> Saved
        </>
      ) : (
        <>
          <Icon name="ExclamationCircleIcon" variant="solid" size={14} /> Couldn’t save
          <button
            type="button"
            onClick={onRetry}
            className="todo-focus rounded font-semibold underline-offset-2 hover:underline"
          >
            Retry
          </button>
        </>
      )}
    </span>
  );
}

function IconAction({
  label,
  icon,
  onClick,
  pressed,
  badge,
}: {
  label: string;
  icon: string;
  onClick: () => void;
  pressed?: boolean;
  badge?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      aria-pressed={pressed}
      className="todo-btn todo-btn-quiet h-10 min-w-10 px-2.5 aria-pressed:todo-btn-active"
    >
      <Icon name={icon} size={17} aria-hidden="true" />
      {badge && <span className="text-xs tabular-nums">{badge}</span>}
    </button>
  );
}

/**
 * The top of the page, as an iOS large-title screen: a Back link and the page's actions, the title "Guided Practice", the
 * problem under it, and the overall completion. Once the title scrolls away, `TopBar` takes over as a compact bar.
 */
export default function PageHead({
  topic,
  backHref,
  percent,
  titleRef,
  game,
  badges,
  focus,
  saveStatus,
  onRetrySave,
  onAchievements,
  onPrefs,
  onShortcuts,
  onFocus,
}: {
  topic: TopicRef;
  backHref: string;
  /** null while there is no path yet */
  percent: number | null;
  titleRef: RefObject<HTMLHeadingElement | null>;
  game: boolean;
  badges: { earned: number; total: number } | null;
  focus: boolean;
  saveStatus: SaveStatus;
  onRetrySave: () => void;
  onAchievements: () => void;
  onPrefs: () => void;
  onShortcuts: () => void;
  onFocus: () => void;
}) {
  const name = topic.subName ? `${topic.name} · ${topic.subName}` : topic.name;
  return (
    <header className="pt-3">
      <div className="flex items-center justify-between gap-3">
        <BackButton
          href={backHref}
          label={`Back to ${topic.subName || topic.name}`}
          className="-ml-2.5 min-w-0 shrink [&>span]:break-words [&>span]:text-left [&>span]:leading-snug [&>svg]:flex-shrink-0"
        />
        <div className="flex shrink-0 items-center gap-1.5">
          <span className="hidden sm:block">
            <SaveState status={saveStatus} onRetry={onRetrySave} />
          </span>
          {percent !== null && game && badges && (
            <IconAction
              label="Achievements"
              icon="TrophyIcon"
              onClick={onAchievements}
              badge={`${badges.earned}/${badges.total}`}
            />
          )}
          {percent !== null && (
            <IconAction
              label={focus ? 'Leave focus mode' : 'Focus mode'}
              icon={focus ? 'ArrowsPointingInIcon' : 'ArrowsPointingOutIcon'}
              onClick={onFocus}
              pressed={focus}
            />
          )}
          <IconAction
            label="Keyboard shortcuts"
            icon="QuestionMarkCircleIcon"
            onClick={onShortcuts}
          />
          <IconAction label="Preferences" icon="AdjustmentsHorizontalIcon" onClick={onPrefs} />
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-end justify-between gap-x-[1.5rem] gap-y-3">
        <div className="min-w-0 flex-1">
          <h1
            ref={titleRef}
            className="text-[2rem] font-semibold leading-tight tracking-tight text-foreground sm:text-2xl"
          >
            Guided Practice
          </h1>
          <p className="mt-1 break-words text-base leading-snug text-muted-foreground">{name}</p>
          <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
            {topic.category && <Tag tone="accent">{topic.category}</Tag>}
            <DifficultyTag difficulty={topic.difficulty} />
            <LcTag brief={topic.brief} />
          </div>
        </div>
        {percent !== null && (
          <div
            className="text-left sm:text-right"
            aria-label={`Overall completion ${percent} percent`}
          >
            <p className="text-[2rem] font-semibold leading-none tabular-nums text-foreground">
              {percent}
              <span className="text-lg text-muted-foreground">%</span>
            </p>
            <p className="mt-1 text-xs text-muted-foreground">complete</p>
          </div>
        )}
      </div>
      <div className="mt-2 sm:hidden">
        <SaveState status={saveStatus} onRetry={onRetrySave} />
      </div>
    </header>
  );
}

/** The compact bar that replaces the large title once it has scrolled out of view. */
export function TopBar({
  visible,
  topic,
  backHref,
  percent,
  saveStatus,
}: {
  visible: boolean;
  topic: TopicRef;
  backHref: string;
  percent: number | null;
  saveStatus: SaveStatus;
}) {
  return (
    <div className="gp-topbar-wrap">
      <div
        className="gp-topbar gp-material"
        data-visible={visible}
        aria-hidden={!visible || undefined}
        inert={visible ? undefined : true}
      >
        <div className="mx-auto flex h-[3rem] w-full max-w-[1280px] items-center gap-3 px-4 sm:px-8">
          <Link
            href={backHref}
            aria-label="Back to the topic"
            className="todo-focus -ml-2 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:text-foreground"
          >
            <Icon name="ChevronLeftIcon" size={20} />
          </Link>
          <p className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground">
            {topic.subName || topic.name}
          </p>
          <SaveState
            status={saveStatus === 'saved' ? 'idle' : saveStatus}
            onRetry={() => undefined}
          />
          {percent !== null && (
            <p className="shrink-0 text-sm font-semibold tabular-nums text-foreground">
              {percent}%
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

/** True while the element is on screen; the title's visibility decides when the top bar shows. */
export function useInView(ref: RefObject<Element | null>, topOffset = 64): boolean {
  const [inView, setInView] = useState(true);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(([entry]) => setInView(entry.isIntersecting), {
      rootMargin: `-${topOffset}px 0px 0px 0px`,
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref, topOffset]);
  return inView;
}

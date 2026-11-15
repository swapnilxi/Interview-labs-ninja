'use client';

import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import Link from 'next/link';
import Icon from '@/components/ui/AppIcon';
import { useAuth } from '@/contexts/AuthContext';

export type DailySessionTab =
  | 'session'
  | 'practice'
  | 'quick-practice'
  | 'progress'
  | 'question-bank'
  | 'myspace'
  | 'swapnilxi-space';

export interface TabConfig {
  id: DailySessionTab;
  label: string;
  icon: string;
  description: string;
}

/** The order is the flow: today's session first, then the ways to practise, then looking back. */
export const DAILY_SESSION_TABS: TabConfig[] = [
  {
    id: 'session',
    label: 'Today',
    icon: 'SunIcon',
    description: "Today's 10 personalised questions",
  },
  {
    id: 'practice',
    label: 'Practice',
    icon: 'AcademicCapIcon',
    description: 'Build a drill by topic and level',
  },
  {
    id: 'quick-practice',
    label: 'Quick blitz',
    icon: 'BoltIcon',
    description: 'Rapid flashcards with instant answers',
  },
  {
    id: 'progress',
    label: 'Progress',
    icon: 'ChartBarIcon',
    description: 'Readiness, streaks and skill trends',
  },
  {
    id: 'question-bank',
    label: 'Question bank',
    icon: 'BookOpenIcon',
    description: 'Browse, filter and search every question',
  },
];

export const tabHref = (id: DailySessionTab) =>
  id === 'session' ? '/daily-session' : `/daily-session?tab=${id}`;

interface DailySessionTabSwitcherProps {
  activeTab: DailySessionTab;
}

// useLayoutEffect warns during SSR; the thumb is measured in the browser only.
const useIsoLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

/**
 * The section switcher: an iOS segmented control whose raised thumb glides to the active section. On a phone the
 * track scrolls sideways (the active section is kept in view); icons show from the small-tablet width up.
 */
export default function DailySessionTabSwitcher({ activeTab }: DailySessionTabSwitcherProps) {
  const { user } = useAuth();
  const isSwapnilxi = user?.email?.toLowerCase() === 'swapnilgupta.xi@gmail.com';
  const wrapRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLElement>(null);
  const [thumb, setThumb] = useState<{ x: number; w: number } | null>(null);
  // The first placement jumps into position; only later moves glide.
  const [glide, setGlide] = useState(false);
  const [fits, setFits] = useState(true);

  const mySpaceTab: TabConfig = {
    id: isSwapnilxi ? 'swapnilxi-space' : 'myspace',
    label: isSwapnilxi ? 'swapnilxi space' : 'My Space',
    icon: isSwapnilxi ? 'ShieldCheckIcon' : 'LockClosedIcon',
    description: isSwapnilxi
      ? 'Private creator command deck & controls'
      : 'Private notes, targets and your own questions',
  };

  const visibleTabs = [...DAILY_SESSION_TABS, mySpaceTab];

  useIsoLayoutEffect(() => {
    const track = trackRef.current;
    const wrap = wrapRef.current;
    if (!track || !wrap) return;
    const measure = () => {
      const el = track.querySelector<HTMLElement>('[aria-current="page"]');
      setThumb(el ? { x: el.offsetLeft, w: el.offsetWidth } : null);
      setFits(wrap.scrollWidth <= wrap.clientWidth + 1);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(track);
    ro.observe(wrap);
    return () => ro.disconnect();
  }, [activeTab, mySpaceTab.label]);

  useEffect(() => {
    const id = requestAnimationFrame(() => setGlide(true));
    return () => cancelAnimationFrame(id);
  }, []);

  // On a phone the track scrolls sideways: keep the active section in view (the track only, never the page).
  useEffect(() => {
    const wrap = wrapRef.current;
    const el = trackRef.current?.querySelector<HTMLElement>('[aria-current="page"]');
    if (!wrap || !el || wrap.scrollWidth <= wrap.clientWidth) return;
    const left = el.offsetLeft - (wrap.clientWidth - el.offsetWidth) / 2;
    wrap.scrollTo({ left, behavior: glide ? 'smooth' : 'auto' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  return (
    <div ref={wrapRef} className="ds-tabs-wrap" data-fits={fits}>
      <nav ref={trackRef} aria-label="Daily Session sections" className="ds-tabs">
        <span
          className="ds-tabs-thumb"
          aria-hidden="true"
          data-ready={glide}
          style={{
            transform: `translateX(${thumb?.x ?? 0}px)`,
            width: thumb?.w ?? 0,
            opacity: thumb ? 1 : 0,
          }}
        />
        {visibleTabs.map((tab) => {
          const isMySpaceTab = tab.id === 'myspace' || tab.id === 'swapnilxi-space';
          const isActive =
            activeTab === tab.id ||
            (isMySpaceTab && (activeTab === 'myspace' || activeTab === 'swapnilxi-space'));
          return (
            <Link
              key={tab.id}
              href={tabHref(tab.id)}
              scroll={false}
              prefetch={false}
              aria-current={isActive ? 'page' : undefined}
              title={tab.description}
              className="ds-tab"
            >
              <Icon
                name={tab.icon}
                size={17}
                variant={isActive ? 'solid' : 'outline'}
                className="hidden flex-shrink-0 sm:block"
              />
              {tab.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}

'use client';

import React, { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Icon from '@/components/ui/AppIcon';
import DailySessionInteractive from './DailySessionModule';
import DailySessionTabSwitcher, {
  DailySessionTab,
  tabHref,
} from './components/DailySessionTabSwitcher';
import PracticeMode from './components/PracticeMode';
import QuickPractice from './components/QuickPractice';
import ProgressDashboardInteractive from '@/modules/progress-dashboard/ProgressDashboardModule';
import QuestionBankInteractive from '@/modules/question-bank/QuestionBankModule';
import SwapnilxiSpace from './components/SwapnilxiSpace';
import { useCompanionStats } from './companion/useCompanion';
import './daily-session.css';

const TAB_HEADER: Record<DailySessionTab, { title: string; subtitle: string }> = {
  session: {
    title: "Today's session",
    subtitle:
      'Ten questions picked for you. Answer at your own pace, with hints when you need them.',
  },
  practice: {
    title: 'Practice',
    subtitle: 'Build a focused drill: pick a topic, a level and how long you have.',
  },
  'quick-practice': {
    title: 'Quick blitz',
    subtitle: 'Rapid flashcards with instant model answers. Great for a five-minute gap.',
  },
  progress: {
    title: 'Your progress',
    subtitle: 'Readiness, streaks and how each skill is trending.',
  },
  'question-bank': {
    title: 'Question bank',
    subtitle: "Every question you've seen, searchable and filterable.",
  },
  myspace: {
    title: 'My Space',
    subtitle: 'Your private notes, targets and custom questions.',
  },
  'swapnilxi-space': {
    title: 'Creator space',
    subtitle: 'Creator controls, direct database ingestion and roadmap notes.',
  },
};

const VALID_TABS: DailySessionTab[] = [
  'session',
  'practice',
  'quick-practice',
  'progress',
  'question-bank',
  'myspace',
  'swapnilxi-space',
];

/** "Good evening · Saturday, 14 November". Computed after mount so the server and browser never disagree. */
function useGreeting() {
  const [text, setText] = useState('');
  useEffect(() => {
    const now = new Date();
    const h = now.getHours();
    const part =
      h < 5
        ? 'Burning the midnight oil'
        : h < 12
          ? 'Good morning'
          : h < 17
            ? 'Good afternoon'
            : 'Good evening';
    setText(
      `${part} · ${now.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}`
    );
  }, []);
  return text;
}

function DailySessionContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { stats } = useCompanionStats();
  const greeting = useGreeting();

  const tabParam = searchParams.get('tab') as DailySessionTab | null;

  // The URL is the source of truth for the tab, so Back/Forward, a reload and a shared link all land on the
  // same one. A missing or unknown ?tab= is the default tab (Today), which is also what Back to a
  // tab-less /daily-session must show.
  const activeTab: DailySessionTab =
    tabParam && VALID_TABS.includes(tabParam) ? tabParam : 'session';

  // A hand-edited ?tab=zzz shows the default tab, so the address is corrected to match (replace: no history entry).
  useEffect(() => {
    if (tabParam && !VALID_TABS.includes(tabParam))
      router.replace('/daily-session', { scroll: false });
  }, [tabParam, router]);

  const handleTabChange = (newTab: DailySessionTab) => {
    router.push(tabHref(newTab), { scroll: false });
  };

  // Focus mode: while a question is on screen (a session's quiz, a practice run) the page header steps aside,
  // like a lesson in a language app. The run's own top bar has the way out.
  const focused =
    (activeTab === 'session' &&
      searchParams.get('session') !== null &&
      searchParams.get('q') !== null) ||
    (activeTab === 'practice' && searchParams.get('run') !== null);

  const meta = TAB_HEADER[activeTab] || TAB_HEADER.session;

  return (
    <div className="lab-page ds-skin min-h-screen pt-[60px]" data-accent-exempt="">
      {!focused && (
        <header className="ds-header">
          <div className="mx-auto max-w-[1200px] px-4 pt-[1.75rem] sm:px-[2rem] sm:pt-[2.25rem]">
            <div className="flex flex-col gap-5 pb-4 sm:flex-row sm:items-end sm:justify-between">
              <div className="min-w-0 ds-enter">
                <p className="ds-eyebrow min-h-[1rem]">{greeting}</p>
                <h1 className="ds-display mt-2">{meta.title}</h1>
                <p className="ds-body mt-1.5 max-w-[56ch]">{meta.subtitle}</p>
              </div>
              <div className="flex flex-shrink-0 items-center gap-2 ds-enter-2">
                <span className="ds-stat ds-tone-gold" title="Days in a row with a finished drill">
                  <Icon name="FireIcon" variant="solid" size={18} />
                  {stats.streak}
                  <small>day streak</small>
                </span>
                <span className="ds-stat ds-tone-indigo" title="Experience points from practice">
                  <Icon name="SparklesIcon" variant="solid" size={17} />
                  {stats.xp.toLocaleString()}
                  <small>XP</small>
                </span>
              </div>
            </div>
            <DailySessionTabSwitcher activeTab={activeTab} />
          </div>
        </header>
      )}

      <main
        className={`mx-auto max-w-[1200px] px-4 sm:px-[2rem] ${focused ? 'pb-[2rem]' : 'py-[1.5rem] sm:py-[2rem]'}`}
      >
        {activeTab === 'session' && <DailySessionInteractive />}
        {activeTab === 'practice' && <PracticeMode onSwitchTab={handleTabChange} />}
        {activeTab === 'quick-practice' && <QuickPractice />}
        {activeTab === 'progress' && <ProgressDashboardInteractive embedded />}
        {activeTab === 'question-bank' && <QuestionBankInteractive embedded />}
        {(activeTab === 'swapnilxi-space' || activeTab === 'myspace') && <SwapnilxiSpace />}
      </main>
    </div>
  );
}

export default function DailySessionContainer() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-background pt-[60px] flex items-center justify-center">
          <div className="w-10 h-10 border-4 border-border border-t-primary rounded-full animate-spin" />
        </div>
      }
    >
      <DailySessionContent />
    </Suspense>
  );
}

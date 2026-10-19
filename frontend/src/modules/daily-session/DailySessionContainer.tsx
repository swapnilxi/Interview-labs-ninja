'use client';

import React, { Suspense, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Icon from '@/components/ui/AppIcon';
import DailySessionInteractive from './DailySessionModule';
import DailySessionTabSwitcher, { DailySessionTab } from './components/DailySessionTabSwitcher';
import PracticeMode from './components/PracticeMode';
import QuickPractice from './components/QuickPractice';
import ProgressDashboardInteractive from '@/modules/progress-dashboard/ProgressDashboardModule';
import QuestionBankInteractive from '@/modules/question-bank/QuestionBankModule';
import SwapnilxiSpace from './components/SwapnilxiSpace';
import { useAuth } from '@/contexts/AuthContext';

const TAB_HEADER_METADATA: Record<
  DailySessionTab,
  { title: string; subtitle: string; badges: string[] }
> = {
  session: {
    title: 'Daily Training Session',
    subtitle: '10 personalised questions · timed practice · AI-powered hints',
    badges: ['Timed practice', 'AI hints on demand', 'Progress tracked', 'DB-backed questions'],
  },
  practice: {
    title: 'Practice Mode',
    subtitle: 'Targeted drill practice · filter by topic & difficulty · self-evaluation',
    badges: ['Custom pool', 'Topic filtering', 'Model solutions', 'Untimed / Timed'],
  },
  'quick-practice': {
    title: 'Quick Practice Blitz',
    subtitle: 'Rapid-fire question flashcards · instant model answers · streak scoring',
    badges: ['Flashcard format', 'Rapid retention', 'Streak counter', 'Random shuffle'],
  },
  progress: {
    title: 'Progress Dashboard',
    subtitle: 'Preparation analytics · skill development trends · interview readiness',
    badges: ['Performance trends', 'Skill accuracy', 'Streak tracking', 'Weekly analytics'],
  },
  'question-bank': {
    title: 'Question Bank',
    subtitle: 'Review, filter & practice your question repository',
    badges: ['Categorized search', 'Difficulty filter', 'CSV export', 'Batch actions'],
  },
  myspace: {
    title: 'MySpace · Private Personal Command Deck',
    subtitle: 'Your personal preparation cockpit · private notes · target tracking & custom questions',
    badges: ['Personalized', 'Private Notes', 'Target Tracker', 'Question Injector'],
  },
  'swapnilxi-space': {
    title: 'Swapnilxi Private Command Deck',
    subtitle: 'Creator controls · direct database ingestion · roadmap notes',
    badges: ['Verified creator', 'Direct injection', 'Persistent notes', 'SuperAdmin deck'],
  },
};

function DailySessionContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user } = useAuth();
  const isSwapnilxi = user?.email?.toLowerCase() === 'swapnilgupta.xi@gmail.com';

  const tabParam = searchParams.get('tab') as DailySessionTab | null;

  const validTabs: DailySessionTab[] = [
    'session',
    'practice',
    'quick-practice',
    'progress',
    'question-bank',
    'myspace',
    'swapnilxi-space',
  ];

  // The URL is the source of truth for the tab, so Back/Forward, a reload and a shared link all land on the
  // same one. A missing or unknown ?tab= is the default tab (Daily Session), which is also what Back to a
  // tab-less /daily-session must show.
  const activeTab: DailySessionTab = tabParam && validTabs.includes(tabParam) ? tabParam : 'session';

  // A hand-edited ?tab=zzz shows the default tab, so the address is corrected to match (replace: no history entry).
  useEffect(() => {
    if (tabParam && !validTabs.includes(tabParam)) router.replace('/daily-session', { scroll: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabParam]);

  const handleTabChange = (newTab: DailySessionTab) => {
    const targetUrl = newTab === 'session' ? '/daily-session' : `/daily-session?tab=${newTab}`;
    router.push(targetUrl, { scroll: false });
  };

  const currentMeta = TAB_HEADER_METADATA[activeTab] || TAB_HEADER_METADATA.session;

  return (
    <div className="lab-page min-h-screen bg-background pt-[60px]">
      {/* Page header band: the shared hero wash (.lab-glow follows the Settings accent) with one rule below it */}
      <div className="lab-glow border-b border-border">
        <div className="relative mx-auto max-w-[1300px] px-4 py-5 sm:px-[2rem] sm:py-[1.5rem]">
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-3.5">
              <div className="lab-tile h-10 w-10" aria-hidden="true">
                <Icon name="AcademicCapIcon" size={20} />
              </div>
              <div>
                <h1 className="text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
                  {currentMeta.title}
                </h1>
                <p className="mt-0.5 text-sm font-medium mix-text-foreground/[0.74]">{currentMeta.subtitle}</p>
              </div>
            </div>

            {/* Sub-tab Switcher Bar */}
            <DailySessionTabSwitcher activeTab={activeTab} onTabChange={handleTabChange} />

            {/* Chips row (desktop: below lg the subtitle and the tabs say it) */}
            <div className="mt-1 hidden flex-wrap gap-x-5 gap-y-1 lg:flex">
              {currentMeta.badges.map((label) => (
                <span
                  key={label}
                  className="text-xs font-medium mix-text-foreground/[0.74] before:mr-1.5 before:content-['·'] first:before:content-none"
                >
                  {label}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Main Tab Content View */}
      <div className="mx-auto max-w-[1300px] px-4 py-[1.5rem] sm:px-[2rem] sm:py-[2rem]">
        {activeTab === 'session' && <DailySessionInteractive />}
        {activeTab === 'practice' && <PracticeMode onSwitchTab={handleTabChange} />}
        {activeTab === 'quick-practice' && <QuickPractice />}
        {activeTab === 'progress' && <ProgressDashboardInteractive embedded />}
        {activeTab === 'question-bank' && <QuestionBankInteractive embedded />}
        {(activeTab === 'swapnilxi-space' || activeTab === 'myspace') && <SwapnilxiSpace />}
      </div>
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

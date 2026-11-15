'use client';

import React, { useState, useEffect, useMemo } from 'react';
import MetricCard from './MetricCard';
import ProgressChart from './ProgressChart';
import DifficultyProgressCard from './DifficultyProgress';
import SkillBreakdownCard from './SkillBreakdownCard';
import WeeklySummaryCard from './WeeklySummaryCard';
import { sessionService } from '@/lib/services/sessionService';
import { questionsService, Question } from '@/lib/services/questionsService';

/** A YYYY-MM-DD date at local midnight (`new Date('2026-11-14')` is UTC midnight, the day before west of Greenwich). */
function parseDay(s: string): Date {
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? new Date(`${s}T00:00:00`) : new Date(s);
}

const DAY_MS = 1000 * 60 * 60 * 24;

/** Mean of the 1-5 self-ratings as a 0-100 score, or null when nothing is rated. */
function scoreOf(qs: Question[]): number | null {
  const rated = qs.filter((q) => q.userPerformance !== undefined);
  if (!rated.length) return null;
  return Math.round((rated.reduce((sum, q) => sum + q.userPerformance!, 0) / rated.length) * 20);
}

/** Monday 00:00 to next Monday 00:00 of the current week. */
function currentWeek() {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
  const end = new Date(start);
  end.setDate(start.getDate() + 7);
  return { start, end };
}

const plural = (n: number, one: string, many = `${one}s`) => (n === 1 ? one : many);

export default function ProgressDashboardInteractive({
  embedded = false,
}: { embedded?: boolean } = {}) {
  const [isHydrated, setIsHydrated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [stats, setStats] = useState({
    totalSessions: 0,
    totalAnswered: 0,
    completedAnswers: 0,
    recentDates: [] as string[],
    recentSessions: [] as { date: string; answered: number; completed: number }[],
  });

  useEffect(() => {
    setIsHydrated(true);
    async function loadData() {
      try {
        const qData = await questionsService.getAll();
        setQuestions(qData);

        const sData = await sessionService.getProgressStats();
        setStats({ ...sData, recentSessions: sData.recentSessions ?? [] });
      } catch (err) {
        console.error('Failed to load progress dashboard data:', err);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  // 1. Average self-rating (1-5), null until something is rated.
  const averagePerformance = useMemo(() => {
    const scores = questions
      .filter((q) => q.userPerformance !== undefined)
      .map((q) => q.userPerformance!);
    if (scores.length === 0) return null;
    return parseFloat((scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1));
  }, [questions]);

  // 2. Score per day, from rated questions only (a day with no ratings has no point, a category without ratings
  //    that day has a gap).
  const chartData = useMemo(() => {
    const dateGroups: Record<string, Question[]> = {};
    questions.forEach((q) => {
      if (!dateGroups[q.dateEncountered]) dateGroups[q.dateEncountered] = [];
      dateGroups[q.dateEncountered].push(q);
    });

    return Object.keys(dateGroups)
      .sort()
      .map((dateStr) => {
        const qs = dateGroups[dateStr];
        return {
          date: parseDay(dateStr).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
          interview: scoreOf(qs.filter((q) => q.category === 'Interview')),
          cvSkill: scoreOf(qs.filter((q) => q.category === 'CV Skill')),
          overall: scoreOf(qs),
        };
      })
      .filter((p) => p.overall !== null);
  }, [questions]);

  // 3. By difficulty: questions in the bank at each level, and how many you rated 4 or 5.
  const difficultiesData = useMemo(() => {
    const counts = {
      Easy: { attempted: 0, correct: 0 },
      Medium: { attempted: 0, correct: 0 },
      Hard: { attempted: 0, correct: 0 },
    };

    questions.forEach((q) => {
      const diff = q.difficulty;
      if (counts[diff]) {
        counts[diff].attempted += 1;
        // Count performance >= 4 as correct/success
        if (q.userPerformance !== undefined && q.userPerformance >= 4) {
          counts[diff].correct += 1;
        }
      }
    });

    return (['Easy', 'Medium', 'Hard'] as const).map((level) => ({
      level,
      attempted: counts[level].attempted,
      correct: counts[level].correct,
      accuracy: counts[level].attempted
        ? Math.round((counts[level].correct / counts[level].attempted) * 100)
        : 0,
    }));
  }, [questions]);

  // 4. Skills: questions per skill group, and how many of them you have rated.
  const skillsData = useMemo(() => {
    const skillList = [
      {
        category: 'Data Structures & Algorithms',
        subTypes: ['Data Structures', 'Algorithms'],
        icon: 'CubeIcon',
      },
      {
        category: 'System Design',
        subTypes: ['System Design (Mid-Scale)', 'Large-Scale System Design', 'System Design'],
        icon: 'ServerIcon',
      },
      { category: 'Classical CV', subTypes: ['Classical CV'], icon: 'EyeIcon' },
      { category: 'Deep Learning Vision', subTypes: ['Deep Learning Vision'], icon: 'CpuChipIcon' },
      {
        category: 'Leadership & Culture',
        subTypes: ['Leadership'],
        icon: 'ChatBubbleLeftRightIcon',
      },
    ];

    return skillList.map((skill) => {
      const matchedQs = questions.filter((q) => skill.subTypes.includes(q.subType));
      const total = matchedQs.length;
      const completed = matchedQs.filter((q) => q.userPerformance !== undefined).length;
      return {
        category: skill.category,
        completed,
        total,
        accuracy: total > 0 ? Math.round((completed / total) * 100) : 0,
        icon: skill.icon,
      };
    });
  }, [questions]);

  // 5. Session streak: consecutive days, ending today or yesterday, with questions in the bank.
  const currentStreak = useMemo(() => {
    if (questions.length === 0) return 0;

    const dates = Array.from(new Set(questions.map((q) => q.dateEncountered)))
      .sort()
      .reverse();

    let streak = 0;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (dates.length > 0) {
      const latestDate = parseDay(dates[0]);
      latestDate.setHours(0, 0, 0, 0);
      const diffDays = Math.round(Math.abs(today.getTime() - latestDate.getTime()) / DAY_MS);

      // If the latest activity was today or yesterday, streak is active
      if (diffDays <= 1) {
        streak = 1;
        let currentDate = latestDate;

        for (let i = 1; i < dates.length; i++) {
          const prevDate = parseDay(dates[i]);
          prevDate.setHours(0, 0, 0, 0);
          const gapDays = Math.round(Math.abs(currentDate.getTime() - prevDate.getTime()) / DAY_MS);

          if (gapDays === 1) {
            streak++;
            currentDate = prevDate;
          } else {
            break;
          }
        }
      }
    }
    return streak;
  }, [questions]);

  // 6. This week (Monday to Sunday), from the same data.
  const week = useMemo(() => {
    const { start, end } = currentWeek();
    const inWeek = (s: string | null | undefined) => {
      if (!s) return false;
      const d = parseDay(s);
      return d >= start && d < end;
    };
    const sessions = stats.recentSessions.filter((s) => inWeek(s.date));
    const last = new Date(end);
    last.setDate(end.getDate() - 1);
    // "Nov 9 – 15" / "9–15 Nov", in the reader's own order.
    const dayMonth = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short' });
    const range =
      typeof dayMonth.formatRange === 'function'
        ? dayMonth.formatRange(start, last)
        : `${dayMonth.format(start)} – ${dayMonth.format(last)}`;
    return {
      range,
      added: questions.filter((q) => inWeek(q.dateEncountered)).length,
      answered: sessions.reduce((sum, s) => sum + s.answered, 0),
      days: sessions.length,
      rated: questions.filter((q) => q.userPerformance !== undefined && inWeek(q.lastReviewed))
        .length,
    };
  }, [questions, stats.recentSessions]);

  if (!isHydrated || loading) {
    const skeleton = (
      <div className="space-y-4 pb-10 pt-1" aria-busy="true" aria-label="Loading your progress">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="ins-skel h-[8.5rem]" />
          ))}
        </div>
        <div className="ins-skel h-[22rem]" />
      </div>
    );
    if (embedded) return skeleton;
    return (
      <div className="lab-page ds-skin min-h-screen pt-[60px]">
        <div className="mx-auto max-w-[1200px] px-4 py-[2rem] sm:px-[2rem]">{skeleton}</div>
      </div>
    );
  }

  const hasRatings = averagePerformance !== null;

  const weeklyStatsList = [
    { label: 'Questions added', value: String(week.added) },
    { label: 'Answers saved', value: String(week.answered) },
    { label: 'Practice days', value: `${week.days}`, unit: '/ 7' },
    { label: 'Answers rated', value: String(week.rated) },
  ];

  const content = (
    <div
      className={
        embedded
          ? 'space-y-4 pb-10 pt-1 sm:space-y-5'
          : 'mx-auto max-w-[1200px] space-y-5 px-4 py-[2rem] sm:px-[2rem]'
      }
    >
      <section aria-label="Overview" className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <MetricCard
          title="Sessions"
          value={stats.totalSessions}
          subtitle={`${plural(stats.totalSessions, 'Day')} with an answer saved`}
          icon="AcademicCapIcon"
          color="primary"
        />
        <MetricCard
          title="Answered"
          value={stats.totalAnswered}
          subtitle="Across all your sessions"
          icon="CheckCircleIcon"
          color="success"
        />
        <MetricCard
          title="Average rating"
          value={hasRatings ? averagePerformance : '–'}
          unit={hasRatings ? '/ 5' : undefined}
          empty={!hasRatings}
          subtitle={hasRatings ? 'Your own rating of your answers' : 'Rate answers in Review'}
          icon="StarIcon"
          color="accent"
        />
        <MetricCard
          title="Session streak"
          value={currentStreak}
          unit={plural(currentStreak, 'day')}
          subtitle="Days in a row with a session"
          icon="FireIcon"
          color="secondary"
        />
      </section>

      <section className="ds-card p-4 sm:p-[1.4rem]" aria-labelledby="ins-trend-title">
        <ProgressChart data={chartData} chartType="line" titleId="ins-trend-title" />
      </section>

      <div className="grid grid-cols-1 gap-4 sm:gap-5 lg:grid-cols-5">
        <div className="lg:col-span-3">
          <SkillBreakdownCard skills={skillsData} />
        </div>
        <div className="grid grid-cols-1 content-start gap-4 sm:gap-5 md:grid-cols-2 lg:col-span-2 lg:grid-cols-1">
          <DifficultyProgressCard difficulties={difficultiesData} />
          <WeeklySummaryCard weekRange={week.range} stats={weeklyStatsList} />
        </div>
      </div>
    </div>
  );

  if (embedded) return content;

  return <div className="lab-page ds-skin min-h-screen pt-[60px]">{content}</div>;
}

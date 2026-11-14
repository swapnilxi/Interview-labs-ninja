'use client';

import { notify } from '@/lib/ui/notifications';
import React, { useState, useEffect, useMemo, useRef, useTransition } from 'react';
import Link from 'next/link';
import CompanionStrip from './companion/CompanionStrip';
import { useCompanionVoice } from './companion/useCompanionVoice';
import { greeting, line } from './companion/content';
import { playChime, stopSoundscape } from './companion/soundscape';
import Icon from '@/components/ui/AppIcon';
import BackButton from '@/components/ui/BackButton';
import { useUrlState, buildUrl } from '@/lib/navigation/urlState';
import { useSmartBack } from '@/lib/navigation/smartBack';
import { questionsService, Question } from '@/lib/services/questionsService';
import { sessionService, SessionAnswer } from '@/lib/services/sessionService';
import { isLoggedIn } from '@/lib/auth/tokenStore';
import AnswerWorkspace from './coach/AnswerWorkspace';
import RichText from './coach/RichText';
import { Bar, DifficultyChip, Ring, WeekStrip, dayKey, difficultyTone, isTypingTarget, readPracticeDays, relativeDay, toneClass, uniqueByText } from './components/ds';
import { useCompanionStats } from './companion/useCompanion';
import { defaultAIRequestFields } from '@/lib/services/settingsService';
import { backendFetch, isBackendKnownDown, isNetworkFailure, checkBackendHealth } from '@/lib/http/backendAvailability';
import { parseApiError } from '@/lib/http/apiClient';
import { localDailySessionAdapter } from '@/lib/services/local/localDailySessionAdapter';

const DEFAULT_QUESTIONS: Omit<Question, 'id'>[] = [
  {
    questionText: 'Implement a LRU Cache with O(1) time complexity for both get and put operations.',
    category: 'Interview',
    subType: 'Data Structures',
    difficulty: 'Hard',
    questionType: 'DSA',
    dateEncountered: new Date().toISOString().split('T')[0],
    lastReviewed: null,
  },
  {
    questionText: 'Design a rate limiter backend service that limits requests per user ID to 100 requests per minute.',
    category: 'Interview',
    subType: 'System Design (Mid-Scale)',
    difficulty: 'Medium',
    questionType: 'System Design',
    dateEncountered: new Date().toISOString().split('T')[0],
    lastReviewed: null,
  },
  {
    questionText: 'Your production ML model is suffering from covariate shift between training and client deployment. How would you debug and fix this?',
    category: 'Interview',
    subType: 'Scenario-Based Bug',
    difficulty: 'Medium',
    questionType: 'ML Scenario',
    dateEncountered: new Date().toISOString().split('T')[0],
    lastReviewed: null,
  },
  {
    questionText: 'Design a distributed search indexing and ranking system like Elasticsearch that can handle 10,000 document additions per second.',
    category: 'Interview',
    subType: 'Large-Scale System Design',
    difficulty: 'Hard',
    questionType: 'Large-Scale Design',
    dateEncountered: new Date().toISOString().split('T')[0],
    lastReviewed: null,
  },
  {
    questionText: 'Describe a situation where you had a significant disagreement with a product manager regarding technical debt. How did you resolve it?',
    category: 'Interview',
    subType: 'Leadership',
    difficulty: 'Easy',
    questionType: 'Behavioral',
    dateEncountered: new Date().toISOString().split('T')[0],
    lastReviewed: null,
  },
  {
    questionText: 'Explain the mathematical difference between intrinsic and extrinsic camera matrices and how they are estimated.',
    category: 'CV Skill',
    subType: 'Classical CV',
    difficulty: 'Hard',
    questionType: 'Camera Geometry',
    dateEncountered: new Date().toISOString().split('T')[0],
    lastReviewed: null,
  },
  {
    questionText: 'What is the role of Anchor Boxes in object detectors like Faster R-CNN? How do you optimize their sizes for custom datasets?',
    category: 'CV Skill',
    subType: 'Deep Learning Vision',
    difficulty: 'Medium',
    questionType: 'Object Detection',
    dateEncountered: new Date().toISOString().split('T')[0],
    lastReviewed: null,
  },
  {
    questionText: 'Describe the trade-offs of using post-training quantization vs quantization-aware training for mobile CNN inference.',
    category: 'CV Skill',
    subType: 'CV Training Strategy',
    difficulty: 'Medium',
    questionType: 'Quantization',
    dateEncountered: new Date().toISOString().split('T')[0],
    lastReviewed: null,
  },
  {
    questionText: 'How do you detect and handle labeling bias in a semantic segmentation dataset of street scenes?',
    category: 'CV Skill',
    subType: 'Dataset Quality',
    difficulty: 'Easy',
    questionType: 'Dataset Bias',
    dateEncountered: new Date().toISOString().split('T')[0],
    lastReviewed: null,
  },
  {
    questionText: 'How would you optimize inference latency for a Transformer-based object detection model on edge devices like Jetson Nano?',
    category: 'CV Skill',
    subType: 'CV Optimization',
    difficulty: 'Hard',
    questionType: 'Edge Optimization',
    dateEncountered: new Date().toISOString().split('T')[0],
    lastReviewed: null,
  },
];

type CategoryFilter = 'All' | 'Interview' | 'CV Skill';

/** Which screen of the session flow is showing (see "Screen = URL" below). 'loading' = the URL names a session that is still being fetched. */
type Screen = 'setup' | 'loading' | 'ready' | 'quiz' | 'overview';

/**
 * The `session=` id in the URL: the numeric session id, or `offline-<date>` for a session kept only in this
 * browser (offline mode keys them by date). Anything else is not a session.
 */
const OFFLINE_PREFIX = 'offline-';
function parseSessionKey(key: string): { kind: 'offline'; date: string } | { kind: 'remote'; id: string } | null {
  const offline = /^offline-(\d{4}-\d{2}-\d{2})$/.exec(key);
  if (offline) return { kind: 'offline', date: offline[1] };
  return /^\d+$/.test(key) ? { kind: 'remote', id: key } : null;
}

/** "W42/15/October" for a YYYY-MM-DD date: the backend's session code is a pure function of the date, so every session can show the right one. */
function sessionCodeFor(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  if (!y || !m || !d) return dateStr;
  const target = new Date(Date.UTC(y, m - 1, d));
  const month = target.toLocaleString('en-US', { month: 'long', timeZone: 'UTC' });
  target.setUTCDate(target.getUTCDate() + 4 - (target.getUTCDay() || 7)); // the Thursday of this ISO week
  const week = Math.ceil(((target.getTime() - Date.UTC(target.getUTCFullYear(), 0, 1)) / 86400000 + 1) / 7);
  return `W${week}/${String(d).padStart(2, '0')}/${month}`;
}

export default function DailySessionInteractive() {
  const companion = useCompanionVoice(greeting(new Date().getHours()));
  const { stats: companionStats } = useCompanionStats();
  const [sessionDate, setSessionDate] = useState('');
  const [questions, setQuestions] = useState<Question[]>([]);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  // The `session=` key of the session that `questions`/`answers`/`sessionDate` currently hold (null = none).
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  interface RecentRow {
    key: string;
    sessionId?: string;
    date: string;
    total: number;
    answered: number;
    offline?: boolean;
  }
  const [recentSessions, setRecentSessions] = useState<RecentRow[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [genWarning, setGenWarning] = useState<string | null>(null);
  const [isOfflineSession, setIsOfflineSession] = useState(false);
  const [backendOffline, setBackendOffline] = useState(false);

  // Setup form fields
  const [difficulty, setDifficulty] = useState('Mixed');
  const [cvText, setCvText] = useState('');
  const [jdText, setJdText] = useState('');
  const [uploadingResume, setUploadingResume] = useState(false);
  const [uploadedFileName, setUploadedFileName] = useState('');

  // AI Hint & Answer state
  const [isGeneratingHint, setIsGeneratingHint] = useState(false);
  const [showHint, setShowHint] = useState(false);
  const [showExplain, setShowExplain] = useState(false);
  const [dynamicExplain, setDynamicExplain] = useState<string | null>(null);
  const [isExplaining, setIsExplaining] = useState(false);
  const [hintError, setHintError] = useState<string | null>(null);
  const [codes, setCodes] = useState<Record<string, string>>({});
  const [dynamicAiAnswer, setDynamicAiAnswer] = useState<string | null>(null);

  const handleResumeUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingResume(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await backendFetch('/sessions/upload-resume', {
        method: 'POST',
        body: formData,
      });
      if (!res.ok) throw new Error(await parseApiError(res));
      const data = await res.json();
      setCvText(data.extracted_text);
      setUploadedFileName(data.filename);
    } catch (err) {
      if (isNetworkFailure(err) && /\.(txt|md)$/i.test(file.name)) {
        // Backend down, but plain text needs no server-side parsing — read it directly.
        const text = (await file.text()).trim();
        setCvText(text);
        setUploadedFileName(file.name);
      } else if (isNetworkFailure(err)) {
        alert('Backend is unreachable, and PDF/DOCX extraction needs it. Paste your resume text manually, or upload a .txt file instead.');
      } else {
        console.error(err);
        alert(err instanceof Error ? err.message : 'Failed to extract resume text. Please ensure file format is PDF, DOCX, or TXT.');
      }
    } finally {
      setUploadingResume(false);
    }
  };

  // Timer state
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  // DB question preview state
  const [dbQuestions, setDbQuestions] = useState<Question[]>([]);
  const [displayedDbQuestions, setDisplayedDbQuestions] = useState<Question[]>([]);
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>('All');
  const [isLoadingDbQuestions, setIsLoadingDbQuestions] = useState(false);

  // ── Screen = URL ──────────────────────────────────────────────────────────────────────────────────
  // The address bar is the single source of truth for which screen shows, so Back/Forward, a reload and a
  // shared link all land on the same screen:
  //   ?tab=session                              setup (Configure Your Session + recent sessions)
  //   ?tab=session&session=<id>                 ready ("Session Ready!")
  //   ?tab=session&session=<id>&q=<n>           quiz, question n (1-based)
  //   ?tab=session&session=<id>&q=<n>&view=all  every question at once (q = the question it was opened from)
  // <id> is the numeric session id, or `offline-<date>` for a session kept only in this browser. Anything
  // missing, unknown or out of range falls back to the parent screen. Moving to another screen pushes a
  // history entry; stepping between questions replaces the current one.
  const { get, update, pathname, searchParams } = useUrlState();
  const goBack = useSmartBack();
  const sessionParam = get('session') || null;
  const qParam = get('q');
  const viewParam = get('view');
  const qNum = qParam !== null && /^\d+$/.test(qParam) ? Number(qParam) : NaN;
  const qValid = qNum >= 1 && qNum <= questions.length;
  const currentIndex = qValid ? qNum - 1 : 0;
  const screen: Screen = !sessionParam
    ? 'setup'
    : loadedKey !== sessionParam
      ? 'loading'
      : qParam !== null && !qValid
        ? 'ready'
        : viewParam === 'all'
          ? 'overview'
          : qParam !== null
            ? 'quiz'
            : 'ready';
  const viewAll = screen === 'overview';
  // Where the Back controls lead: ready and quiz go to the setup; the overview goes back to its question.
  const setupUrl = buildUrl(pathname, searchParams, { tab: 'session', session: null, q: null, view: null });
  const quizUrl = buildUrl(pathname, searchParams, { view: null, q: currentIndex + 1 });

  const loadedKeyRef = useRef<string | null>(null); // mirrors loadedKey for async code
  // The latest `update` and whether this screen is still on show, for code that finishes after an await
  const updateRef = useRef(update);
  const mounted = useRef(true);
  useEffect(() => {
    updateRef.current = update;
  });
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  // True while the router is moving to a session's screen: the setup shows a spinner instead of flashing back.
  const [navigating, startNavigation] = useTransition();

  /** Moves to a session's "ready" screen. `fresh` drops what is held so a just-created session is fetched, not reused. */
  const openSession = (key: string, fresh = false) => {
    // generating can take a while: someone who has moved on to another tab meanwhile is not pulled back
    if (!mounted.current) return;
    if (fresh) {
      loadedKeyRef.current = null;
      setLoadedKey(null);
    }
    startNavigation(() => {
      updateRef.current({ tab: 'session', session: key, q: null, view: null }, 'push');
    });
  };

  /**
   * Fetches the session named in the URL; a session that can't be found sends the URL back to the setup.
   * `superseded()` turns true once the URL has moved on (or the page is gone): a slow load must not land late.
   */
  const loadSession = async (key: string, superseded: () => boolean) => {
    const fail = (message: string) => {
      setLoadError(message);
      updateRef.current({ session: null, q: null, view: null }, 'replace');
    };
    setLoadError(null);
    try {
      const notFound = isLoggedIn()
        ? 'No questions were found for that session. Try generating a new one.'
        : 'Log in to load your saved sessions, or generate a new one.';
      const parsed = parseSessionKey(key);
      if (!parsed) return fail(notFound);

      const offline = parsed.kind === 'offline';
      let sessionQs: Question[];
      let dateStr: string;
      if (parsed.kind === 'offline') {
        dateStr = parsed.date;
        sessionQs = localDailySessionAdapter.getQuestions(dateStr);
      } else {
        const { id } = parsed;
        sessionQs = (await questionsService.getAll()).filter((q) => q.sessionId === id);
        dateStr = sessionQs[0]?.dateEncountered ?? '';
      }
      if (superseded()) return;
      if (sessionQs.length === 0) return fail(notFound);

      // Saved answers
      const progress = offline
        ? localDailySessionAdapter.getSessionByDate(dateStr)
        : await sessionService.getSessionByDate(dateStr);
      if (superseded()) return;
      const ansMap: Record<string, string> = {};
      progress.forEach((p) => {
        ansMap[p.questionText] = p.answerText;
      });

      setIsOfflineSession(offline);
      setQuestions(sessionQs);
      setSessionDate(dateStr);
      setAnswers(ansMap);
      setElapsedSeconds(0);
      try {
        // "started today" marker read by the daily reminder (NotificationHost)
        localStorage.setItem('ninja_active_session_date', dateStr);
      } catch {
        /* storage unavailable: only the reminder check loses out */
      }
      loadedKeyRef.current = key;
      setLoadedKey(key);
    } catch (err) {
      if (superseded()) return;
      console.error(err);
      fail('Could not load the session. Check that the backend is running and try again.');
    }
  };

  // Load the session the URL names (a link, a reload, a recent session, or one that was just created). The
  // screens show a spinner until it is in; moving between its questions never reloads it.
  useEffect(() => {
    if (!sessionParam || loadedKeyRef.current === sessionParam) return;
    let cancelled = false;
    void loadSession(sessionParam, () => cancelled);
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionParam]);

  // Keep the address bar honest: a param that doesn't belong to the screen on show (a stray q on the setup, a q
  // out of range, an unknown view) is dropped. replace: it only tidies the current entry.
  useEffect(() => {
    if (screen === 'loading') return;
    const want = {
      session: screen === 'setup' ? null : sessionParam,
      q: screen === 'quiz' || (screen === 'overview' && qValid) ? qNum : null,
      view: screen === 'overview' ? 'all' : null,
    };
    if (
      get('session') !== want.session ||
      qParam !== (want.q === null ? null : String(want.q)) ||
      viewParam !== want.view
    ) {
      update(want, 'replace');
    }
  }, [screen, sessionParam, qParam, viewParam, qNum, qValid, get, update]);

  // A new screen starts at the top (the router keeps the scroll position when only the query changes), and
  // leaving the quiz silences the focus sound, however the user left (Back, Reset, browser Back).
  const settledScreen = useRef<Screen | null>(null);
  useEffect(() => {
    if (screen === 'loading') return;
    const previous = settledScreen.current;
    settledScreen.current = screen;
    if (previous && previous !== screen) window.scrollTo({ top: 0 });
    if (screen === 'setup' || screen === 'ready') stopSoundscape();
  }, [screen]);

  useEffect(() => {
    loadDbQuestions();
    checkBackendHealth().then((ok) => setBackendOffline(!ok));
  }, []);

  // Timer effect: runs while a question is on screen (paused on the setup, ready and overview screens)
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (screen === 'quiz') {
      interval = setInterval(() => {
        setElapsedSeconds((prev) => prev + 1);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [screen]);

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60).toString().padStart(2, '0');
    const s = (seconds % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  // Latest 10 sessions: real session records from the server when logged in, plus offline ones kept in this browser.
  // Refreshed every time the setup screen comes back (answer counts change while a session is open).
  const onSetup = screen === 'setup';
  useEffect(() => {
    if (!onSetup) return;
    let cancelled = false;
    (async () => {
      const offline: RecentRow[] = localDailySessionAdapter
        .listRecent(10)
        .map((r) => ({ key: `off:${r.date}`, date: r.date, total: r.total, answered: r.completed, offline: true }));
      const remote: RecentRow[] = isLoggedIn()
        ? (await sessionService.getRecentSessions(10)).map((r) => ({
            key: `s:${r.sessionId}`,
            sessionId: r.sessionId,
            date: r.sessionDate,
            total: r.questionCount,
            answered: r.answeredCount,
          }))
        : [];
      const merged = [...remote, ...offline]
        .sort((a, b) => b.date.localeCompare(a.date) || Number(b.sessionId ?? 0) - Number(a.sessionId ?? 0))
        .slice(0, 10);
      if (!cancelled) setRecentSessions(merged);
    })();
    return () => {
      cancelled = true;
    };
  }, [onSetup]);

  /** The recent-sessions row's address: its session's "ready" screen. */
  const recentHref = (r: RecentRow) =>
    buildUrl(pathname, searchParams, {
      tab: 'session',
      session: r.offline ? `${OFFLINE_PREFIX}${r.date}` : r.sessionId,
      q: null,
      view: null,
    });

  /** Tries the real backend first; on a network failure (backend unreachable), falls back to a local session. */
  const resolveNewSession = async (): Promise<{ session_id: number; session_date: string; session_code: string; offline: boolean }> => {
    if (!isBackendKnownDown()) {
      try {
        const res = await backendFetch('/sessions', {
          method: 'POST',
          body: JSON.stringify({
            difficulty_hint: difficulty,
            cv_present: !!cvText,
            jd_present: !!jdText,
          }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();

        let payloadQuestions: any[] = [];
        try {
          const genRes = await backendFetch('/sessions/generate-session-questions', {
            method: 'POST',
            body: JSON.stringify({
              difficulty,
              cv_present: !!cvText,
              jd_present: !!jdText,
              cv_text: cvText || undefined,
              jd_text: jdText || undefined,
              ...defaultAIRequestFields(),
            }),
          });
          if (genRes.ok) {
            const genData = await genRes.json();
            if (Array.isArray(genData.questions)) {
              if (genData.questions.length === 0) {
                // Every question we know has already been used: say so instead of repeating old ones.
                throw Object.assign(new Error(genData.warning || 'No new questions are available right now.'), { noNewQuestions: true });
              }
              payloadQuestions = genData.questions;
              setGenWarning(genData.warning || null);
            }
          }
        } catch (e) {
          if ((e as { noNewQuestions?: boolean })?.noNewQuestions) throw e;
          console.warn('AI question generator unavailable, using base questions:', e);
        }

        if (!payloadQuestions.length) {
          payloadQuestions = DEFAULT_QUESTIONS.map((q, idx) => ({
            section: idx < 5 ? 'A' : 'B',
            number: (idx % 5) + 1,
            category: q.category === 'Interview' ? 'interview' : 'cv_skill',
            sub_type: q.subType,
            difficulty: difficulty !== 'Mixed' ? difficulty.toLowerCase() : q.difficulty.toLowerCase(),
            topics: [q.questionType || q.subType],
            question_text: q.questionText,
          }));
        }

        const qRes = await backendFetch('/sessions/questions', {
          method: 'POST',
          body: JSON.stringify({
            session_id: data.session_id,
            questions: payloadQuestions,
          }),
        });
        if (!qRes.ok) throw new Error(`HTTP ${qRes.status}`);

        return {
          session_id: data.session_id,
          session_date: data.session_date,
          session_code: data.session_code || `W${data.session_id}/${data.session_date}`,
          offline: false,
        };
      } catch (err) {
        if (!isNetworkFailure(err)) throw err;
        // fall through to the local session below
      }
    }
    const local = localDailySessionAdapter.createSessionWithQuestions(difficulty, DEFAULT_QUESTIONS);
    return { ...local, offline: true };
  };

  const handleStartSession = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setGenWarning(null);
    setLoadError(null);
    try {
      const { session_id, session_date, offline } = await resolveNewSession();

      if (offline) setGenWarning('Backend unreachable: these are built-in sample questions, saved only in this browser.');
      try {
        localStorage.setItem('ninja_active_session_date', session_date);
      } catch {
        /* storage unavailable: only the daily reminder check loses out */
      }
      // The new session is a new screen: it gets its own URL, and the URL's loader fills it in.
      openSession(offline ? `${OFFLINE_PREFIX}${session_date}` : String(session_id), true);
    } catch (err) {
      console.error('Failed to initialize session:', err);
      setLoadError(err instanceof Error ? err.message : 'Could not start a session. Try again.');
    } finally {
      setLoading(false);
    }
  };

  /** Routes to the local offline store for a session that was started offline, else the real backend. */
  const persistAnswer = async (payload: SessionAnswer) => {
    if (isOfflineSession) {
      localDailySessionAdapter.saveSessionAnswers(sessionDate, [payload]);
    } else {
      await sessionService.saveSessionAnswers([payload]);
    }
  };

  /** Saves the open question's answer. Resolves true when it was saved. */
  const handleSaveAnswer = async (): Promise<boolean> => {
    if (questions.length === 0) return false;
    const currentQ = questions[currentIndex];
    const answerText = answers[currentQ.questionText] || '';

    const payload: SessionAnswer = {
      questionId: currentQ.id,
      questionText: currentQ.questionText,
      answerText,
      category: currentQ.category === 'Interview' ? 'interview' : 'cv_skill',
      difficulty: currentQ.difficulty.toLowerCase(),
      questionType: currentQ.questionType || currentQ.subType,
      isCompleted: !!answerText.trim(),
      sessionDate,
    };

    setLoading(true);
    try {
      await persistAnswer(payload);
      if (answerText.trim()) {
        if (companion.settings.chimes && !companion.settings.soundMuted) playChime('good', companion.settings.volume);
        companion.say(line('nailed'), 'cheer');
      }
      const done = questions.filter(
        (q) => (q.questionText === currentQ.questionText ? answerText : answers[q.questionText] || '').trim()
      ).length;
      const total = questions.length;
      if (total > 0 && done === total) {
        if (companion.settings.chimes && !companion.settings.soundMuted) playChime('finish', companion.settings.volume);
        companion.say(line('finish'), 'cheer');
        notify({
          source: 'daily-session',
          tone: 'success',
          title: 'Daily session complete',
          body: `All ${total} questions answered. Nice work!`,
          href: '/progress-dashboard',
          dedupeKey: `daily-session-done:${sessionDate}`,
        });
      }
      return true;
    } catch (err) {
      console.error(err);
      notify({ source: 'daily-session', tone: 'error', title: "Couldn't save your answer", body: 'Check your connection and try again.' });
      return false;
    } finally {
      setLoading(false);
    }
  };

  const handleExport = async () => {
    try {
      let text: string;
      if (isOfflineSession) {
        text = localDailySessionAdapter.renderMarkdown(sessionDate, questions, answers);
      } else {
        try {
          const res = await backendFetch(`/export?session_date=${sessionDate}`);
          if (!res.ok) throw new Error('No questions generated for this date');
          text = await res.json();
        } catch (err) {
          if (!isNetworkFailure(err)) throw err;
          text = localDailySessionAdapter.renderMarkdown(sessionDate, questions, answers);
        }
      }

      const blob = new Blob([text], { type: 'text/markdown' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `interview-ninja-session-${sessionDate}.md`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error(err);
      alert('Failed to export questions. Ensure you have generated the session questions first.');
    }
  };

  /** "Reset Session": forgets the open session and returns to the setup (a new history entry, like any screen change). */
  const handleClearSession = () => {
    stopSoundscape();
    try {
      // `date` is the "started today" marker; the others are keys older versions kept the active session in
      ['date', 'id', 'offline', 'code'].forEach((k) => localStorage.removeItem(`ninja_active_session_${k}`));
    } catch {
      /* storage unavailable */
    }
    loadedKeyRef.current = null;
    setLoadedKey(null);
    setIsOfflineSession(false);
    setElapsedSeconds(0);
    setQuestions([]);
    setAnswers({});
    update({ tab: 'session', session: null, q: null, view: null }, 'push');
  };

  const handleGenerateHint = async () => {
    if (!activeQuestion) return;
    setIsGeneratingHint(true);
    setDynamicAiAnswer(null);
    try {
      // Backend known unreachable — skip straight to the canned explanation below rather than waiting out a timeout.
      if (!isOfflineSession && !isBackendKnownDown()) {
        const res = await backendFetch('/sessions/generate-answer', {
          method: 'POST',
          body: JSON.stringify({
            question_text: activeQuestion.questionText,
            category: activeQuestion.category,
            sub_type: activeQuestion.subType,
            action: 'answer',
            ...defaultAIRequestFields(),
          }),
        });
        if (!res.ok) throw new Error(await parseApiError(res));
        const data = await res.json();
        // The backend returns a generic stub (with a "note") when no AI key worked; don't present it as a real answer.
        if (data.note) throw new Error('AI is not available right now. Check your API key in Settings.');
        setDynamicAiAnswer(data.answer);
      } else {
        throw new Error('The backend is offline, so AI help is unavailable.');
      }
    } catch (e: any) {
      setHintError(e?.message || 'Could not generate a hint.');
    } finally {
      setIsGeneratingHint(false);
      setShowHint(true);
    }
  };

  const resetHints = () => {
    setIsGeneratingHint(false);
    setShowHint(false);
    setShowExplain(false);
    setDynamicAiAnswer(null);
    setDynamicExplain(null);
    setHintError(null);
  };

  // A hint belongs to the question it was asked for: it resets when the question changes, however it changed
  // (number pill, Previous/Next, or the browser's Back/Forward).
  useEffect(() => {
    resetHints();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentIndex, loadedKey]);

  const handleExplainMore = async () => {
    if (!activeQuestion) return;
    if (showExplain) {
      setShowExplain(false);
      return;
    }
    setShowExplain(true);
    if (dynamicExplain) return;
    setIsExplaining(true);
    try {
      const res = await backendFetch('/sessions/generate-answer', {
        method: 'POST',
        body: JSON.stringify({
          question_text: activeQuestion.questionText,
          category: activeQuestion.category,
          sub_type: activeQuestion.subType,
          action: 'explain',
          ...defaultAIRequestFields(),
        }),
      });
      if (!res.ok) throw new Error(await parseApiError(res));
      setDynamicExplain((await res.json()).answer);
    } catch (e: any) {
      setHintError(e?.message || 'Could not generate the explanation.');
    } finally {
      setIsExplaining(false);
    }
  };

  // Code written in the DSA / System Design code space, kept per question in this browser.
  const codeKey = (q: string) => `ninja_code::${sessionDate}::${q}`;
  const setCode = (q: string, v: string) => {
    setCodes((p) => ({ ...p, [q]: v }));
    try {
      localStorage.setItem(codeKey(q), v);
    } catch {
      /* storage unavailable: code stays in memory for this visit */
    }
  };

  const loadDbQuestions = async () => {
    setIsLoadingDbQuestions(true);
    try {
      const all = uniqueByText(await questionsService.getAll());
      setDbQuestions(all);
      const shuffled = [...all].sort(() => Math.random() - 0.5);
      setDisplayedDbQuestions(shuffled.slice(0, 6));
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoadingDbQuestions(false);
    }
  };

  const pickQuestionsForFilter = (filter: CategoryFilter, pool: Question[]) => {
    const filtered = filter === 'All' ? pool : pool.filter((q) => q.category === filter);
    const shuffled = [...filtered].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, 6);
  };

  const handleCategoryFilterChange = (filter: CategoryFilter) => {
    setCategoryFilter(filter);
    setDisplayedDbQuestions(pickQuestionsForFilter(filter, dbQuestions));
  };

  const handleRegenerateFromDb = () => {
    setDisplayedDbQuestions(pickQuestionsForFilter(categoryFilter, dbQuestions));
  };

  const handleExportCSV = () => {
    const header = ['#', 'Category', 'Sub-Type', 'Difficulty', 'Question Type', 'Question'];
    const rows = displayedDbQuestions.map((q, i) => [
      String(i + 1),
      q.category,
      q.subType,
      q.difficulty,
      q.questionType || q.subType,
      `"${q.questionText.replace(/"/g, '""')}"`,
    ]);
    const csv = [header, ...rows].map((r) => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `interview-ninja-questions.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const activeQuestion = questions[currentIndex];
  const isAnswered = (q: Question) => !!(answers[q.questionText] || '').trim();
  const answeredCount = questions.filter(isAnswered).length;
  const allAnswered = questions.length > 0 && answeredCount === questions.length;
  const isLast = currentIndex === questions.length - 1;

  // ── Today / this week, for the setup screen ──
  const todayKey = dayKey();
  const todaySession = recentSessions.find((r) => r.date === todayKey);
  const [practiceDays, setPracticeDays] = useState<string[]>([]);
  useEffect(() => {
    if (onSetup) setPracticeDays(readPracticeDays());
  }, [onSetup]);
  const activeDays = useMemo(
    () => new Set([...recentSessions.filter((r) => r.answered > 0).map((r) => r.date), ...practiceDays]),
    [recentSessions, practiceDays],
  );
  const weekDaysPractised = useMemo(() => {
    const now = new Date();
    const monday = new Date(now);
    monday.setDate(now.getDate() - ((now.getDay() + 6) % 7));
    let n = 0;
    for (let i = 0; i < 7; i++) {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      if (activeDays.has(dayKey(d))) n++;
    }
    return n;
  }, [activeDays]);

  /** Saves this answer, then moves on (the last question just saves). */
  const handleSaveAndNext = async () => {
    if ((await handleSaveAnswer()) && !isLast) update({ q: currentIndex + 2 }, 'replace');
  };

  // Arrow keys step between questions while nothing is being typed.
  useEffect(() => {
    if (screen !== 'quiz') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || isTypingTarget(e.target)) return;
      if (e.key === 'ArrowRight' && currentIndex < questions.length - 1) update({ q: currentIndex + 2 }, 'replace');
      if (e.key === 'ArrowLeft' && currentIndex > 0) update({ q: currentIndex }, 'replace');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [screen, currentIndex, questions.length, update]);

  // Spinner while a session is being created or fetched (the setup form never shows with one pending)
  if (screen === 'loading' || (screen === 'setup' && (loading || navigating))) {
    return (
      <div className="flex h-[26rem] flex-col items-center justify-center gap-4">
        <div className="animate-spin" role="status" aria-label="Loading">
          <Ring value={0.28} size={48} stroke={5} />
        </div>
        <p className="text-sm font-semibold ds-muted">
          {loading ? 'Picking ten questions for you…' : 'Opening your session…'}
        </p>
      </div>
    );
  }

  // ── Setup: "Today" ────────────────────────────────────────────────────────
  if (screen === 'setup') {
    const tailored = !!cvText.trim() || !!jdText.trim();
    const interviewCount = dbQuestions.filter((q) => q.category === 'Interview').length;
    const cvCount = dbQuestions.filter((q) => q.category === 'CV Skill').length;

    return (
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_20rem] lg:gap-[1.75rem]">
        <div className="min-w-0 space-y-5">
          {backendOffline && (
            <div className="ds-banner ds-tone-gold" role="status">
              <Icon name="SignalSlashIcon" size={18} />
              <span>
                <b>Offline mode.</b> The backend isn&apos;t reachable, so new sessions use built-in questions and are saved in this
                browser only.
              </span>
            </div>
          )}

          {/* Hero: today's session */}
          <section className="ds-hero ds-enter" aria-labelledby="ds-today-title">
            <div className="relative p-5 sm:p-[1.75rem]">
              <CompanionStrip c={companion} size={56} />

              {todaySession && (
                <div className="ds-card-raised mt-5 flex flex-wrap items-center gap-4 p-4">
                  <Ring
                    value={todaySession.total ? todaySession.answered / todaySession.total : 0}
                    size={52}
                    tone={todaySession.answered >= todaySession.total ? 'jade' : 'indigo'}
                    label={`${todaySession.answered} of ${todaySession.total} answered`}
                  >
                    <span className="text-xs font-bold ds-ink ds-num">
                      {todaySession.answered}/{todaySession.total}
                    </span>
                  </Ring>
                  <div className="min-w-0 flex-1">
                    <p className="ds-h3">
                      {todaySession.answered >= todaySession.total ? "Today's session is done" : "Today's session is waiting"}
                    </p>
                    <p className="text-sm ds-muted">
                      {todaySession.answered >= todaySession.total
                        ? 'Every question answered. Revisit it, or start a fresh one below.'
                        : `${todaySession.answered} of ${todaySession.total} answered. Pick up where you left off.`}
                    </p>
                  </div>
                  <Link href={recentHref(todaySession)} prefetch={false} scroll={false} className="ds-btn ds-btn-primary">
                    {todaySession.answered >= todaySession.total ? 'Review' : 'Continue'}
                    <Icon name="ArrowRightIcon" size={16} />
                  </Link>
                </div>
              )}

              <div className="mt-[1.5rem]">
                <span className="ds-chip ds-tone-gold">
                  <Icon name="SunIcon" size={14} variant="solid" />
                  Daily session
                </span>
                <h2 id="ds-today-title" className="ds-h2 mt-3">
                  {todaySession ? 'Or start a fresh set' : 'Ten fresh questions, tuned to you'}
                </h2>
                <p className="ds-body mt-1 max-w-[60ch]">
                  A mix of interview and computer-vision questions. Answer in your own words; the AI coach and hints are one tap
                  away.
                </p>
              </div>

              <form onSubmit={handleStartSession} className="mt-5 space-y-5">
                <div>
                  <p id="ds-level" className="mb-2 text-sm font-semibold ds-ink">
                    Level
                  </p>
                  <div className="ds-seg" role="group" aria-labelledby="ds-level">
                    {['Easy', 'Medium', 'Hard', 'Mixed'].map((label) => (
                      <button
                        key={label}
                        type="button"
                        aria-pressed={difficulty === label}
                        onClick={() => setDifficulty(label)}
                        className={toneClass(difficultyTone(label))}
                      >
                        <span className="ds-dot" aria-hidden="true" />
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                <details className="ds-disclosure ds-inset">
                  <summary className="flex items-center gap-3 px-4 py-3">
                    <span className="ds-icon-tile ds-icon-tile-sm ds-tone-indigo">
                      <Icon name="BriefcaseIcon" size={16} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold ds-ink">Tailor to your resume and target role</span>
                      <span className="block text-xs ds-faint">Optional. Questions lean towards your experience and the job.</span>
                    </span>
                    <span className="hidden gap-1.5 sm:flex">
                      {cvText.trim() && <span className="ds-chip ds-tone-jade">Resume</span>}
                      {jdText.trim() && <span className="ds-chip ds-tone-jade">Job</span>}
                    </span>
                    <Icon name="ChevronDownIcon" size={16} className="ds-caret ds-faint" />
                  </summary>
                  <div className="space-y-4 px-4 pb-4">
                    <div>
                      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                        <label htmlFor="cv-text" className="text-sm font-semibold ds-ink">
                          Resume or project context
                        </label>
                        <label className="ds-btn ds-btn-secondary ds-btn-sm cursor-pointer">
                          <Icon name="DocumentArrowUpIcon" size={15} />
                          {uploadingResume ? 'Reading…' : 'Upload PDF, DOCX or TXT'}
                          <input
                            type="file"
                            accept=".pdf,.docx,.txt,.md"
                            className="hidden"
                            onChange={handleResumeUpload}
                            disabled={uploadingResume}
                          />
                        </label>
                      </div>
                      {uploadedFileName && (
                        <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold ds-tone-jade ds-tone-text">
                          <Icon name="CheckCircleIcon" size={14} variant="solid" />
                          {uploadedFileName}
                        </p>
                      )}
                      <textarea
                        id="cv-text"
                        rows={4}
                        value={cvText}
                        onChange={(e) => setCvText(e.target.value)}
                        placeholder="Paste your resume or a few lines about your projects…"
                        className="ds-field resize-y"
                      />
                    </div>
                    <div>
                      <label htmlFor="jd-text" className="mb-2 block text-sm font-semibold ds-ink">
                        Job description
                      </label>
                      <textarea
                        id="jd-text"
                        rows={4}
                        value={jdText}
                        onChange={(e) => setJdText(e.target.value)}
                        placeholder="Paste the role you're preparing for…"
                        className="ds-field resize-y"
                      />
                    </div>
                  </div>
                </details>

                <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                  <button
                    type="submit"
                    disabled={loading}
                    className={`ds-btn ds-btn-lg ${todaySession ? 'ds-btn-secondary' : 'ds-btn-primary'} sm:min-w-[16rem]`}
                  >
                    <Icon name={todaySession ? 'ArrowPathIcon' : 'PlayIcon'} size={18} variant={todaySession ? 'outline' : 'solid'} />
                    {todaySession ? 'Generate a new session' : "Start today's session"}
                  </button>
                  <span className="text-sm ds-faint">
                    10 questions · about 25 min{tailored ? ' · tailored to you' : ''}
                  </span>
                </div>
              </form>
            </div>
          </section>

          {loadError && (
            <div role="alert" className="ds-banner ds-tone-rose">
              <Icon name="ExclamationTriangleIcon" size={18} />
              <span>{loadError}</span>
            </div>
          )}

          {/* Recent sessions */}
          {recentSessions.length > 0 && (
            <section className="ds-card p-5 ds-enter-2" aria-labelledby="ds-recent-title">
              <div className="mb-2 flex items-baseline justify-between gap-3">
                <h3 id="ds-recent-title" className="ds-h3">
                  Recent sessions
                </h3>
                <span className="text-xs font-semibold ds-faint">Last {recentSessions.length}</span>
              </div>
              <ul>
                {recentSessions.map((r) => {
                  const done = r.total > 0 && r.answered >= r.total;
                  return (
                    <li key={r.key}>
                      {/* a real link: the session has its own address, so it can also be opened in a new tab */}
                      <Link href={recentHref(r)} prefetch={false} scroll={false} className="ds-row">
                        <Ring value={r.total ? r.answered / r.total : 0} size={40} stroke={4} tone={done ? 'jade' : 'indigo'}>
                          {done ? (
                            <Icon name="CheckIcon" size={16} className="ds-tone-jade ds-tone-text" />
                          ) : (
                            <span className="text-[11px] font-bold ds-muted ds-num">{r.answered}</span>
                          )}
                        </Ring>
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-semibold ds-ink">{relativeDay(r.date)}</span>
                          <span className="block text-xs ds-faint">
                            {r.answered} of {r.total} answered
                            {r.offline ? ' · this browser only' : ''}
                          </span>
                        </span>
                        <Icon name="ChevronRightIcon" size={16} className="ds-chevron" />
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}

          {/* From the question bank */}
          <section aria-labelledby="ds-bank-title" className="ds-enter-3">
            <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
              <div>
                <h3 id="ds-bank-title" className="ds-h3">
                  From your question bank
                </h3>
                <p className="mt-0.5 text-sm ds-muted">
                  A random handful{dbQuestions.length > 0 ? ` of ${dbQuestions.length}` : ''}. Open one for a full AI review.
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleRegenerateFromDb}
                  disabled={isLoadingDbQuestions || dbQuestions.length === 0}
                  className="ds-btn ds-btn-secondary ds-btn-sm"
                >
                  <Icon name="ArrowsRightLeftIcon" size={15} />
                  Shuffle
                </button>
                <button
                  type="button"
                  onClick={handleExportCSV}
                  disabled={displayedDbQuestions.length === 0}
                  className="ds-btn ds-btn-ghost ds-btn-sm"
                >
                  <Icon name="ArrowDownTrayIcon" size={15} />
                  CSV
                </button>
              </div>
            </div>

            <div className="ds-seg ds-seg-inline mb-4 w-full sm:w-auto" role="group" aria-label="Category">
              {(['All', 'Interview', 'CV Skill'] as CategoryFilter[]).map((cat) => (
                <button key={cat} type="button" aria-pressed={categoryFilter === cat} onClick={() => handleCategoryFilterChange(cat)}>
                  {cat}
                  {dbQuestions.length > 0 && (
                    <small className="ds-num">
                      {cat === 'All' ? dbQuestions.length : cat === 'Interview' ? interviewCount : cvCount}
                    </small>
                  )}
                </button>
              ))}
            </div>

            {isLoadingDbQuestions ? (
              <div className="grid gap-3 md:grid-cols-2" aria-busy="true">
                {[0, 1, 2, 3].map((i) => (
                  <div key={i} className="ds-qcard h-[7.5rem] animate-pulse" />
                ))}
              </div>
            ) : displayedDbQuestions.length === 0 ? (
              <div className="ds-card flex flex-col items-center px-5 py-10 text-center">
                <span className="ds-icon-tile ds-icon-tile-lg ds-tone-neutral">
                  <Icon name="InboxIcon" size={22} />
                </span>
                <p className="mt-3 text-sm font-semibold ds-ink">No questions yet</p>
                <p className="mt-1 text-sm ds-faint">Start your first session and its questions will appear here.</p>
              </div>
            ) : (
              <div className="grid gap-3 md:grid-cols-2">
                {displayedDbQuestions.map((q) => (
                  <Link key={q.id} href={`/question-review?id=${q.id}`} prefetch={false} className="ds-qcard group">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className={`ds-chip ${q.category === 'Interview' ? 'ds-tone-indigo' : 'ds-tone-jade'}`}>{q.category}</span>
                      <DifficultyChip difficulty={q.difficulty} />
                    </span>
                    <span className="text-[0.92rem] font-semibold leading-snug ds-ink">{q.questionText}</span>
                    <span className="mt-auto flex items-center justify-between gap-2 text-xs ds-faint">
                      <span className="break-words">{q.subType}</span>
                      <span className="flex flex-shrink-0 items-center gap-1 font-semibold ds-tone-indigo ds-tone-text opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
                        Review
                        <Icon name="ArrowRightIcon" size={13} />
                      </span>
                    </span>
                  </Link>
                ))}
              </div>
            )}
          </section>
        </div>

        {/* Sidebar */}
        <aside className="space-y-5 lg:sticky lg:top-[5.5rem] lg:self-start">
          <section className="ds-card p-5 ds-enter-2" aria-labelledby="ds-week-title">
            <div className="mb-4 flex items-center justify-between gap-3">
              <h3 id="ds-week-title" className="ds-h3">
                This week
              </h3>
              <span className="ds-chip ds-tone-gold ds-num">
                <Icon name="FireIcon" size={13} variant="solid" />
                {companionStats.streak} day streak
              </span>
            </div>
            <WeekStrip activeDays={activeDays} />
            <p className="mt-4 text-xs leading-relaxed ds-faint">
              {weekDaysPractised === 0
                ? 'Answer a question or finish a drill to light up today.'
                : `${weekDaysPractised} of 7 days practised this week. Keep the flame going.`}
            </p>
          </section>

          <nav className="ds-card p-2 ds-enter-3" aria-label="More ways to practise">
            <p className="ds-eyebrow px-3 pb-1 pt-2">More ways to practise</p>
            {[
              { href: '/daily-session?tab=practice', icon: 'AcademicCapIcon', tone: 'indigo' as const, title: 'Practice drill', sub: 'Pick a topic, level and length' },
              { href: '/daily-session?tab=quick-practice', icon: 'BoltIcon', tone: 'gold' as const, title: 'Quick blitz', sub: 'Flashcards for a short gap' },
              { href: '/daily-session?tab=progress', icon: 'ChartBarIcon', tone: 'jade' as const, title: 'Your progress', sub: 'Readiness and skill trends' },
            ].map((l) => (
              <Link key={l.href} href={l.href} scroll={false} prefetch={false} className="ds-row ds-row-flush">
                <span className={`ds-icon-tile ${toneClass(l.tone)}`}>
                  <Icon name={l.icon} size={19} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold ds-ink">{l.title}</span>
                  <span className="block text-xs ds-faint">{l.sub}</span>
                </span>
                <Icon name="ChevronRightIcon" size={16} className="ds-chevron" />
              </Link>
            ))}
          </nav>
        </aside>
      </div>
    );
  }

  // ── Ready: the session's cover ────────────────────────────────────────────
  if (screen === 'ready') {
    const firstOpen = questions.findIndex((q) => !isAnswered(q));
    const resumeAt = firstOpen === -1 ? 0 : firstOpen;
    const topics = Array.from(new Set(questions.map((q) => q.subType).filter(Boolean))).slice(0, 8);
    const levels = (['Easy', 'Medium', 'Hard'] as const)
      .map((d) => ({ d, n: questions.filter((q) => q.difficulty?.toLowerCase() === d.toLowerCase()).length }))
      .filter((x) => x.n > 0);
    const started = answeredCount > 0;
    return (
      <div className="mx-auto max-w-2xl space-y-4 pt-2">
        <BackButton href={setupUrl} label="Back" />
        <section className="ds-hero ds-enter">
          <div className="relative p-5 sm:p-[2rem]">
            <CompanionStrip c={companion} size={56} />
            <div className="mt-[1.5rem]">
              <p className="ds-eyebrow">Session {sessionCodeFor(sessionDate)} · {relativeDay(sessionDate)}</p>
              <h2 className="ds-display mt-2">
                {allAnswered ? 'All done. Nicely played.' : started ? 'Welcome back' : 'Your session is ready'}
              </h2>
              <p className="ds-body mt-2 max-w-[52ch]">
                {allAnswered
                  ? 'Every question has an answer. Revisit any of them, or export your notes.'
                  : started
                    ? `You've answered ${answeredCount} of ${questions.length}. The timer starts when you open a question.`
                    : 'Take them one at a time. The timer starts when you open the first question, and hints are always one tap away.'}
              </p>
            </div>

            <dl className="mt-[1.5rem] grid grid-cols-3 gap-2 sm:gap-3">
              {[
                { k: 'Questions', v: String(questions.length) },
                { k: 'About', v: `${Math.max(5, Math.round(questions.length * 2.5))} min` },
                { k: 'Answered', v: `${answeredCount}/${questions.length}` },
              ].map((s) => (
                <div key={s.k} className="ds-inset px-3 py-3 sm:px-4">
                  <dt className="ds-eyebrow">{s.k}</dt>
                  <dd className="mt-1 text-xl font-bold ds-ink ds-num">{s.v}</dd>
                </div>
              ))}
            </dl>

            {started && <Bar value={answeredCount / questions.length} tone={allAnswered ? 'jade' : 'indigo'} className="mt-4" label="Answered" />}

            {(topics.length > 0 || levels.length > 0) && (
              <div className="mt-[1.5rem]">
                <p className="mb-2 text-sm font-semibold ds-ink">What&apos;s inside</p>
                <div className="flex flex-wrap gap-2">
                  {levels.map((l) => (
                    <span key={l.d} className={`ds-chip ${toneClass(difficultyTone(l.d))}`}>
                      <span className="ds-dot" aria-hidden="true" />
                      {l.n} {l.d.toLowerCase()}
                    </span>
                  ))}
                  {topics.map((t) => (
                    <span key={t} className="ds-chip ds-tone-neutral">
                      {t}
                    </span>
                  ))}
                </div>
              </div>
            )}

            <div className="mt-7 flex flex-col-reverse gap-3 sm:flex-row sm:items-center">
              <button type="button" onClick={() => goBack(setupUrl)} className="ds-btn ds-btn-ghost ds-btn-lg">
                Not now
              </button>
              <button
                type="button"
                onClick={() => {
                  companion.startSound();
                  companion.say(line('start'), 'cheer');
                  setElapsedSeconds(0);
                  update({ q: resumeAt + 1 }, 'push');
                }}
                className="ds-btn ds-btn-primary ds-btn-lg flex-1"
              >
                <Icon name="PlayIcon" size={18} variant="solid" />
                {allAnswered ? 'Review answers' : started ? `Continue at question ${resumeAt + 1}` : 'Start'}
              </button>
            </div>
          </div>
        </section>
      </div>
    );
  }

  // ── Quiz (focus mode: the page header is hidden) and the all-questions overview ──
  return (
    <div className="pt-3 sm:pt-4">
      {/* Floating top bar: leave, progress, time, overview */}
      <div className="ds-topbar">
        <div className="flex items-center gap-3 px-3 py-2.5 sm:px-4">
          <button
            type="button"
            onClick={() => goBack(viewAll ? quizUrl : setupUrl)}
            className="ds-btn ds-btn-ghost ds-btn-icon"
            aria-label={viewAll ? 'Back to the question' : 'Leave the session'}
            title={viewAll ? 'Back to the question' : 'Leave (your saved answers stay)'}
          >
            <Icon name={viewAll ? 'ArrowLeftIcon' : 'XMarkIcon'} size={20} />
          </button>
          <div className="min-w-0 flex-1">
            <div className="mb-1.5 flex items-center justify-between gap-2 text-xs font-semibold">
              <span className="ds-muted">
                {viewAll ? 'All questions' : `Question ${currentIndex + 1} of ${questions.length}`}
              </span>
              <span className="ds-faint ds-num">
                {answeredCount}/{questions.length} answered
              </span>
            </div>
            <Bar value={answeredCount / Math.max(1, questions.length)} tone={allAnswered ? 'jade' : 'indigo'} label="Session progress" />
          </div>
          <span className="hidden sm:inline-flex" title="Time on questions">
            <span className="ds-chip ds-tone-neutral ds-num">
              <Icon name="ClockIcon" size={14} />
              {formatTime(elapsedSeconds)}
            </span>
          </span>
          <button
            type="button"
            onClick={() => (viewAll ? goBack(quizUrl) : update({ view: 'all' }, 'push'))}
            className="ds-btn ds-btn-secondary ds-btn-sm"
            aria-label={viewAll ? 'One question at a time' : 'See all questions'}
          >
            <Icon name={viewAll ? 'RectangleStackIcon' : 'Squares2X2Icon'} size={16} />
            <span className="hidden sm:inline">{viewAll ? 'One at a time' : 'All questions'}</span>
          </button>
        </div>
      </div>

      <div className="mt-4 space-y-3">
        {genWarning && (
          <div role="status" className="ds-banner ds-tone-gold">
            <Icon name="ExclamationTriangleIcon" size={18} />
            <span>{genWarning}</span>
          </div>
        )}
        {isOfflineSession && !genWarning && (
          <div className="ds-banner ds-tone-gold" role="status">
            <Icon name="SignalSlashIcon" size={18} />
            <span>Offline session: answers are saved in this browser only.</span>
          </div>
        )}
        {allAnswered && (
          <div className="ds-banner ds-banner-center ds-tone-jade ds-pop flex-wrap" role="status">
            <Icon name="CheckBadgeIcon" size={22} variant="solid" />
            <span className="min-w-0 flex-1">
              <b>All {questions.length} answered.</b> Lovely work. Export your notes, or see how you&apos;re trending.
            </span>
            <span className="flex gap-2">
              <button type="button" onClick={handleExport} className="ds-btn ds-btn-secondary ds-btn-sm">
                <Icon name="ArrowDownTrayIcon" size={15} />
                Export
              </button>
              <Link href="/daily-session?tab=progress" scroll={false} prefetch={false} className="ds-btn ds-btn-solid ds-btn-sm">
                See progress
              </Link>
            </span>
          </div>
        )}
      </div>

      {viewAll ? (
        <div className="mt-5 grid grid-cols-1 gap-4 pb-8 md:grid-cols-2">
          {questions.map((q, idx) => (
            <article key={q.id} className="ds-card flex flex-col gap-4 p-5">
              <div className="flex flex-wrap items-center gap-2">
                <span className={`ds-chip ${isAnswered(q) ? 'ds-tone-jade' : 'ds-tone-neutral'} ds-num`}>
                  {isAnswered(q) && <Icon name="CheckIcon" size={12} />}Q{idx + 1}
                </span>
                <span className="ds-chip ds-tone-neutral">{q.subType}</span>
                <DifficultyChip difficulty={q.difficulty} />
              </div>
              <button
                type="button"
                onClick={() => update({ view: null, q: idx + 1 }, 'push')}
                className="text-left text-[0.95rem] font-semibold leading-snug ds-ink hover:underline"
                title="Open this question"
              >
                {q.questionText}
              </button>
              <div className="mt-auto space-y-2">
                <textarea
                  rows={3}
                  aria-label={`Answer to question ${idx + 1}`}
                  placeholder="Jot down your answer…"
                  value={answers[q.questionText] || ''}
                  onChange={(e) => {
                    const text = e.target.value;
                    setAnswers((prev) => ({ ...prev, [q.questionText]: text }));
                  }}
                  className="ds-field resize-y text-sm"
                />
                <div className="flex items-center justify-between gap-2">
                  <Link href={`/question-review?id=${q.id || idx + 1}`} prefetch={false} className="ds-link text-xs">
                    Full review
                  </Link>
                  <button
                    type="button"
                    onClick={async () => {
                      const payload: SessionAnswer = {
                        questionId: q.id,
                        questionText: q.questionText,
                        answerText: answers[q.questionText] || '',
                        category: q.category === 'Interview' ? 'interview' : 'cv_skill',
                        difficulty: q.difficulty.toLowerCase(),
                        questionType: q.questionType || q.subType,
                        isCompleted: !!(answers[q.questionText] || '').trim(),
                        sessionDate,
                      };
                      await persistAnswer(payload);
                    }}
                    className="ds-btn ds-btn-secondary ds-btn-sm"
                  >
                    Save
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="mt-5 grid grid-cols-1 gap-5 pb-[8rem] lg:grid-cols-[minmax(0,1fr)_20rem]">
          <div className="min-w-0 space-y-4">
            {/* Question navigator */}
            <div className="flex flex-wrap items-center gap-1.5 sm:gap-2" role="group" aria-label="Questions">
              {questions.map((q, idx) => {
                const done = isAnswered(q);
                const current = idx === currentIndex;
                return (
                  <button
                    key={q.id ?? idx}
                    type="button"
                    onClick={() => update({ q: idx + 1 }, 'replace')}
                    aria-label={`Question ${idx + 1}${done ? ' (answered)' : ''}`}
                    aria-current={current}
                    data-done={done}
                    className="ds-qdot"
                  >
                    {done && !current ? <Icon name="CheckIcon" size={14} /> : idx + 1}
                  </button>
                );
              })}
            </div>

            <CompanionStrip c={companion} size={48} />

            {/* The question */}
            <section key={activeQuestion?.id ?? currentIndex} className="ds-card-raised p-5 sm:p-[1.75rem] ds-enter" aria-labelledby="ds-q-text">
              <div className="mb-4 flex flex-wrap items-center gap-2">
                <span className="ds-chip ds-tone-indigo ds-num">
                  {currentIndex + 1} / {questions.length}
                </span>
                {activeQuestion?.subType && <span className="ds-chip ds-tone-neutral">{activeQuestion.subType}</span>}
                {activeQuestion?.difficulty && <DifficultyChip difficulty={activeQuestion.difficulty} />}
                <Link
                  href={`/question-review?id=${activeQuestion?.id || currentIndex + 1}`}
                  prefetch={false}
                  className="ds-link ml-auto text-xs"
                >
                  Full review
                </Link>
              </div>
              <h2 id="ds-q-text" className="ds-question">
                {activeQuestion?.questionText}
              </h2>
            </section>

            {/* Answer + code space + AI coach */}
            {activeQuestion && (
              <section className="ds-card p-5 sm:p-[1.5rem]">
                <AnswerWorkspace
                  question={{
                    questionText: activeQuestion.questionText,
                    category: activeQuestion.category === 'Interview' ? 'interview' : 'cv_skill',
                    subType: activeQuestion.subType,
                    difficulty: activeQuestion.difficulty,
                  }}
                  answer={answers[activeQuestion.questionText] || ''}
                  onAnswerChange={(text) => setAnswers((prev) => ({ ...prev, [activeQuestion.questionText]: text }))}
                  code={codes[activeQuestion.questionText] ?? (typeof window !== 'undefined' ? localStorage.getItem(codeKey(activeQuestion.questionText)) || '' : '')}
                  onCodeChange={(v) => setCode(activeQuestion.questionText, v)}
                />
              </section>
            )}
          </div>

          {/* Hint + session tools */}
          <aside className="space-y-4 self-start lg:sticky lg:top-[9rem]">
            <section className="ds-card overflow-hidden" data-semantic="hint" aria-labelledby="ds-hint-title">
              <div className="ds-tone-gold p-5">
                <div className="flex items-center gap-3">
                  <span className="ds-icon-tile">
                    <Icon name="LightBulbIcon" size={19} />
                  </span>
                  <div>
                    <h3 id="ds-hint-title" className="ds-h3">
                      Stuck? Get a hint
                    </h3>
                    <p className="text-xs ds-faint">Give it a go first. Then peek.</p>
                  </div>
                </div>
                {!showHint ? (
                  <button
                    type="button"
                    onClick={handleGenerateHint}
                    disabled={isGeneratingHint}
                    className="ds-btn ds-btn-soft mt-4 w-full"
                  >
                    <Icon name="SparklesIcon" size={16} />
                    {isGeneratingHint ? 'Thinking…' : 'Show a model answer'}
                  </button>
                ) : (
                  <div className="mt-4 space-y-3">
                    {dynamicAiAnswer && <RichText text={dynamicAiAnswer} className="ds-ink" />}
                    {dynamicAiAnswer && (
                      <button type="button" onClick={handleExplainMore} disabled={isExplaining} className="ds-btn ds-btn-soft ds-btn-sm w-full">
                        {isExplaining ? 'Explaining…' : showExplain ? 'Hide the deep dive' : 'Explain it more deeply'}
                      </button>
                    )}
                    {showExplain && dynamicExplain && (
                      <div className="ds-inset p-3">
                        <RichText text={dynamicExplain} />
                      </div>
                    )}
                  </div>
                )}
                {hintError && <p className="mt-3 text-xs font-semibold ds-tone-rose ds-tone-text">{hintError}</p>}
              </div>
            </section>

            <section className="ds-card p-2" aria-label="Session tools">
              <button type="button" onClick={handleExport} className="ds-row ds-row-flush w-full text-left">
                <span className="ds-icon-tile ds-icon-tile-sm ds-tone-neutral">
                  <Icon name="ArrowDownTrayIcon" size={16} />
                </span>
                <span className="flex-1 text-sm font-semibold ds-ink">Export as Markdown</span>
              </button>
              <button type="button" onClick={handleClearSession} className="ds-row ds-row-flush w-full text-left">
                <span className="ds-icon-tile ds-icon-tile-sm ds-tone-rose">
                  <Icon name="ArrowPathIcon" size={16} />
                </span>
                <span className="flex-1">
                  <span className="block text-sm font-semibold ds-ink">Close this session</span>
                  <span className="block text-xs ds-faint">Saved answers stay in Recent sessions</span>
                </span>
              </button>
              <p className="hidden px-3 pb-2 pt-1 text-xs ds-faint lg:block">
                <span className="ds-kbd">←</span> <span className="ds-kbd">→</span> move between questions
              </p>
            </section>
          </aside>

          {/* Bottom action bar */}
          <div className="ds-actionbar">
            <div className="mx-auto flex max-w-[1200px] items-center justify-between gap-2 sm:px-4">
              <button
                type="button"
                disabled={currentIndex === 0}
                onClick={() => update({ q: currentIndex }, 'replace')}
                className="ds-btn ds-btn-ghost"
              >
                <Icon name="ArrowLeftIcon" size={16} />
                <span className="hidden sm:inline">Previous</span>
              </button>
              <div className="flex items-center gap-2">
                {!isLast && (
                  <button type="button" onClick={() => update({ q: currentIndex + 2 }, 'replace')} className="ds-btn ds-btn-ghost">
                    Skip
                  </button>
                )}
                <button type="button" onClick={handleSaveAndNext} disabled={loading} className="ds-btn ds-btn-primary ds-btn-lg min-w-[11rem]">
                  {loading ? 'Saving…' : isLast ? 'Save answer' : 'Save & next'}
                  {!loading && <Icon name={isLast ? 'CheckIcon' : 'ArrowRightIcon'} size={17} />}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

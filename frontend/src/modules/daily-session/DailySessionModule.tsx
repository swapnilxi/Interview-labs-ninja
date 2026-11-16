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
import AILearnChat from './coach/AILearnChat';
import Modal from '@/components/ui/Modal';
import RichText from './coach/RichText';
import {
  Bar,
  DifficultyChip,
  PipStrip,
  Ring,
  WeekStrip,
  dayKey,
  difficultyTone,
  isTypingTarget,
  readPracticeDays,
  relativeDay,
  toneClass,
  uniqueByText,
} from './components/ds';
import { useCompanionStats } from './companion/useCompanion';
import TopicPicker from './components/TopicPicker';
import { readFocusTopics, DEFAULT_TOPICS } from './topics';
import { useAuth } from '@/contexts/AuthContext';
import { defaultAIRequestFields, isMissingKeyError } from '@/lib/services/settingsService';
import { AI_TIMEOUT_MS, backendFetch, isBackendKnownDown, isNetworkFailure, checkBackendHealth } from '@/lib/http/backendAvailability';
import { parseApiError } from '@/lib/http/apiClient';
import { localDailySessionAdapter } from '@/lib/services/local/localDailySessionAdapter';

/** No AI key is configured (in this browser or on the server), so no questions were written. */
class NeedsKeyError extends Error {
  constructor() {
    super('Add an AI key in Config to generate questions.');
    this.name = 'NeedsKeyError';
  }
}

/** Built-in questions, used only for an offline session (the backend can't be reached at all). */
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
  // The last Start found no AI key anywhere (browser or server): the setup screen asks for one.
  const [needsKey, setNeedsKey] = useState(false);
  const [isOfflineSession, setIsOfflineSession] = useState(false);
  const [backendOffline, setBackendOffline] = useState(false);

  // Setup form fields
  const [difficulty, setDifficulty] = useState('Mixed');
  // Topics to focus this session on. All presets selected by default; seeds from My Space focus areas when available.
  const { user } = useAuth();
  const topicUserKey = user ? user.id || user.email?.toLowerCase() || 'authenticated' : 'guest';
  const [topics, setTopics] = useState<string[]>(DEFAULT_TOPICS);
  useEffect(() => {
    const saved = readFocusTopics(String(topicUserKey));
    setTopics(saved.length ? saved : DEFAULT_TOPICS);
  }, [topicUserKey]);
  // Companies to target for this session (empty = no company filter).
  const [companies, setCompanies] = useState<string[]>([]);
  const [cvText, setCvText] = useState('');
  const [jdText, setJdText] = useState('');
  const [uploadingResume, setUploadingResume] = useState(false);
  const [uploadedFileName, setUploadedFileName] = useState('');

  // AI Hint & Answer state
  const [isGeneratingHint, setIsGeneratingHint] = useState(false);
  const [showHint, setShowHint] = useState(false);
  // The run bar's AI tutor sheet.
  const [tutorOpen, setTutorOpen] = useState(false);
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

  /**
   * Writes the questions first, then saves the session, so a failed or keyless generation leaves no empty session
   * behind. No AI key -> NeedsKeyError (the setup screen asks for one). Only a backend that can't be reached at all
   * falls back to a local session of built-in questions; any other failure is shown. (Papering over failures with the
   * built-in questions is what kept handing out the same ten questions.)
   */
  const resolveNewSession = async (): Promise<{
    session_id: number;
    session_date: string;
    session_code: string;
    offline: boolean;
    warning: string | null;
  }> => {
    if (!isBackendKnownDown()) {
      try {
        const genRes = await backendFetch('/sessions/generate-session-questions', {
          method: 'POST',
          // Several AI rounds: give it up to 5 minutes, not the 5-second default.
          timeoutMs: AI_TIMEOUT_MS,
          body: JSON.stringify({
            difficulty,
            cv_present: !!cvText,
            jd_present: !!jdText,
            cv_text: cvText || undefined,
            jd_text: jdText || undefined,
            topics: topics.length ? topics : undefined,
            companies: companies.length ? companies : undefined,
            ...defaultAIRequestFields(),
          }),
        });
        if (!genRes.ok) {
          const detail = await parseApiError(genRes);
          if (isMissingKeyError(detail)) throw new NeedsKeyError();
          throw new Error(`Couldn't generate questions: ${detail}`);
        }
        const genData = await genRes.json();
        if (genData?.needs_key) throw new NeedsKeyError();
        const payloadQuestions: unknown[] = Array.isArray(genData?.questions) ? genData.questions : [];
        if (!payloadQuestions.length) {
          // Every question we could find is already in the bank: say so instead of repeating old ones.
          throw new Error(genData?.warning || 'No new questions are available right now. Try other topics.');
        }

        const res = await backendFetch('/sessions', {
          method: 'POST',
          body: JSON.stringify({
            difficulty_hint: difficulty,
            cv_present: !!cvText,
            jd_present: !!jdText,
          }),
        });
        if (!res.ok) throw new Error(await parseApiError(res));
        const data = await res.json();

        const qRes = await backendFetch('/sessions/questions', {
          method: 'POST',
          body: JSON.stringify({
            session_id: data.session_id,
            questions: payloadQuestions,
          }),
        });
        if (!qRes.ok) throw new Error(await parseApiError(qRes));

        return {
          session_id: data.session_id,
          session_date: data.session_date,
          session_code: data.session_code || `W${data.session_id}/${data.session_date}`,
          offline: false,
          warning: genData?.warning || null,
        };
      } catch (err) {
        if (!isNetworkFailure(err)) throw err;
        // fall through to the local session below
      }
    }
    const local = localDailySessionAdapter.createSessionWithQuestions(difficulty, DEFAULT_QUESTIONS);
    return {
      ...local,
      offline: true,
      warning: 'Backend unreachable: these are built-in sample questions, saved only in this browser.',
    };
  };

  const handleStartSession = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setGenWarning(null);
    setLoadError(null);
    setNeedsKey(false);
    try {
      const { session_id, session_date, offline, warning } = await resolveNewSession();

      setGenWarning(warning);
      try {
        localStorage.setItem('ninja_active_session_date', session_date);
      } catch {
        /* storage unavailable: only the daily reminder check loses out */
      }
      // The new session is a new screen: it gets its own URL, and the URL's loader fills it in.
      openSession(offline ? `${OFFLINE_PREFIX}${session_date}` : String(session_id), true);
    } catch (err) {
      if (err instanceof NeedsKeyError) {
        setNeedsKey(true);
        return;
      }
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
      setDisplayedDbQuestions(all.slice(0, 10));
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoadingDbQuestions(false);
    }
  };

  const pickQuestionsForFilter = (filter: CategoryFilter, pool: Question[]) => {
    const filtered = filter === 'All' ? pool : pool.filter((q) => q.category === filter);
    const shuffled = [...filtered].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, 10);
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
  // Recent sessions: the latest four, the rest one tap away.
  const [showAllRecent, setShowAllRecent] = useState(false);
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
      if (document.querySelector('[data-modal-root]')) return; // the tutor sheet (or another dialog) is open
      if (e.key === 'ArrowRight' && currentIndex < questions.length - 1) update({ q: currentIndex + 2 }, 'replace');
      if (e.key === 'ArrowLeft' && currentIndex > 0) update({ q: currentIndex }, 'replace');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [screen, currentIndex, questions.length, update]);

  // Spinner while a session is being created or fetched (the setup form never shows with one pending)
  if (screen === 'loading' || (screen === 'setup' && (loading || navigating))) {
    return (
      <div className="flex h-[26rem] flex-col items-center justify-center gap-[1.75rem]">
        <div className="ds-loader" role="status" aria-label="Loading">
          <span className="ds-loader-track" />
          <span className="ds-loader-arc" />
          <span className="ds-loader-arc-inner" />
          <span className="ds-loader-core" />
        </div>
        <p className="ds-loader-text">
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

    const recentShown = showAllRecent ? recentSessions : recentSessions.slice(0, 4);

    const weekCard = (
      <section className="ds-card p-5" aria-labelledby="ds-week-title">
        <div className="mb-4 flex items-baseline justify-between gap-3">
          <h3 id="ds-week-title" className="ds-h3">
            This week
          </h3>
          <span className="text-xs font-medium ds-faint ds-num">{weekDaysPractised} of 7 days</span>
        </div>
        <WeekStrip activeDays={activeDays} />
        <p className="mt-4 text-xs leading-relaxed ds-faint">
          {weekDaysPractised === 0
            ? 'Answer a question or finish a drill to light up today.'
            : companionStats.streak > 1
              ? `${companionStats.streak}-day streak. Keep the flame going.`
              : 'Keep the flame going: a little every day adds up.'}
        </p>
      </section>
    );

    const moreWays = (
      <nav aria-labelledby="ds-more-title">
        <div className="ds-section-head">
          <h3 id="ds-more-title">More ways to practise</h3>
        </div>
        <div className="ds-list" data-icons="true">
          {[
            { href: '/daily-session?tab=practice', icon: 'AcademicCapIcon', tone: 'indigo' as const, title: 'Practice drill', sub: 'Pick a topic, level and length' },
            { href: '/daily-session?tab=quick-practice', icon: 'BoltIcon', tone: 'gold' as const, title: 'Quick blitz', sub: 'Flashcards for a short gap' },
            { href: '/daily-session?tab=progress', icon: 'ChartBarIcon', tone: 'jade' as const, title: 'Your progress', sub: 'Readiness and skill trends' },
          ].map((l) => (
            <Link key={l.href} href={l.href} scroll={false} prefetch={false} className="ds-list-row">
              <span className={`ds-icon-tile ds-icon-tile-sm ${toneClass(l.tone)}`}>
                <Icon name={l.icon} size={17} variant="solid" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold ds-ink">{l.title}</span>
                <span className="block text-xs ds-faint">{l.sub}</span>
              </span>
              <Icon name="ChevronRightIcon" size={16} className="ds-chevron" />
            </Link>
          ))}
        </div>
      </nav>
    );

    return (
      <div className="grid gap-[1.75rem] lg:grid-cols-[minmax(0,1fr)_20rem] lg:gap-[2rem]">
        <div className="min-w-0 space-y-[1.75rem]">
          {backendOffline && (
            <div className="ds-banner ds-tone-gold" role="status">
              <Icon name="SignalSlashIcon" size={18} />
              <span>
                <b>Offline mode.</b> The backend isn&apos;t reachable, so new sessions use built-in questions and are saved in this
                browser only.
              </span>
            </div>
          )}

          {/* Today's session already exists: continuing it is the main action, so it comes first. */}
          {todaySession && (
            <section className="ds-card flex flex-wrap items-center gap-4 p-4 sm:p-5 ds-enter" aria-label="Today's session">
              <Ring
                value={todaySession.total ? todaySession.answered / todaySession.total : 0}
                size={52}
                stroke={5}
                tone={todaySession.answered >= todaySession.total ? 'jade' : 'indigo'}
                label={`${todaySession.answered} of ${todaySession.total} answered`}
              >
                <span className="text-[11px] font-bold ds-ink ds-num">
                  {todaySession.answered}/{todaySession.total}
                </span>
              </Ring>
              {/* min width: below it the button wraps to its own full-width row instead of squeezing this text
                  into a one-word column. */}
              <div className="min-w-[9.5rem] flex-1">
                <p className="ds-h3">
                  {todaySession.answered >= todaySession.total ? "Today's session is done" : "Today's session is waiting"}
                </p>
                <p className="text-sm ds-muted">
                  {todaySession.answered >= todaySession.total
                    ? 'Every question answered. Revisit it, or start a fresh set below.'
                    : `${todaySession.answered} of ${todaySession.total} answered. Pick up where you left off.`}
                </p>
              </div>
              <Link
                href={recentHref(todaySession)}
                prefetch={false}
                scroll={false}
                className="ds-btn ds-btn-primary w-full justify-center sm:w-auto"
              >
                {todaySession.answered >= todaySession.total ? 'Review' : 'Continue'}
                <Icon name="ArrowRightIcon" size={16} />
              </Link>
            </section>
          )}

          {/* Hero: set up today's session */}
          <section className="ds-hero ds-enter" aria-labelledby="ds-today-title">
            <div className="relative p-5 sm:p-[1.75rem]">
              <CompanionStrip c={companion} />

              <div className="mt-5">
                <h2 id="ds-today-title" className="ds-h2">
                  {todaySession ? 'Or start a fresh set' : 'Ten fresh questions, tuned to you'}
                </h2>
                <p className="ds-body mt-1 max-w-[58ch]">
                  Interview and computer-vision questions. Answer in your own words; hints and the AI coach are one tap away.
                </p>
              </div>

              <form onSubmit={handleStartSession} className="mt-[1.5rem] space-y-[1.5rem]">
                <div>
                  <p id="ds-level" className="mb-2 text-sm font-semibold ds-ink">
                    Level
                  </p>
                  <div className="ds-seg" role="group" aria-labelledby="ds-level">
                    {['Easy', 'Medium', 'Hard', 'Mixed'].map((label) => (
                      <button key={label} type="button" aria-pressed={difficulty === label} onClick={() => setDifficulty(label)}>
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                <TopicPicker value={topics} onChange={setTopics} companies={companies} onCompaniesChange={setCompanies} />

                <details className="ds-disclosure ds-list" open>
                  <summary className="ds-list-row">
                    <span className="ds-icon-tile ds-icon-tile-sm ds-tone-neutral">
                      <Icon name="BriefcaseIcon" size={16} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold ds-ink">Tailor to your resume and role</span>
                      <span className="block text-xs ds-faint">
                        {tailored
                          ? [cvText.trim() && 'Resume added', jdText.trim() && 'Job added'].filter(Boolean).join(' · ')
                          : 'Optional'}
                      </span>
                    </span>
                    <Icon name="ChevronDownIcon" size={16} className="ds-caret ds-faint flex-shrink-0" />
                  </summary>
                  <div className="space-y-4 px-4 pb-4 pt-1">
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

                <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:gap-4">
                  <button
                    type="submit"
                    disabled={loading}
                    className={`ds-btn ds-btn-lg ${todaySession ? 'ds-btn-secondary' : 'ds-btn-primary'} w-full sm:w-auto sm:min-w-[15rem]`}
                  >
                    <Icon name={todaySession ? 'ArrowPathIcon' : 'PlayIcon'} size={18} variant={todaySession ? 'outline' : 'solid'} />
                    {todaySession ? 'Generate a new session' : "Start today's session"}
                  </button>
                  <span className="text-center text-[13px] ds-faint sm:text-left">
                    10 questions · about 25 min{topics.length ? ` · ${topics.length} topic${topics.length === 1 ? '' : 's'}` : ''}{tailored ? ' · tailored' : ''}
                  </span>
                </div>
              </form>
            </div>
          </section>

          {needsKey && (
            <div role="alert" className="ds-banner ds-tone-gold flex-wrap">
              <Icon name="KeyIcon" size={18} />
              <span className="min-w-0 flex-1">
                <span className="block font-semibold">Add an AI key to generate questions</span>
                <span className="block text-sm">
                  Every session is written fresh by the model you pick in Config, so questions don&apos;t repeat. Keys stay in
                  this browser.
                </span>
              </span>
              <Link href="/config" className="ds-btn ds-btn-primary ds-btn-sm">
                <Icon name="Cog6ToothIcon" size={15} />
                Open Config
              </Link>
            </div>
          )}

          {loadError && (
            <div role="alert" className="ds-banner ds-tone-rose">
              <Icon name="ExclamationTriangleIcon" size={18} />
              <span>{loadError}</span>
            </div>
          )}

          {/* Phones and tablets: the week sits right under the hero (the sidebar holds it on desktop). */}
          <div className="lg:hidden">{weekCard}</div>

          {/* Recent sessions */}
          {recentSessions.length > 0 && (
            <section aria-labelledby="ds-recent-title" className="ds-enter-2">
              <div className="ds-section-head">
                <h3 id="ds-recent-title">Recent sessions</h3>
                {recentSessions.length > 4 && (
                  <button type="button" onClick={() => setShowAllRecent((v) => !v)} className="ds-link text-xs">
                    {showAllRecent ? 'Show fewer' : `Show all ${recentSessions.length}`}
                  </button>
                )}
              </div>
              <ul className="ds-list" data-icons="true">
                {recentShown.map((r) => {
                  const done = r.total > 0 && r.answered >= r.total;
                  return (
                    <li key={r.key}>
                      {/* a real link: the session has its own address, so it can also be opened in a new tab */}
                      <Link href={recentHref(r)} prefetch={false} scroll={false} className="ds-list-row">
                        <Ring value={r.total ? r.answered / r.total : 0} size={32} stroke={3.5} tone={done ? 'jade' : 'indigo'}>
                          {done && <Icon name="CheckIcon" size={14} className="ds-tone-jade ds-tone-text" />}
                        </Ring>
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-semibold ds-ink">{relativeDay(r.date)}</span>
                          <span className="block text-xs ds-faint ds-num">
                            {done ? 'Completed' : `${r.answered} of ${r.total} answered`}
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
            <div className="ds-section-head ds-section-head-center">
              <h3 id="ds-bank-title">From your question bank</h3>
              <span className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={handleRegenerateFromDb}
                  disabled={isLoadingDbQuestions || dbQuestions.length === 0}
                  className="ds-btn ds-btn-ghost ds-btn-sm"
                  title="Show another random handful"
                >
                  <Icon name="ArrowPathIcon" size={15} />
                  <span className="hidden sm:inline">Shuffle</span>
                  <span className="sr-only sm:hidden">Shuffle</span>
                </button>
                <button
                  type="button"
                  onClick={handleExportCSV}
                  disabled={displayedDbQuestions.length === 0}
                  className="ds-btn ds-btn-ghost ds-btn-sm"
                  title="Download these questions as CSV"
                >
                  <Icon name="ArrowDownTrayIcon" size={15} />
                  <span className="hidden sm:inline">CSV</span>
                  <span className="sr-only sm:hidden">Download CSV</span>
                </button>
              </span>
            </div>

            <div className="ds-seg ds-seg-inline mb-3 w-full sm:w-auto" role="group" aria-label="Category">
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
              <div className="ds-list" aria-busy="true">
                {[0, 1, 2, 3].map((i) => (
                  <div key={i} className="ds-list-row">
                    <span className="h-[2.4rem] w-full animate-pulse rounded-lg ds-inset" />
                  </div>
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
              <ul className="ds-list">
                {displayedDbQuestions.map((q) => (
                  <li key={q.id}>
                    <Link
                      href={`/question-review?id=${q.id}`}
                      prefetch={false}
                      className="ds-list-row ds-list-row-top"
                      title="Open the full review"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="ds-clamp-2 text-[0.9rem] font-semibold leading-snug ds-ink">{q.questionText}</span>
                        <span className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs ds-faint">
                          <span className={`inline-flex items-center gap-1.5 font-semibold ${toneClass(difficultyTone(q.difficulty))} ds-tone-text`}>
                            <span className="ds-dot" aria-hidden="true" />
                            {q.difficulty}
                          </span>
                          <span aria-hidden="true">·</span>
                          <span>{q.category}</span>
                          {q.subType && (
                            <>
                              <span aria-hidden="true">·</span>
                              <span className="break-words">{q.subType}</span>
                            </>
                          )}
                        </span>
                      </span>
                      <Icon name="ChevronRightIcon" size={16} className="ds-chevron mt-0.5" />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        {/* Sidebar (desktop) */}
        <aside className="hidden space-y-[1.75rem] lg:sticky lg:top-[5.5rem] lg:block lg:self-start">
          {weekCard}
          {moreWays}
        </aside>

        {/* Phones and tablets: the other ways to practise close the page. */}
        <div className="lg:hidden">{moreWays}</div>
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
            <CompanionStrip c={companion} />
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
                { k: 'Minutes', v: `~${Math.max(5, Math.round(questions.length * 2.5))}` },
                { k: 'Answered', v: `${answeredCount}/${questions.length}` },
              ].map((s) => (
                <div key={s.k} className="ds-stat-tile">
                  <dt>{s.k}</dt>
                  <dd>{s.v}</dd>
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
                  {topics.slice(0, 5).map((t) => (
                    <span key={t} className="ds-chip ds-tone-neutral">
                      {t}
                    </span>
                  ))}
                  {topics.length > 5 && (
                    <span className="ds-chip ds-tone-neutral ds-num" title={topics.slice(5).join(', ')}>
                      +{topics.length - 5} more
                    </span>
                  )}
                </div>
              </div>
            )}

            <div className="mt-7 flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:gap-3">
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
      {/* Run bar (the quiz's navigation bar): leave, where you are, time, overview. One pip per question sits under it:
          the progress bar and the question navigator in one line. */}
      <div className="ds-topbar ds-runbar">
        <div className="ds-runbar-row">
          <button
            type="button"
            onClick={() => goBack(viewAll ? quizUrl : setupUrl)}
            className="ds-btn ds-btn-ghost ds-btn-icon"
            aria-label={viewAll ? 'Back to the question' : 'Leave the session'}
            title={viewAll ? 'Back to the question' : 'Leave (your saved answers stay)'}
          >
            <Icon name={viewAll ? 'ArrowLeftIcon' : 'XMarkIcon'} size={20} />
          </button>
          <div className="ds-runbar-title">
            <h1 className="ds-runbar-name">
              {viewAll ? (
                'All questions'
              ) : (
                <>
                  Question {currentIndex + 1}
                  <span> of {questions.length}</span>
                </>
              )}
            </h1>
            <p className="ds-runbar-sub ds-num">
              {answeredCount} of {questions.length} answered
            </p>
          </div>
          <span className="ds-runbar-time ds-num" title="Time on questions">
            <Icon name="ClockIcon" size={15} />
            {formatTime(elapsedSeconds)}
          </span>
          {!viewAll && activeQuestion && (
            <button
              type="button"
              onClick={() => setTutorOpen(true)}
              className="ds-btn ds-btn-secondary ds-btn-sm ds-runbar-all"
              aria-haspopup="dialog"
              aria-label="AI tutor for this question"
              title="Learn this question with the AI tutor"
            >
              <Icon name="ChatBubbleLeftRightIcon" size={17} />
              <span className="hidden sm:inline">AI tutor</span>
            </button>
          )}
          <button
            type="button"
            onClick={() => (viewAll ? goBack(quizUrl) : update({ view: 'all' }, 'push'))}
            className="ds-btn ds-btn-secondary ds-btn-sm ds-runbar-all"
            aria-label={viewAll ? 'One question at a time' : 'See all questions'}
            title={viewAll ? 'One question at a time' : 'See all questions'}
          >
            <Icon name={viewAll ? 'RectangleStackIcon' : 'Squares2X2Icon'} size={17} />
            <span className="hidden sm:inline">{viewAll ? 'One at a time' : 'All questions'}</span>
          </button>
        </div>
        <PipStrip
          count={questions.length}
          current={viewAll ? undefined : currentIndex}
          isDone={(i) => isAnswered(questions[i])}
          onSelect={viewAll ? undefined : (i) => update({ q: i + 1 }, 'replace')}
          label={viewAll ? 'Session progress' : 'Questions'}
        />
      </div>

      {/* The AI tutor for the question on screen: a sheet on phones, a panel on desktop. Each question keeps its own
          conversation while the session is open (closing the sheet does not end it). */}
      <Modal
        isOpen={tutorOpen && !viewAll && !!activeQuestion}
        onClose={() => setTutorOpen(false)}
        labelledBy="ds-tutor-title"
        className="lab-page ds-skin ios-sheet flex max-h-[90vh] w-full flex-col overflow-hidden rounded-[22px] sm:max-w-2xl"
      >
        <div className="ios-sheet-head sm:pt-4">
          <h2 id="ds-tutor-title" className="ios-sheet-title">
            AI tutor
          </h2>
          <button
            type="button"
            onClick={() => setTutorOpen(false)}
            className="sheet-done ds-tone-indigo ds-tone-text"
          >
            Done
          </button>
        </div>
        {activeQuestion && (
          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 pb-[1.25rem] sm:px-[1.5rem]">
            <p className="ds-clamp-2 text-sm ds-muted">{activeQuestion.questionText}</p>
            <AILearnChat
              key={activeQuestion.questionText}
              persistKey={`session:${sessionDate}:${activeQuestion.questionText}`}
              question={{
                questionText: activeQuestion.questionText,
                category: activeQuestion.category === 'Interview' ? 'interview' : 'cv_skill',
                subType: activeQuestion.subType,
                difficulty: activeQuestion.difficulty,
              }}
            />
          </div>
        )}
      </Modal>

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
                className="text-left text-[0.95rem] font-medium leading-[1.5] ds-ink hover:underline"
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
                  {/^\d+$/.test(q.id) ? (
                    <Link
                      href={`/question-review?id=${q.id}`}
                      prefetch={false}
                      className="ds-link text-xs"
                    >
                      Full review
                    </Link>
                  ) : (
                    <span />
                  )}
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
            {/* The question */}
            <section
              key={activeQuestion?.id ?? currentIndex}
              className="ds-card-raised ds-qmain ds-enter"
              aria-labelledby="ds-q-text"
            >
              <div className="ds-qmeta">
                <div className="ds-qmeta-tags">
                  {activeQuestion?.subType && (
                    <span className="ds-chip ds-tone-neutral">{activeQuestion.subType}</span>
                  )}
                  {activeQuestion?.difficulty && (
                    <DifficultyChip difficulty={activeQuestion.difficulty} />
                  )}
                </div>
                {activeQuestion && /^\d+$/.test(activeQuestion.id) && (
                  <Link
                    href={`/question-review?id=${activeQuestion.id}`}
                    prefetch={false}
                    className="ds-reviewlink"
                    aria-label="Full review of this question"
                    title="Full review"
                  >
                    <span className="hidden sm:inline">Full review</span>
                    <Icon name="ArrowTopRightOnSquareIcon" size={16} />
                  </Link>
                )}
              </div>
              <h2 id="ds-q-text" className="ds-question">
                {activeQuestion?.questionText}
              </h2>
            </section>

            {/* Answer + code space + AI coach */}
            {activeQuestion && (
              <section className="ds-card ds-answer p-5 sm:p-[1.5rem]">
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
          <aside className="ds-rail space-y-4 self-start">
            <CompanionStrip c={companion} className="px-1" />

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

            <section className="ds-list" data-icons="true" aria-label="Session tools">
              <button type="button" onClick={handleExport} className="ds-list-row">
                <span className="ds-icon-tile ds-icon-tile-sm ds-tone-neutral">
                  <Icon name="ArrowDownTrayIcon" size={16} />
                </span>
                <span className="flex-1 text-sm font-semibold ds-ink">Export as Markdown</span>
              </button>
              <button type="button" onClick={handleClearSession} className="ds-list-row">
                <span className="ds-icon-tile ds-icon-tile-sm ds-tone-neutral">
                  <Icon name="XMarkIcon" size={16} />
                </span>
                <span className="flex-1">
                  <span className="block text-sm font-semibold ds-ink">Close this session</span>
                  <span className="block text-xs ds-faint">Saved answers stay in Recent sessions</span>
                </span>
              </button>
            </section>
            <p className="hidden items-center gap-1.5 px-1 text-xs ds-faint lg:flex">
              <span className="ds-kbd">←</span>
              <span className="ds-kbd">→</span>
              move between questions
            </p>
          </aside>

          {/* Dock: previous, skip, save & next. A floating glass capsule, the same material as the tab bar it replaces
              while a question is on screen; on desktop it sits under the question column. */}
          <div className="ds-dock">
            <div className="ds-dock-inner">
              <div className="ds-dock-bar">
                <button
                  type="button"
                  disabled={currentIndex === 0}
                  onClick={() => update({ q: currentIndex }, 'replace')}
                  className="ds-btn ds-btn-ghost ds-dock-prev"
                  aria-label="Previous question"
                >
                  <Icon name="ArrowLeftIcon" size={18} />
                  <span className="hidden sm:inline">Previous</span>
                </button>
                <div className="ds-dock-end">
                  {!isLast && (
                    <button
                      type="button"
                      onClick={() => update({ q: currentIndex + 2 }, 'replace')}
                      className="ds-btn ds-btn-ghost ds-dock-skip"
                    >
                      Skip
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={handleSaveAndNext}
                    disabled={loading}
                    className="ds-btn ds-btn-primary ds-dock-next"
                  >
                    {loading ? 'Saving…' : isLast ? 'Save answer' : 'Save & next'}
                    {!loading && <Icon name={isLast ? 'CheckIcon' : 'ArrowRightIcon'} size={18} />}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

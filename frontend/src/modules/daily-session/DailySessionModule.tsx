'use client';

import { notify } from '@/lib/ui/notifications';
import React, { useState, useEffect, useRef, useTransition } from 'react';
import Link from 'next/link';
import CompanionStrip from './companion/CompanionStrip';
import { useCompanionVoice } from './companion/useCompanionVoice';
import { greeting, line } from './companion/content';
import { playChime, stopSoundscape } from './companion/soundscape';
import { useRouter } from 'next/navigation';
import Icon from '@/components/ui/AppIcon';
import BackButton from '@/components/ui/BackButton';
import { useUrlState, buildUrl } from '@/lib/navigation/urlState';
import { useSmartBack } from '@/lib/navigation/smartBack';
import { questionsService, Question } from '@/lib/services/questionsService';
import { sessionService, SessionAnswer } from '@/lib/services/sessionService';
import { isLoggedIn } from '@/lib/auth/tokenStore';
import AnswerWorkspace from './coach/AnswerWorkspace';
import RichText from './coach/RichText';
import { DifficultyTag } from '@/modules/common/lab/LabTags';
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
  const router = useRouter();
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

  const handleSaveAnswer = async () => {
    if (questions.length === 0) return;
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
    } catch (err) {
      console.error(err);
      notify({ source: 'daily-session', tone: 'error', title: "Couldn't save your answer", body: 'Check your connection and try again.' });
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
      const all = await questionsService.getAll();
      setDbQuestions(all);
      const shuffled = [...all].sort(() => Math.random() - 0.5);
      setDisplayedDbQuestions(shuffled.slice(0, 10));
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

  // Spinner while a session is being created or fetched (the setup form never shows with one pending)
  if (screen === 'loading' || (screen === 'setup' && (loading || navigating))) {
    return (
      <div className="flex items-center justify-center h-[500px]">
        <div className="w-[3rem] h-[3rem] border-4 border-border border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  // Phase 1: Setup Form
  if (screen === 'setup') {
    // Selected difficulty = the same soft tint + hairline as DifficultyTag (semantic colours; Mixed is neutral slate, never an accent chip).
    const difficultyOptions = [
      { label: 'Easy',   active: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300' },
      { label: 'Medium', active: 'border-amber-500/40 bg-amber-500/10 text-amber-800 dark:text-amber-300' },
      { label: 'Hard',   active: 'border-rose-500/40 bg-rose-500/10 text-rose-700 dark:text-rose-300' },
      { label: 'Mixed',  active: 'border-slate-500/40 bg-slate-500/10 text-slate-700 dark:text-slate-300' },
    ];

    return (
      <div className="space-y-[1.5rem]">
        <CompanionStrip c={companion} />
        {backendOffline && (
          <div className="flex items-center gap-3 rounded-xl border mix-border-warning/30 mix-bg-warning/10 px-4 py-3 text-sm text-warning">
            <Icon name="ExclamationTriangleIcon" size={18} variant="outline" className="flex-shrink-0" />
            <span>
              Backend unreachable — Daily Session will run in offline mode. Your session and answers are saved in this browser only, and won&apos;t sync once the backend is back.
            </span>
          </div>
        )}
        {/* ── Setup Card ── */}
        <div className="todo-lit lit-static rounded-xl border bg-card">
          <div className="p-4 sm:p-[1.5rem]">
            <h2 className="font-heading text-lg font-semibold text-foreground mb-7 flex items-center gap-3">
              <div className="todo-icon-chip h-9 w-9">
                <Icon name="AcademicCapIcon" size={17} />
              </div>
              Configure Your Session
            </h2>
            <form onSubmit={handleStartSession} className="space-y-[1.25rem] sm:space-y-[1.5rem]">
              <div>
                <label className="block text-sm font-semibold text-foreground mb-3">Difficulty</label>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {difficultyOptions.map(({ label, active }) => (
                    <button key={label} type="button" onClick={() => setDifficulty(label)}
                      className={`todo-focus min-h-[48px] py-3 rounded-lg border text-sm font-semibold transition-smooth ${
                        difficulty === label ? active : 'mix-bg-foreground/[0.04] border-border text-muted-foreground hover:mix-bg-foreground/[0.08] hover:text-foreground'
                      }`}>
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                  <label htmlFor="cv-text" className="flex items-center gap-2 text-sm font-semibold text-foreground whitespace-nowrap">
                    Context / Resume
                    <span className="text-xs text-muted-foreground font-medium">Optional</span>
                  </label>
                  <label className="cursor-pointer inline-flex min-h-[40px] items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg lab-tint lab-ink hover:mix-bg-primary/[0.18] transition-smooth border mix-border-primary/25">
                    <Icon name="DocumentArrowUpIcon" size={14} />
                    {uploadingResume ? 'Extracting...' : 'Upload Resume (.pdf/.docx/.txt)'}
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
                  <div className="mb-2 text-xs font-medium text-emerald-500 flex items-center gap-1">
                    <Icon name="CheckCircleIcon" size={14} variant="solid" />
                    Uploaded: {uploadedFileName}
                  </div>
                )}
                <textarea id="cv-text" rows={4} value={cvText} onChange={(e) => setCvText(e.target.value)}
                  placeholder="Paste your resume, project context, or upload a document using the button above..."
                  className="todo-input px-4 py-3 text-sm resize-none" />
              </div>

              <div>
                <label htmlFor="jd-text" className="flex items-center gap-3 text-sm font-semibold text-foreground mb-2">
                  Job Description
                  <span className="text-xs text-muted-foreground font-medium">Optional — tailors focus</span>
                </label>
                <textarea id="jd-text" rows={4} value={jdText} onChange={(e) => setJdText(e.target.value)}
                  placeholder="Paste target job description to customise question focus areas..."
                  className="todo-input px-4 py-3 text-sm resize-none" />
              </div>

              <button type="submit" disabled={loading}
                className="todo-btn todo-btn-primary w-full gap-3 px-4 py-3.5 text-sm disabled:pointer-events-none">
                {loading ? (
                  <span className="w-5 h-5 border-2 border-current border-t-transparent rounded-full animate-spin" />
                ) : (
                  <Icon name="PlayIcon" size={17} variant="solid" />
                )}
                Generate Daily Session (10 Questions)
              </button>
            </form>
          </div>
        </div>

        {loadError && (
          <div role="alert" className="flex items-center gap-3 rounded-xl border mix-border-error/30 mix-bg-error/10 px-4 py-3 text-sm text-error">
            <Icon name="ExclamationTriangleIcon" size={18} variant="outline" className="flex-shrink-0" />
            <span>{loadError}</span>
          </div>
        )}

        {/* ── Recent Sessions ── */}
        {recentSessions.length > 0 && (
          <div className="bg-card rounded-xl border border-border">
            <div className="p-4 sm:p-[1.5rem]">
              <h3 className="font-heading text-base font-semibold text-foreground flex items-center gap-3 mb-[1rem]">
                <Icon name="ClockIcon" size={18} variant="outline" className="text-primary flex-shrink-0" />
                Recent Sessions
                <span className="text-xs font-medium text-muted-foreground">last {recentSessions.length}</span>
              </h3>
              <ul className="divide-y divide-border">
                {recentSessions.map((r) => {
                  const pct = r.total ? Math.round((r.answered / r.total) * 100) : 0;
                  return (
                    <li key={r.key}>
                      {/* a real link: the session has its own address, so it can also be opened in a new tab */}
                      <Link
                        href={recentHref(r)}
                        prefetch={false}
                        scroll={false}
                        className="todo-focus flex w-full items-center gap-[1rem] py-[0.75rem] text-left hover:mix-bg-foreground/[0.05] rounded-lg px-[0.5rem] transition-smooth"
                      >
                        <span className="min-w-[6.5rem] text-sm font-medium text-foreground">
                          {new Date(`${r.date}T00:00:00`).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}
                        </span>
                        <span className="flex-1 h-[0.4rem] rounded-full bg-muted overflow-hidden">
                          <span className="block h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
                        </span>
                        <span className="text-xs text-muted-foreground whitespace-nowrap">
                          {r.total} questions · {r.answered} answered{r.offline ? ' · offline' : ''}
                        </span>
                        <Icon name="ChevronRightIcon" size={14} variant="outline" className="text-muted-foreground" />
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          </div>
        )}

        {/* ── Question Preview from DB ── */}
        <section aria-label="Questions from Database">
          <div>
            {/* Header row */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-5">
              <h3 className="font-heading text-base font-semibold text-foreground flex items-center gap-3">
                <Icon name="CircleStackIcon" size={18} variant="outline" className="text-primary flex-shrink-0" />
                Questions from Database
                {dbQuestions.length > 0 && (
                  <span className="text-xs font-medium text-muted-foreground">({dbQuestions.length} total)</span>
                )}
              </h3>
              <div className="flex gap-3">
                <button onClick={handleRegenerateFromDb}
                  disabled={isLoadingDbQuestions || dbQuestions.length === 0}
                  className="todo-focus px-4 py-2 rounded-lg border border-border text-sm font-medium text-foreground hover:bg-muted transition-smooth flex items-center gap-2 disabled:opacity-40 disabled:pointer-events-none">
                  <Icon name="ArrowPathIcon" size={14} variant="outline" />
                  Regenerate
                </button>
                <button onClick={handleExportCSV}
                  disabled={displayedDbQuestions.length === 0}
                  className="todo-focus px-4 py-2 rounded-lg border border-border text-sm font-medium text-foreground hover:bg-muted transition-smooth flex items-center gap-2 disabled:opacity-40 disabled:pointer-events-none">
                  <Icon name="ArrowDownTrayIcon" size={14} variant="outline" />
                  Export CSV
                </button>
              </div>
            </div>

            {/* Category filter pills */}
            <div className="flex flex-wrap gap-3 mb-7">
              {(['All', 'Interview', 'CV Skill'] as CategoryFilter[]).map((cat) => (
                <button key={cat} onClick={() => handleCategoryFilterChange(cat)}
                  className={`px-4 py-1.5 rounded-full text-sm font-medium transition-smooth border ${
                    categoryFilter === cat
                      ? 'bg-primary border-primary text-primary-foreground'
                      : 'bg-muted border-border text-muted-foreground hover:border-muted-foreground'
                  }`}>
                  {cat}
                  {cat !== 'All' && dbQuestions.length > 0 && (
                    <span className="ml-1.5 text-xs opacity-70">
                      ({dbQuestions.filter((q) => q.category === cat).length})
                    </span>
                  )}
                </button>
              ))}
            </div>

            {/* Question cards */}
            {isLoadingDbQuestions ? (
              <div className="flex justify-center py-10">
                <div className="w-8 h-8 border-2 border-border border-t-primary rounded-full animate-spin" />
              </div>
            ) : displayedDbQuestions.length === 0 ? (
              <div className="text-center py-10 text-muted-foreground">
                <Icon name="InboxIcon" size={36} variant="outline" className="mx-auto mb-4 opacity-30" />
                <p className="text-sm">No questions in the database yet.</p>
                <p className="text-xs mt-2">Generate your first session above to populate the question bank.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {displayedDbQuestions.map((q, idx) => (
                  <div 
                    key={q.id}
                    onClick={() => router.push(`/question-review?id=${q.id}`)}
                    className="todo-lit lit-soft bg-card border border-border rounded-xl p-4 flex flex-col gap-3 cursor-pointer transition-all group"
                    title="Click to open question review & AI breakdown"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3 flex-wrap min-w-0">
                        <span className="text-xs font-semibold px-2.5 py-1 rounded-full lab-tint lab-ink shrink-0">
                          {q.category}
                        </span>
                        <span className="text-xs text-muted-foreground truncate">{q.subType}</span>
                      </div>
                      <DifficultyTag difficulty={q.difficulty} className="shrink-0" />
                    </div>
                    <p className="text-sm text-foreground leading-relaxed group-hover:lab-ink transition-colors">
                      <span className="text-muted-foreground font-medium mr-2">Q{idx + 1}.</span>
                      {q.questionText}
                    </p>
                    <div className="flex items-center justify-between pt-1 text-xs text-muted-foreground mt-auto">
                      <span className="group-hover:lab-ink font-medium flex items-center gap-1">
                        Review Question & AI Feedback &rarr;
                      </span>
                      <span className="text-xs font-mono">#{q.id}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      </div>
    );
  }

  // Phase 2: Ready / Interstitial
  if (screen === 'ready') {
    return (
      <div className="max-w-2xl mx-auto mt-[1rem] sm:mt-9 space-y-[1rem] animate-fade-in">
      <div>
        <BackButton href={setupUrl} label="Back" />
      </div>
      <CompanionStrip c={companion} />
      <div className="todo-lit lit-soft bg-card rounded-lg p-[1.25rem] sm:p-9 border border-border text-center">
        <Icon name="CheckBadgeIcon" size={64} className="text-success mx-auto mb-[1.125rem]" variant="outline" />
        <h2 className="font-heading text-3xl font-semibold text-foreground mb-3">Session Ready!</h2>
        <p className="text-muted-foreground mb-[1.5rem] font-body">
          Your custom interview questions have been generated and securely saved. This quiz mode will record your session duration and track your completion.
        </p>
        <div className="flex flex-col-reverse items-stretch justify-center gap-3 sm:flex-row sm:items-center sm:gap-3">
          <button
            onClick={() => goBack(setupUrl)}
            className="py-3 px-[1.5rem] rounded-md border border-border text-sm font-medium text-foreground hover:bg-muted transition-smooth inline-flex items-center justify-center gap-3 focus-ring"
          >
            <Icon name="ArrowLeftIcon" size={18} variant="outline" />
            Back
          </button>
          <button
            onClick={() => {
              companion.startSound();
              companion.say(line('start'), 'cheer');
              setElapsedSeconds(0);
              update({ q: 1 }, 'push');
            }}
            className="py-3 px-[1.5rem] rounded-md bg-primary hover:opacity-90 text-primary-foreground text-lg font-medium transition-smooth inline-flex items-center justify-center gap-3 focus-ring shadow-glow"
          >
            <Icon name="PlayCircleIcon" size={24} variant="solid" />
            Start Practicing
          </button>
        </div>
      </div>
      </div>
    );
  }

  // Phase 3: Active Session (Quiz Mode)
  return (
    <div className="space-y-[1.5rem] mt-[1.5rem] animate-fade-in">
      <div>
        {/* quiz -> the setup; the all-questions overview -> the quiz, at the question it was opened from */}
        <BackButton href={viewAll ? quizUrl : setupUrl} label="Back" />
      </div>
      <CompanionStrip c={companion} />
      <div className="h-2 w-full overflow-hidden rounded-full bg-muted" aria-label="Session progress">
        <div
          className="h-full rounded-full bg-primary transition-all duration-500"
          style={{ width: `${Math.max(4, Math.min(100, (Object.keys(answers).length / Math.max(1, questions.length)) * 100))}%` }}
        />
      </div>
      {genWarning && (
        <div role="status" className="flex items-center gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-[1.25rem] py-[0.75rem] text-sm text-amber-700 dark:text-amber-300">
          <Icon name="ExclamationTriangleIcon" size={18} variant="outline" className="flex-shrink-0" />
          <span>{genWarning}</span>
        </div>
      )}
      {/* Session Controls Header */}
      <div className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
        <div className="flex flex-wrap items-center gap-3">
          <span className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-semibold tabular-nums lab-tint lab-ink">
            <Icon name="ClockIcon" size={16} />
            {formatTime(elapsedSeconds)}
          </span>
          <span className="text-sm font-semibold text-foreground">
            Session ID: {sessionCodeFor(sessionDate)}
          </span>
          <span className="text-sm text-muted-foreground">
            {Object.keys(answers).length} of 10 answered
          </span>
          {isOfflineSession && (
            <span className="flex items-center gap-1.5 rounded-md border mix-border-warning/30 mix-bg-warning/10 px-3 py-1.5 text-xs font-medium text-warning">
              <Icon name="ExclamationTriangleIcon" size={14} variant="outline" />
              Offline — saved locally
            </span>
          )}
        </div>
        <div className="flex flex-wrap gap-3">
          <button
            onClick={() => (viewAll ? goBack(quizUrl) : update({ view: 'all' }, 'push'))}
            className="todo-btn todo-btn-secondary text-sm"
          >
            <Icon name={viewAll ? "BookOpenIcon" : "ListBulletIcon"} size={16} variant="outline" />
            {viewAll ? 'Back to Quiz' : 'View All Questions'}
          </button>
          <button
            onClick={handleExport}
            className="todo-btn todo-btn-secondary text-sm"
          >
            <Icon name="ArrowDownTrayIcon" size={16} variant="outline" />
            Export Markdown
          </button>
          <button
            onClick={handleClearSession}
            className="todo-btn border border-error text-sm text-error hover:mix-bg-error/10"
          >
            Reset Session
          </button>
        </div>
      </div>

      {viewAll ? (
        // Grid View of All Questions
        <div className="space-y-[1.125rem]">
          <h3 className="text-xl font-semibold text-foreground font-heading">All Questions Overview</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-[1.125rem]">
            {questions.map((q, idx) => (
              <div key={q.id} className="todo-lit lit-soft bg-card border border-border rounded-lg p-[1.125rem] flex flex-col justify-between">
                <div>
                  <div className="flex justify-between items-center gap-3 mb-3">
                    <span className="text-xs font-caption text-muted-foreground">
                      Q{idx + 1} • {q.category} ({q.subType})
                    </span>
                    <DifficultyTag difficulty={q.difficulty} className="shrink-0" />
                  </div>
                  <p 
                    onClick={() => router.push(`/question-review?id=${q.id || idx + 1}`)}
                    className="text-sm font-medium text-foreground leading-relaxed mb-[1.125rem] cursor-pointer hover:lab-ink transition-colors"
                    title="Click to open question review & AI breakdown"
                  >
                    {q.questionText}
                  </p>
                </div>
                <div>
                  <textarea
                    rows={3}
                    placeholder="Type answer details..."
                    value={answers[q.questionText] || ''}
                    onChange={(e) => {
                      const text = e.target.value;
                      setAnswers((prev) => ({ ...prev, [q.questionText]: text }));
                    }}
                    className="w-full rounded-md border border-border bg-input px-3 py-1.5 text-xs text-foreground focus-ring placeholder:text-muted-foreground mb-3"
                  />
                  <button
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
                    className="todo-btn todo-btn-primary"
                  >
                    Save Answer
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        // Quiz Mode (Single Question Focus)
        <div className="grid grid-cols-1 gap-[1.5rem] lg:grid-cols-[minmax(0,1fr)_21rem]">
          <div className="min-w-0 space-y-[1.25rem]">
            {/* Question navigator */}
            <div className="flex flex-wrap items-center gap-2" aria-label="Questions">
              {questions.map((q, idx) => {
                const done = !!(answers[q.questionText] || '').trim();
                const current = idx === currentIndex;
                return (
                  <button
                    key={q.id ?? idx}
                    type="button"
                    onClick={() => update({ q: idx + 1 }, 'replace')}
                    aria-label={`Question ${idx + 1}${done ? ' (answered)' : ''}`}
                    aria-current={current}
                    className={`h-9 w-9 rounded-full text-xs font-extrabold transition ${
                      current
                        ? 'scale-110 bg-primary text-primary-foreground shadow-md'
                        : done
                          ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300'
                          : 'bg-muted text-muted-foreground hover:mix-bg-foreground/10 hover:text-foreground'
                    }`}
                  >
                    {done && !current ? '✓' : idx + 1}
                  </button>
                );
              })}
            </div>

            {/* Question hero */}
            <div className="rounded-xl border border-border bg-card p-[1.5rem]">
              <div className="mb-[0.75rem] flex flex-wrap items-center gap-2 text-xs font-extrabold">
                <span className="rounded-full px-3 py-1 lab-tint lab-ink">
                  Question {currentIndex + 1} of {questions.length}
                </span>
                <span className="rounded-full mix-bg-foreground/[0.06] px-3 py-1 text-foreground">{activeQuestion?.subType}</span>
                {activeQuestion?.difficulty && <DifficultyTag difficulty={activeQuestion.difficulty} size="md" />}
                <button
                  type="button"
                  onClick={() => router.push(`/question-review?id=${activeQuestion?.id || currentIndex + 1}`)}
                  className="todo-focus ml-auto rounded-full border border-border px-3 py-1 text-muted-foreground hover:text-foreground"
                >
                  Full review →
                </button>
              </div>
              <h3 className="font-heading text-xl font-bold leading-snug text-foreground">{activeQuestion?.questionText}</h3>
            </div>

            {/* Answer + code space + AI coach */}
            {activeQuestion && (
              <div className="space-y-[1rem] rounded-xl border border-border bg-card p-[1.25rem] sm:p-[1.5rem]">
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
                <div className="flex justify-end">
                  <button
                    onClick={handleSaveAnswer}
                    className="flex items-center gap-2 rounded-2xl bg-primary px-[1.25rem] py-[0.65rem] text-sm font-extrabold text-primary-foreground shadow-[0_4px_0_0_color-mix(in_srgb,var(--color-primary)_60%,black)] transition active:translate-y-[2px] active:shadow-none"
                  >
                    <Icon name="CheckIcon" size={16} variant="outline" />
                    Save answer
                  </button>
                </div>
              </div>
            )}

            {/* Navigation */}
            <div className="flex items-center justify-between">
              <button
                disabled={currentIndex === 0}
                onClick={() => update({ q: currentIndex }, 'replace')}
                className="flex items-center gap-2 rounded-2xl border-2 border-border px-[1.1rem] py-[0.6rem] text-sm font-extrabold text-foreground transition hover:bg-muted disabled:pointer-events-none disabled:opacity-30"
              >
                <Icon name="ArrowLeftIcon" size={16} variant="outline" />
                Previous
              </button>
              <button
                disabled={currentIndex === questions.length - 1}
                onClick={() => update({ q: currentIndex + 2 }, 'replace')}
                className="flex items-center gap-2 rounded-2xl bg-primary px-[1.1rem] py-[0.6rem] text-sm font-extrabold text-primary-foreground shadow-[0_4px_0_0_color-mix(in_srgb,var(--color-primary)_60%,black)] transition active:translate-y-[2px] active:shadow-none disabled:pointer-events-none disabled:opacity-30"
              >
                Next
                <Icon name="ArrowRightIcon" size={16} variant="outline" />
              </button>
            </div>
          </div>

          {/* Hint / model answer panel */}
          <aside className="space-y-[1rem] self-start lg:sticky lg:top-[5rem]">
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-[1.25rem]" data-semantic="hint">
              <div className="mb-[0.5rem] flex items-center gap-2 text-sm font-extrabold text-amber-900 dark:text-amber-100">
                <Icon name="LightBulbIcon" size={18} variant="outline" className="flex-shrink-0" aria-hidden="true" /> Stuck? Ask for a hint
              </div>
              {!showHint ? (
                <>
                  <p className="mb-[0.75rem] text-xs leading-relaxed text-amber-900/80 dark:text-amber-100/80">
                    Try it yourself first. This gets a concise reference answer from AI for this exact question.
                  </p>
                  <button
                    onClick={handleGenerateHint}
                    disabled={isGeneratingHint}
                    className="flex w-full items-center justify-center gap-2 rounded-2xl bg-amber-400 px-3 py-[0.65rem] text-sm font-extrabold text-amber-950 shadow-[0_4px_0_0_rgba(180,83,9,0.5)] transition active:translate-y-[2px] active:shadow-none disabled:opacity-60"
                  >
                    {isGeneratingHint ? 'Thinking…' : 'Generate hint'}
                  </button>
                </>
              ) : (
                <div className="space-y-[0.75rem]">
                  {dynamicAiAnswer ? (
                    <RichText text={dynamicAiAnswer} className="text-amber-950 dark:text-amber-50" />
                  ) : null}
                  {dynamicAiAnswer && (
                    <button
                      onClick={handleExplainMore}
                      disabled={isExplaining}
                      className="w-full rounded-2xl border-2 border-amber-400 px-3 py-2 text-xs font-extrabold text-amber-900 dark:text-amber-100"
                    >
                      {isExplaining ? 'Explaining…' : showExplain ? 'Hide deep explanation' : 'Explain more with AI'}
                    </button>
                  )}
                  {showExplain && dynamicExplain && (
                    <div className="rounded-2xl bg-white/70 p-3 dark:bg-black/20">
                      <RichText text={dynamicExplain} />
                    </div>
                  )}
                </div>
              )}
              {hintError && <p className="mt-2 text-xs font-semibold text-rose-600 dark:text-rose-300">{hintError}</p>}
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}

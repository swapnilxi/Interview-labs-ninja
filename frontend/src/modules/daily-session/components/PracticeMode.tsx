'use client';

import React, { useState, useEffect, useLayoutEffect, useMemo, useRef, useCallback } from 'react';
import AnswerWorkspace from '../coach/AnswerWorkspace';
import AILearnChat, { chatTranscript } from '../coach/AILearnChat';
import { answerCoachService, type Evaluation } from '../coach/answerCoachService';
import { detectKind, wantsCode } from '../coach/questionKind';
import Icon from '@/components/ui/AppIcon';
import { questionsService, Question } from '@/lib/services/questionsService';
import { questionReviewService } from '@/modules/question-review/questionReviewService';
import { isLoggedIn } from '@/lib/auth/tokenStore';
import { openLoginModal } from '@/components/auth/LoginModal';
import { notify } from '@/lib/ui/notifications';
import { useUrlState, type NavMode } from '@/lib/navigation/urlState';
import { useSmartBack } from '@/lib/navigation/smartBack';
import Mascot from '../companion/Mascot';
import CompanionBubble from '../companion/CompanionBubble';
import CompanionSettings from '../companion/CompanionSettings';
import CompanionControls from '../companion/CompanionControls';
import { useCompanionSettings, useCompanionStats, xpToday } from '../companion/useCompanion';
import { playSoundscape, stopSoundscape, setSoundscapeVolume, playChime } from '../companion/soundscape';
import { speak, stopSpeaking } from '../companion/voice';
import { DifficultyChip, PipStrip, clock, isTypingTarget, toneClass, uniqueByText } from './ds';
import { MANTRAS, MOODS, MoodId, Mood, blessingFor, greeting, line, randomShloka } from '../companion/content';
import PracticeSetup from './practice/PracticeSetup';
import RunSummary from './practice/RunSummary';
import type { Mission } from './practice/Missions';
import { CheckError, CheckingPanel, ScoredPanel, SelfCheck, SelfPanel, type ReviewChange } from './practice/ResultPanel';
import {
  COMBO_BONUS,
  COMBO_FROM,
  DEFAULT_GOAL,
  FINISH_XP,
  GRADE_META,
  answerXp,
  gradeFromScore,
  ratingFor,
  readGoal,
  writeGoal,
  type Earned,
  type Grade,
} from './practice/progression';
import {
  HISTORY_KEY,
  SAMPLE_FALLBACK_QUESTIONS,
  buildMissions,
  isBankQuestion,
  matchesDrill,
  readHistory,
  topicLabel,
  type PracticeRun,
} from './practice/drill';

interface PracticeModeProps {
  onSwitchTab?: (tab: 'session' | 'quick-practice' | 'progress' | 'question-bank') => void;
}

/** question: answering. checking: the AI is scoring it. reveal: grading it yourself. feedback: the result. */
type Phase = 'question' | 'checking' | 'reveal' | 'feedback';

// ---------- A run has an address ----------
// Setup is /daily-session?tab=practice. A run in progress is &run=<id>&q=<n> (n counts from 1) and its finished
// summary is &run=<id>&done=1. The run itself is kept in localStorage, so a reload, a new tab or Forward can bring
// it back; an address whose run is not in storage falls back to setup. `&practice=<question id>` (from the question
// bank) is an entry link that opens a one-question run in its own place; an unknown id falls back to setup. The run's
// Back uses preferHistory, so a run opened from the bank returns to the bank rather than to setup.
const PRACTICE_URL = '/daily-session?tab=practice';
const RUN_KEY = 'labninja.practice.run.v1';

interface StoredRun {
  id: string;
  set: Question[];
  index: number;
  phase: Phase;
  notes: Record<string, string>;
  codes: Record<string, string>;
  grades: Record<string, Grade>;
  xp: number;
  combo: number;
  seconds: number;
  completed: boolean;
  finishInfo: { streak: number; grew: boolean } | null;
  category: string;
  difficulty: string;
  /** Added with the AI-scored loop (2026-11-16); older runs read back with empty defaults. */
  evals: Record<string, Evaluation>;
  earned: Record<string, Earned>;
  changes: Record<string, ReviewChange>;
  bestCombo: number;
  xpAtStart: number;
  mission: string | null;
}

const newRunId = () => Date.now().toString(36);

/** The address params that say where a run is: question n, or the finished summary. */
const runParams = (completed: boolean, index: number) =>
  completed ? { q: null, done: '1' } : { q: String(index + 1), done: null };

const asRecord = <T,>(v: unknown): Record<string, T> =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, T>) : {};

/** A stored evaluation is only shown if it has the shape the result panel reads. */
const isEvaluation = (v: unknown): v is Evaluation => {
  const e = v as Evaluation | null;
  return (
    !!e &&
    typeof e.overall === 'number' &&
    typeof e.level === 'string' &&
    [e.criteria, e.strengths, e.factual_issues, e.missing, e.improvements, e.follow_ups].every(Array.isArray)
  );
};

const filterRecord = <T,>(v: unknown, ok: (x: unknown) => boolean): Record<string, T> =>
  Object.fromEntries(Object.entries(asRecord<unknown>(v)).filter(([, x]) => ok(x))) as Record<string, T>;

const readRun = (): StoredRun | null => {
  try {
    const r = JSON.parse(localStorage.getItem(RUN_KEY) || 'null');
    if (!r || typeof r.id !== 'string' || !r.id || !Array.isArray(r.set) || r.set.length === 0) return null;
    if (!r.set.every((q: Question) => q && typeof q.id === 'string' && typeof q.questionText === 'string')) return null;
    if (!Number.isInteger(r.index) || r.index < 0 || r.index >= r.set.length) return null;
    const grades = filterRecord<Grade>(r.grades, (g) => g === 'nailed' || g === 'almost' || g === 'review');
    // A check that was in flight is lost with the page: back to answering.
    let phase: Phase = r.phase === 'reveal' || r.phase === 'feedback' ? r.phase : 'question';
    if (phase === 'feedback' && !grades[r.set[r.index].id]) phase = 'reveal'; // nothing graded yet: grade it again
    return {
      id: r.id,
      set: r.set,
      index: r.index,
      phase,
      notes: asRecord<string>(r.notes),
      codes: asRecord<string>(r.codes),
      grades,
      xp: Number(r.xp) || 0,
      combo: Number(r.combo) || 0,
      seconds: Number(r.seconds) || 0,
      completed: r.completed === true,
      finishInfo:
        r.finishInfo && typeof r.finishInfo === 'object'
          ? { streak: Number(r.finishInfo.streak) || 0, grew: r.finishInfo.grew === true }
          : null,
      category: typeof r.category === 'string' ? r.category : 'All',
      difficulty: typeof r.difficulty === 'string' ? r.difficulty : 'All',
      evals: filterRecord<Evaluation>(r.evals, isEvaluation),
      earned: filterRecord<Earned>(
        r.earned,
        (e) => !!e && typeof (e as Earned).base === 'number' && typeof (e as Earned).combo === 'number'
      ),
      changes: filterRecord<ReviewChange>(r.changes, (c) => c === 'added' || c === 'cleared'),
      bestCombo: Number(r.bestCombo) || 0,
      xpAtStart: Number(r.xpAtStart) || 0,
      mission: typeof r.mission === 'string' ? r.mission : null,
    };
  } catch {
    return null;
  }
};

const writeRun = (run: StoredRun | null) => {
  try {
    if (run) localStorage.setItem(RUN_KEY, JSON.stringify(run));
    else localStorage.removeItem(RUN_KEY);
  } catch {
    /* storage unavailable: the run just won't survive a reload */
  }
};

const errorText = (e: unknown, fallback: string) => (e as { message?: string } | null)?.message || fallback;

export default function PracticeMode(_props: PracticeModeProps) {
  const [allQuestions, setAllQuestions] = useState<Question[]>([]);
  const [loading, setLoading] = useState(true);
  const [settings, updateSettings] = useCompanionSettings();
  const { stats, addXp, completeSession } = useCompanionStats();
  const [sheetOpen, setSheetOpen] = useState(false);

  // This user's review list (server side, so it follows them between devices). null: not loaded / unavailable.
  const [reviewIds, setReviewIds] = useState<Set<string> | null>(null);
  const reviewRef = useRef<Set<string> | null>(null);
  reviewRef.current = reviewIds;

  const [goal, setGoal] = useState(DEFAULT_GOAL);
  useEffect(() => setGoal(readGoal()), []);
  const changeGoal = (xp: number) => {
    setGoal(xp);
    writeGoal(xp);
  };

  // Setup
  const [mood, setMood] = useState<MoodId | null>(null);
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [selectedDifficulty, setSelectedDifficulty] = useState('All');
  const [questionCount, setQuestionCount] = useState(10);
  const [answerMode, setAnswerModeState] = useState<'write' | 'chat'>('write');
  useEffect(() => {
    try {
      if (localStorage.getItem('labninja.practice.answerMode') === 'chat') setAnswerModeState('chat');
    } catch {
      /* default to write mode */
    }
  }, []);
  const setAnswerMode = (m: 'write' | 'chat') => {
    setAnswerModeState(m);
    try {
      localStorage.setItem('labninja.practice.answerMode', m);
    } catch {
      /* preference is best-effort */
    }
  };

  const [history, setHistory] = useState<PracticeRun[]>([]);
  useEffect(() => setHistory(readHistory()), []);

  // Run
  const [isPracticing, setIsPracticing] = useState(false);
  const [activeSet, setActiveSet] = useState<Question[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [phase, setPhase] = useState<Phase>('question');
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [codes, setCodes] = useState<Record<string, string>>({});
  const [grades, setGrades] = useState<Record<string, Grade>>({});
  const [evals, setEvals] = useState<Record<string, Evaluation>>({});
  const [earned, setEarned] = useState<Record<string, Earned>>({});
  const [changes, setChanges] = useState<Record<string, ReviewChange>>({});
  const [saveFailed, setSaveFailed] = useState<Record<string, boolean>>({});
  const [sessionXp, setSessionXp] = useState(0);
  const [combo, setCombo] = useState(0);
  const [bestCombo, setBestCombo] = useState(0);
  const [xpAtStart, setXpAtStart] = useState(0);
  const [mission, setMission] = useState<string | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [isCompleted, setIsCompleted] = useState(false);
  const [finishInfo, setFinishInfo] = useState<{ streak: number; grew: boolean } | null>(null);
  const [runId, setRunId] = useState('');
  // The current question's check: its error, and how many messages the learner sent the tutor (chat mode).
  const [checkError, setCheckError] = useState<string | null>(null);
  const [learnerTurns, setLearnerTurns] = useState(0);
  // Questions whose result has the tutor open under it ("Go deeper"). Memory only.
  const [deeper, setDeeper] = useState<Record<string, boolean>>({});
  const checkSeq = useRef(0);

  // The address says which screen: no `run` is setup, `run`+`q` a question, `run`+`done` the summary.
  const { get, update } = useUrlState();
  const goBack = useSmartBack();
  const urlRun = get('run');
  const urlQ = get('q');
  const urlDone = get('done');
  // `practice=<question id>` is an entry link (the question bank's "Practice again"): it opens a one-question run.
  const urlPractice = get('practice');

  // Companion
  const [msg, setMsg] = useState('');
  const [msgMood, setMsgMood] = useState<Mood>('happy');
  const [speaking, setSpeaking] = useState(false);
  const speakTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [hello] = useState(() => greeting(new Date().getHours()));
  const [shloka] = useState(() => randomShloka());

  const say = useCallback(
    (text: string, m: Mood = 'happy', voice = true) => {
      setMsg(text);
      setMsgMood(m);
      if (voice && settings.voiceOn && settings.mascotOn) {
        speak(text, settings.voicePreset, settings.voiceURI);
        setSpeaking(true);
        clearTimeout(speakTimer.current);
        speakTimer.current = setTimeout(() => setSpeaking(false), Math.min(6000, 600 + text.length * 55));
      }
    },
    [settings.voiceOn, settings.mascotOn, settings.voicePreset, settings.voiceURI]
  );

  useEffect(() => {
    async function loadData() {
      const [qs, review] = await Promise.allSettled([questionsService.getAll(), questionReviewService.getReviewList()]);
      const data = qs.status === 'fulfilled' ? qs.value : [];
      if (qs.status === 'rejected') console.error('Failed to load questions for practice mode:', qs.reason);
      setAllQuestions(data && data.length > 0 ? uniqueByText(data) : SAMPLE_FALLBACK_QUESTIONS);
      if (review.status === 'fulfilled') setReviewIds(new Set(review.value.map((r) => String(r.question_id))));
      setLoading(false);
    }
    loadData();
  }, []);

  // Silence everything when leaving the tab
  useEffect(
    () => () => {
      stopSoundscape();
      stopSpeaking();
      clearTimeout(speakTimer.current);
    },
    []
  );

  useEffect(() => {
    if (!isPracticing || isCompleted) return;
    const t = setInterval(() => setElapsedSeconds((p) => p + 1), 1000);
    return () => clearInterval(t);
  }, [isPracticing, isCompleted]);

  // The run in memory is mirrored into localStorage, so its address still works after a reload.
  const abandonedRun = useRef(''); // set by exitPractice: a write already queued for that run must not bring it back
  useEffect(() => {
    if (!isPracticing || !runId || activeSet.length === 0 || abandonedRun.current === runId) return;
    writeRun({
      id: runId,
      set: activeSet,
      index: currentIndex,
      phase,
      notes,
      codes,
      grades,
      xp: sessionXp,
      combo,
      seconds: elapsedSeconds,
      completed: isCompleted,
      finishInfo,
      category: selectedCategory,
      difficulty: selectedDifficulty,
      evals,
      earned,
      changes,
      bestCombo,
      xpAtStart,
      mission,
    });
  }, [isPracticing, runId, activeSet, currentIndex, phase, notes, codes, grades, sessionXp, combo, elapsedSeconds, isCompleted, finishInfo, selectedCategory, selectedDifficulty, evals, earned, changes, bestCombo, xpAtStart, mission]);

  const resetQuestionUi = () => {
    checkSeq.current += 1; // a check still in flight no longer applies
    setCheckError(null);
    setLearnerTurns(0);
  };

  const applyRun = (s: StoredRun) => {
    resetQuestionUi();
    setRunId(s.id);
    setActiveSet(s.set);
    setCurrentIndex(s.index);
    setPhase(s.phase);
    setNotes(s.notes);
    setCodes(s.codes);
    setGrades(s.grades);
    setEvals(s.evals);
    setEarned(s.earned);
    setChanges(s.changes);
    setSaveFailed({});
    setSessionXp(s.xp);
    setCombo(s.combo);
    setBestCombo(s.bestCombo);
    setXpAtStart(s.xpAtStart);
    setMission(s.mission);
    setElapsedSeconds(s.seconds);
    setSelectedCategory(s.category);
    setSelectedDifficulty(s.difficulty);
    setFinishInfo(s.finishInfo);
    setIsCompleted(s.completed);
    setIsPracticing(true);
    setMsg(s.completed ? line('finish') : 'Welcome back! Let us pick up where you left off.');
    setMsgMood(s.completed ? 'cheer' : 'happy');
  };

  // Address -> run. Runs when the address changes: a reload, browser Back/Forward, a link or a hand edit.
  // Our own actions (start, next, finish) set the state first and then write the same address, so they
  // arrive here as a no-op.
  const live = useRef({ on: false, id: '', done: false, index: 0 });
  useLayoutEffect(() => {
    live.current = { on: isPracticing, id: runId, done: isCompleted, index: currentIndex };
  }); // declared before the address effect below, so that one always reads what was just committed
  // (a layout effect, so Back/Forward never paint the previous screen under the new address for a frame)
  useLayoutEffect(() => {
    const run = live.current;
    if (!urlRun) {
      // Setup: drop the copy in memory (browser Back to setup). Storage keeps the run, so Forward restores it.
      if (run.on) {
        stopSoundscape();
        stopSpeaking();
        checkSeq.current += 1;
        setIsPracticing(false);
        setIsCompleted(false);
      }
      if (urlPractice !== null) {
        // An entry link: wait for the questions, then open a one-question run in this address's place.
        // An unknown id is just a refinement that does not apply: drop it and stay on setup.
        if (loading) return;
        const target = allQuestions.find((x) => x.id === urlPractice);
        if (target) beginRun([target], 'replace', false, 'One question');
        else update({ practice: null, run: null, q: null, done: null }, 'replace');
        return;
      }
      if (urlRun !== null || urlQ !== null || urlDone !== null) update({ run: null, q: null, done: null }, 'replace'); // stray run params
      return;
    }
    if (run.on && run.id === urlRun) {
      // The run on screen: the address must say exactly where it is (q out of range, q on a finished run, ...).
      // This is also what catches the address up after a slow start (see syncAddress).
      const want = runParams(run.done, run.index);
      if (urlQ !== want.q || urlDone !== want.done) update({ run: urlRun, ...want }, 'replace');
      return;
    }
    const stored = readRun();
    if (stored && stored.id === urlRun) {
      applyRun(stored);
      const want = runParams(stored.completed, stored.index);
      if (urlQ !== want.q || urlDone !== want.done) update({ run: urlRun, ...want }, 'replace');
    } else {
      update({ run: null, q: null, done: null }, 'replace'); // not restorable: back to setup
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlRun, urlQ, urlDone, urlPractice, loading]);

  const eligibleQuestions = useMemo(
    () => allQuestions.filter((q) => matchesDrill(q, selectedCategory, selectedDifficulty)),
    [allQuestions, selectedCategory, selectedDifficulty]
  );
  const missions = useMemo(() => buildMissions(allQuestions, reviewIds), [allQuestions, reviewIds]);

  const pickMood = (id: MoodId) => {
    const m = MOODS.find((x) => x.id === id)!;
    setMood(id);
    setQuestionCount(m.count);
    if (id === 'anxious' || id === 'tired') setSelectedDifficulty('Easy');
    say(m.tip, id === 'energised' ? 'cheer' : 'comfort');
  };

  // Keep the address in step with the run (replace: a step is not a new screen). Every write carries the run id,
  // because the router can still be busy with the previous one. While the address has not even caught up with the
  // start of the run (urlRun !== runId) a write would replace the start's history entry instead of following it:
  // skip it, the address effect above writes the right place as soon as the start lands.
  const syncAddress = (params: Record<string, string | number | null>) => {
    if (urlRun === runId) update({ run: runId, ...params }, 'replace');
  };

  // `push` from setup (Back returns to setup); `replace` from the finished summary (a new run takes its place).
  const startPractice = (mode: NavMode = 'push') => {
    const pool = eligibleQuestions.length > 0 ? eligibleQuestions : allQuestions;
    const selected = [...pool].sort(() => Math.random() - 0.5).slice(0, Math.min(questionCount, pool.length));
    beginRun(selected, mode, true, null);
  };

  // `byTap` is false when an address starts the run (no tap, so no audio or speech: the browser would refuse it).
  const beginRun = (selected: Question[], mode: NavMode, byTap: boolean, label: string | null) => {
    if (selected.length === 0) return;
    // Runs inside a tap, so the browser lets audio start.
    if (byTap && settings.sound !== 'off' && !settings.soundMuted) {
      playSoundscape(settings.sound);
      setSoundscapeVolume(settings.volume);
    }
    resetQuestionUi();
    const id = newRunId();
    setRunId(id);
    setActiveSet(selected);
    setCurrentIndex(0);
    setNotes({});
    setCodes({});
    setGrades({});
    setEvals({});
    setEarned({});
    setChanges({});
    setSaveFailed({});
    setDeeper({});
    setSessionXp(0);
    setCombo(0);
    setBestCombo(0);
    setXpAtStart(stats.xp);
    setMission(label);
    setPhase('question');
    setElapsedSeconds(0);
    setIsCompleted(false);
    setFinishInfo(null);
    setIsPracticing(true);
    const deity = MANTRAS[blessingFor(selectedDifficulty, mood ?? 'calm')];
    say(settings.spiritual ? `${line('start')} ${deity.mantra}: ${deity.for}.` : line('start'), 'cheer', byTap);
    window.scrollTo({ top: 0 }); // the run opens at its top, where Back is
    update({ run: id, q: 1, done: null, practice: null }, mode);
  };

  const startMission = (m: Mission) => beginRun(m.questions, 'push', true, m.title);

  // Leaving on purpose (X, "Back to Practice"): the run is dropped for good and we go back to setup. Browser Back
  // keeps it in storage instead, so Forward can resume.
  const exitPractice = () => {
    stopSoundscape();
    stopSpeaking();
    checkSeq.current += 1;
    abandonedRun.current = runId;
    writeRun(null);
    setIsPracticing(false);
    setIsCompleted(false);
    goBack(PRACTICE_URL);
  };

  /**
   * The rating goes to the question bank (per user, both backends): it feeds Progress and the AI memory. A miss joins
   * the review list, a nailed answer clears it from there. Best effort: XP never depends on it.
   */
  const saveResult = async (q: Question, g: Grade, score: number | null) => {
    if (!isBankQuestion(q)) return;
    const id = Number(q.id);
    const rating = ratingFor(g, score);
    try {
      await questionReviewService.setPerformance(id, rating);
      const list = reviewRef.current;
      let change: ReviewChange = null;
      if (list && g === 'review' && !list.has(q.id)) {
        await questionReviewService.setInReview(id, true);
        change = 'added';
      } else if (list && g === 'nailed' && list.has(q.id)) {
        await questionReviewService.setInReview(id, false);
        change = 'cleared';
      }
      if (change) {
        setReviewIds((prev) => {
          const next = new Set(prev ?? []);
          if (change === 'added') next.add(q.id);
          else next.delete(q.id);
          return next;
        });
        setChanges((p) => ({ ...p, [q.id]: change }));
      }
      const today = new Date().toISOString().split('T')[0];
      setAllQuestions((prev) => prev.map((x) => (x.id === q.id ? { ...x, userPerformance: rating, lastReviewed: today } : x)));
    } catch (e) {
      console.error('Could not save the practice result:', e);
      setSaveFailed((p) => ({ ...p, [q.id]: true }));
    }
  };

  const applyGrade = (q: Question, g: Grade, ev: Evaluation | null) => {
    const score = ev ? ev.overall : null;
    const nextCombo = g === 'nailed' ? combo + 1 : 0;
    const base = answerXp(g, score);
    const bonus = g === 'nailed' && nextCombo >= COMBO_FROM ? COMBO_BONUS : 0;
    setGrades((p) => ({ ...p, [q.id]: g }));
    if (ev) setEvals((p) => ({ ...p, [q.id]: ev }));
    setEarned((p) => ({ ...p, [q.id]: { base, combo: bonus } }));
    setSessionXp((x) => x + base + bonus);
    addXp(base + bonus);
    setCombo(nextCombo);
    setBestCombo((b) => Math.max(b, nextCombo));
    if (settings.chimes && !settings.soundMuted) playChime(g === 'nailed' ? 'good' : 'soft', settings.volume);
    say(line(g === 'nailed' ? 'nailed' : g), g === 'nailed' ? 'cheer' : g === 'almost' ? 'happy' : 'comfort');
    setCheckError(null);
    setPhase('feedback');
    void saveResult(q, g, score);
  };

  const current = activeSet[currentIndex];
  const chatKey = (q: Question) => `practice:${runId}:${q.id}`;
  const draft = current ? notes[current.id] || '' : '';
  const code = current ? codes[current.id] || '' : '';
  const canCheck = answerMode === 'chat' ? learnerTurns > 0 : !!(draft.trim() || code.trim());

  /** Score the answer (or the tutor chat) with the AI coach; the score sets the grade. */
  const checkAnswer = async () => {
    const q = current;
    if (!q || !canCheck || phase === 'checking') return;
    if (!isLoggedIn()) {
      openLoginModal({ feature: 'the AI answer coach', redirectTo: `${window.location.pathname}${window.location.search}` });
      return;
    }
    const chat = answerMode === 'chat';
    const kind = detectKind(q.subType, q.category, q.questionText);
    const seq = ++checkSeq.current;
    setCheckError(null);
    setPhase('checking');
    say(chat ? 'Reading back through our chat…' : 'Reading your answer carefully…', 'think', false);
    try {
      const ev = await answerCoachService.evaluate({
        questionText: q.questionText,
        answerText: chat ? chatTranscript(chatKey(q)) : draft,
        codeText: chat ? undefined : code,
        language: !chat && code.trim() && wantsCode(kind) ? (kind === 'system_design' ? 'Pseudo-code' : 'Python') : undefined,
        category: q.category === 'Interview' ? 'interview' : 'cv_skill',
        subType: q.subType,
        difficulty: q.difficulty,
        isTranscript: chat || undefined,
      });
      if (seq !== checkSeq.current) return; // graded by hand meanwhile, or left the question
      if (!isEvaluation(ev)) throw new Error('The AI sent back a result in an unexpected shape.');
      applyGrade(q, gradeFromScore(ev.overall), ev);
    } catch (e) {
      if (seq !== checkSeq.current) return;
      setCheckError(errorText(e, 'Check your AI key in Config and try again.'));
      setPhase('question');
      say("I couldn't read that one. Try again, or grade it yourself.", 'comfort', false);
    }
  };

  /** Grade it yourself instead (also cancels a check in flight). */
  const gradeMyself = () => {
    checkSeq.current += 1;
    setCheckError(null);
    setPhase('reveal');
  };

  const next = () => {
    resetQuestionUi();
    if (currentIndex < activeSet.length - 1) {
      setCurrentIndex((i) => i + 1);
      setPhase('question');
      say('Next one! You are warmed up now.', 'happy', false);
      window.scrollTo({ top: 0, behavior: 'smooth' });
      syncAddress({ q: currentIndex + 2, done: null }); // the next question, not a new history entry
      return;
    }
    addXp(FINISH_XP);
    const total = sessionXp + FINISH_XP;
    setSessionXp(total);
    const gradeVals = activeSet.map((q) => grades[q.id]).filter(Boolean);
    const nailedN = gradeVals.filter((g) => g === 'nailed').length;
    const almostN = gradeVals.filter((g) => g === 'almost').length;
    const scores = activeSet.map((q) => evals[q.id]?.overall).filter((n): n is number => typeof n === 'number');
    const run: PracticeRun = {
      at: new Date().toISOString(),
      category: selectedCategory,
      difficulty: selectedDifficulty,
      total: activeSet.length,
      nailed: nailedN,
      almost: almostN,
      accuracy: gradeVals.length ? Math.round(((nailedN + almostN * 0.5) / gradeVals.length) * 100) : 0,
      xp: total,
      seconds: elapsedSeconds,
      ...(mission ? { mission } : {}),
      ...(scores.length ? { avgScore: Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) } : {}),
    };
    const nextHistory = [run, ...readHistory()].slice(0, 10);
    try {
      localStorage.setItem(HISTORY_KEY, JSON.stringify(nextHistory));
    } catch {
      /* storage unavailable: history is best-effort */
    }
    setHistory(nextHistory);
    const info = completeSession();
    setFinishInfo(info);
    setIsCompleted(true);
    syncAddress({ q: null, done: 1 }); // the summary takes the last question's place
    window.scrollTo({ top: 0 });
    if (settings.chimes && !settings.soundMuted) playChime('finish', settings.volume);
    say(info.grew ? `${line('finish')} ${line('streakUp')}` : line('finish'), 'cheer');
    notify({
      source: 'daily-session',
      tone: 'success',
      title: 'Practice drill finished',
      body: `${activeSet.length} question${activeSet.length === 1 ? '' : 's'}, +${total} XP.`,
    });
  };

  const SoundButton = <CompanionControls settings={settings} update={updateSettings} onOpenSettings={() => setSheetOpen(true)} />;
  const Sheet = <CompanionSettings open={sheetOpen} onClose={() => setSheetOpen(false)} settings={settings} update={updateSettings} />;

  // A drill left mid-way (browser Back, a closed tab) can be picked up again from the setup.
  const [pendingRun, setPendingRun] = useState<StoredRun | null>(null);
  useEffect(() => {
    if (isPracticing) return;
    const r = readRun();
    setPendingRun(r && !r.completed ? r : null);
  }, [isPracticing]);

  const matchCount = useCallback(
    (cat: string) => allQuestions.filter((q) => matchesDrill(q, cat, selectedDifficulty)).length,
    [allQuestions, selectedDifficulty]
  );

  // Keyboard: Enter (Ctrl/Cmd+Enter while typing) is the main action: check, then continue. While grading yourself,
  // 1 / 2 / 3 pick the grade and Escape goes back to the answer.
  const keyHandler = useRef<(e: KeyboardEvent) => void>(() => {});
  keyHandler.current = (e: KeyboardEvent) => {
    if (!isPracticing || isCompleted || !current) return;
    const typing = isTypingTarget(e.target);
    const onControl = !!(e.target as HTMLElement | null)?.closest?.('button, a, summary, [role="button"]');
    const enter = e.key === 'Enter' && !e.shiftKey && (e.metaKey || e.ctrlKey || (!typing && !onControl));
    if (phase === 'question' && enter && canCheck) {
      e.preventDefault();
      void checkAnswer();
    } else if (phase === 'reveal' && !typing && ['1', '2', '3'].includes(e.key)) {
      applyGrade(current, ({ '1': 'review', '2': 'almost', '3': 'nailed' } as const)[e.key as '1' | '2' | '3'], null);
    } else if (phase === 'reveal' && e.key === 'Escape') {
      setPhase('question');
    } else if (phase === 'feedback' && enter) {
      e.preventDefault();
      next();
    }
  };
  useEffect(() => {
    const h = (e: KeyboardEvent) => keyHandler.current(e);
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, []);

  if (loading) {
    return (
      <div className="flex h-[22rem] flex-col items-center justify-center gap-3">
        <Mascot mood="think" size={80} />
        <p className="text-sm font-medium ds-muted">Deepu is lighting the lamp…</p>
      </div>
    );
  }

  // ---------- Finished ----------
  if (isCompleted) {
    return (
      <>
        <RunSummary
          set={activeSet}
          grades={grades}
          evals={evals}
          earned={earned}
          sessionXp={sessionXp}
          xpAtStart={xpAtStart}
          seconds={elapsedSeconds}
          bestCombo={bestCombo}
          changes={changes}
          streak={finishInfo?.streak ?? stats.streak}
          streakGrew={!!finishInfo?.grew}
          todayXp={xpToday(stats)}
          goal={goal}
          message={msg}
          speaking={speaking}
          mascotOn={settings.mascotOn}
          spiritual={settings.spiritual}
          shloka={shloka}
          backHref={PRACTICE_URL}
          onRetryMisses={(qs) => beginRun(qs, 'replace', true, 'Retry the misses')}
          onNewDrill={() => startPractice('replace')}
          onExit={exitPractice}
        />
        {Sheet}
      </>
    );
  }

  // ---------- A question ----------
  if (isPracticing && current) {
    const q = current;
    const g = grades[q.id];
    const gm = g ? GRADE_META[g] : null;
    const ev = evals[q.id];
    const got = earned[q.id];
    const last = currentIndex === activeSet.length - 1;
    const onList = reviewIds?.has(q.id);
    const runName = mission ?? (selectedCategory === 'All' ? 'Mixed drill' : `${topicLabel(selectedCategory)} drill`);
    const wsQuestion = {
      questionText: q.questionText,
      category: q.category === 'Interview' ? 'interview' : 'cv_skill',
      subType: q.subType,
      difficulty: q.difficulty,
    };
    const answering = phase === 'question' || phase === 'checking';
    const openTutor = () => setDeeper((p) => ({ ...p, [q.id]: true }));

    return (
      <div className="pm-run mx-auto max-w-3xl pb-[10rem] pt-3 sm:pt-4">
        {/* Run bar: way out, where you are, XP; the pips are the run so far, coloured by result */}
        <div className="ds-topbar ds-runbar">
          <div className="ds-runbar-row">
            <button type="button" onClick={exitPractice} className="ds-btn ds-btn-ghost ds-btn-icon" aria-label="End this drill" title="End this drill">
              <Icon name="XMarkIcon" size={20} />
            </button>
            <div className="ds-runbar-title">
              <p className="ds-runbar-name">
                Question {currentIndex + 1} <span>of {activeSet.length}</span>
              </p>
              <p className="ds-runbar-sub truncate">{runName}</p>
            </div>
            <span className="ds-runbar-time ds-num" aria-label={`Time ${clock(elapsedSeconds)}`}>
              <Icon name="ClockIcon" size={14} />
              {clock(elapsedSeconds)}
            </span>
            {combo >= 2 && (
              <span key={combo} className="pm-stat pm-combo ds-num" title={`${combo} nailed in a row`} aria-label={`${combo} nailed in a row`}>
                <Icon name="FireIcon" size={14} variant="solid" />
                {combo}
              </span>
            )}
            <span key={`xp-${sessionXp}`} className="pm-stat pm-xp ds-num" title="XP this drill" aria-label={`${sessionXp} XP this drill`}>
              <Icon name="SparklesIcon" size={14} variant="solid" />
              {sessionXp}
            </span>
          </div>
          <PipStrip
            count={activeSet.length}
            current={currentIndex}
            isDone={(i) => !!grades[activeSet[i].id]}
            gradeOf={(i) => grades[activeSet[i].id]}
            label="Drill progress"
          />
        </div>

        <div className={`pm-companion mt-3 flex items-center gap-2 ${settings.mascotOn ? '' : 'justify-end'}`}>
          <CompanionBubble text={msg} mood={msgMood} speaking={speaking} onSpeak={() => say(msg, msgMood)} className="min-w-0 flex-1" />
          {SoundButton}
        </div>

        <section key={q.id} className="ds-card-raised ds-qmain mt-3 ds-enter" aria-labelledby="pm-q-text">
          <div className="flex flex-wrap items-center gap-2">
            {q.subType && <span className="ds-chip ds-tone-neutral">{q.subType}</span>}
            <DifficultyChip difficulty={q.difficulty} />
            {onList && (
              <span className="ds-chip ds-tone-rose">
                <Icon name="ArrowPathIcon" size={12} />
                On your review list
              </span>
            )}
          </div>
          <h2 id="pm-q-text" className="ds-question mt-3">
            {q.questionText}
          </h2>

          {answering && (
            <div inert={phase === 'checking'} className={phase === 'checking' ? 'pm-locked' : undefined}>
              <div role="tablist" aria-label="How to answer" className="ds-seg mt-[1.25rem]">
                {(
                  [
                    ['write', 'PencilSquareIcon', 'Write it out', 'Write'],
                    ['chat', 'ChatBubbleLeftRightIcon', 'Talk it through with the tutor', 'AI tutor'],
                  ] as const
                ).map(([m, icon, label, short]) => (
                  <button key={m} type="button" role="tab" aria-selected={answerMode === m} onClick={() => setAnswerMode(m)}>
                    <Icon name={icon} size={16} />
                    {/* Phones: the short label, so the two tabs never wrap */}
                    <span className="sm:hidden">{short}</span>
                    <span className="hidden sm:inline">{label}</span>
                  </button>
                ))}
              </div>
              {answerMode === 'write' ? (
                <div className="ds-answer mt-4">
                  <AnswerWorkspace
                    question={wsQuestion}
                    answer={draft}
                    onAnswerChange={(v) => setNotes((p) => ({ ...p, [q.id]: v }))}
                    code={code}
                    onCodeChange={(v) => setCodes((p) => ({ ...p, [q.id]: v }))}
                    rows={5}
                    coach={false}
                  />
                  {phase === 'question' && (
                    <div className="pm-stuck mt-4">
                      <span className="text-[13px] ds-faint">Stuck?</span>
                      <button type="button" onClick={() => setAnswerMode('chat')} className="ds-btn ds-btn-soft ds-btn-sm ds-tone-indigo">
                        <Icon name="ChatBubbleLeftRightIcon" size={15} />
                        Ask the tutor
                      </button>
                      <button type="button" onClick={() => say(line('stuck'), 'comfort')} className="ds-btn ds-btn-ghost ds-btn-sm">
                        <Icon name="LightBulbIcon" size={15} />
                        Give me a tip
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <div className="mt-4">
                  <AILearnChat
                    key={q.id}
                    question={wsQuestion}
                    persistKey={chatKey(q)}
                    autoStart
                    embedded
                    onLearnerTurns={setLearnerTurns}
                  />
                </div>
              )}
            </div>
          )}

          {phase === 'question' && checkError && (
            <div className="mt-4">
              <CheckError message={checkError} onRetry={() => void checkAnswer()} onSelf={gradeMyself} />
            </div>
          )}
          {phase === 'checking' && (
            <div className="mt-4">
              <CheckingPanel chat={answerMode === 'chat'} />
            </div>
          )}
          {phase === 'reveal' && (
            <div className="mt-[1.25rem]">
              <SelfCheck question={wsQuestion} draft={draft} />
            </div>
          )}
          {phase === 'feedback' && g && got && (
            <div className="mt-[1.25rem]">
              {ev ? (
                <ScoredPanel
                  ev={ev}
                  grade={g}
                  xp={got.base}
                  combo={got.combo}
                  change={changes[q.id] ?? null}
                  saveFailed={saveFailed[q.id]}
                  onDeeper={deeper[q.id] ? undefined : openTutor}
                />
              ) : (
                <SelfPanel
                  grade={g}
                  xp={got.base}
                  combo={got.combo}
                  change={changes[q.id] ?? null}
                  saveFailed={saveFailed[q.id]}
                  onDeeper={deeper[q.id] ? undefined : openTutor}
                />
              )}
              {deeper[q.id] && (
                <div className="mt-4">
                  <AILearnChat key={`deeper-${q.id}`} question={wsQuestion} persistKey={chatKey(q)} autoStart embedded />
                </div>
              )}
            </div>
          )}
        </section>

        {/* Dock: the one next step, thumb-reachable; tinted by the result once there is one */}
        <div className="ds-dock pm-dock" data-grade={phase === 'feedback' ? g : undefined}>
          <div className="ds-dock-inner">
            <div className={`ds-dock-bar ${gm && phase === 'feedback' ? toneClass(gm.tone) : ''}`} role="toolbar" aria-label="Answer">
              {answering && (
                <>
                  <button type="button" onClick={gradeMyself} className="ds-btn ds-btn-ghost pm-dock-side">
                    Grade myself
                  </button>
                  <button
                    type="button"
                    onClick={() => void checkAnswer()}
                    disabled={!canCheck || phase === 'checking'}
                    aria-keyshortcuts="Control+Enter Meta+Enter"
                    title={canCheck ? 'Score it with AI (Ctrl+Enter)' : answerMode === 'chat' ? 'Reply to the tutor first' : 'Write or dictate an answer first'}
                    className="ds-btn ds-btn-primary pm-dock-main"
                  >
                    {phase === 'checking' ? (
                      <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden="true" />
                    ) : (
                      <Icon name="SparklesIcon" size={17} variant="solid" />
                    )}
                    {phase === 'checking' ? 'Checking' : answerMode === 'chat' ? 'Score my chat' : 'Check with AI'}
                  </button>
                </>
              )}
              {phase === 'reveal' && (
                <>
                  <button type="button" onClick={() => setPhase('question')} className="ds-btn ds-btn-ghost ds-dock-prev" aria-label="Back to my answer" title="Back to my answer (Esc)">
                    <Icon name="ChevronLeftIcon" size={20} />
                  </button>
                  {(['review', 'almost', 'nailed'] as const).map((k, i) => {
                    const m = GRADE_META[k];
                    return (
                      <button
                        key={k}
                        type="button"
                        onClick={() => applyGrade(q, k, null)}
                        aria-keyshortcuts={String(i + 1)}
                        title={`${m.label} (${i + 1})`}
                        className={`ds-btn ds-btn-soft pm-grade ${toneClass(m.tone)}`}
                      >
                        <Icon name={m.icon} size={17} />
                        {k === 'review' ? 'Review' : m.label}
                      </button>
                    );
                  })}
                </>
              )}
              {phase === 'feedback' && gm && got && (
                <>
                  <span className="pm-dock-result">
                    <Icon name={gm.icon} size={18} variant="solid" />
                    <span>{gm.label}</span>
                  </span>
                  <button type="button" onClick={next} className="ds-btn ds-btn-solid pm-dock-main" aria-keyshortcuts="Enter">
                    {last ? 'Finish drill' : 'Continue'}
                    <Icon name="ArrowRightIcon" size={17} />
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
        {Sheet}
      </div>
    );
  }

  // ---------- Setup ----------
  return (
    <>
      <PracticeSetup
        xp={stats.xp}
        todayXp={xpToday(stats)}
        goal={goal}
        onGoalChange={changeGoal}
        missions={missions}
        onMission={startMission}
        pending={
          pendingRun
            ? {
                category: pendingRun.category,
                difficulty: pendingRun.difficulty,
                mission: pendingRun.mission,
                index: pendingRun.index,
                total: pendingRun.set.length,
              }
            : null
        }
        onResume={() => pendingRun && update({ run: pendingRun.id, q: pendingRun.index + 1, done: null, practice: null }, 'push')}
        onDiscard={() => {
          writeRun(null);
          setPendingRun(null);
        }}
        category={selectedCategory}
        onCategory={setSelectedCategory}
        difficulty={selectedDifficulty}
        onDifficulty={setSelectedDifficulty}
        count={questionCount}
        onCount={setQuestionCount}
        answerMode={answerMode}
        onAnswerMode={setAnswerMode}
        matchCount={matchCount}
        eligible={eligibleQuestions.length}
        total={allQuestions.length}
        onStart={() => startPractice()}
        mood={mood}
        onMood={pickMood}
        companion={{
          text: msg || hello,
          mood: msgMood,
          speaking,
          onSpeak: () => say(msg || hello, msgMood),
          controls: SoundButton,
          on: settings.mascotOn,
        }}
        spiritual={settings.spiritual}
        shloka={shloka}
        history={history}
      />
      {Sheet}
    </>
  );
}

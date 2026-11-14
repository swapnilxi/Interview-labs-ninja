'use client';

import React, { useState, useEffect, useLayoutEffect, useMemo, useRef, useCallback } from 'react';
import AnswerWorkspace from '../coach/AnswerWorkspace';
import AILearnChat from '../coach/AILearnChat';
import Icon from '@/components/ui/AppIcon';
import BackButton from '@/components/ui/BackButton';
import Link from 'next/link';
import { questionsService, Question } from '@/lib/services/questionsService';
import { notify } from '@/lib/ui/notifications';
import { useUrlState, type NavMode } from '@/lib/navigation/urlState';
import { useSmartBack } from '@/lib/navigation/smartBack';
import Mascot from '../companion/Mascot';
import CompanionBubble from '../companion/CompanionBubble';
import CompanionSettings from '../companion/CompanionSettings';
import CompanionControls from '../companion/CompanionControls';
import { useCompanionSettings, useCompanionStats } from '../companion/useCompanion';
import { playSoundscape, stopSoundscape, setSoundscapeVolume, playChime } from '../companion/soundscape';
import { speak, stopSpeaking } from '../companion/voice';
import { Bar, DifficultyChip, Ring, StepLabel, clock, dayKey, difficultyTone, isTypingTarget, relativeDay, toneClass, uniqueByText, type Tone } from './ds';
import {
  MANTRAS,
  MOODS,
  MoodId,
  Mood,
  SARASWATI_VANDANA,
  blessingFor,
  greeting,
  line,
  randomShloka,
} from '../companion/content';

interface PracticeModeProps {
  onSwitchTab?: (tab: 'session' | 'quick-practice' | 'progress' | 'question-bank') => void;
}

const CATEGORY_CHIPS: { label: string; value: string; icon: string; tone: Tone }[] = [
  { label: 'Everything', value: 'All', icon: 'Squares2X2Icon', tone: 'indigo' },
  { label: 'Interview', value: 'Interview', icon: 'MicrophoneIcon', tone: 'indigo' },
  { label: 'CV skill', value: 'CV Skill', icon: 'EyeIcon', tone: 'jade' },
  { label: 'DSA', value: 'DSA', icon: 'PuzzlePieceIcon', tone: 'gold' },
  { label: 'System design', value: 'System Design', icon: 'ServerStackIcon', tone: 'indigo' },
  { label: 'Deep learning', value: 'Deep Learning Vision', icon: 'CpuChipIcon', tone: 'jade' },
  { label: 'Classical CV', value: 'Classical CV', icon: 'ViewfinderCircleIcon', tone: 'gold' },
  { label: 'Behavioral', value: 'Behavioral', icon: 'UserGroupIcon', tone: 'indigo' },
];

const DIFFICULTY_OPTIONS = [
  { value: 'All', label: 'Mixed' },
  { value: 'Easy', label: 'Easy' },
  { value: 'Medium', label: 'Medium' },
  { value: 'Hard', label: 'Hard' },
];
const QUESTION_COUNT_OPTIONS = [5, 10, 15, 20];

const MOOD_LOOK: Record<string, { icon: string; tone: Tone }> = {
  energised: { icon: 'FireIcon', tone: 'gold' },
  calm: { icon: 'SunIcon', tone: 'jade' },
  tired: { icon: 'MoonIcon', tone: 'indigo' },
  anxious: { icon: 'HeartIcon', tone: 'indigo' },
};

type Grade = 'nailed' | 'almost' | 'review';
type Phase = 'question' | 'reveal' | 'feedback';
const XP: Record<Grade, number> = { nailed: 10, almost: 6, review: 3 };

const GRADE_META: Record<Grade, { label: string; title: string; icon: string; tone: Tone }> = {
  review: { label: 'Needs review', title: 'Marked for review', icon: 'ArrowPathIcon', tone: 'rose' },
  almost: { label: 'Almost', title: 'Nearly there', icon: 'HandThumbUpIcon', tone: 'gold' },
  nailed: { label: 'Nailed it', title: 'Excellent!', icon: 'CheckBadgeIcon', tone: 'jade' },
};

/** Does a question belong in a drill of this topic and level? ('All' matches anything.) */
function matchesDrill(q: Question, category: string, difficulty: string): boolean {
  if (category !== 'All') {
    const c = category.toLowerCase();
    const ok = q.category === category || q.subType?.toLowerCase().includes(c) || q.questionType?.toLowerCase().includes(c);
    if (!ok) return false;
  }
  return difficulty === 'All' || q.difficulty.toLowerCase() === difficulty.toLowerCase();
}

const SAMPLE_FALLBACK_QUESTIONS: Question[] = [
  {
    id: 'p1',
    questionText: 'Implement a LRU Cache with O(1) time complexity for both get and put operations.',
    category: 'Interview',
    subType: 'Data Structures',
    difficulty: 'Hard',
    questionType: 'DSA',
    dateEncountered: new Date().toISOString().split('T')[0],
    lastReviewed: null,
  },
  {
    id: 'p2',
    questionText: 'Design a distributed rate limiter service that limits client requests to 1,000 requests per minute with low latency.',
    category: 'Interview',
    subType: 'System Design',
    difficulty: 'Medium',
    questionType: 'System Design',
    dateEncountered: new Date().toISOString().split('T')[0],
    lastReviewed: null,
  },
  {
    id: 'p3',
    questionText: 'Explain the mathematical difference between intrinsic and extrinsic camera matrices and how Zhang\'s calibration estimates them.',
    category: 'CV Skill',
    subType: 'Classical CV',
    difficulty: 'Hard',
    questionType: 'Camera Geometry',
    dateEncountered: new Date().toISOString().split('T')[0],
    lastReviewed: null,
  },
  {
    id: 'p4',
    questionText: 'How do Anchor Boxes function in Faster R-CNN detectors, and how do you optimize anchor scales with K-means clustering?',
    category: 'CV Skill',
    subType: 'Deep Learning Vision',
    difficulty: 'Medium',
    questionType: 'Object Detection',
    dateEncountered: new Date().toISOString().split('T')[0],
    lastReviewed: null,
  },
  {
    id: 'p5',
    questionText: 'Describe how you resolved a high-stakes disagreement with product management regarding engineering technical debt.',
    category: 'Interview',
    subType: 'Behavioral',
    difficulty: 'Easy',
    questionType: 'Behavioral',
    dateEncountered: new Date().toISOString().split('T')[0],
    lastReviewed: null,
  },
  {
    id: 'p6',
    questionText: 'Describe quantization-aware training (QAT) vs post-training quantization (PTQ) for deploying deep vision models to mobile edge GPUs.',
    category: 'CV Skill',
    subType: 'Deep Learning Vision',
    difficulty: 'Medium',
    questionType: 'Quantization',
    dateEncountered: new Date().toISOString().split('T')[0],
    lastReviewed: null,
  },
  {
    id: 'p7',
    questionText: 'Design a scalable real-time video streaming architecture that supports 50,000 concurrent viewers with low jitter.',
    category: 'Interview',
    subType: 'System Design',
    difficulty: 'Hard',
    questionType: 'System Design',
    dateEncountered: new Date().toISOString().split('T')[0],
    lastReviewed: null,
  },
];


const HISTORY_KEY = 'labninja.practice.history.v1';

interface PracticeRun {
  at: string;
  category: string;
  difficulty: string;
  total: number;
  nailed: number;
  almost: number;
  accuracy: number;
  xp: number;
  seconds: number;
}

const readHistory = (): PracticeRun[] => {
  try {
    const raw = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
};

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
}

const newRunId = () => Date.now().toString(36);

/** The address params that say where a run is: question n, or the finished summary. */
const runParams = (completed: boolean, index: number) =>
  completed ? { q: null, done: '1' } : { q: String(index + 1), done: null };

const asRecord = <T,>(v: unknown): Record<string, T> =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, T>) : {};

const readRun = (): StoredRun | null => {
  try {
    const r = JSON.parse(localStorage.getItem(RUN_KEY) || 'null');
    if (!r || typeof r.id !== 'string' || !r.id || !Array.isArray(r.set) || r.set.length === 0) return null;
    if (!r.set.every((q: Question) => q && typeof q.id === 'string' && typeof q.questionText === 'string')) return null;
    if (!Number.isInteger(r.index) || r.index < 0 || r.index >= r.set.length) return null;
    const grades = asRecord<Grade>(r.grades);
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

export default function PracticeMode({ onSwitchTab }: PracticeModeProps) {
  const [allQuestions, setAllQuestions] = useState<Question[]>([]);
  const [loading, setLoading] = useState(true);
  const [settings, updateSettings] = useCompanionSettings();
  const { stats, addXp, completeSession } = useCompanionStats();
  const [sheetOpen, setSheetOpen] = useState(false);

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

  // Session
  const [isPracticing, setIsPracticing] = useState(false);
  const [activeSet, setActiveSet] = useState<Question[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [phase, setPhase] = useState<Phase>('question');
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [codes, setCodes] = useState<Record<string, string>>({});
  const [showHint, setShowHint] = useState(false);
  const [grades, setGrades] = useState<Record<string, Grade>>({});
  const [sessionXp, setSessionXp] = useState(0);
  const [combo, setCombo] = useState(0);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [isCompleted, setIsCompleted] = useState(false);
  const [finishInfo, setFinishInfo] = useState<{ streak: number; grew: boolean } | null>(null);
  const [runId, setRunId] = useState('');

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
    [settings.voiceOn, settings.mascotOn, settings.voicePreset, settings.voiceURI],
  );

  useEffect(() => {
    async function loadData() {
      try {
        const data = await questionsService.getAll();
        setAllQuestions(data && data.length > 0 ? uniqueByText(data) : SAMPLE_FALLBACK_QUESTIONS);
      } catch (err) {
        console.error('Failed to load questions for practice mode:', err);
        setAllQuestions(SAMPLE_FALLBACK_QUESTIONS);
      } finally {
        setLoading(false);
      }
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
    [],
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
    });
  }, [isPracticing, runId, activeSet, currentIndex, phase, notes, codes, grades, sessionXp, combo, elapsedSeconds, isCompleted, finishInfo, selectedCategory, selectedDifficulty]);

  const applyRun = (s: StoredRun) => {
    setRunId(s.id);
    setActiveSet(s.set);
    setCurrentIndex(s.index);
    setPhase(s.phase);
    setNotes(s.notes);
    setCodes(s.codes);
    setGrades(s.grades);
    setSessionXp(s.xp);
    setCombo(s.combo);
    setElapsedSeconds(s.seconds);
    setSelectedCategory(s.category);
    setSelectedDifficulty(s.difficulty);
    setShowHint(false);
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
        setIsPracticing(false);
        setIsCompleted(false);
      }
      if (urlPractice !== null) {
        // An entry link: wait for the questions, then open a one-question run in this address's place.
        // An unknown id is just a refinement that does not apply: drop it and stay on setup.
        if (loading) return;
        const target = allQuestions.find((x) => x.id === urlPractice);
        if (target) beginRun([target], 'replace', false);
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
    [allQuestions, selectedCategory, selectedDifficulty],
  );

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
    beginRun(selected, mode, true);
  };

  // `byTap` is false when an address starts the run (no tap, so no audio or speech: the browser would refuse it).
  const beginRun = (selected: Question[], mode: NavMode, byTap: boolean) => {
    if (selected.length === 0) return;
    // Runs inside a tap, so the browser lets audio start.
    if (byTap && settings.sound !== 'off' && !settings.soundMuted) {
      playSoundscape(settings.sound);
      setSoundscapeVolume(settings.volume);
    }
    const id = newRunId();
    setRunId(id);
    setActiveSet(selected);
    setCurrentIndex(0);
    setNotes({});
    setCodes({});
    setGrades({});
    setSessionXp(0);
    setCombo(0);
    setPhase('question');
    setShowHint(false);
    setElapsedSeconds(0);
    setIsCompleted(false);
    setFinishInfo(null);
    setIsPracticing(true);
    const deity = MANTRAS[blessingFor(selectedDifficulty, mood ?? 'calm')];
    say(
      settings.spiritual
        ? `${line('start')} ${deity.mantra}: ${deity.for}.`
        : line('start'),
      'cheer',
      byTap,
    );
    window.scrollTo({ top: 0 }); // the run opens at its top, where Back is
    update({ run: id, q: 1, done: null, practice: null }, mode);
  };

  // Leaving on purpose (X, "Change topics"): the run is dropped for good and we go back to setup. Browser Back
  // keeps it in storage instead, so Forward can resume.
  const exitPractice = () => {
    stopSoundscape();
    stopSpeaking();
    abandonedRun.current = runId;
    writeRun(null);
    setIsPracticing(false);
    setIsCompleted(false);
    goBack(PRACTICE_URL);
  };

  const grade = (g: Grade) => {
    const q = activeSet[currentIndex];
    if (!q) return;
    setGrades((p) => ({ ...p, [q.id]: g }));
    const earned = XP[g] + (g === 'nailed' && combo >= 2 ? 5 : 0);
    setSessionXp((x) => x + earned);
    addXp(earned);
    setCombo((c) => (g === 'nailed' ? c + 1 : 0));
    if (settings.chimes && !settings.soundMuted) playChime(g === 'nailed' ? 'good' : 'soft', settings.volume);
    say(line(g === 'nailed' ? 'nailed' : g), g === 'nailed' ? 'cheer' : g === 'almost' ? 'happy' : 'comfort');
    setPhase('feedback');
  };

  const next = () => {
    setShowHint(false);
    if (currentIndex < activeSet.length - 1) {
      setCurrentIndex((i) => i + 1);
      setPhase('question');
      say('Next one! You are warmed up now.', 'happy', false);
      window.scrollTo({ top: 0, behavior: 'smooth' });
      syncAddress({ q: currentIndex + 2, done: null }); // the next question, not a new history entry
      return;
    }
    addXp(20);
    setSessionXp((x) => x + 20);
    const gradeVals = Object.values(grades);
    const nailedN = gradeVals.filter((g) => g === 'nailed').length;
    const almostN = gradeVals.filter((g) => g === 'almost').length;
    const run: PracticeRun = {
      at: new Date().toISOString(),
      category: selectedCategory,
      difficulty: selectedDifficulty,
      total: activeSet.length,
      nailed: nailedN,
      almost: almostN,
      accuracy: gradeVals.length ? Math.round(((nailedN + almostN * 0.5) / gradeVals.length) * 100) : 0,
      xp: sessionXp + 20,
      seconds: elapsedSeconds,
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
    if (settings.chimes && !settings.soundMuted) playChime('finish', settings.volume);
    say(info.grew ? `${line('finish')} ${line('streakUp')}` : line('finish'), 'cheer');
    notify({
      source: 'daily-session',
      tone: 'success',
      title: 'Practice Drill Completed!',
      body: `You completed ${activeSet.length} questions in practice mode.`,
    });
  };

  const fmt = clock;

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
    [allQuestions, selectedDifficulty],
  );

  // Keyboard: Enter (or Ctrl/Cmd+Enter while typing) is the main button; 1 / 2 / 3 grade the answer.
  const keyHandler = useRef<(e: KeyboardEvent) => void>(() => {});
  keyHandler.current = (e: KeyboardEvent) => {
    if (!isPracticing || isCompleted || activeSet.length === 0) return;
    const typing = isTypingTarget(e.target);
    const enter = e.key === 'Enter' && (!typing || e.metaKey || e.ctrlKey);
    if (phase === 'question' && enter) {
      e.preventDefault();
      setPhase('reveal');
    } else if (phase === 'reveal' && !typing && ['1', '2', '3'].includes(e.key)) {
      grade(({ '1': 'review', '2': 'almost', '3': 'nailed' } as const)[e.key as '1' | '2' | '3']);
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
        <p className="text-sm font-semibold ds-muted">Deepu is lighting the lamp…</p>
      </div>
    );
  }

  // ---------- Completion ----------
  if (isCompleted) {
    const vals = Object.values(grades);
    const nailed = vals.filter((g) => g === 'nailed').length;
    const accuracy = vals.length ? Math.round(((nailed + vals.filter((g) => g === 'almost').length * 0.5) / vals.length) * 100) : 0;
    const lakshmi = MANTRAS.Lakshmi;
    const streak = finishInfo?.streak ?? stats.streak;
    return (
      <div className="mx-auto max-w-2xl space-y-4 pb-8 pt-3 sm:pt-4">
        <BackButton href={PRACTICE_URL} label="Back" preferHistory />
        <section className="ds-hero ds-pop">
          <div className="relative px-5 py-[2rem] text-center sm:px-[2.5rem]">
            {settings.mascotOn && (
              <div className="flex justify-center">
                <Mascot mood="cheer" size={96} speaking={speaking} />
              </div>
            )}
            <p className="ds-eyebrow mt-3">Drill complete</p>
            <h2 className="ds-display mt-1.5">
              {accuracy >= 80 ? 'Outstanding.' : accuracy >= 50 ? 'Solid work.' : 'You showed up. That counts.'}
            </h2>
            <p className="ds-body mx-auto mt-2 max-w-[46ch]">{msg}</p>

            <div className="mt-7 flex flex-wrap items-center justify-center gap-5 sm:gap-7">
              <Ring
                value={accuracy / 100}
                size={116}
                stroke={9}
                tone={accuracy >= 70 ? 'jade' : accuracy >= 40 ? 'gold' : 'rose'}
                label={`${accuracy}% accuracy`}
              >
                <span>
                  <span className="block text-[1.65rem] font-bold leading-none ds-ink ds-num">{accuracy}%</span>
                  <span className="mt-1 block text-xs font-semibold ds-faint">accuracy</span>
                </span>
              </Ring>
              <dl className="grid grid-cols-3 gap-2 text-left">
                {[
                  { k: 'XP', v: `+${sessionXp}`, tone: 'ds-tone-gold' },
                  { k: 'Time', v: fmt(elapsedSeconds), tone: 'ds-tone-indigo' },
                  { k: 'Nailed', v: `${nailed}/${activeSet.length}`, tone: 'ds-tone-jade' },
                ].map((s) => (
                  <div key={s.k} className={`ds-inset min-w-[5.5rem] px-3 py-3 ${s.tone}`}>
                    <dt className="ds-eyebrow">{s.k}</dt>
                    <dd className="mt-1 text-lg font-bold ds-tone-text ds-num">{s.v}</dd>
                  </div>
                ))}
              </dl>
            </div>

            <div className="ds-banner ds-banner-center ds-tone-gold mx-auto mt-[1.5rem] w-fit">
              <Icon name="FireIcon" size={18} variant="solid" />
              <span>
                <b>{streak}-day streak</b>
                {finishInfo?.grew ? ', extended today' : ''}
              </span>
            </div>

            {settings.spiritual && (
              <div className="ds-inset mt-5 p-4 text-left">
                <p className="ds-eyebrow">Closing blessing</p>
                <p className="mt-1.5 text-sm font-semibold ds-ink">{lakshmi.mantra}</p>
                <p className="mt-2 text-sm italic ds-ink">{shloka.sanskrit}</p>
                <p className="mt-1 text-xs ds-faint">
                  {shloka.meaning} ({shloka.source})
                </p>
              </div>
            )}
          </div>
        </section>

        <section className="ds-card p-5" aria-labelledby="pm-review-title">
          <h3 id="pm-review-title" className="ds-h3 mb-2">
            How each question went
          </h3>
          <ul className="ds-divide">
            {activeSet.map((q, i) => {
              const g = grades[q.id];
              const meta = g ? GRADE_META[g] : null;
              const reviewable = /^\d+$/.test(q.id);
              return (
                <li key={q.id} className="flex items-start gap-3 py-3">
                  <span className={`ds-icon-tile ds-icon-tile-sm ${meta ? toneClass(meta.tone) : 'ds-tone-neutral'}`}>
                    {meta ? <Icon name={meta.icon} size={15} /> : <span className="text-xs font-bold">{i + 1}</span>}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold leading-snug ds-ink">{q.questionText}</span>
                    <span className="mt-0.5 block text-xs ds-faint">
                      {meta ? meta.label : 'Not graded'} · {q.subType}
                    </span>
                  </span>
                  {reviewable && g !== 'nailed' && (
                    <Link href={`/question-review?id=${q.id}`} prefetch={false} className="ds-link flex-shrink-0 text-xs">
                      Review
                    </Link>
                  )}
                </li>
              );
            })}
          </ul>
        </section>

        <div className="flex flex-col gap-2 sm:flex-row-reverse">
          <button type="button" onClick={() => startPractice('replace')} className="ds-btn ds-btn-primary ds-btn-lg flex-1">
            <Icon name="ArrowPathIcon" size={18} />
            Practice again
          </button>
          <button type="button" onClick={exitPractice} className="ds-btn ds-btn-secondary ds-btn-lg">
            Change topics
          </button>
        </div>
        {Sheet}
      </div>
    );
  }

  // ---------- Active question ----------
  if (isPracticing && activeSet.length > 0) {
    const q = activeSet[currentIndex];
    const pct = (currentIndex + (phase === 'feedback' ? 1 : 0)) / activeSet.length;
    const g = grades[q.id];
    const gm = g ? GRADE_META[g] : null;
    const wsQuestion = {
      questionText: q.questionText,
      category: q.category === 'Interview' ? 'interview' : 'cv_skill',
      subType: q.subType,
      difficulty: q.difficulty,
    };

    return (
      <div className="mx-auto max-w-3xl pb-[12rem] pt-3 sm:pt-4">
        {/* Floating top bar: end, progress, XP */}
        <div className="ds-topbar">
          <div className="flex items-center gap-3 px-3 py-2.5 sm:px-4">
            <button type="button" onClick={exitPractice} className="ds-btn ds-btn-ghost ds-btn-icon" aria-label="End this drill" title="End this drill">
              <Icon name="XMarkIcon" size={20} />
            </button>
            <div className="min-w-0 flex-1">
              <div className="mb-1.5 flex items-center justify-between gap-2 text-xs font-semibold">
                <span className="ds-muted">
                  Question {currentIndex + 1} of {activeSet.length}
                </span>
                {combo >= 2 ? (
                  <span className="ds-tone-gold ds-tone-text flex items-center gap-1">
                    <Icon name="FireIcon" size={13} variant="solid" />
                    {combo} in a row
                  </span>
                ) : (
                  <span className="ds-faint ds-num">{fmt(elapsedSeconds)}</span>
                )}
              </div>
              <Bar value={pct} tone="jade" label="Drill progress" />
            </div>
            <span className="ds-chip ds-tone-gold ds-num" title="XP this drill">
              <Icon name="SparklesIcon" size={13} variant="solid" />
              {sessionXp}
            </span>
          </div>
        </div>

        <div className={`mt-4 flex items-end gap-3 ${settings.mascotOn ? '' : 'justify-end'}`}>
          <CompanionBubble
            text={msg}
            mood={msgMood}
            speaking={speaking}
            size={48}
            onSpeak={() => say(msg, msgMood)}
            className="min-w-0 flex-1"
          />
          {SoundButton}
        </div>

        <section key={q.id} className="ds-card-raised mt-4 p-5 sm:p-[1.75rem] ds-enter" aria-labelledby="pm-q-text">
          <div className="flex flex-wrap items-center gap-2">
            {q.subType && <span className="ds-chip ds-tone-neutral">{q.subType}</span>}
            <DifficultyChip difficulty={q.difficulty} />
          </div>
          <h2 id="pm-q-text" className="ds-question mt-3">
            {q.questionText}
          </h2>

          {phase === 'question' && (
            <>
              <div role="tablist" aria-label="Answer mode" className="ds-seg mt-[1.5rem]">
                {(
                  [
                    ['write', 'PencilSquareIcon', 'Write it out'],
                    ['chat', 'ChatBubbleLeftRightIcon', 'Learn with AI tutor'],
                  ] as const
                ).map(([m, icon, label]) => (
                  <button key={m} type="button" role="tab" aria-selected={answerMode === m} onClick={() => setAnswerMode(m)}>
                    <Icon name={icon} size={16} />
                    {label}
                  </button>
                ))}
              </div>
              {/* Both stay mounted so switching modes never loses your draft or the conversation. */}
              <div className={`mt-4 ${answerMode === 'write' ? '' : 'hidden'}`}>
                <AnswerWorkspace
                  question={wsQuestion}
                  answer={notes[q.id] || ''}
                  onAnswerChange={(v) => setNotes((p) => ({ ...p, [q.id]: v }))}
                  code={codes[q.id] || ''}
                  onCodeChange={(v) => setCodes((p) => ({ ...p, [q.id]: v }))}
                  rows={5}
                />
              </div>
              <div className={`mt-4 ${answerMode === 'chat' ? '' : 'hidden'}`}>
                <AILearnChat key={q.id} question={wsQuestion} />
              </div>
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowHint((h) => !h)}
                  aria-expanded={showHint}
                  className="ds-btn ds-btn-soft ds-btn-sm ds-tone-gold"
                >
                  <Icon name="LightBulbIcon" size={15} />
                  {showHint ? 'Hide hint' : 'Hint'}
                </button>
                <button type="button" onClick={() => say(line('stuck'), 'comfort')} className="ds-btn ds-btn-ghost ds-btn-sm">
                  <Icon name="LifebuoyIcon" size={15} />
                  I&apos;m stuck
                </button>
              </div>
              {showHint && (
                <div className="ds-banner ds-tone-gold mt-3" data-semantic="hint">
                  <Icon name="LightBulbIcon" size={17} />
                  <span>
                    Break it into inputs, edge cases, the core algorithm or components, then the trade-offs (time vs space,
                    latency vs accuracy).
                  </span>
                </div>
              )}
            </>
          )}

          {phase !== 'question' && (
            <div className="ds-inset ds-tone-indigo mt-[1.5rem] p-4 sm:p-5">
              <p className="flex items-center gap-2 text-sm font-semibold ds-tone-text">
                <Icon name="AcademicCapIcon" size={17} />
                What a strong answer covers
              </p>
              <ul className="mt-3 space-y-2 text-sm ds-ink">
                {[
                  'States the problem, constraints and assumptions up front.',
                  'Walks through the logic, data flow or derivation step by step.',
                  'Names the trade-offs, failure points and optimisations.',
                ].map((t) => (
                  <li key={t} className="flex gap-2.5">
                    <Icon name="CheckCircleIcon" size={17} className="mt-0.5 flex-shrink-0 ds-tone-jade ds-tone-text" />
                    {t}
                  </li>
                ))}
              </ul>
              {notes[q.id] && (
                <div className="mt-4 border-t ds-hairline pt-3">
                  <p className="ds-eyebrow">Your draft</p>
                  <p className="mt-1 whitespace-pre-wrap text-sm ds-muted">{notes[q.id]}</p>
                </div>
              )}
            </div>
          )}
        </section>

        {/* Bottom action bar: thumb-reachable on phones; tinted by the grade once graded */}
        <div className={`ds-actionbar ${gm && phase === 'feedback' ? toneClass(gm.tone) : ''}`} data-tone={phase === 'feedback' ? g : undefined}>
          <div className="mx-auto max-w-3xl">
            {phase === 'question' && (
              <div className="flex items-center gap-3">
                <span className="hidden items-center gap-1 text-xs ds-faint md:flex">
                  <span className="ds-kbd">Ctrl</span>
                  <span className="ds-kbd">↵</span>
                </span>
                <button type="button" onClick={() => setPhase('reveal')} className="ds-btn ds-btn-primary ds-btn-lg flex-1">
                  {answerMode === 'chat' ? 'Done. Check my understanding' : 'Check my answer'}
                </button>
              </div>
            )}
            {phase === 'reveal' && (
              <div>
                <p className="mb-2.5 text-center text-sm font-semibold ds-ink">How did it go?</p>
                <div className="grid grid-cols-3 gap-2">
                  {(['review', 'almost', 'nailed'] as const).map((k, i) => {
                    const m = GRADE_META[k];
                    return (
                      <button
                        key={k}
                        type="button"
                        onClick={() => grade(k)}
                        className={`ds-option ds-option-stack ds-option-center ${toneClass(m.tone)}`}
                      >
                        <span className="ds-icon-tile ds-icon-tile-sm">
                          <Icon name={m.icon} size={17} />
                        </span>
                        <span className="text-sm font-semibold ds-ink">{m.label}</span>
                        <span className="hidden md:inline-flex">
                          <span className="ds-kbd">{i + 1}</span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
            {phase === 'feedback' && gm && (
              <div className="flex flex-wrap items-center gap-3">
                <span className="ds-icon-tile">
                  <Icon name={gm.icon} size={20} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-base font-bold ds-tone-text">{gm.title}</p>
                  <p className="text-sm ds-muted">
                    +{XP[g!] + (g === 'nailed' && combo >= 3 ? 5 : 0)} XP
                    {g === 'review' ? ' · we will bring this one back' : ''}
                  </p>
                </div>
                <button type="button" onClick={next} className="ds-btn ds-btn-solid ds-btn-lg w-full sm:w-auto sm:min-w-[12rem]">
                  {currentIndex === activeSet.length - 1 ? 'Finish' : 'Continue'}
                  <Icon name="ArrowRightIcon" size={17} />
                </button>
              </div>
            )}
          </div>
        </div>
        {Sheet}
      </div>
    );
  }

  // ---------- Setup ----------
  const startCount = Math.min(questionCount, eligibleQuestions.length || allQuestions.length);
  const topic = CATEGORY_CHIPS.find((c) => c.value === selectedCategory) ?? CATEGORY_CHIPS[0];
  const level = DIFFICULTY_OPTIONS.find((d) => d.value === selectedDifficulty) ?? DIFFICULTY_OPTIONS[0];
  const minutes = Math.max(3, Math.round(startCount * 1.5));
  const StartButton = (
    <button type="button" onClick={() => startPractice()} disabled={startCount === 0} className="ds-btn ds-btn-primary ds-btn-lg w-full">
      <Icon name="PlayIcon" size={18} variant="solid" />
      Start · {startCount} question{startCount === 1 ? '' : 's'}
    </button>
  );

  return (
    <div className="grid gap-5 pb-[8rem] lg:grid-cols-[minmax(0,1fr)_21rem] lg:grid-rows-[auto_1fr] lg:gap-x-[1.75rem] lg:pb-8">
      {/* Deepu + mood (first on a phone, top right on a wide screen) */}
      <section className="ds-hero ds-enter lg:col-start-2 lg:row-start-1" aria-labelledby="pm-mood-title">
        <div className="relative p-5">
          <div className="flex items-start justify-between gap-3">
            <CompanionBubble
              text={msg || hello}
              mood={msgMood}
              speaking={speaking}
              size={52}
              onSpeak={() => say(msg || hello, msgMood)}
              className="min-w-0 flex-1"
            />
            {!settings.mascotOn && <span className="flex-1" />}
          </div>
          <div className="mt-5">
            <p id="pm-mood-title" className="text-sm font-semibold ds-ink">
              How are you feeling?
            </p>
            <p className="text-xs ds-faint">Deepu sizes the drill to match.</p>
          </div>
          <div className="mt-3 grid grid-cols-4 gap-2" role="group" aria-labelledby="pm-mood-title">
            {MOODS.map((m) => {
              const look = MOOD_LOOK[m.id];
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => pickMood(m.id)}
                  aria-pressed={mood === m.id}
                  className={`ds-option ds-option-stack ds-option-center ds-option-compact ${toneClass(look.tone)}`}
                >
                  <span className="ds-icon-tile ds-icon-tile-sm">
                    <Icon name={look.icon} size={16} variant={mood === m.id ? 'solid' : 'outline'} />
                  </span>
                  <span className="text-xs font-semibold ds-ink">{m.label}</span>
                </button>
              );
            })}
          </div>
          <div className="mt-4 flex items-center justify-between gap-3 border-t ds-hairline pt-4">
            <p className="text-xs font-semibold ds-faint">Focus sound and Deepu</p>
            {SoundButton}
          </div>
        </div>
      </section>

      {/* The drill builder */}
      <div className="min-w-0 space-y-5 lg:col-start-1 lg:row-span-2 lg:row-start-1">
        {pendingRun && (
          <section className="ds-card-raised flex flex-wrap items-center gap-4 p-4 ds-enter" aria-label="Drill in progress">
            <Ring
              value={pendingRun.index / pendingRun.set.length}
              size={48}
              tone="jade"
              label={`${pendingRun.index} of ${pendingRun.set.length} done`}
            >
              <span className="text-[11px] font-bold ds-ink ds-num">
                {pendingRun.index}/{pendingRun.set.length}
              </span>
            </Ring>
            <div className="min-w-0 flex-1">
              <p className="ds-h3">You have a drill in progress</p>
              <p className="text-sm ds-muted">
                {pendingRun.category === 'All' ? 'Everything' : pendingRun.category} ·{' '}
                {pendingRun.difficulty === 'All' ? 'mixed level' : pendingRun.difficulty.toLowerCase()} · question{' '}
                {pendingRun.index + 1} of {pendingRun.set.length}
              </p>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  writeRun(null);
                  setPendingRun(null);
                }}
                className="ds-btn ds-btn-ghost"
              >
                Discard
              </button>
              <button
                type="button"
                onClick={() => update({ run: pendingRun.id, q: pendingRun.index + 1, done: null, practice: null }, 'push')}
                className="ds-btn ds-btn-primary"
              >
                Resume
                <Icon name="ArrowRightIcon" size={16} />
              </button>
            </div>
          </section>
        )}

        <section className="ds-card p-5 sm:p-[1.5rem] ds-enter" aria-label="Topic">
          <StepLabel n={1} hint={`${eligibleQuestions.length} matching`}>
            Topic
          </StepLabel>
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
            {CATEGORY_CHIPS.map((c) => {
              const n = matchCount(c.value);
              return (
                <button
                  key={c.value}
                  type="button"
                  onClick={() => setSelectedCategory(c.value)}
                  aria-pressed={selectedCategory === c.value}
                  className={`ds-option ds-option-stack ${toneClass(c.tone)}`}
                >
                  <span className="ds-icon-tile">
                    <Icon name={c.icon} size={19} />
                  </span>
                  <span>
                    <span className="block text-sm font-semibold leading-snug ds-ink">{c.label}</span>
                    <span className="block text-xs ds-faint ds-num">
                      {n} question{n === 1 ? '' : 's'}
                    </span>
                  </span>
                  <Icon name="CheckCircleIcon" size={18} variant="solid" className="ds-check" />
                </button>
              );
            })}
          </div>
        </section>

        <section className="ds-card p-5 sm:p-[1.5rem] ds-enter-2" aria-label="Level and length">
          <div className="grid gap-5 md:grid-cols-2">
            <div>
              <StepLabel n={2}>Level</StepLabel>
              <div className="ds-seg" role="group" aria-label="Level">
                {DIFFICULTY_OPTIONS.map((d) => (
                  <button
                    key={d.value}
                    type="button"
                    aria-pressed={selectedDifficulty === d.value}
                    onClick={() => setSelectedDifficulty(d.value)}
                    className={toneClass(difficultyTone(d.value))}
                  >
                    <span className="ds-dot" aria-hidden="true" />
                    {d.label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <StepLabel n={3} hint={`about ${minutes} min`}>
                Length
              </StepLabel>
              <div className="ds-seg" role="group" aria-label="Number of questions">
                {QUESTION_COUNT_OPTIONS.map((n) => (
                  <button key={n} type="button" aria-pressed={questionCount === n} onClick={() => setQuestionCount(n)} className="ds-num">
                    {n}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="ds-card p-5 sm:p-[1.5rem] ds-enter-3" aria-label="Answer style">
          <StepLabel n={4}>How you&apos;ll answer</StepLabel>
          <div className="grid gap-2.5 sm:grid-cols-2">
            {(
              [
                ['write', 'PencilSquareIcon', 'indigo', 'Write it out', 'Type your answer, then get AI feedback on it.'],
                ['chat', 'ChatBubbleLeftRightIcon', 'jade', 'Learn with an AI tutor', 'Talk it through, one step at a time.'],
              ] as const
            ).map(([m, icon, tone, title, sub]) => (
              <button
                key={m}
                type="button"
                onClick={() => setAnswerMode(m)}
                aria-pressed={answerMode === m}
                className={`ds-option ${toneClass(tone)}`}
              >
                <span className="ds-icon-tile">
                  <Icon name={icon} size={19} />
                </span>
                <span className="min-w-0 pr-5">
                  <span className="block text-sm font-semibold ds-ink">{title}</span>
                  <span className="block text-xs leading-snug ds-faint">{sub}</span>
                </span>
                <Icon name="CheckCircleIcon" size={18} variant="solid" className="ds-check" />
              </button>
            ))}
          </div>
        </section>
      </div>

      {/* Summary, thought, history */}
      <aside className="space-y-5 lg:sticky lg:top-[5.5rem] lg:col-start-2 lg:row-start-2 lg:self-start">
        <section className="ds-card-raised p-5 ds-enter-2" aria-labelledby="pm-summary-title">
          <p className="ds-eyebrow">Your drill</p>
          <p id="pm-summary-title" className="ds-h2 mt-1.5">
            {startCount} {topic.value === 'All' ? '' : `${topic.label} `}question{startCount === 1 ? '' : 's'}
          </p>
          <p className="mt-0.5 text-sm ds-muted">{topic.value === 'All' ? 'Across every topic' : `From ${topic.label}`}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <span className={`ds-chip ${toneClass(difficultyTone(level.value))}`}>
              <span className="ds-dot" aria-hidden="true" />
              {level.value === 'All' ? 'Mixed level' : level.label}
            </span>
            <span className="ds-chip ds-tone-neutral">
              <Icon name="ClockIcon" size={13} />
              about {minutes} min
            </span>
            <span className="ds-chip ds-tone-neutral">{answerMode === 'chat' ? 'AI tutor' : 'Written'}</span>
          </div>
          {eligibleQuestions.length === 0 && allQuestions.length > 0 ? (
            <p className="mt-3 text-xs ds-faint">Nothing matches exactly, so we&apos;ll mix in other questions.</p>
          ) : (
            eligibleQuestions.length < questionCount && (
              <p className="mt-3 text-xs ds-faint">
                Only {eligibleQuestions.length} question{eligibleQuestions.length === 1 ? '' : 's'} match this topic and level,
                so the drill is shorter. Try a wider level or topic for more.
              </p>
            )
          )}
          <div className="mt-5 hidden lg:block">{StartButton}</div>
        </section>

        {settings.spiritual && (
          <details className="ds-card ds-disclosure group p-5 ds-enter-3">
            <summary className="flex items-center gap-3">
              <span className="ds-icon-tile ds-icon-tile-sm ds-tone-gold">
                <Icon name="SunIcon" size={16} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold ds-ink">Today&apos;s thought</span>
                <span className="block text-sm italic ds-muted">{shloka.sanskrit}</span>
              </span>
              <Icon name="ChevronDownIcon" size={16} className="ds-caret ds-faint" />
            </summary>
            <div className="mt-3 space-y-2 pl-[2.75rem]">
              <p className="text-sm ds-ink">
                {shloka.meaning} <span className="ds-faint">({shloka.source})</span>
              </p>
              <p className="text-xs ds-faint">
                Before you start: <span className="italic">{SARASWATI_VANDANA}</span>
              </p>
            </div>
          </details>
        )}

        {history.length > 0 && (
          <section className="ds-card p-5 ds-enter-3" aria-labelledby="pm-history-title">
            <div className="mb-1 flex items-baseline justify-between">
              <h3 id="pm-history-title" className="ds-h3">
                Recent drills
              </h3>
              <span className="text-xs font-semibold ds-faint">Last {history.length}</span>
            </div>
            <ul>
              {history.map((h) => (
                <li key={h.at} className="flex items-center gap-3 py-2.5">
                  <Ring
                    value={h.accuracy / 100}
                    size={38}
                    stroke={4}
                    tone={h.accuracy >= 70 ? 'jade' : h.accuracy >= 40 ? 'gold' : 'rose'}
                    label={`${h.accuracy}% accuracy`}
                  >
                    <span className="text-[11px] font-bold ds-muted ds-num">{h.accuracy}</span>
                  </Ring>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold ds-ink">
                      {h.category === 'All' ? 'Mixed topics' : h.category} · {h.difficulty === 'All' ? 'any level' : h.difficulty.toLowerCase()}
                    </span>
                    <span className="block text-xs ds-faint">
                      {relativeDay(dayKey(new Date(h.at)))} · {h.total} questions · {fmt(h.seconds)}
                    </span>
                  </span>
                  <span className="ds-chip ds-tone-gold ds-num">+{h.xp}</span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </aside>

      {/* Phone: the start button sits in a bar at the bottom */}
      <div className="lg:hidden">
        <div className="ds-actionbar">
          <div className="mx-auto flex max-w-xl items-center gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold ds-ink">
                {topic.value === 'All' ? 'Every topic' : topic.label} · {level.value === 'All' ? 'mixed level' : level.label.toLowerCase()}
              </p>
              <p className="text-xs ds-faint">
                {startCount} question{startCount === 1 ? '' : 's'} · about {minutes} min
              </p>
            </div>
            <div className="w-[11.5rem]">{StartButton}</div>
          </div>
        </div>
      </div>
      {Sheet}
    </div>
  );
}

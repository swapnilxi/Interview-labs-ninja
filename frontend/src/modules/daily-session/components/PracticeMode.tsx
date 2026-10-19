'use client';

import React, { useState, useEffect, useLayoutEffect, useMemo, useRef, useCallback } from 'react';
import AnswerWorkspace from '../coach/AnswerWorkspace';
import AILearnChat from '../coach/AILearnChat';
import Icon from '@/components/ui/AppIcon';
import BackButton from '@/components/ui/BackButton';
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

const CATEGORY_CHIPS = [
  { label: 'Everything', value: 'All', emoji: '🌈', color: 'from-violet-500 to-fuchsia-500' },
  { label: 'Interview', value: 'Interview', emoji: '🎤', color: 'from-sky-500 to-indigo-500' },
  { label: 'CV Skill', value: 'CV Skill', emoji: '👁️', color: 'from-emerald-500 to-teal-500' },
  { label: 'DSA', value: 'DSA', emoji: '🧩', color: 'from-amber-500 to-orange-500' },
  { label: 'System Design', value: 'System Design', emoji: '🏗️', color: 'from-rose-500 to-pink-500' },
  { label: 'Deep Learning', value: 'Deep Learning Vision', emoji: '🧠', color: 'from-purple-500 to-violet-600' },
  { label: 'Classical CV', value: 'Classical CV', emoji: '📐', color: 'from-cyan-500 to-blue-500' },
  { label: 'Behavioral', value: 'Behavioral', emoji: '💬', color: 'from-lime-500 to-green-500' },
];

const DIFFICULTY_OPTIONS = [
  { value: 'All', label: 'Mix', emoji: '🎲' },
  { value: 'Easy', label: 'Easy', emoji: '🌱' },
  { value: 'Medium', label: 'Medium', emoji: '🔥' },
  { value: 'Hard', label: 'Hard', emoji: '🦁' },
];
const QUESTION_COUNT_OPTIONS = [5, 10, 15, 20];

type Grade = 'nailed' | 'almost' | 'review';
type Phase = 'question' | 'reveal' | 'feedback';
const XP: Record<Grade, number> = { nailed: 10, almost: 6, review: 3 };

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

const CARD = 'rounded-xl border border-border bg-card';

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
        setAllQuestions(data && data.length > 0 ? data : SAMPLE_FALLBACK_QUESTIONS);
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
    () =>
      allQuestions.filter((q) => {
        if (selectedCategory !== 'All') {
          const c = selectedCategory.toLowerCase();
          const ok =
            q.category === selectedCategory ||
            q.subType?.toLowerCase().includes(c) ||
            q.questionType?.toLowerCase().includes(c);
          if (!ok) return false;
        }
        if (selectedDifficulty !== 'All' && q.difficulty.toLowerCase() !== selectedDifficulty.toLowerCase()) return false;
        return true;
      }),
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

  const fmt = (s: number) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

  const SoundButton = <CompanionControls settings={settings} update={updateSettings} onOpenSettings={() => setSheetOpen(true)} />;
  const Sheet = <CompanionSettings open={sheetOpen} onClose={() => setSheetOpen(false)} settings={settings} update={updateSettings} />;

  if (loading) {
    return (
      <div className="flex h-[18rem] flex-col items-center justify-center gap-3">
        <Mascot mood="think" size={88} />
        <p className="text-sm font-semibold text-muted-foreground">Deepu is lighting the lamp…</p>
      </div>
    );
  }

  // ---------- Completion ----------
  if (isCompleted) {
    const vals = Object.values(grades);
    const nailed = vals.filter((g) => g === 'nailed').length;
    const accuracy = vals.length ? Math.round(((nailed + vals.filter((g) => g === 'almost').length * 0.5) / vals.length) * 100) : 0;
    const lakshmi = MANTRAS.Lakshmi;
    return (
      <div className="mx-auto max-w-xl space-y-4 pb-8 animate-fade-in">
        <div>
          <BackButton href={PRACTICE_URL} label="Back" preferHistory />
        </div>
        <div className={`${CARD} overflow-hidden text-center`}>
          <div className="bg-gradient-to-b from-amber-200 via-orange-100 to-transparent px-4 pb-2 pt-[1.5rem] dark:from-amber-500/25 dark:via-orange-500/10">
            {settings.mascotOn && <div className="flex justify-center"><Mascot mood="cheer" size={120} speaking={speaking} /></div>}
            <h2 className="mt-2 font-heading text-2xl font-extrabold text-foreground">Lesson complete! 🎉</h2>
            <p className="mx-auto mt-1 max-w-sm text-sm font-semibold text-muted-foreground">{msg}</p>
          </div>
          <div className="grid grid-cols-3 gap-2 p-4">
            {[
              { k: 'XP earned', v: `+${sessionXp}`, c: 'border-amber-300 bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300', e: '⭐' },
              { k: 'Accuracy', v: `${accuracy}%`, c: 'border-emerald-300 bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300', e: '🎯' },
              { k: 'Time', v: fmt(elapsedSeconds), c: 'border-slate-300 bg-slate-50 text-slate-700 dark:border-slate-500/40 dark:bg-slate-500/10 dark:text-slate-300', e: '⏱️' },
            ].map((s) => (
              <div key={s.k} className={`rounded-2xl border-2 px-2 py-3 ${s.c}`}>
                <div className="text-[11px] font-extrabold uppercase tracking-wide">{s.e} {s.k}</div>
                <div className="mt-1 text-xl font-extrabold">{s.v}</div>
              </div>
            ))}
          </div>
          <div className="mx-4 mb-4 rounded-2xl bg-orange-50 px-4 py-3 text-sm font-bold text-orange-800 dark:bg-orange-500/10 dark:text-orange-200">
            🔥 {finishInfo?.streak ?? stats.streak}-day streak{finishInfo?.grew ? ' (extended today!)' : ''}
          </div>
          {settings.spiritual && (
            <div className="mx-4 mb-4 rounded-2xl border-2 mix-border-primary/30 lab-tint p-4 text-left">
              <div className="text-xs font-extrabold uppercase tracking-wide lab-ink">
                {lakshmi.emoji} Closing blessing
              </div>
              <p className="mt-1 text-sm font-bold text-foreground">{lakshmi.mantra}</p>
              <p className="mt-2 text-sm italic text-foreground">{shloka.sanskrit}</p>
              <p className="mt-1 text-xs text-muted-foreground">{shloka.meaning} <span className="font-semibold">({shloka.source})</span></p>
            </div>
          )}
        </div>
        <div className="flex flex-col gap-2">
          <button type="button" onClick={() => startPractice('replace')} className="rounded-2xl bg-primary py-4 text-base font-extrabold uppercase tracking-wide text-primary-foreground shadow-[0_5px_0_0_color-mix(in_srgb,var(--color-primary)_60%,black)] active:translate-y-[2px] active:shadow-[0_3px_0_0_color-mix(in_srgb,var(--color-primary)_60%,black)]">
            Practice again
          </button>
          <button type="button" onClick={exitPractice} className="rounded-2xl border-2 border-border py-3.5 text-sm font-extrabold uppercase tracking-wide text-muted-foreground">
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
    const pct = Math.round(((currentIndex + (phase === 'feedback' ? 1 : 0)) / activeSet.length) * 100);
    const g = grades[q.id];
    const diffColor =
      q.difficulty === 'Hard'
        ? 'bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-300'
        : q.difficulty === 'Medium'
        ? 'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300'
        : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300';
    const fbColor =
      g === 'nailed'
        ? 'bg-emerald-100 text-emerald-900 dark:bg-emerald-500/20 dark:text-emerald-100'
        : g === 'almost'
        ? 'bg-amber-100 text-amber-900 dark:bg-amber-500/20 dark:text-amber-100'
        : 'bg-rose-100 text-rose-900 dark:bg-rose-500/20 dark:text-rose-100';

    return (
      <div className="mx-auto max-w-3xl space-y-4 pb-[9rem] animate-fade-in">
        <div>
          <BackButton href={PRACTICE_URL} label="Back" preferHistory />
        </div>
        {/* Top bar: exit, chunky progress, xp, sound */}
        <div className="flex items-center gap-3">
          <button type="button" onClick={exitPractice} className="flex h-[2.75rem] w-[2.75rem] items-center justify-center rounded-2xl border-2 border-border bg-card text-lg font-bold text-muted-foreground" aria-label="Exit practice">✕</button>
          <div className="h-4 flex-1 overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-primary transition-all duration-500" style={{ width: `${Math.max(pct, 4)}%` }} />
          </div>
          <span className="rounded-2xl bg-amber-100 px-3 py-2 text-sm font-extrabold text-amber-700 dark:bg-amber-500/20 dark:text-amber-300">⭐ {sessionXp}</span>
          {SoundButton}
        </div>
        <div className="flex items-center justify-between text-xs font-bold text-muted-foreground">
          <span>Question {currentIndex + 1} of {activeSet.length}</span>
          <span>{combo >= 2 ? `🔥 ${combo} in a row!` : fmt(elapsedSeconds)}</span>
        </div>

        <CompanionBubble text={msg} mood={msgMood} speaking={speaking} onSpeak={() => say(msg, msgMood)} />

        <div className={`${CARD} space-y-4 p-5`}>
          <div className="flex flex-wrap items-center gap-2 text-xs font-extrabold">
            <span className="rounded-full px-3 py-1 lab-tint lab-ink">{q.subType}</span>
            <span className={`rounded-full px-3 py-1 ${diffColor}`}>{q.difficulty}</span>
          </div>
          <h3 className="font-heading text-lg font-extrabold leading-snug text-foreground sm:text-xl">{q.questionText}</h3>

          {phase === 'question' && (
            <>
              <div role="tablist" aria-label="Answer mode" className="grid grid-cols-2 gap-1 rounded-2xl bg-muted p-1 text-sm font-extrabold">
                {([['write', '✍️ Write answer'], ['chat', '💬 AI Learn Chat']] as const).map(([m, label]) => (
                  <button
                    key={m}
                    type="button"
                    role="tab"
                    aria-selected={answerMode === m}
                    onClick={() => setAnswerMode(m)}
                    className={`rounded-xl py-2 transition ${answerMode === m ? 'bg-card lab-ink shadow-sm' : 'text-muted-foreground'}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {/* Both stay mounted so switching modes never loses your draft or the conversation. */}
              <div className={answerMode === 'write' ? '' : 'hidden'}>
                <AnswerWorkspace
                  question={{ questionText: q.questionText, category: q.category === 'Interview' ? 'interview' : 'cv_skill', subType: q.subType, difficulty: q.difficulty }}
                  answer={notes[q.id] || ''}
                  onAnswerChange={(v) => setNotes((p) => ({ ...p, [q.id]: v }))}
                  code={codes[q.id] || ''}
                  onCodeChange={(v) => setCodes((p) => ({ ...p, [q.id]: v }))}
                  rows={5}
                />
              </div>
              <div className={answerMode === 'chat' ? '' : 'hidden'}>
                <AILearnChat
                  key={q.id}
                  question={{ questionText: q.questionText, category: q.category === 'Interview' ? 'interview' : 'cv_skill', subType: q.subType, difficulty: q.difficulty }}
                />
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button type="button" onClick={() => setShowHint((h) => !h)} className="rounded-full border-2 border-amber-300 bg-amber-50 px-4 py-2 text-xs font-extrabold text-amber-800 dark:bg-amber-500/10 dark:text-amber-200">
                  💡 {showHint ? 'Hide hint' : 'Hint'}
                </button>
                <button type="button" onClick={() => say(line('stuck'), 'comfort')} className="rounded-full border-2 mix-border-primary/40 lab-tint px-4 py-2 text-xs font-extrabold lab-ink">
                  😵 I&apos;m stuck
                </button>
              </div>
              {showHint && (
                <p className="rounded-2xl bg-amber-50 p-3 text-sm leading-relaxed text-amber-900 dark:bg-amber-500/10 dark:text-amber-100">
                  Break it into inputs, edge cases, the core algorithm or components, then trade-offs (time vs space, latency vs accuracy).
                </p>
              )}
            </>
          )}

          {phase !== 'question' && (
            <div className="space-y-2 rounded-2xl border-2 mix-border-primary/30 lab-tint p-4 text-sm">
              <div className="font-extrabold lab-ink">🎓 What a strong answer covers</div>
              <ul className="list-disc space-y-1 pl-5 text-foreground">
                <li>State the problem, constraints and assumptions up front.</li>
                <li>Walk through the logic, data flow or derivation step by step.</li>
                <li>Name the trade-offs, failure points and optimisations.</li>
              </ul>
              {notes[q.id] && <p className="border-t mix-border-primary/30 pt-2 text-xs text-muted-foreground"><b>Your draft:</b> {notes[q.id]}</p>}
            </div>
          )}
        </div>

        {/* Sticky bottom action bar: thumb-reachable on phones */}
        <div className={`fixed inset-x-0 bottom-[var(--mobile-tab-h,0px)] z-40 border-t-2 border-border px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] ${phase === 'feedback' ? fbColor : 'bg-card'}`}>
          <div className="mx-auto max-w-xl">
            {phase === 'question' && (
              <button type="button" onClick={() => setPhase('reveal')} className="w-full rounded-2xl bg-emerald-500 py-4 text-base font-extrabold uppercase tracking-wide text-white shadow-[0_5px_0_0_#059669] active:translate-y-[2px] active:shadow-[0_3px_0_0_#059669]">
                {answerMode === 'chat' ? 'Done · check my understanding' : 'Check my answer'}
              </button>
            )}
            {phase === 'reveal' && (
              <div>
                <p className="mb-2 text-center text-xs font-extrabold uppercase tracking-wide text-muted-foreground">How did you do?</p>
                <div className="grid grid-cols-3 gap-2">
                  <button type="button" onClick={() => grade('review')} className="rounded-2xl border-2 border-rose-300 bg-rose-50 py-3 text-xs font-extrabold text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">😅<br />Need review</button>
                  <button type="button" onClick={() => grade('almost')} className="rounded-2xl border-2 border-amber-300 bg-amber-50 py-3 text-xs font-extrabold text-amber-700 dark:bg-amber-500/10 dark:text-amber-300">🙂<br />Almost</button>
                  <button type="button" onClick={() => grade('nailed')} className="rounded-2xl border-2 border-emerald-300 bg-emerald-50 py-3 text-xs font-extrabold text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300">🤩<br />Nailed it</button>
                </div>
              </div>
            )}
            {phase === 'feedback' && (
              <div className="space-y-2">
                <p className="text-center text-sm font-extrabold">
                  {g === 'nailed' ? 'Excellent! ' : g === 'almost' ? 'Nice try! ' : 'Marked for review. '}+{XP[g!]} XP
                </p>
                <button type="button" onClick={next} className={`w-full rounded-2xl py-4 text-base font-extrabold uppercase tracking-wide text-white ${g === 'review' ? 'bg-rose-500 shadow-[0_5px_0_0_#be123c]' : g === 'almost' ? 'bg-amber-500 shadow-[0_5px_0_0_#b45309]' : 'bg-emerald-500 shadow-[0_5px_0_0_#059669]'}`}>
                  {currentIndex === activeSet.length - 1 ? 'Finish' : 'Continue'}
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
  return (
    <div className="mx-auto max-w-xl space-y-5 pb-[7rem] animate-fade-in">
      <div className="flex items-center justify-between gap-2">
        <div className="flex gap-2 text-sm font-extrabold">
          <span className="rounded-2xl bg-orange-100 px-3 py-2 text-orange-700 dark:bg-orange-500/20 dark:text-orange-300">🔥 {stats.streak}</span>
          <span className="rounded-2xl bg-amber-100 px-3 py-2 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300">⭐ {stats.xp} XP</span>
        </div>
        {SoundButton}
      </div>

      <CompanionBubble text={msg || hello} mood={msgMood} speaking={speaking} size={84} onSpeak={() => say(msg || hello, msgMood)} />

      {settings.spiritual && (
        <div className="rounded-2xl border-2 mix-border-primary/30 lab-tint p-4">
          <div className="text-xs font-extrabold uppercase tracking-wide lab-ink">🪔 Today&apos;s thought</div>
          <p className="mt-1 text-sm font-semibold italic text-foreground">{shloka.sanskrit}</p>
          <p className="mt-1 text-xs text-muted-foreground">{shloka.meaning} <span className="font-semibold">({shloka.source})</span></p>
          <p className="mt-2 text-[11px] text-muted-foreground">Before you start: <span className="italic">{SARASWATI_VANDANA}</span></p>
        </div>
      )}

      {history.length > 0 && (
        <section className={`${CARD} space-y-3 p-4`}>
          <h3 className="text-sm font-extrabold text-foreground">🕘 Recent practice <span className="font-semibold text-muted-foreground">(last {history.length})</span></h3>
          <ul className="divide-y divide-border">
            {history.map((h) => (
              <li key={h.at} className="flex items-center gap-3 py-2 text-xs">
                <div className="min-w-0 flex-1">
                  <div className="truncate font-extrabold text-foreground">
                    {h.category === 'All' ? 'Mixed topics' : h.category} · {h.difficulty === 'All' ? 'any level' : h.difficulty}
                  </div>
                  <div className="text-muted-foreground">
                    {new Date(h.at).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })} · {h.total} Qs · {fmt(h.seconds)}
                  </div>
                </div>
                <span className="rounded-full bg-emerald-100 px-2 py-1 font-extrabold text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300">{h.accuracy}%</span>
                <span className="rounded-full bg-amber-100 px-2 py-1 font-extrabold text-amber-700 dark:bg-amber-500/20 dark:text-amber-300">⭐ {h.xp}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className={`${CARD} space-y-3 p-4`}>
        <h3 className="text-sm font-extrabold text-foreground">How are you feeling today?</h3>
        <div className="grid grid-cols-4 gap-2">
          {MOODS.map((m) => (
            <button key={m.id} type="button" onClick={() => pickMood(m.id)} className={`rounded-2xl border-2 py-3 text-center text-[11px] font-extrabold transition ${mood === m.id ? 'border-primary lab-tint lab-ink' : 'border-border text-muted-foreground'}`}>
              <div className="text-2xl">{m.emoji}</div>
              {m.label}
            </button>
          ))}
        </div>
      </section>

      <section className={`${CARD} space-y-3 p-4`}>
        <h3 className="text-sm font-extrabold text-foreground">How do you want to answer?</h3>
        <div className="grid grid-cols-2 gap-2">
          {([['write', '✍️', 'Write it out', 'Type your answer, then get AI feedback'], ['chat', '💬', 'AI Learn Chat', 'Learn it in depth with an AI tutor, step by step']] as const).map(([m, emoji, title, sub]) => (
            <button key={m} type="button" onClick={() => setAnswerMode(m)} className={`rounded-2xl border-2 px-3 py-3 text-left transition ${answerMode === m ? 'border-primary lab-tint' : 'border-border'}`}>
              <div className="text-xl">{emoji}</div>
              <div className="text-sm font-extrabold text-foreground">{title}</div>
              <div className="text-[11px] leading-snug text-muted-foreground">{sub}</div>
            </button>
          ))}
        </div>
      </section>

      <section className={`${CARD} space-y-3 p-4`}>
        <h3 className="text-sm font-extrabold text-foreground">What shall we practise?</h3>
        <div className="grid grid-cols-2 gap-2">
          {CATEGORY_CHIPS.map((c) => {
            const active = selectedCategory === c.value;
            return (
              <button key={c.value} type="button" onClick={() => setSelectedCategory(c.value)} data-accent-exempt={active ? '' : undefined} className={`flex items-center gap-2 rounded-2xl border-2 px-3 py-3 text-left text-sm font-extrabold transition ${active ? 'border-transparent bg-gradient-to-br text-white shadow-md ' + c.color : 'border-border bg-card text-foreground'}`}>
                <span className="text-xl">{c.emoji}</span>
                {c.label}
              </button>
            );
          })}
        </div>
      </section>

      <section className={`${CARD} space-y-4 p-4`}>
        <div>
          <h3 className="mb-2 text-sm font-extrabold text-foreground">Difficulty</h3>
          <div className="grid grid-cols-4 gap-2">
            {DIFFICULTY_OPTIONS.map((d) => (
              <button key={d.value} type="button" onClick={() => setSelectedDifficulty(d.value)} className={`rounded-2xl border-2 py-2.5 text-center text-xs font-extrabold transition ${selectedDifficulty === d.value ? 'border-primary lab-tint lab-ink' : 'border-border text-muted-foreground'}`}>
                <div className="text-lg">{d.emoji}</div>
                {d.label}
              </button>
            ))}
          </div>
        </div>
        <div>
          <h3 className="mb-2 text-sm font-extrabold text-foreground">How many questions?</h3>
          <div className="grid grid-cols-4 gap-2">
            {QUESTION_COUNT_OPTIONS.map((n) => (
              <button key={n} type="button" onClick={() => setQuestionCount(n)} className={`rounded-2xl border-2 py-2.5 text-sm font-extrabold transition ${questionCount === n ? 'border-primary lab-tint lab-ink' : 'border-border text-muted-foreground'}`}>
                {n}
              </button>
            ))}
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          <b className="text-foreground">{eligibleQuestions.length}</b> matching questions available
          {eligibleQuestions.length === 0 && ' (will mix in others so you can still practise)'}
        </p>
      </section>

      <div className="fixed inset-x-0 bottom-[var(--mobile-tab-h,0px)] z-40 border-t-2 border-border bg-card px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
        <div className="mx-auto max-w-xl">
          <button type="button" onClick={() => startPractice()} className="w-full rounded-2xl bg-emerald-500 py-4 text-base font-extrabold uppercase tracking-wide text-white shadow-[0_5px_0_0_#059669] active:translate-y-[2px] active:shadow-[0_3px_0_0_#059669]">
            Start · {startCount} questions
          </button>
        </div>
      </div>
      {Sheet}
    </div>
  );
}

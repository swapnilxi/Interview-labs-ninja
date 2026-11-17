'use client';

/**
 * /question-review?id=<n>: one question, worked on four ways (Answer, AI tutor, Quiz, Notes), with a Study row
 * (Quick review, Breakdown, Dive deep, Send to SwipeLearn), the user's own mastery and review-list mark, and
 * previous / next through the list it was opened from (`&from=review`: the review list; otherwise the Question Bank's
 * default order). On the Daily Session skin (ds-*), with its own bits in question-review.css (qr-*).
 *
 * The address holds the screen: `id`, `from`, and `mode` (answer is the default and is left out).
 */

import React, { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import Icon from '@/components/ui/AppIcon';
import FlatIcon from '@/components/ui/FlatIcon';
import ConfirmHost from '@/components/ui/ConfirmHost';
import Popover from '@/components/ui/Popover';
import SaveControl from '@/components/ui/SaveControl';
import AnswerWorkspace from '@/modules/daily-session/coach/AnswerWorkspace';
import AILearnChat from '@/modules/daily-session/coach/AILearnChat';
import {
  DifficultyChip,
  dayKey,
  isTypingTarget,
  relativeDay,
} from '@/modules/daily-session/components/ds';
import { useAutoSave } from '@/lib/ui/useAutoSave';
import { useUrlState } from '@/lib/navigation/urlState';
import { useSmartBack } from '@/lib/navigation/smartBack';
import { toast } from '@/lib/ui/toast';
import StarExplainer from './StarExplainer';
import QuizPane from './QuizPane';
import StudyRow from './StudySheets';
import RelatedQuestions from './RelatedQuestions';
import { ErrorBanner, requireLogin } from './ui';
import { addToTodo } from './addToTodo';
import {
  ReviewApiError,
  bankOrder,
  categoryLabel,
  difficultyLabel,
  questionReviewService,
  type ReviewQuestion,
} from './questionReviewService';
import '@/modules/daily-session/daily-session.css';
import '@/modules/daily-session/styles/blitz-space.css';
import './question-review.css';

/** The review page is opened from the daily quiz, the question bank and other reviews; this is its parent. */
const QUESTION_BANK_URL = '/daily-session?tab=question-bank';
const LAYOUT_KEY = 'labninja.question-review.layout.v1';
const codeKey = (id: number) => `labninja.question-review.code.v1.${id}`;
const premasterKey = (id: number) => `labninja.question-review.premaster.v1.${id}`;

type Mode = 'answer' | 'tutor' | 'quiz' | 'notes';
type From = 'bank' | 'review';
const MODES: { id: Mode; label: string; icon: string }[] = [
  { id: 'answer', label: 'Answer', icon: 'PencilSquareIcon' },
  { id: 'tutor', label: 'AI tutor', icon: 'ChatBubbleLeftRightIcon' },
  { id: 'quiz', label: 'Quiz', icon: 'QuestionMarkCircleIcon' },
  { id: 'notes', label: 'Notes', icon: 'DocumentTextIcon' },
];

function readStore(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function writeStore(key: string, value: string | null) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    /* storage unavailable: a convenience only */
  }
}

function useMedia(query: string): boolean {
  const [matches, setMatches] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const on = () => setMatches(mq.matches);
    on();
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, [query]);
  return matches;
}

/** "Today at 14:05", "Yesterday", "Mon, 9 Nov" for a server timestamp (SQLite's UTC "YYYY-MM-DD HH:MM:SS"). */
function savedWhen(ts: string): string {
  const iso = /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(:\d{2})?$/.test(ts)
    ? `${ts.replace(' ', 'T')}Z`
    : ts;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const day = relativeDay(dayKey(d));
  return day === 'Today'
    ? `today at ${d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}`
    : day;
}

/** "today", "yesterday", "on Mon, 9 Nov" (after a verb: "Reviewed today", "added on Mon, 9 Nov"). */
function onDay(date: string): string {
  const d = relativeDay(date);
  return d === 'Today' || d === 'Yesterday' ? d.toLowerCase() : `on ${d}`;
}

const reviewHref = (id: number, from: From, mode?: Mode) =>
  `/question-review?id=${id}${from === 'review' ? '&from=review' : ''}${mode && mode !== 'answer' ? `&mode=${mode}` : ''}`;

// ── Data hooks ───────────────────────────────────────────────────────────────────────────────────────────────────

/**
 * The user's answer and notes for the question, saved as they type (and at once with Save or Ctrl/Cmd+S). Until the
 * saved copy has loaded nothing is written, so a failed load can never overwrite it; text typed meanwhile is kept and
 * saved once the load succeeds.
 */
function useWorkspace(id: number) {
  const [answer, setAnswer] = useState('');
  const [notes, setNotes] = useState('');
  const [inReview, setInReview] = useState(false);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState('');
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const statusRef = useRef(status);
  statusRef.current = status;
  const dirty = useRef({ answer: false, notes: false });
  const latest = useRef({ answer: '', notes: '' });

  const answerSave = useAutoSave<{ id: number; answer: string }>(async (v) => {
    const w = await questionReviewService.saveWorkspace(v.id, { answer: v.answer });
    setUpdatedAt(w.updated_at);
  }, 800);
  const notesSave = useAutoSave<{ id: number; notes: string }>(async (v) => {
    const w = await questionReviewService.saveWorkspace(v.id, { notes: v.notes });
    setUpdatedAt(w.updated_at);
  }, 800);
  const scheduleAnswer = answerSave.schedule;
  const scheduleNotes = notesSave.schedule;

  const load = useCallback(async () => {
    setStatus('loading');
    setError('');
    try {
      const w = await questionReviewService.getWorkspace(id);
      if (dirty.current.answer) scheduleAnswer({ id, answer: latest.current.answer });
      else {
        latest.current.answer = w.answer ?? '';
        setAnswer(latest.current.answer);
      }
      if (dirty.current.notes) scheduleNotes({ id, notes: latest.current.notes });
      else {
        latest.current.notes = w.notes ?? '';
        setNotes(latest.current.notes);
      }
      setInReview(!!w.in_review);
      setUpdatedAt(w.updated_at);
      setStatus('ready');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load your saved work.');
      setStatus('error');
    }
  }, [id, scheduleAnswer, scheduleNotes]);

  useEffect(() => {
    void load();
  }, [load]);

  const changeAnswer = useCallback(
    (v: string) => {
      setAnswer(v);
      latest.current.answer = v;
      dirty.current.answer = true;
      if (statusRef.current === 'ready') scheduleAnswer({ id, answer: v });
    },
    [id, scheduleAnswer]
  );
  const changeNotes = useCallback(
    (v: string) => {
      setNotes(v);
      latest.current.notes = v;
      dirty.current.notes = true;
      if (statusRef.current === 'ready') scheduleNotes({ id, notes: v });
    },
    [id, scheduleNotes]
  );

  const saveAnswerNow = () => answerSave.saveNow({ id, answer: latest.current.answer });
  const saveNotesNow = () => notesSave.saveNow({ id, notes: latest.current.notes });

  return {
    answer,
    notes,
    inReview,
    setInReview,
    status,
    error,
    updatedAt,
    reload: load,
    changeAnswer,
    changeNotes,
    answerSave,
    notesSave,
    saveAnswerNow,
    saveNotesNow,
    isDirty: () => dirty.current,
  };
}

interface Neighbours {
  prev: number | null;
  next: number | null;
  /** -1 when this question is not in the list. */
  index: number;
  total: number;
}

/** The ids either side of this question, in the order of the list it was opened from (ids only, no content). */
function useNeighbours(id: number, from: From): Neighbours | null {
  const [nav, setNav] = useState<Neighbours | null>(null);
  useEffect(() => {
    let cancelled = false;
    const order =
      from === 'review'
        ? questionReviewService.getReviewList().then((items) => items.map((i) => i.question_id))
        : questionReviewService.listQuestions().then(bankOrder);
    order
      .then((ids) => {
        if (cancelled) return;
        const i = ids.indexOf(id);
        setNav({
          prev: i > 0 ? ids[i - 1] : null,
          next: i !== -1 && i < ids.length - 1 ? ids[i + 1] : null,
          index: i,
          total: ids.length,
        });
      })
      .catch(() => !cancelled && setNav(null));
    return () => {
      cancelled = true;
    };
  }, [id, from]);
  return nav;
}

// ── The screen ───────────────────────────────────────────────────────────────────────────────────────────────────

function ReviewScreen({ question, from }: { question: ReviewQuestion; from: From }) {
  const id = question.id;
  const router = useRouter();
  const goBack = useSmartBack();
  const { get, update } = useUrlState();
  const modeParam = get('mode');
  const mode: Mode = MODES.some((m) => m.id === modeParam) ? (modeParam as Mode) : 'answer';
  const setMode = useCallback(
    (m: Mode) => update({ mode: m === 'answer' ? null : m }, 'replace'),
    [update]
  );

  // Layout: Focus (one pane at a time) or, from 1024px, Split (the answer beside the AI tutor).
  const wide = useMedia('(min-width: 1024px)');
  const finePointer = useMedia('(pointer: fine)');
  const [layoutPref, setLayoutPref] = useState<'focus' | 'split'>('focus');
  useEffect(() => {
    if (readStore(LAYOUT_KEY) === 'split') setLayoutPref('split');
  }, []);
  const chooseLayout = (l: 'focus' | 'split') => {
    setLayoutPref(l);
    writeStore(LAYOUT_KEY, l);
  };
  const split = wide && layoutPref === 'split';
  // In Split the tutor has its own column, so the switcher picks what sits beside it.
  const paneMode: Mode = split && mode === 'tutor' ? 'answer' : mode;
  const tabs = split ? MODES.filter((m) => m.id !== 'tutor') : MODES;

  const ws = useWorkspace(id);
  const nav = useNeighbours(id, from);

  // The code / design sketch is kept in this browser (the server keeps the written answer and notes).
  const [code, setCode] = useState('');
  useEffect(() => setCode(readStore(codeKey(id)) ?? ''), [id]);
  const changeCode = (v: string) => {
    setCode(v);
    writeStore(codeKey(id), v || null);
  };

  const onAddTodo = useCallback(
    (text: string) => void addToTodo(text, id, () => router.push('/ai-todo')),
    [id, router]
  );

  // ── Mastery (this user's own rating; 5 = mastered) ──
  const [perf, setPerf] = useState<number | null>(question.userPerformance);
  const [lastReviewed, setLastReviewed] = useState<string | null>(question.lastReviewed);
  const [savingPerf, setSavingPerf] = useState(false);
  const mastered = perf === 5;
  const toggleMastered = async () => {
    if (!requireLogin('progress tracking')) return;
    // Un-marking puts back the rating from before it was marked (remembered in this browser); without one it is 3.
    const stored = Number(readStore(premasterKey(id)));
    const before = stored >= 1 && stored <= 4 ? stored : null;
    const next = mastered ? (before ?? 3) : 5;
    setSavingPerf(true);
    try {
      await questionReviewService.setPerformance(id, next);
      if (!mastered)
        writeStore(premasterKey(id), perf !== null && perf !== 5 ? String(perf) : null);
      else writeStore(premasterKey(id), null);
      setPerf(next);
      setLastReviewed(dayKey());
      if (mastered)
        toast.info(
          before
            ? `No longer mastered. Your rating is back to ${next} of 5.`
            : 'No longer mastered. Rated 3 of 5.'
        );
    } catch (e) {
      toast.error(`Could not update mastery. ${e instanceof Error ? e.message : ''}`.trim());
    } finally {
      setSavingPerf(false);
    }
  };

  // ── Review list ("Add to review") ──
  const [savingReview, setSavingReview] = useState(false);
  const toggleReview = async () => {
    if (!requireLogin('the review list')) return;
    const want = !ws.inReview;
    ws.setInReview(want);
    setSavingReview(true);
    try {
      const mark = await questionReviewService.setInReview(id, want);
      ws.setInReview(mark.in_review);
    } catch (e) {
      ws.setInReview(!want);
      toast.error(
        `Could not update your review list. ${e instanceof Error ? e.message : ''}`.trim()
      );
    } finally {
      setSavingReview(false);
    }
  };

  // ── Keyboard: ←/→ and K/J step through the list, 1-4 pick a pane, ? shows them all, Ctrl/Cmd+S saves ──
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const shortcutsAnchor = useRef<HTMLButtonElement>(null);
  const navRef = useRef(nav);
  navRef.current = nav;
  const saveAll = useCallback(async () => {
    const dirty = ws.isDirty();
    const results = await Promise.all([
      ws.saveAnswerNow(),
      dirty.notes ? ws.saveNotesNow() : Promise.resolve(true),
    ]);
    return results.every(Boolean);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ws.saveAnswerNow, ws.saveNotesNow]);
  const saveAllRef = useRef(saveAll);
  saveAllRef.current = saveAll;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === 's') {
        e.preventDefault();
        void saveAllRef.current();
        return;
      }
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey || e.isComposing) return;
      if (isTypingTarget(e.target)) return;
      // An open sheet or dialog keeps its keys; the tabs handle their own arrows.
      if (document.querySelector('[data-modal-root]')) return;
      const target = e.target as HTMLElement | null;
      if (target?.closest('[role="dialog"], [role="menu"]')) return;
      const inTabs = !!target?.closest('[role="tablist"]');
      const go = (to: number | null | undefined) => {
        if (!to) return;
        e.preventDefault();
        router.replace(reviewHref(to, from, mode), { scroll: false });
      };
      const k = e.key;
      if ((k === 'ArrowLeft' && !inTabs) || k === 'k' || k === 'K') go(navRef.current?.prev);
      else if ((k === 'ArrowRight' && !inTabs) || k === 'j' || k === 'J') go(navRef.current?.next);
      else if (/^[1-4]$/.test(k)) {
        e.preventDefault();
        setMode(MODES[Number(k) - 1].id);
      } else if (k === '?') {
        e.preventDefault();
        setShortcutsOpen((o) => !o);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [router, from, mode, setMode]);

  // Tabs (ARIA): arrows, Home and End move between them.
  const onTabsKey = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const i = tabs.findIndex((t) => t.id === paneMode);
    let to = -1;
    if (e.key === 'ArrowRight') to = (i + 1) % tabs.length;
    else if (e.key === 'ArrowLeft') to = (i - 1 + tabs.length) % tabs.length;
    else if (e.key === 'Home') to = 0;
    else if (e.key === 'End') to = tabs.length - 1;
    if (to < 0) return;
    e.preventDefault();
    setMode(tabs[to].id);
    document.getElementById(`qr-tab-${tabs[to].id}`)?.focus();
  };

  // ── Notes → To-Do (the selection, or the whole note) ──
  const notesRef = useRef<HTMLTextAreaElement>(null);
  const notesToTodo = () => {
    const el = notesRef.current;
    const sel =
      el && el.selectionStart !== el.selectionEnd
        ? ws.notes.slice(el.selectionStart, el.selectionEnd)
        : '';
    void addToTodo(sel.trim() || ws.notes, id, () => router.push('/ai-todo'));
  };

  const wsQuestion = {
    questionText: question.questionText,
    category: question.category,
    subType: question.subType,
    difficulty: difficultyLabel(question.difficulty),
  };
  const topics = question.topics.filter(
    (t) => t.trim().toLowerCase() !== question.subType.trim().toLowerCase()
  );
  const listName = from === 'review' ? 'Review list' : 'Question bank';
  const shortName = from === 'review' ? 'Review list' : 'Bank';
  const count = nav && nav.index >= 0 ? ` · ${nav.index + 1} of ${nav.total}` : '';
  const hint = (keys: string) => (finePointer ? ` (${keys})` : '');
  const savedText = ws.updatedAt ? `Saved ${savedWhen(ws.updatedAt)}` : 'Saved to your account';
  const idleText = ws.updatedAt ? `Saved ${savedWhen(ws.updatedAt)}` : 'Saves as you type';

  const navButton = (dir: 'prev' | 'next') => {
    const to = dir === 'prev' ? nav?.prev : nav?.next;
    const label = dir === 'prev' ? 'Previous question' : 'Next question';
    const icon = dir === 'prev' ? 'ChevronLeftIcon' : 'ChevronRightIcon';
    const title = `${label}${hint(dir === 'prev' ? 'K or ←' : 'J or →')}`;
    return to ? (
      <Link
        href={reviewHref(to, from, mode)}
        replace
        scroll={false}
        prefetch={false}
        aria-label={label}
        title={title}
        className="ds-btn ds-btn-ghost ds-btn-icon"
      >
        <Icon name={icon} size={20} />
      </Link>
    ) : (
      <button
        type="button"
        disabled
        aria-label={label}
        title={label}
        className="ds-btn ds-btn-ghost ds-btn-icon"
      >
        <Icon name={icon} size={20} />
      </button>
    );
  };

  return (
    <div className="qr-wrap space-y-3 sm:space-y-4" data-layout={split ? 'split' : 'focus'}>
      {/* Header row: back, where you are, review mark, previous / next. */}
      <nav aria-label="Question" className="flex items-center gap-1">
        <a
          href={QUESTION_BANK_URL}
          onClick={(e) => {
            if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
            e.preventDefault();
            goBack(QUESTION_BANK_URL, { preferHistory: true });
          }}
          className="ds-btn ds-btn-ghost ds-btn-sm -ml-2 px-2"
          aria-label="Back"
        >
          <Icon name="ChevronLeftIcon" size={18} />
          <span className="hidden sm:inline">Back</span>
        </a>
        <p className="min-w-0 flex-1 truncate text-[13px] font-medium ds-faint" aria-live="polite">
          <span className="sm:hidden">{shortName}</span>
          <span className="hidden sm:inline">{listName}</span>
          {count}
        </p>
        <button
          type="button"
          onClick={toggleReview}
          disabled={savingReview || ws.status === 'loading'}
          aria-pressed={ws.inReview}
          aria-label={ws.inReview ? 'On your review list' : 'Add to review list'}
          title={ws.inReview ? 'On your review list. Tap to remove it' : 'Add to review list'}
          className={`ds-btn ds-btn-icon ${ws.inReview ? 'ds-btn-soft ds-tone-indigo' : 'ds-btn-ghost'}`}
        >
          <Icon name="BookmarkIcon" size={19} variant={ws.inReview ? 'solid' : 'outline'} />
        </button>
        {navButton('prev')}
        {navButton('next')}
        {finePointer && (
          <button
            ref={shortcutsAnchor}
            type="button"
            onClick={() => setShortcutsOpen((o) => !o)}
            aria-expanded={shortcutsOpen}
            aria-label="Keyboard shortcuts"
            title="Keyboard shortcuts (?)"
            className="ds-btn ds-btn-ghost ds-btn-icon"
          >
            <Icon name="CommandLineIcon" size={18} />
          </button>
        )}
      </nav>
      <Popover
        open={shortcutsOpen}
        anchorRef={shortcutsAnchor}
        onClose={() => setShortcutsOpen(false)}
        role="dialog"
        label="Keyboard shortcuts"
        className="todo-popover lab-page ds-skin qr-pop w-[min(17rem,calc(100vw-1rem))] rounded-[14px] p-3"
      >
        <p className="mb-2 text-sm font-medium ds-ink">Keyboard shortcuts</p>
        <dl className="grid grid-cols-[auto_1fr] items-center gap-x-3 gap-y-2 text-[13px] ds-muted">
          {[
            [['←', 'K'], 'Previous question'],
            [['→', 'J'], 'Next question'],
            [['1–4'], 'Answer, AI tutor, Quiz, Notes'],
            [['Ctrl', 'S'], 'Save now'],
            [['Esc'], 'Close a sheet'],
            [['?'], 'Show these'],
          ].map(([keys, what]) => (
            <React.Fragment key={what as string}>
              <dt className="flex gap-1">
                {(keys as string[]).map((k) => (
                  <kbd key={k} className="ds-kbd">
                    {k}
                  </kbd>
                ))}
              </dt>
              <dd>{what as string}</dd>
            </React.Fragment>
          ))}
        </dl>
      </Popover>

      {/* Hero: the question is the page title. */}
      <header className="ds-hero qr-hero" aria-labelledby="qr-title">
        <div className="qr-chips">
          {question.subType && <span className="ds-chip ds-tone-neutral">{question.subType}</span>}
          <DifficultyChip difficulty={difficultyLabel(question.difficulty)} />
          {topics.map((t) => (
            <span key={t} className="ds-chip ds-tone-neutral">
              {t}
            </span>
          ))}
        </div>
        <h1 id="qr-title" className="ds-question qr-title mt-2.5 sm:mt-3">
          {question.questionText}
        </h1>
        <div className="mt-3 flex flex-col gap-3 sm:mt-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="qr-status">
            <span className={mastered ? 'ds-tone-jade ds-tone-text font-medium' : undefined}>
              <Icon
                name={mastered ? 'CheckBadgeIcon' : 'StarIcon'}
                size={15}
                variant={mastered ? 'solid' : 'outline'}
              />
              {mastered ? 'Mastered' : perf ? `Rated ${perf} of 5` : 'Not rated yet'}
            </span>
            {lastReviewed && <span>Reviewed {onDay(lastReviewed)}</span>}
            <span>
              {categoryLabel(question.category)}
              {question.questionDate ? ` · added ${onDay(question.questionDate)}` : ''}
            </span>
          </p>
          <div className="qr-actions">
            <button
              type="button"
              onClick={toggleMastered}
              disabled={savingPerf}
              aria-pressed={mastered}
              className="ds-btn ds-btn-secondary ds-btn-sm qr-master"
            >
              <Icon
                name={mastered ? 'CheckBadgeIcon' : 'CheckCircleIcon'}
                className="flex-shrink-0"
                size={16}
                variant={mastered ? 'solid' : 'outline'}
              />
              {mastered ? 'Mastered' : 'Mark as mastered'}
            </button>
            <Link
              href={`/daily-session?tab=practice&practice=${id}`}
              prefetch={false}
              title="Practice this question as a one-question drill"
              className="ds-btn ds-btn-secondary ds-btn-sm"
            >
              <Icon name="PlayIcon" className="flex-shrink-0" size={15} />
              Practice it
            </Link>
          </div>
        </div>
      </header>

      <StudyRow question={question} answer={ws.answer} onAddTodo={onAddTodo} />

      {/* Workspace: the switcher and its panes. Answer and AI tutor stay mounted (hidden), so switching never loses a
          draft or a conversation; Split moves the tutor into its own column without remounting it. */}
      <div className="qr-work">
        <div className="flex items-center gap-3">
          <div
            role="tablist"
            aria-label="Work on this question"
            className="ds-seg qr-seg min-w-0 flex-1"
            onKeyDown={onTabsKey}
          >
            {tabs.map((m) => {
              const n = MODES.findIndex((x) => x.id === m.id) + 1;
              return (
                <button
                  key={m.id}
                  id={`qr-tab-${m.id}`}
                  type="button"
                  role="tab"
                  aria-selected={paneMode === m.id}
                  aria-controls={`qr-panel-${m.id}`}
                  tabIndex={paneMode === m.id ? 0 : -1}
                  onClick={() => setMode(m.id)}
                  title={finePointer ? `${m.label} (${n})` : undefined}
                >
                  <Icon name={m.icon} size={16} />
                  {m.label}
                </button>
              );
            })}
          </div>
          {wide && (
            <div role="group" aria-label="Layout" className="ds-seg ds-seg-inline flex-shrink-0">
              <button
                type="button"
                aria-pressed={!split}
                onClick={() => chooseLayout('focus')}
                title="One pane at a time"
              >
                <Icon name="RectangleStackIcon" size={16} />
                Focus
              </button>
              <button
                type="button"
                aria-pressed={split}
                onClick={() => chooseLayout('split')}
                title="Your answer beside the AI tutor"
              >
                <Icon name="ViewColumnsIcon" size={16} />
                Split
              </button>
            </div>
          )}
        </div>

        <section
          id="qr-panel-answer"
          role="tabpanel"
          aria-labelledby="qr-tab-answer"
          className={`ds-card ds-answer qr-answer qr-pane space-y-4 ${paneMode === 'answer' ? '' : 'hidden'}`}
        >
          {ws.status === 'error' && (
            <ErrorBanner
              message={`Your saved answer could not be loaded, so changes are not saved yet. ${ws.error}`}
              onRetry={() => void ws.reload()}
            />
          )}
          <SaveControl
            state={ws.answerSave.state}
            error={ws.answerSave.error}
            onRetry={ws.answerSave.retry}
            onSave={ws.saveAnswerNow}
            idleText={ws.status === 'loading' ? 'Loading your saved answer…' : idleText}
            savedText={savedText}
          />
          <AnswerWorkspace
            question={wsQuestion}
            answer={ws.answer}
            onAnswerChange={ws.changeAnswer}
            code={code}
            onCodeChange={changeCode}
            rows={8}
            onAddTodo={onAddTodo}
          />
          <StarExplainer
            questionText={question.questionText}
            category={question.category}
            subType={question.subType}
            difficulty={wsQuestion.difficulty}
            answerText={ws.answer}
            onUse={ws.changeAnswer}
          />
        </section>

        <section
          id="qr-panel-tutor"
          role={split ? 'region' : 'tabpanel'}
          aria-labelledby={split ? 'qr-tutor-title' : 'qr-tab-tutor'}
          className={`ds-card qr-pane qr-pane-tutor ${split || paneMode === 'tutor' ? '' : 'hidden'}`}
        >
          {split && (
            <div className="mb-3">
              <h2 id="qr-tutor-title" className="ds-h3">
                AI tutor
              </h2>
              <p className="text-xs ds-faint">Talk it through while you write.</p>
            </div>
          )}
          <AILearnChat question={wsQuestion} />
        </section>

        <section
          id="qr-panel-quiz"
          role="tabpanel"
          aria-labelledby="qr-tab-quiz"
          className={`ds-card qr-pane qr-quiz ${paneMode === 'quiz' ? '' : 'hidden'}`}
        >
          <QuizPane questionId={id} answer={ws.answer} />
        </section>

        <section
          id="qr-panel-notes"
          role="tabpanel"
          aria-labelledby="qr-tab-notes"
          className={`ds-card qr-pane space-y-3 ${paneMode === 'notes' ? '' : 'hidden'}`}
        >
          {ws.status === 'error' && (
            <ErrorBanner
              message={`Your saved notes could not be loaded, so changes are not saved yet. ${ws.error}`}
              onRetry={() => void ws.reload()}
            />
          )}
          <div className="flex items-center justify-between gap-3">
            <label htmlFor="qr-notes" className="text-sm font-medium ds-ink">
              Your notes
            </label>
            <button
              type="button"
              onClick={notesToTodo}
              disabled={!ws.notes.trim()}
              title="Adds the selected text, or the whole note, as a To-Do task"
              className="ds-btn ds-btn-secondary ds-btn-sm"
            >
              <Icon name="PlusCircleIcon" size={16} />
              Add to To-Do
            </button>
          </div>
          <textarea
            id="qr-notes"
            ref={notesRef}
            value={ws.notes}
            onChange={(e) => ws.changeNotes(e.target.value)}
            rows={10}
            placeholder="Key ideas, links, what to revisit…"
            className="ds-field qr-notes resize-y"
            aria-describedby="qr-notes-hint"
          />
          <p id="qr-notes-hint" className="bs-footnote">
            Select part of a note to send just that to To-Do.
          </p>
          <SaveControl
            state={ws.notesSave.state}
            error={ws.notesSave.error}
            onRetry={ws.notesSave.retry}
            onSave={ws.saveNotesNow}
            idleText={ws.status === 'loading' ? 'Loading your notes…' : idleText}
            savedText={savedText}
          />
        </section>
      </div>

      <RelatedQuestions question={question} />
    </div>
  );
}

// ── Loading, not found, failed ───────────────────────────────────────────────────────────────────────────────────

function ReviewSkeleton() {
  return (
    <div className="qr-wrap space-y-4" aria-busy="true">
      <h1 className="sr-only">Loading the question</h1>
      <div className="flex items-center gap-2">
        <div className="qr-skel h-[2.25rem] w-[5rem]" />
        <div className="qr-skel h-4 w-[8rem]" />
      </div>
      <div className="ds-hero qr-hero space-y-3">
        <div className="flex gap-2">
          <div className="qr-skel h-[1.5rem] w-[8rem] rounded-full" />
          <div className="qr-skel h-[1.5rem] w-[4.5rem] rounded-full" />
        </div>
        <div className="qr-skel h-5 w-full" />
        <div className="qr-skel h-5 w-11/12" />
        <div className="qr-skel h-5 w-2/3" />
        <div className="qr-skel mt-2 h-4 w-1/2" />
      </div>
      <div className="qr-skel h-[2.75rem] w-full rounded-[14px]" />
      <div className="ds-card qr-pane space-y-3">
        <div className="qr-skel h-4 w-1/3" />
        <div className="qr-skel h-[10rem] w-full" />
      </div>
    </div>
  );
}

function StateCard({
  icon,
  title,
  body,
  children,
}: {
  icon: 'search' | 'warning';
  title: string;
  body: string;
  children: React.ReactNode;
}) {
  return (
    <div className="qr-wrap">
      <section className="ds-card flex flex-col items-center px-5 py-10 text-center">
        <span className="ds-icon-tile ds-icon-tile-lg ds-tone-neutral">
          <FlatIcon name={icon} size={22} />
        </span>
        <h1 className="ds-h2 mt-3">{title}</h1>
        <p className="ds-body mt-1 max-w-[28rem]">{body}</p>
        <div className="mt-5 flex flex-wrap justify-center gap-2">{children}</div>
      </section>
    </div>
  );
}

type Load =
  | { status: 'loading' }
  | { status: 'ready'; question: ReviewQuestion }
  | { status: 'notfound' }
  | { status: 'error'; message: string };

function QuestionReviewContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const rawId = searchParams.get('id');
  const from: From = searchParams.get('from') === 'review' ? 'review' : 'bank';
  const id = rawId !== null && /^\d{1,12}$/.test(rawId) ? Number(rawId) : null;
  const [load, setLoad] = useState<Load>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (rawId === null) {
      // No question named: the question bank is this screen's parent (replace: the bare address leaves no entry).
      toast.info('Pick a question to review it.');
      router.replace(QUESTION_BANK_URL);
      return;
    }
    if (id === null) {
      setLoad({ status: 'notfound' });
      return;
    }
    let cancelled = false;
    setLoad((prev) =>
      prev.status === 'ready' && prev.question.id === id ? prev : { status: 'loading' }
    );
    questionReviewService
      .getQuestion(id)
      .then((question) => !cancelled && setLoad({ status: 'ready', question }))
      .catch((e) => {
        if (cancelled) return;
        if (e instanceof ReviewApiError && e.status === 404) setLoad({ status: 'notfound' });
        else
          setLoad({
            status: 'error',
            message: e instanceof Error ? e.message : 'The server could not be reached.',
          });
      });
    return () => {
      cancelled = true;
    };
  }, [rawId, id, attempt, router]);

  return (
    <div className="lab-page ds-skin min-h-screen pt-[60px]" data-accent-exempt="">
      <main className="px-4 pb-[2.5rem] pt-3 sm:px-[2rem] sm:pt-5">
        {load.status === 'ready' ? (
          <ReviewScreen key={load.question.id} question={load.question} from={from} />
        ) : load.status === 'notfound' ? (
          <StateCard
            icon="search"
            title="Question not found"
            body={`There is no question ${rawId ? `#${rawId.slice(0, 24)}` : ''}. It may have been removed, or the link is wrong.`}
          >
            <Link href={QUESTION_BANK_URL} className="ds-btn ds-btn-primary">
              Browse the question bank
            </Link>
          </StateCard>
        ) : load.status === 'error' ? (
          <StateCard
            icon="warning"
            title="Couldn't load this question"
            body={`${load.message} Your work is safe; try again in a moment.`}
          >
            <button
              type="button"
              onClick={() => setAttempt((a) => a + 1)}
              className="ds-btn ds-btn-primary"
            >
              <Icon name="ArrowPathIcon" size={16} />
              Try again
            </button>
            <Link href={QUESTION_BANK_URL} className="ds-btn ds-btn-secondary">
              Question bank
            </Link>
          </StateCard>
        ) : (
          <ReviewSkeleton />
        )}
      </main>
      <ConfirmHost panelClassName="lab-page" />
    </div>
  );
}

export default function QuestionReviewInteractive() {
  return (
    <Suspense
      fallback={
        <div className="lab-page ds-skin min-h-screen pt-[60px]">
          <main className="px-4 pt-3 sm:px-[2rem] sm:pt-5">
            <ReviewSkeleton />
          </main>
        </div>
      }
    >
      <QuestionReviewContent />
    </Suspense>
  );
}

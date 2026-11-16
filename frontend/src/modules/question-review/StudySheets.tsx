'use client';

import React, { useCallback, useEffect, useId, useRef, useState } from 'react';
import Link from 'next/link';
import Icon from '@/components/ui/AppIcon';
import FlatIcon, { type FlatIconName } from '@/components/ui/FlatIcon';
import Modal from '@/components/ui/Modal';
import RichText from '@/modules/daily-session/coach/RichText';
import { PipStrip } from '@/modules/daily-session/components/ds';
import { confirmDialog } from '@/lib/ui/confirm';
import { toast } from '@/lib/ui/toast';
import { ErrorBanner, requireLogin } from './ui';
import { LISTEN_RATES, speakableText, useListen } from './useListen';
import {
  MAX_DEEP_DEPTH,
  questionReviewService,
  swipeLearnHref,
  type Breakdown,
  type DeepDive,
  type QuickReview,
  type ReviewQuestion,
  type StudyItems,
  type StudyKind,
} from './questionReviewService';

const STUDY: { kind: StudyKind; label: string; icon: FlatIconName; title: string }[] = [
  {
    kind: 'quick',
    label: 'Quick review',
    icon: 'quick',
    title: 'A short read: the gist, key points and what to remember',
  },
  {
    kind: 'breakdown',
    label: 'Breakdown',
    icon: 'study',
    title: 'Small lessons to read one at a time',
  },
  {
    kind: 'deep',
    label: 'Dive deep',
    icon: 'search',
    title: 'The topic in depth, section by section',
  },
];

const SHEET_TITLE: Record<StudyKind, string> = {
  quick: 'Quick review',
  breakdown: 'Breakdown',
  deep: 'Dive deep',
};
const WAITING: Record<StudyKind, string> = {
  quick: 'Writing a quick review…',
  breakdown: 'Breaking it into small lessons…',
  deep: 'Writing the deep dive…',
};

type Busy = Partial<Record<StudyKind, boolean>>;
type Errors = Partial<Record<StudyKind, string>>;

/**
 * The "Study" row under the question: Quick review, Breakdown and Dive deep open reading sheets (written by the AI
 * the first time, then stored for this user), and Send to SwipeLearn turns the question into quick-read cards there.
 */
export default function StudyRow({
  question,
  answer,
  onAddTodo,
}: {
  question: ReviewQuestion;
  answer: string;
  /** "Add to To-Do" for a single idea (Dive deep's "Explore next"). */
  onAddTodo: (text: string) => void;
}) {
  const id = question.id;
  const [items, setItems] = useState<StudyItems>({ quick: null, breakdown: null, deep: null });
  const [open, setOpen] = useState<StudyKind | null>(null);
  const [busy, setBusy] = useState<Busy>({});
  const [errors, setErrors] = useState<Errors>({});

  // What is already stored loads with the page; a failure here is not shown (opening a sheet asks again).
  useEffect(() => {
    let cancelled = false;
    questionReviewService
      .getStudy(id)
      .then((s) => {
        if (!cancelled)
          setItems((prev) => ({
            quick: prev.quick ?? s.quick,
            breakdown: prev.breakdown ?? s.breakdown,
            deep: prev.deep ?? s.deep,
          }));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [id]);

  const generate = useCallback(
    async (kind: StudyKind, refresh: boolean) => {
      setBusy((b) => ({ ...b, [kind]: true }));
      setErrors((e) => ({ ...e, [kind]: '' }));
      try {
        const item = await questionReviewService.generateStudy(id, kind, { refresh, answer });
        setItems((prev) => ({ ...prev, [kind]: item }));
      } catch (e) {
        setErrors((er) => ({
          ...er,
          [kind]: e instanceof Error ? e.message : 'Could not write this. Try again.',
        }));
      } finally {
        setBusy((b) => ({ ...b, [kind]: false }));
      }
    },
    [id, answer]
  );

  const openSheet = (kind: StudyKind) => {
    if (!requireLogin('the AI study views')) return;
    setOpen(kind);
    // Not stored yet: write it now (a POST without refresh also returns a stored one, if the list was slow).
    if (!items[kind] && !busy[kind]) void generate(kind, false);
  };

  const regenerate = async (kind: StudyKind) => {
    const ok = await confirmDialog({
      title: `Write a new ${SHEET_TITLE[kind].toLowerCase()}?`,
      message:
        kind === 'breakdown'
          ? 'The current lessons and your reading progress are replaced.'
          : 'The current one is replaced. It cannot be brought back.',
      confirmLabel: 'Regenerate',
    });
    if (ok) void generate(kind, true);
  };

  const setItem = <K extends StudyKind>(kind: K, item: StudyItems[K]) =>
    setItems((prev) => ({ ...prev, [kind]: item }));

  const sheetBody = (kind: StudyKind) => {
    if (busy[kind]) return <ReadingSkeleton label={WAITING[kind]} />;
    if (errors[kind])
      return (
        <div className="space-y-3 pt-2">
          <ErrorBanner message={errors[kind]!} onRetry={() => void generate(kind, false)} />
        </div>
      );
    if (kind === 'quick' && items.quick)
      return (
        <QuickReviewView item={{ ...items.quick, title: items.quick.title || question.subType }} />
      );
    if (kind === 'breakdown' && items.breakdown)
      return (
        <BreakdownView
          questionId={id}
          item={items.breakdown}
          onChange={(b) => setItem('breakdown', b)}
        />
      );
    if (kind === 'deep' && items.deep)
      return (
        <DeepDiveView
          questionId={id}
          item={items.deep}
          onChange={(d) => setItem('deep', d)}
          onAddTodo={onAddTodo}
        />
      );
    return <ReadingSkeleton label={WAITING[kind]} />;
  };

  return (
    <section aria-labelledby="qr-study-title">
      <div className="ds-section-head">
        <h2 id="qr-study-title">Study</h2>
        <span>Saved to your account</span>
      </div>
      <div className="qr-study">
        {STUDY.map((s) => (
          <button
            key={s.kind}
            type="button"
            onClick={() => openSheet(s.kind)}
            title={s.title}
            aria-haspopup="dialog"
            className="ds-btn ds-btn-sm"
          >
            <FlatIcon name={s.icon} size={16} />
            <span className="min-w-0">{s.label}</span>
          </button>
        ))}
        <Link
          href={swipeLearnHref(question)}
          prefetch={false}
          title="Turn this question into quick-read cards in SwipeLearn"
          className="ds-btn ds-btn-sm"
        >
          <FlatIcon name="cards" size={16} />
          <span className="min-w-0">Send to SwipeLearn</span>
        </Link>
      </div>

      {STUDY.map((s) => (
        <StudySheet
          key={s.kind}
          open={open === s.kind}
          onClose={() => setOpen(null)}
          title={SHEET_TITLE[s.kind]}
          icon={s.icon}
          onRegenerate={items[s.kind] && !busy[s.kind] ? () => void regenerate(s.kind) : undefined}
        >
          {sheetBody(s.kind)}
        </StudySheet>
      ))}
    </section>
  );
}

// ── Sheet shell ──────────────────────────────────────────────────────────────────────────────────────────────────

function StudySheet({
  open,
  onClose,
  title,
  icon,
  onRegenerate,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  icon: FlatIconName;
  onRegenerate?: () => void;
  children: React.ReactNode;
}) {
  const titleId = useId();
  return (
    <Modal
      isOpen={open}
      onClose={onClose}
      labelledBy={titleId}
      className="lab-page ds-skin ios-sheet qr-sheet flex max-h-[90vh] w-full flex-col overflow-hidden rounded-[22px] sm:max-w-2xl"
    >
      <div className="ios-sheet-head sm:pt-4">
        <h2 id={titleId} className="ios-sheet-title flex min-w-0 items-center gap-2">
          <FlatIcon name={icon} size={20} />
          {title}
        </h2>
        <div className="flex flex-shrink-0 items-center gap-1">
          {onRegenerate && (
            <button
              type="button"
              onClick={onRegenerate}
              className="ds-btn ds-btn-ghost ds-btn-sm qr-done"
              title="Write a new version"
            >
              <Icon name="ArrowPathIcon" size={15} />
              <span className="hidden sm:inline">Regenerate</span>
              <span className="sr-only sm:hidden">Regenerate</span>
            </button>
          )}
          <button type="button" onClick={onClose} className="sheet-done qr-done">
            Done
          </button>
        </div>
      </div>
      {children}
    </Modal>
  );
}

function ReadingSkeleton({ label }: { label: string }) {
  return (
    <div className="qr-sheet-body" aria-busy="true">
      <p className="mb-4 flex items-center gap-2 text-sm font-medium ds-muted" role="status">
        <span
          className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent"
          aria-hidden="true"
        />
        {label}
      </p>
      <div className="space-y-3" aria-hidden="true">
        <div className="qr-skel h-[1.5rem] w-2/3" />
        <div className="qr-skel h-4 w-full" />
        <div className="qr-skel h-4 w-11/12" />
        <div className="qr-skel h-4 w-4/5" />
        <div className="qr-skel mt-5 h-[5rem] w-full" />
        <div className="qr-skel h-4 w-3/4" />
      </div>
    </div>
  );
}

// ── Listen (read aloud) ──────────────────────────────────────────────────────────────────────────────────────────

type Listen = ReturnType<typeof useListen>;

/** Play / pause plus a speed chip. Playback starts only from this tap. */
function ListenControl({
  listen,
  text,
  children,
}: {
  listen: Listen;
  text: () => string;
  children?: React.ReactNode;
}) {
  const { state, rate } = listen;
  const onMain = () => {
    if (state === 'playing') listen.pause();
    else if (state === 'paused') listen.resume();
    else if (state === 'loading') listen.stop();
    else listen.play(text());
  };
  const label =
    state === 'playing'
      ? 'Pause'
      : state === 'paused'
        ? 'Resume'
        : state === 'loading'
          ? 'Stop'
          : 'Listen';
  const nextRate = LISTEN_RATES[(LISTEN_RATES.indexOf(rate) + 1) % LISTEN_RATES.length];
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={onMain}
          aria-pressed={state === 'playing'}
          aria-label={state === 'idle' ? 'Listen: read this aloud' : label}
          className={`ds-btn ds-btn-sm ${state === 'idle' ? 'ds-btn-secondary' : 'ds-btn-soft ds-tone-indigo'}`}
        >
          {state === 'loading' ? (
            <span
              className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent"
              aria-hidden="true"
            />
          ) : (
            <Icon
              name={
                state === 'playing'
                  ? 'PauseIcon'
                  : state === 'paused'
                    ? 'PlayIcon'
                    : 'SpeakerWaveIcon'
              }
              size={16}
              variant={state === 'idle' ? 'outline' : 'solid'}
            />
          )}
          {label}
        </button>
        <button
          type="button"
          onClick={() => listen.setRate(nextRate)}
          aria-label={`Reading speed ${rate} times. Change to ${nextRate} times`}
          title="Reading speed"
          className="ds-btn ds-btn-ghost ds-btn-sm ds-num"
        >
          {rate}×
        </button>
        {children}
      </div>
      {listen.note && (
        <p className="text-xs ds-faint" role="status">
          {listen.note}
        </p>
      )}
      {listen.error && (
        <p className="ds-banner ds-tone-gold text-sm" role="alert">
          <Icon name="SpeakerXMarkIcon" size={16} />
          <span>{listen.error}</span>
        </p>
      )}
    </div>
  );
}

// ── Quick review ─────────────────────────────────────────────────────────────────────────────────────────────────

/** List items read as sentences: "A. B. C." (no doubled full stops). */
const sentences = (items: string[]) => items.map((t) => t.trim().replace(/[.!?]+$/, '')).join('. ');

/** Title, summary, key points, "Remember", then the pitfalls: the order the sheet shows them in. */
function quickText(item: QuickReview): string {
  return [
    item.title,
    item.summary,
    item.key_points.length ? `Key points. ${sentences(item.key_points)}` : '',
    item.remember ? `Remember. ${item.remember}` : '',
    item.pitfalls.length ? `Watch out. ${sentences(item.pitfalls)}` : '',
  ]
    .filter(Boolean)
    .map((t) => speakableText(t).replace(/[.\s]*$/, '.'))
    .join('\n');
}

function QuickReviewView({ item }: { item: QuickReview }) {
  const listen = useListen();
  return (
    <div className="qr-sheet-body">
      <article className="qr-read space-y-[1.5rem]">
        <header>
          <p className="ds-eyebrow flex items-center gap-1.5">
            <Icon name="ClockIcon" size={14} />
            <span className="ds-num">{item.read_minutes}</span> min read
          </p>
          <h3 className="ds-h2 mt-1.5">{item.title}</h3>
          {item.summary && <p className="qr-read-lead mt-3">{item.summary}</p>}
          <div className="mt-4">
            <ListenControl listen={listen} text={() => quickText(item)} />
          </div>
        </header>

        {item.key_points.length > 0 && (
          <section aria-labelledby="qr-quick-points">
            <h4 id="qr-quick-points" className="ds-h3 mb-3">
              Key points
            </h4>
            <ul className="qr-read-list">
              {item.key_points.map((p, i) => (
                <li key={i}>
                  <FlatIcon name="ok" size={18} />
                  <span>{p}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {item.remember && (
          <aside className="qr-callout ds-tone-jade" aria-label="Remember">
            <p className="qr-callout-title">
              <Icon name="BookmarkIcon" variant="solid" size={16} />
              Remember
            </p>
            <p>{item.remember}</p>
          </aside>
        )}

        {item.pitfalls.length > 0 && (
          <aside className="qr-callout ds-tone-gold" aria-label="Watch out">
            <p className="qr-callout-title">
              <Icon name="ExclamationTriangleIcon" variant="solid" size={16} />
              Watch out
            </p>
            <ul className="qr-read-list">
              {item.pitfalls.map((p, i) => (
                <li key={i}>
                  <span
                    aria-hidden="true"
                    className="mt-[0.7rem] h-1.5 w-1.5 flex-shrink-0 rounded-full bg-current opacity-60"
                  />
                  <span>{p}</span>
                </li>
              ))}
            </ul>
          </aside>
        )}
      </article>
    </div>
  );
}

// ── Breakdown: one small lesson per screen ───────────────────────────────────────────────────────────────────────

function firstUnread(item: Breakdown): number {
  const i = item.chunks.findIndex((_, n) => !item.done.includes(n));
  return i === -1 ? 0 : i;
}

function BreakdownView({
  questionId,
  item,
  onChange,
}: {
  questionId: number;
  item: Breakdown;
  onChange: (b: Breakdown) => void;
}) {
  // Opening again resumes at the first lesson not read yet.
  const [idx, setIdx] = useState(() => firstUnread(item));
  const [showCheck, setShowCheck] = useState(false);
  const [saving, setSaving] = useState(false);
  const [autoAdvance, setAutoAdvance] = useState(false);
  const total = item.chunks.length;
  const chunk = item.chunks[Math.min(idx, total - 1)];
  const isRead = item.done.includes(idx);
  const allRead = total > 0 && item.chunks.every((_, n) => item.done.includes(n));

  // Listening reads the lesson on screen. With auto-advance on, a finished lesson moves on and the next one is read
  // (it is not marked as read: that stays the reader's tap).
  const autoRef = useRef(autoAdvance);
  autoRef.current = autoAdvance;
  const advancing = useRef(false);
  const lessonText = (n: number) => {
    const c = item.chunks[n];
    return c ? `${speakableText(c.title)}.\n${speakableText(c.body)}` : '';
  };
  const listen = useListen({
    onEnd: () => {
      if (!autoRef.current) return;
      setIdx((n) => {
        if (n >= total - 1) return n;
        advancing.current = true;
        return n + 1;
      });
    },
  });
  const { play, stop } = listen;
  useEffect(() => {
    setShowCheck(false);
    if (advancing.current) {
      advancing.current = false;
      play(lessonText(idx));
    } else stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idx]);
  // A regenerated breakdown can be shorter.
  useEffect(() => {
    if (idx > total - 1) setIdx(Math.max(0, total - 1));
  }, [idx, total]);

  if (!chunk)
    return (
      <div className="qr-sheet-body">
        <p className="qr-read ds-muted">This breakdown has no lessons. Regenerate it.</p>
      </div>
    );

  const toggleRead = async () => {
    const done = isRead
      ? item.done.filter((n) => n !== idx)
      : [...item.done, idx].sort((a, b) => a - b);
    const before = item;
    onChange({ ...item, done }); // shown at once, put back if the save fails
    setSaving(true);
    try {
      onChange(await questionReviewService.saveBreakdownProgress(questionId, done));
      if (!isRead && idx < total - 1) setIdx(idx + 1);
    } catch (e) {
      onChange(before);
      toast.error(`Could not save your progress. ${e instanceof Error ? e.message : ''}`.trim());
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <div className="qr-sheet-body">
        <PipStrip
          count={total}
          current={idx}
          isDone={(n) => item.done.includes(n)}
          onSelect={setIdx}
          label="Lessons"
          className="mb-5"
        />
        <article className="qr-read" aria-live="polite">
          <p className="ds-eyebrow flex flex-wrap items-center gap-x-2">
            <span className="ds-num">
              Lesson {idx + 1} of {total}
            </span>
            {isRead && (
              <span className="inline-flex items-center gap-1 ds-tone-jade ds-tone-text">
                <Icon name="CheckCircleIcon" variant="solid" size={14} />
                Read
              </span>
            )}
          </p>
          <h3 className="ds-h2 mt-1.5">{chunk.title}</h3>
          <div className="mt-3">
            <ListenControl listen={listen} text={() => lessonText(idx)}>
              <button
                type="button"
                onClick={() => setAutoAdvance((v) => !v)}
                aria-pressed={autoAdvance}
                title="When a lesson has been read aloud, go on to the next one"
                className={`ds-btn ds-btn-sm ${autoAdvance ? 'ds-btn-soft ds-tone-indigo' : 'ds-btn-ghost'}`}
              >
                <Icon
                  name={autoAdvance ? 'CheckCircleIcon' : 'ForwardIcon'}
                  size={15}
                  variant={autoAdvance ? 'solid' : 'outline'}
                />
                Auto-advance
              </button>
            </ListenControl>
          </div>
          <div className="qr-prose mt-4">
            <RichText text={chunk.body} />
          </div>

          {chunk.check && (
            <div className="mt-[1.5rem]">
              {showCheck ? (
                <div className="qr-check ds-enter">
                  <p className="qr-callout-title ds-tone-indigo">
                    <Icon name="QuestionMarkCircleIcon" variant="solid" size={16} />
                    Check yourself
                  </p>
                  <p>{chunk.check}</p>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setShowCheck(true)}
                  className="ds-btn ds-btn-secondary ds-btn-sm"
                >
                  <Icon name="QuestionMarkCircleIcon" size={16} />
                  Check yourself
                </button>
              )}
            </div>
          )}
          {allRead && (
            <p className="ds-banner ds-banner-center ds-tone-jade mt-[1.5rem]" role="status">
              <Icon name="CheckBadgeIcon" variant="solid" size={18} />
              <span>You have read every lesson. Try the quiz to see what stuck.</span>
            </p>
          )}
        </article>
      </div>
      <div className="qr-sheet-foot grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2">
        <button
          type="button"
          onClick={() => setIdx(idx - 1)}
          disabled={idx === 0}
          className="ds-btn ds-btn-ghost"
          aria-label="Previous lesson"
        >
          <Icon name="ArrowLeftIcon" size={18} />
          <span className="hidden sm:inline">Previous</span>
        </button>
        <button
          type="button"
          onClick={toggleRead}
          disabled={saving}
          aria-pressed={isRead}
          className={`ds-btn ${isRead ? 'ds-btn-soft ds-tone-jade' : 'ds-btn-primary'}`}
        >
          <Icon
            name={isRead ? 'CheckCircleIcon' : 'CheckIcon'}
            size={18}
            variant={isRead ? 'solid' : 'outline'}
          />
          {isRead ? 'Read' : 'Mark as read'}
        </button>
        <button
          type="button"
          onClick={() => setIdx(idx + 1)}
          disabled={idx >= total - 1}
          className="ds-btn ds-btn-ghost"
          aria-label="Next lesson"
        >
          <span className="hidden sm:inline">Next</span>
          <Icon name="ArrowRightIcon" size={18} />
        </button>
      </div>
    </>
  );
}

// ── Dive deep ────────────────────────────────────────────────────────────────────────────────────────────────────

function DeepDiveView({
  questionId,
  item,
  onChange,
  onAddTodo,
}: {
  questionId: number;
  item: DeepDive;
  onChange: (d: DeepDive) => void;
  onAddTodo: (text: string) => void;
}) {
  const [expanding, setExpanding] = useState<number | null>(null);
  const [error, setError] = useState<{ section: number; message: string } | null>(null);

  const goDeeper = async (section: number) => {
    setExpanding(section);
    setError(null);
    try {
      onChange(await questionReviewService.expandDeep(questionId, section));
    } catch (e) {
      setError({
        section,
        message: e instanceof Error ? e.message : 'Could not go deeper. Try again.',
      });
    } finally {
      setExpanding(null);
    }
  };

  return (
    <div className="qr-sheet-body">
      <div className="qr-read">
        {item.sections.map((s, i) => {
          const depth = Math.max(1, Math.min(MAX_DEEP_DEPTH, s.depth || 1));
          return (
            <section key={i} className="qr-section" aria-labelledby={`qr-deep-${i}`}>
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                <h3 id={`qr-deep-${i}`} className="ds-h2">
                  {s.heading}
                </h3>
                <span
                  className="qr-depth"
                  role="img"
                  aria-label={`Depth ${depth} of ${MAX_DEEP_DEPTH}`}
                  title={`Depth ${depth} of ${MAX_DEEP_DEPTH}`}
                >
                  {Array.from({ length: MAX_DEEP_DEPTH }, (_, n) => (
                    <span key={n} data-on={n < depth} />
                  ))}
                </span>
              </div>
              <div className="qr-prose mt-3">
                <RichText text={s.body} />
              </div>
              {depth < MAX_DEEP_DEPTH && (
                <button
                  type="button"
                  onClick={() => void goDeeper(i)}
                  disabled={expanding !== null}
                  className="ds-btn ds-btn-soft ds-tone-indigo ds-btn-sm mt-4"
                >
                  {expanding === i ? (
                    <span
                      className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent"
                      aria-hidden="true"
                    />
                  ) : (
                    <Icon name="ArrowDownCircleIcon" size={16} />
                  )}
                  {expanding === i ? 'Going deeper…' : 'Go deeper'}
                </button>
              )}
              {error?.section === i && (
                <div className="mt-3">
                  <ErrorBanner message={error.message} onRetry={() => void goDeeper(i)} />
                </div>
              )}
            </section>
          );
        })}

        {item.further.length > 0 && (
          <section className="qr-section" aria-labelledby="qr-deep-next">
            <h3 id="qr-deep-next" className="ds-h3">
              Explore next
            </h3>
            <ul className="qr-further mt-3 flex flex-wrap gap-2">
              {item.further.map((f, i) => (
                <li key={i} className="ds-chip ds-tone-neutral">
                  <span className="min-w-0">{f}</span>
                  <button
                    type="button"
                    onClick={() => onAddTodo(f)}
                    aria-label={`Add to To-Do: ${f}`}
                    title="Add to To-Do"
                    className="qr-chip-add"
                  >
                    <Icon name="PlusIcon" size={14} />
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </div>
  );
}

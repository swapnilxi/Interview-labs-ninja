'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import ConfirmHost from '@/components/ui/ConfirmHost';
import ToastHost from '@/components/ui/ToastHost';
import { apiFetch } from '@/lib/http/apiClient';
import { buildUrl, useUrlState } from '@/lib/navigation/urlState';
import { confirmDialog } from '@/lib/ui/confirm';
import { toast } from '@/lib/ui/toast';
import { labConfig, type GuidedLab, type GuidedLabConfig } from './labs';
import Dashboard from './Dashboard';
import PageHead, { TopBar, useInView } from './PageHead';
import PathView from './PathView';
import { getPrefs, setPref, usePrefs } from './prefs';
import type { PathCtx } from './QuestionRow';
import Rewards from './Rewards';
import { AchievementsSheet, PrefsSheet, ShortcutsSheet } from './Sheets';
import StartScreen from './StartScreen';
import {
  childrenOf,
  isDone,
  isUnlocked,
  nextQuestionId,
  overall,
  progressOf,
  questionOrder,
} from './tree';
import { useGuided } from './useGuided';
import Workspace from './Workspace';
import { achievementStatuses } from './xp';
import type { TopicRef } from './types';

type Sheet = 'prefs' | 'badges' | 'keys' | null;

/** What the page needs to know of a lab's topic (the DSA and CV topic types both have it). */
export interface GuidedTopicLike {
  id: string;
  name: string;
  brief: string;
  category: string;
  difficulty: string;
  subtopics: { id: string; name: string; brief: string }[];
}

/** Finds the topic (and subtopic) the URL names, from the same list the lab uses (the built-in list when the server has none). */
function useTopicRef(
  cfg: GuidedLabConfig,
  fallback: readonly GuidedTopicLike[],
  topicId: string,
  subId: string
): { status: 'loading' | 'ready' | 'missing'; topic: TopicRef | null } {
  const [res, setRes] = useState<{
    status: 'loading' | 'ready' | 'missing';
    topic: TopicRef | null;
  }>({ status: 'loading', topic: null });
  useEffect(() => {
    if (!topicId) {
      setRes({ status: 'missing', topic: null });
      return;
    }
    let live = true;
    setRes({ status: 'loading', topic: null });
    (async () => {
      let topics: readonly GuidedTopicLike[] = [];
      try {
        const r = await apiFetch(cfg.topicsApi);
        if (r.ok) topics = await r.json();
      } catch {
        /* fall back to the built-in topics, as the lab does */
      }
      if (!Array.isArray(topics) || !topics.length) topics = fallback;
      if (!live) return;
      const t = topics.find((x) => x.id === topicId);
      const sub = t && subId ? t.subtopics.find((s) => s.id === subId) : undefined;
      if (!t || (subId && !sub)) {
        setRes({ status: 'missing', topic: null });
        return;
      }
      setRes({
        status: 'ready',
        topic: {
          lab: cfg.lab,
          id: t.id,
          subId: sub?.id ?? '',
          name: t.name,
          brief: t.brief,
          category: t.category,
          difficulty: t.difficulty,
          subName: sub?.name ?? '',
          subBrief: sub?.brief ?? '',
        },
      });
    })();
    return () => {
      live = false;
    };
  }, [cfg, fallback, topicId, subId]);
  return res;
}

function PageSkeleton() {
  return (
    <div role="status" aria-label="Loading" className="mt-[1.5rem] space-y-3">
      <div className="gp-skeleton h-[13rem] rounded-[16px]" />
      <div className="gp-skeleton h-[6rem] rounded-[16px]" />
      <div className="gp-skeleton h-[18rem] rounded-[16px]" />
    </div>
  );
}

function Notice({
  title,
  children,
  actions,
}: {
  title: string;
  children?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <section className="gp-card gp-enter mx-auto mt-8 max-w-xl p-5 sm:p-[2rem]" role="alert">
      <h2 className="text-lg font-semibold tracking-tight text-foreground">{title}</h2>
      {children && (
        <div className="mt-2 text-sm leading-relaxed text-muted-foreground">{children}</div>
      )}
      {actions && <div className="mt-5 flex flex-wrap gap-2">{actions}</div>}
    </section>
  );
}

/**
 * The Guided Practice page of one lab topic (`/dsa-lab/guided-practice?topic=<id>[&sub=<id>]`, `/cv-lab/guided-practice?...`),
 * opened from the topic page's Guided Practice card. The open question is in the URL (`&q=`), so on a phone the list and the
 * workspace are two screens and Back goes from one to the other; on a desktop both are on screen, and the path stays in view
 * beside the workspace. `fallbackTopics` are the lab's built-in topics, used when the server has none.
 */
export default function GuidedPracticePage({
  lab,
  fallbackTopics,
}: {
  lab: GuidedLab;
  fallbackTopics: readonly GuidedTopicLike[];
}) {
  const cfg = labConfig(lab);
  const router = useRouter();
  const { get, update } = useUrlState();
  const topicId = get('topic') ?? '';
  const subId = get('sub') ?? '';
  const qParam = get('q');
  const res = useTopicRef(cfg, fallbackTopics, topicId, subId);
  const guided = useGuided(res.topic);
  const prefs = usePrefs();
  const { state, actions } = guided;

  const [sheet, setSheet] = useState<Sheet>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const titleInView = useInView(titleRef);
  const workspaceRef = useRef<HTMLDivElement>(null);
  const pushed = useRef(false);

  // Back to the topic page, keeping the lab view the topic was opened from (the week plan or its organizer).
  const weekView = get('view') === 'week';
  const backHref = buildUrl(cfg.labPath, '', {
    topic: topicId,
    sub: subId || null,
    view: weekView ? 'week' : null,
    organize: weekView && get('organize') === '1' ? '1' : null,
  });

  // ── Which question is open ────────────────────────────────────────────────
  const reachable = (id: string | null | undefined): id is string =>
    !!state && !!id && !!state.questions[id] && isUnlocked(state, id);
  const selectedId = reachable(qParam)
    ? qParam
    : reachable(state?.ui.questionId)
      ? (state?.ui.questionId ?? null)
      : null;
  const focused = prefs.focus && !!selectedId;
  const workspaceShown = !!qParam || focused;

  // A link with ?q= restores that question as the learner's last one.
  useEffect(() => {
    if (reachable(qParam) && state && state.ui.questionId !== qParam) actions.select(qParam);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qParam, !!state]);

  useEffect(() => {
    if (!qParam) pushed.current = false;
  }, [qParam]);

  const handleSelect = useCallback(
    (id: string) => {
      actions.select(id);
      update({ q: id }, qParam ? 'replace' : 'push');
      if (!qParam) pushed.current = true;
      requestAnimationFrame(() => {
        const el = workspaceRef.current;
        if (!el) return;
        const top = el.getBoundingClientRect().top;
        if (top < 70 || top > window.innerHeight * 0.7)
          window.scrollTo({ top: window.scrollY + top - 112, behavior: 'auto' });
      });
    },
    [actions, update, qParam]
  );

  const backToPath = () => {
    if (pushed.current) {
      pushed.current = false;
      router.back();
    } else update({ q: null }, 'replace');
  };

  // ── Starting over ─────────────────────────────────────────────────────────
  const startOver = useCallback(async () => {
    const ok = await confirmDialog({
      title: 'Start this path over?',
      message: `Your path, progress, XP and answers for this ${cfg.noun} are deleted. This cannot be undone.`,
      confirmLabel: 'Start over',
      tone: 'danger',
    });
    if (!ok) return;
    try {
      await guided.reset();
      update({ q: null }, 'replace');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not start over. Try again.');
    }
  }, [guided, update, cfg.noun]);

  // ── Keyboard ──────────────────────────────────────────────────────────────
  const latest = useRef({ state, selectedId, actions, handleSelect });
  latest.current = { state, selectedId, actions, handleSelect };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey || e.isComposing) return;
      const target = e.target as HTMLElement | null;
      if (target?.closest('input, textarea, select, [contenteditable="true"]')) return;
      if (document.querySelector('[data-modal-root][data-state="open"]')) return;
      const { state: s, selectedId: sel, actions: a, handleSelect: select } = latest.current;
      if (!s) return;
      if (e.key === '?') {
        e.preventDefault();
        setSheet('keys');
        return;
      }
      const key = e.key.toLowerCase();
      if (key === 'f' && sel) {
        e.preventDefault();
        setPref('focus', !getPrefs().focus);
        return;
      }
      if (key === 'j' || key === 'k') {
        const order = questionOrder(s).filter((id) => isUnlocked(s, id));
        if (!order.length) return;
        const at = sel ? order.indexOf(sel) : -1;
        const next =
          key === 'j' ? order[Math.min(order.length - 1, at + 1)] : order[Math.max(0, at - 1)];
        if (next && next !== sel) {
          e.preventDefault();
          select(next);
        }
        return;
      }
      if (!sel) return;
      const progress = progressOf(s, sel);
      if (key === 't') a.setMode(sel, progress.mode === 'tutor' ? null : 'tutor');
      else if (key === 's') a.setMode(sel, progress.mode === 'star' ? null : 'star');
      else if (key === 'r') {
        if (s.questions[sel]?.content?.exercise) void a.test(sel);
      } else if (key === 'b' || key === 'd') {
        const kind = key === 'b' ? 'breakdown' : 'deeper';
        const flag = `${key === 'b' ? 'bd' : 'dp'}:${sel}`;
        if (!childrenOf(s, sel, kind).length) void (key === 'b' ? a.breakdown(sel) : a.dive(sel));
        else a.setOpen(flag, !(s.ui.open[flag] ?? true));
      } else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // ── Rendering ─────────────────────────────────────────────────────────────
  const topic = res.topic;
  const percent = state ? overall(state).percent : null;
  const badges = state
    ? (() => {
        const all = achievementStatuses(state);
        return { earned: all.filter((b) => b.earnedAt).length, total: all.length };
      })()
    : null;
  const ctx: PathCtx | null = state ? { state, guided, selectedId, onSelect: handleSelect } : null;
  const resumeId = state
    ? reachable(state.ui.questionId) && !isDone(state, state.ui.questionId)
      ? state.ui.questionId
      : nextQuestionId(state, state.ui.questionId ?? '')
    : null;

  return (
    <div className="gp-accent gp-page lab-page dsa-type">
      {topic && (
        <TopBar
          visible={!titleInView}
          topic={topic}
          backHref={backHref}
          percent={percent}
          saveStatus={guided.saveStatus}
        />
      )}

      <div className="mx-auto w-full max-w-[1280px] px-4 pb-16 sm:px-8">
        {res.status === 'loading' && <PageSkeleton />}

        {res.status === 'missing' && (
          <Notice
            title={`We could not find that ${cfg.noun}`}
            actions={
              <Link href={cfg.labPath} className="todo-btn todo-btn-primary">
                Back to the {cfg.labName}
              </Link>
            }
          >
            The link may be old, or the topic was removed.
          </Notice>
        )}

        {res.status === 'ready' && topic && (
          <>
            <PageHead
              topic={topic}
              backHref={backHref}
              percent={percent}
              titleRef={titleRef}
              game={prefs.game}
              badges={badges}
              focus={focused}
              saveStatus={guided.saveStatus}
              onRetrySave={guided.retrySave}
              onAchievements={() => setSheet('badges')}
              onPrefs={() => setSheet('prefs')}
              onShortcuts={() => setSheet('keys')}
              onFocus={() => setPref('focus', !prefs.focus)}
            />

            <div className="mt-[1.5rem] space-y-[1.5rem] sm:mt-8 sm:space-y-8">
              {guided.status === 'loading' && <PageSkeleton />}

              {guided.status === 'error' && (
                <Notice
                  title="Could not load your progress"
                  actions={
                    <button
                      type="button"
                      onClick={() => void guided.reload()}
                      className="todo-btn todo-btn-primary"
                    >
                      Try again
                    </button>
                  }
                >
                  {guided.error}
                </Notice>
              )}

              {guided.status === 'unreadable' && (
                <Notice
                  title="Your saved progress could not be read"
                  actions={
                    <>
                      <button
                        type="button"
                        onClick={() => void guided.reload()}
                        className="todo-btn todo-btn-secondary"
                      >
                        Try again
                      </button>
                      <button
                        type="button"
                        onClick={() => void startOver()}
                        className="todo-btn todo-btn-ghost text-error"
                      >
                        Start over
                      </button>
                    </>
                  }
                >
                  Nothing was changed. You can try again, or start this path over (that deletes what
                  was saved).
                </Notice>
              )}

              {guided.status === 'empty' && (
                <StartScreen
                  topic={topic}
                  busy={!!guided.busy.outline}
                  stage={guided.stage}
                  error={guided.errors.outline}
                  onGenerate={(focus) => void actions.generatePath(focus)}
                  onImport={(path, focus) => actions.importPath(path, focus)}
                  onClearError={() => actions.clearError('outline')}
                />
              )}

              {(guided.status === 'ready' || guided.status === 'conflict') && state && ctx && (
                <>
                  {guided.status === 'conflict' && (
                    <div role="alert" className="gp-card flex flex-wrap items-center gap-3 p-4">
                      <p className="min-w-0 flex-1 text-sm leading-snug text-foreground">
                        Your progress changed in another tab or on another device, so saving is
                        paused here. Reload to continue from the latest.
                      </p>
                      <button
                        type="button"
                        onClick={() => void guided.reload()}
                        className="todo-btn todo-btn-primary"
                      >
                        Reload
                      </button>
                    </div>
                  )}

                  {!focused && (
                    <Dashboard
                      state={state}
                      prefs={prefs}
                      resumeId={resumeId}
                      onResume={handleSelect}
                    />
                  )}

                  <div className="gp-grid" data-focus={focused}>
                    <aside
                      aria-label="Path"
                      className={`gp-path ${focused ? 'hidden' : qParam ? 'hidden lg:block' : ''}`}
                    >
                      <PathView ctx={ctx} />
                    </aside>

                    <div
                      ref={workspaceRef}
                      className={`min-w-0 scroll-mt-[8rem] ${workspaceShown ? '' : 'hidden lg:block'}`}
                    >
                      {selectedId ? (
                        <Workspace
                          ctx={ctx}
                          id={selectedId}
                          onBackToPath={focused ? () => setPref('focus', false) : backToPath}
                        />
                      ) : (
                        <section className="gp-card p-5 text-center sm:p-[2rem]">
                          <h2 className="text-base font-semibold text-foreground">
                            Pick a question
                          </h2>
                          <p className="mx-auto mt-1 max-w-sm text-sm leading-relaxed text-muted-foreground">
                            Choose one from the path. Its lesson, {cfg.exerciseLabel}, tutor and
                            answer open here.
                          </p>
                        </section>
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>
          </>
        )}
      </div>

      <Rewards events={guided.events} onDismiss={guided.dismissEvent} />
      <ToastHost />
      <ConfirmHost panelClassName="dsa-type" />
      <PrefsSheet
        open={sheet === 'prefs'}
        onClose={() => setSheet(null)}
        onStartOver={() => void startOver()}
      />
      <ShortcutsSheet open={sheet === 'keys'} onClose={() => setSheet(null)} />
      {state && (
        <AchievementsSheet open={sheet === 'badges'} onClose={() => setSheet(null)} state={state} />
      )}
    </div>
  );
}

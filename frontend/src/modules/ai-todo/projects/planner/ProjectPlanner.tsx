'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Icon from '@/components/ui/AppIcon';
import { openLoginModal } from '@/components/auth/LoginModal';
import { useAuth } from '@/contexts/AuthContext';
import { useUrlState } from '@/lib/navigation/urlState';
import { confirmDialog } from '@/lib/ui/confirm';
import { toast } from '@/lib/ui/toast';
import type { Project } from '@/lib/services/projectService';
import {
  PLAN_STEPS,
  emptyPlannerState,
  projectPlannerService,
  type PlanStep,
  type PlannerState,
} from '@/lib/services/projectPlannerService';
import { SaveIndicator, useSaveStatus } from '../../shared/useSaveStatus';
import { planUrls } from '../projectUrls';
import BriefStep, { materialLength } from './BriefStep';
import QuestionsStep from './QuestionsStep';
import TimelineStep from './TimelineStep';
import PlanView from './PlanView';
import PlanChat from './PlanChat';
import { daysBetween, endFromDuration, todayLocal } from './plannerDates';
import { planToMarkdown } from './planToMarkdown';
import type { PlannerBusy } from './types';

const SAVE_DELAY_MS = 900;

const STEP_LABELS: Record<PlanStep, string> = {
  brief: 'Brief',
  questions: 'Questions',
  timeline: 'Timeline',
  plan: 'Plan',
};

interface ProjectPlannerProps {
  project: Project;
  model: 'ollama' | 'gemini';
}

function errorText(err: unknown, fallback: string): string {
  return err instanceof Error && err.message ? err.message : fallback;
}

export default function ProjectPlanner({ project, model }: ProjectPlannerProps) {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const { get, update } = useUrlState();
  const saveStatus = useSaveStatus();
  const runSave = saveStatus.run;

  const [state, setState] = useState<PlannerState>(emptyPlannerState);
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [loadError, setLoadError] = useState('');
  const [busy, setBusy] = useState<PlannerBusy>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // The latest state, readable from async code that started before the last render.
  const stateRef = useRef(state);
  const dirty = useRef(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Saves go one after another, each sending the latest state when its turn comes, so an older save can't land last.
  const saveChain = useRef<Promise<unknown>>(Promise.resolve());
  const chatRef = useRef<HTMLElement>(null);
  const mounted = useRef(true);
  const projectId = project.id;

  // ── Saving ────────────────────────────────────────────────────────────────

  const flush = useCallback(
    (keepalive = false) => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = null;
      if (!dirty.current) return;
      dirty.current = false;
      void runSave('planner', () => {
        // Leaving the page: send right now, a queued save might never get its turn.
        if (keepalive) return projectPlannerService.save(projectId, stateRef.current, true);
        const turn = saveChain.current.then(() => projectPlannerService.save(projectId, stateRef.current));
        saveChain.current = turn;
        return turn;
      });
    },
    [projectId, runSave]
  );

  /**
   * Keep `next` as the workspace and save it. What the user types is saved a moment after they stop (`immediate`
   * off); what the AI returns is saved at once: it can take a minute to produce and must not be lost to a reload
   * or a closed tab in the second after it appears.
   */
  const commit = useCallback(
    (next: PlannerState, immediate = false) => {
      stateRef.current = next;
      setState(next);
      dirty.current = true;
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = null;
      if (immediate) flush();
      else saveTimer.current = setTimeout(flush, SAVE_DELAY_MS);
    },
    [flush]
  );

  const patch = useCallback(
    (changes: Partial<PlannerState>, immediate = false) => commit({ ...stateRef.current, ...changes }, immediate),
    [commit]
  );

  // Leaving (another section, another project, the tab going to the background) saves what is still waiting.
  useEffect(() => {
    mounted.current = true;
    const onHide = () => {
      if (document.visibilityState === 'hidden') flush(true);
    };
    document.addEventListener('visibilitychange', onHide);
    return () => {
      mounted.current = false;
      document.removeEventListener('visibilitychange', onHide);
      flush();
    };
  }, [flush]);

  // ── Loading ───────────────────────────────────────────────────────────────

  const [loadAttempt, setLoadAttempt] = useState(0);
  // Keyed on the id, not the user object: a refreshed profile must not reload the planner over unsaved edits.
  const userId = user?.id;
  useEffect(() => {
    if (authLoading || userId === undefined) return;
    let cancelled = false;
    setLoadState('loading');
    projectPlannerService
      .load(projectId)
      .then((loaded) => {
        if (cancelled) return;
        stateRef.current = loaded;
        setState(loaded);
        setLoadState('ready');
      })
      .catch((err) => {
        if (cancelled) return;
        setLoadError(errorText(err, "Couldn't load the planner."));
        setLoadState('error');
      });
    return () => {
      cancelled = true;
    };
  }, [projectId, authLoading, userId, loadAttempt]);

  // ── Steps (each one has its own URL; moving between them only refines the screen, so it replaces) ──

  const rawStep = get('step');
  const step: PlanStep = PLAN_STEPS.includes(rawStep as PlanStep) ? (rawStep as PlanStep) : state.plan ? 'plan' : 'brief';

  const goStep = useCallback(
    (next: PlanStep) => {
      // An AI call that finishes after the user left must not pull them back to the planner (its result is still saved).
      if (!mounted.current) return;
      setError(null);
      setNotice(null);
      update({ step: next }, 'replace');
    },
    [update]
  );

  // ── AI actions ────────────────────────────────────────────────────────────

  const runQuestions = async (thenGo: boolean) => {
    setBusy('questions');
    setError(null);
    setNotice(null);
    try {
      const result = await projectPlannerService.askQuestions(projectId, stateRef.current, model);
      const current = stateRef.current;
      commit(
        {
          ...current,
          questions: [...current.questions, ...result.questions],
          questions_ready: result.questions.length === 0 || result.ready,
          questions_note: result.note || current.questions_note,
        },
        true
      );
      if (!result.questions.length && !thenGo) setNotice('The AI has no more questions. You can continue to the timeline.');
      if (thenGo) goStep('questions');
    } catch (err) {
      setError(errorText(err, "Couldn't get questions from the AI."));
    } finally {
      setBusy(null);
    }
  };

  const runCheck = async () => {
    const current = stateRef.current;
    if (daysBetween(current.start_date, current.end_date) < 1) return;
    setBusy('feasibility');
    setError(null);
    try {
      const feasibility = await projectPlannerService.checkTimeline(projectId, current, model);
      patch({ feasibility }, true);
    } catch (err) {
      setError(errorText(err, "Couldn't check the timeline."));
    } finally {
      setBusy(null);
    }
  };

  const runGenerate = async () => {
    const before = stateRef.current;
    if (daysBetween(before.start_date, before.end_date) < 1) return;
    if (before.plan) {
      const ok = await confirmDialog({
        title: 'Write a new plan?',
        message: 'The current plan, and any changes you made to it in the chat, will be replaced.',
        confirmLabel: 'Write new plan',
      });
      if (!ok) return;
    }
    setBusy('generate');
    setError(null);
    try {
      const plan = await projectPlannerService.generate(projectId, stateRef.current, model);
      const current = stateRef.current;
      commit(
        {
          ...current,
          plan,
          plan_for: { start_date: current.start_date, end_date: current.end_date },
          chat: [],
          applied_at: null,
          feasibility: null,
        },
        true
      );
      goStep('plan');
      // The AI also judges the finished plan against the timeline, so the verdict covers the real work.
      setBusy('feasibility');
      try {
        patch({ feasibility: await projectPlannerService.checkTimeline(projectId, stateRef.current, model) }, true);
      } catch (err) {
        setError(errorText(err, "The plan is ready, but the timeline check failed."));
      }
    } catch (err) {
      setError(errorText(err, "Couldn't write the plan."));
    } finally {
      setBusy(null);
    }
  };

  const sendChat = async (message: string): Promise<boolean> => {
    if (!stateRef.current.plan) return false;
    setBusy('refine');
    setError(null);
    try {
      const before = stateRef.current;
      const { reply, plan } = await projectPlannerService.refine(projectId, before, message, model);
      const current = stateRef.current;
      commit(
        {
          ...current,
          chat: [...current.chat, { role: 'user' as const, content: message }, { role: 'assistant' as const, content: reply }].slice(-60),
          ...(plan
            ? { plan, plan_for: { start_date: current.start_date, end_date: current.end_date }, feasibility: null, applied_at: null }
            : {}),
        },
        true
      );
      return true;
    } catch (err) {
      setError(errorText(err, "The AI couldn't answer that."));
      return false;
    } finally {
      setBusy(null);
    }
  };

  const applyPlan = async () => {
    const current = stateRef.current;
    if (!current.plan) return;
    if (current.applied_at) {
      const again = await confirmDialog({
        title: 'Add the plan again?',
        message: 'These phases and tasks are already in the project. Adding them again creates a second copy.',
        confirmLabel: 'Add again',
      });
      if (!again) return;
    }
    setBusy('apply');
    setError(null);
    try {
      const created = await projectPlannerService.applyToProject(projectId, current.plan);
      patch({ applied_at: new Date().toISOString() }, true);
      toast.success(`Added ${created.phases} ${created.phases === 1 ? 'phase' : 'phases'} and ${created.nodes - created.phases} tasks to the project.`, {
        action: { label: 'Open Explorer', onClick: () => router.push(planUrls.project(projectId)) },
      });
    } catch (err) {
      setError(errorText(err, "Couldn't add the plan to the project."));
    } finally {
      setBusy(null);
    }
  };

  const copyPlan = async () => {
    try {
      await navigator.clipboard.writeText(planToMarkdown(project.title, stateRef.current));
      toast.success('Plan copied as Markdown.');
    } catch {
      toast.error("Couldn't copy to the clipboard. Your browser blocked it.");
    }
  };

  const useSuggestion = (value: number, unit: 'weeks' | 'months') => {
    const from = stateRef.current.start_date || todayLocal();
    patch({ start_date: from, end_date: endFromDuration(from, value, unit), unit });
  };

  // ── Render ────────────────────────────────────────────────────────────────

  if (authLoading || (user && loadState === 'loading')) {
    return (
      <div className="flex items-center justify-center py-[4rem]" role="status" aria-label="Loading the planner">
        <span className="h-[1.5rem] w-[1.5rem] animate-spin rounded-full border-2 border-t-primary mix-border-primary/20" />
      </div>
    );
  }

  if (!user) {
    return (
      <section className="todo-glass mx-auto flex max-w-xl flex-col items-center gap-4 px-[1.5rem] py-[2.5rem] text-center">
        <span className="todo-icon-chip h-[3.5rem] w-[3.5rem]">
          <Icon name="SparklesIcon" size={26} />
        </span>
        <div>
          <h3 className="font-heading text-base font-semibold text-foreground">Sign in to use the AI Planner</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            The planner reads your requirements, asks questions and writes a plan with you. It uses AI, so it needs an account. Your project and its tasks
            stay available without one.
          </p>
        </div>
        <button
          type="button"
          onClick={() => openLoginModal({ feature: 'AI Planner', redirectTo: `${window.location.pathname}${window.location.search}` })}
          className="todo-btn todo-btn-primary px-4 py-2"
        >
          Sign in
        </button>
      </section>
    );
  }

  if (loadState === 'error') {
    return (
      <div role="alert" className="todo-alert todo-alert-error">
        <Icon name="ExclamationTriangleIcon" size={14} className="mt-px shrink-0" />
        <p className="flex-1 leading-relaxed">{loadError}</p>
        <button type="button" onClick={() => setLoadAttempt((n) => n + 1)} className="todo-focus rounded font-semibold underline">
          Try again
        </button>
      </div>
    );
  }

  const done: Record<PlanStep, boolean> = {
    brief: materialLength(state) > 0,
    questions: state.questions.some((q) => q.answer.trim()),
    timeline: daysBetween(state.start_date, state.end_date) > 0,
    plan: !!state.plan,
  };

  return (
    <div className="flex flex-col gap-[1rem]">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <nav aria-label="Planner steps" className="todo-segmented">
          {PLAN_STEPS.map((s, index) => (
            <button
              key={s}
              type="button"
              onClick={() => goStep(s)}
              aria-pressed={step === s}
              className="todo-segment gap-2 px-3 py-2 text-sm font-semibold"
            >
              <span
                className={`flex h-[1.25rem] w-[1.25rem] items-center justify-center rounded-full text-xs font-bold ${
                  done[s] && step !== s ? 'bg-emerald-500 text-white' : 'bg-muted text-muted-foreground'
                }`}
                aria-hidden="true"
              >
                {done[s] && step !== s ? <Icon name="CheckIcon" size={11} /> : index + 1}
              </span>
              {STEP_LABELS[s]}
              {done[s] && <span className="sr-only"> (done)</span>}
            </button>
          ))}
        </nav>
        <SaveIndicator state={saveStatus.state} canRetry={saveStatus.canRetry} onRetry={saveStatus.retry} />
      </div>

      {error && (
        <div role="alert" className="todo-alert todo-alert-error">
          <Icon name="ExclamationTriangleIcon" size={14} className="mt-px shrink-0" />
          <p className="flex-1 leading-relaxed">{error}</p>
          <button type="button" onClick={() => setError(null)} className="todo-focus rounded" aria-label="Dismiss">
            <Icon name="XMarkIcon" size={12} />
          </button>
        </div>
      )}
      {notice && (
        <div role="status" className="todo-alert todo-alert-info">
          <Icon name="InformationCircleIcon" size={14} className="mt-px shrink-0" />
          <p className="flex-1 leading-relaxed">{notice}</p>
          <button type="button" onClick={() => setNotice(null)} className="todo-focus rounded" aria-label="Dismiss">
            <Icon name="XMarkIcon" size={12} />
          </button>
        </div>
      )}

      {step === 'brief' && (
        <BriefStep
          state={state}
          projectDescription={project.description}
          busy={busy === 'questions'}
          onChange={patch}
          onAskQuestions={() => void runQuestions(true)}
          onSkip={() => goStep('timeline')}
        />
      )}

      {step === 'questions' && (
        <QuestionsStep
          state={state}
          busy={busy === 'questions'}
          onAnswer={(id, answer) => patch({ questions: stateRef.current.questions.map((q) => (q.id === id ? { ...q, answer } : q)) })}
          onAskMore={() => void runQuestions(false)}
          onContinue={() => goStep('timeline')}
        />
      )}

      {step === 'timeline' && (
        <TimelineStep
          state={state}
          busy={busy}
          onChange={patch}
          onCheck={() => void runCheck()}
          onGenerate={() => void runGenerate()}
          onOpenPlan={() => goStep('plan')}
        />
      )}

      {step === 'plan' &&
        (state.plan ? (
          <div className="flex flex-col gap-[1rem]">
            <button
              type="button"
              onClick={() => chatRef.current?.scrollIntoView({ block: 'start' })}
              className="todo-btn todo-btn-quiet self-start lg:hidden"
            >
              <Icon name="SparklesIcon" size={14} variant="solid" className="text-primary" /> Plan with AI
            </button>
            <div className="grid grid-cols-1 items-start gap-[1rem] lg:grid-cols-[minmax(0,1fr)_21rem]">
              <PlanView
                state={state}
                busy={busy}
                appliedLabel={state.applied_at ? 'Added to project' : null}
                onCheck={() => void runCheck()}
                onApply={() => void applyPlan()}
                onCopy={() => void copyPlan()}
                onEditTimeline={() => goStep('timeline')}
                onUseSuggestion={useSuggestion}
              />
              <PlanChat ref={chatRef} chat={state.chat} busy={busy === 'refine'} onSend={sendChat} />
            </div>
          </div>
        ) : (
          <section className="todo-glass flex flex-col items-center gap-4 px-[1.5rem] py-[2.5rem] text-center">
            <span className="todo-icon-chip h-[3.5rem] w-[3.5rem]">
              <Icon name="MapIcon" size={26} />
            </span>
            <div>
              <h3 className="font-heading text-base font-semibold text-foreground">No plan yet</h3>
              <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
                {done.timeline
                  ? 'Your timeline is set. The AI is ready to write the plan.'
                  : 'Choose a start and an end date first. The AI writes the plan to fit them.'}
              </p>
            </div>
            <button type="button" onClick={() => goStep('timeline')} className="todo-btn todo-btn-primary px-4 py-2">
              {done.timeline ? 'Go to timeline' : 'Choose a timeline'}
            </button>
          </section>
        ))}
    </div>
  );
}

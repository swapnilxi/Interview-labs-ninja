'use client';

/**
 * Everything the Guided Practice page does: it composes the store (load, save) with the AI-driven actions (the path, a
 * lesson, Breakdown, Dive Deeper, the AI Tutor, the STAR answer), the in-browser test runs and the plain progress actions.
 *
 * Every generation is keyed (`outline`, `lesson:<q>`, `bd:<q>`, `dp:<q>`, `tutor:<q>`, `star:<q>`, `run:<q>`) so the page can
 * show a spinner on exactly the control that was pressed, ignore a second press while it runs, and show its error where it
 * happened. Results are applied with `store.mutate`, i.e. to the learner's progress as it is when the answer arrives.
 */

import { useCallback, useMemo, useRef, useState } from 'react';
import { MAX_GENERATED_PHASES, PHASE_COUNT } from './constants';
import type { ImportedPath } from './importPath';
import { baseFields, pathTitles, questionFields, siblingTitles } from './context';
import {
  AiParseError,
  cleanMarkdown,
  normTitle,
  parseBranch,
  parseLesson,
  parseOutline,
  parsePhase,
  splitTutorReply,
} from './parse';
import { labConfig } from './labs';
import { runTests, summarize, verifyExercise, type RunResult } from './runner';
import { aiBreakdown, aiDeeper, aiLesson, aiOutline, aiPhase, aiStar, aiTutor } from './service';
import {
  appendPhases,
  applyBranch,
  applyPhase,
  canGrow,
  childrenOf,
  createPlannedState,
  createState,
  descendantsOf,
  hasProgress,
  isDone,
  knownTitles,
  nowIso,
  patchProgress,
  progressOf,
  setLesson,
  type BranchKind,
} from './tree';
import { completeQuestion, evaluateAchievements, recordRun, uncompleteQuestion } from './xp';
import { useGuidedStore } from './useGuidedStore';
import type {
  GuidedState,
  LearnMode,
  ParsedOutline,
  ParsedPhase,
  Question,
  StarVersion,
  TopicRef,
  TutorMessage,
} from './types';

export type TutorAction =
  'start' | 'ask' | 'hint' | 'example' | 'simplify' | 'exercise' | 'test' | 'mistake' | 'star';
export type StarVariant = 'generate' | 'simplify' | 'example';

/** What the learner sees in the thread for a quick action. */
export const TUTOR_ACTION_LABELS: Record<Exclude<TutorAction, 'start' | 'ask'>, string> = {
  hint: 'Give me a hint',
  example: 'Explain with an example',
  simplify: 'Simplify this concept',
  exercise: 'Give me a coding exercise',
  test: 'Test my understanding',
  mistake: 'Explain my mistake',
  star: 'Help me understand this answer',
};

const clip = (v: string | null | undefined, max: number) => (v ?? '').slice(0, max);
let idSeq = 0;
const uid = (prefix: string) => `${prefix}${Date.now().toString(36)}${(idSeq++).toString(36)}`;

function messageOf(err: unknown): string {
  if (err instanceof AiParseError) return err.message;
  return err instanceof Error ? err.message : 'Something went wrong. Try again.';
}

/** The STAR version on show: the one the learner picked, else the latest. */
export function activeStar(state: GuidedState, id: string): StarVersion | null {
  const star = progressOf(state, id).star;
  return (
    star.versions.find((v) => v.id === star.activeId) ??
    star.versions[star.versions.length - 1] ??
    null
  );
}

/** Titles of the main questions of every phase but `exceptPhaseId`, and the boss: what a new page must not repeat. */
function otherTitles(state: GuidedState, exceptPhaseId: string | null): string[] {
  const titles: string[] = [];
  for (const phase of state.phases) {
    if (phase.id === exceptPhaseId) continue;
    for (const id of phase.questionIds)
      if (state.questions[id]) titles.push(state.questions[id].title);
  }
  if (state.bossId && state.questions[state.bossId])
    titles.push(state.questions[state.bossId].title);
  return titles;
}

interface PageRequest {
  number: number;
  /** Empty for a phase the plan does not have: the AI chooses its title and goal. */
  title: string;
  goal: string;
  plan: { title: string; goal: string }[];
  others: string[];
  /** Questions of this phase that stay (a regenerate keeps worked ones). */
  kept: string[];
  focus: string;
}

/** One page of the path: ask for the questions of one phase and read them (never repeating what the path has). */
async function requestPage(
  topic: TopicRef,
  state: GuidedState | null,
  a: PageRequest
): Promise<ParsedPhase> {
  const reply = await aiPhase({
    ...baseFields(topic, state),
    phase_number: Math.min(Math.max(a.number, 1), 50),
    phase_title: clip(a.title, 200),
    phase_goal: clip(a.goal, 500),
    outline: a.plan
      .slice(0, 12)
      .map((o) => ({ title: clip(o.title, 200) || 'Phase', goal: clip(o.goal, 500) })),
    other_titles: a.others.slice(0, 60).map((t) => clip(t, 300)),
    kept_titles: a.kept.slice(0, 8).map((t) => clip(t, 400)),
    focus: clip(a.focus, 600),
  });
  return parsePhase(reply.text, new Set([...a.others, ...a.kept].map(normTitle)));
}

export function useGuided(topic: TopicRef | null) {
  const store = useGuidedStore(topic);
  const { get, mutate, create } = store;

  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [runs, setRuns] = useState<Record<string, RunResult>>({});
  const inflight = useRef(new Set<string>());
  /** What a path being written is doing now ("Planning the path…", "Writing phase 1…"): the start screen shows it. */
  const [stage, setStage] = useState('');
  /** The plan of a path whose first page failed, so a retry does not plan again (same focus only). */
  const draft = useRef<{ focus: string; outline: ParsedOutline } | null>(null);
  /** A tutor call that failed: what to send again (the learner's message is already in the thread). */
  const failedTutor = useRef(new Map<string, { action: TutorAction; message: string }>());

  const clearError = useCallback((key: string) => {
    setErrors((e) => {
      if (!(key in e)) return e;
      const next = { ...e };
      delete next[key];
      return next;
    });
  }, []);

  /** One keyed job at a time; its busy flag and error are what the page shows. */
  const run = useCallback(
    async (key: string, job: () => Promise<void>) => {
      if (inflight.current.has(key)) return;
      inflight.current.add(key);
      setBusy((b) => ({ ...b, [key]: true }));
      clearError(key);
      try {
        await job();
      } catch (err) {
        setErrors((e) => ({ ...e, [key]: messageOf(err) }));
      } finally {
        inflight.current.delete(key);
        setBusy((b) => {
          const next = { ...b };
          delete next[key];
          return next;
        });
      }
    },
    [clearError]
  );

  // ── The path ──────────────────────────────────────────────────────────────

  /** A fresh path in two small calls: the plan, then its first page of five full questions. The other phases wait as "Generate more". */
  const writeFreshPath = useCallback(
    async (focus: string): Promise<GuidedState | null> => {
      if (!topic) return null;
      const wanted = focus.trim();
      let outline = draft.current && draft.current.focus === wanted ? draft.current.outline : null;
      try {
        if (!outline) {
          setStage('Planning the path…');
          const reply = await aiOutline({
            ...baseFields(topic, null),
            phase_count: PHASE_COUNT,
            focus: clip(wanted, 600),
          });
          outline = parseOutline(reply.text);
          draft.current = { focus: wanted, outline };
        }
        const first = outline.phases[0];
        setStage(`Writing phase 1: ${first.title}…`);
        const page = await requestPage(topic, null, {
          number: 1,
          title: first.title,
          goal: first.goal,
          plan: outline.phases,
          others: [],
          kept: [],
          focus: wanted,
        });
        draft.current = null;
        return createPlannedState(topic, outline, page, wanted);
      } finally {
        setStage('');
      }
    },
    [topic]
  );

  const generatePath = useCallback(
    (focus: string) =>
      run('outline', async () => {
        const fresh = await writeFreshPath(focus);
        if (fresh) create(fresh);
      }),
    [run, writeFreshPath, create]
  );

  /** Writes a new path over this one with the same focus. Progress on this page (XP, answers) is replaced, as with Start over. */
  const regeneratePath = useCallback(
    () =>
      run('regenerate', async () => {
        const fresh = await writeFreshPath(get()?.focus ?? '');
        if (fresh) create(fresh);
      }),
    [run, writeFreshPath, get, create]
  );

  /**
   * Writes the questions of one phase: a phase that is still planned ("Generate more"), or a written one again (Regenerate: the
   * questions the learner worked on stay, the rest are replaced).
   */
  const writePhase = useCallback(
    (phaseId: string) =>
      run(`phase:${phaseId}`, async () => {
        const s = get();
        const phase = s?.phases.find((p) => p.id === phaseId);
        if (!s || !phase || !topic) return;
        const page = await requestPage(topic, s, {
          number: phase.number,
          title: phase.title,
          goal: phase.goal,
          plan: s.phases,
          others: otherTitles(s, phase.id),
          kept: phase.questionIds
            .filter((id) => s.questions[id] && hasProgress(s, id))
            .map((id) => s.questions[id].title),
          focus: s.focus,
        });
        mutate(
          (cur) =>
            cur.phases.some((p) => p.id === phaseId) ? applyPhase(cur, phaseId, page).state : null,
          {
            immediate: true,
          }
        );
      }),
    [run, get, mutate, topic]
  );

  /** "Generate more" past the plan: the AI chooses the next phase and writes its five questions. */
  const addPhase = useCallback(
    () =>
      run('phase:new', async () => {
        const s = get();
        if (!s || !topic || s.phases.length >= MAX_GENERATED_PHASES) return;
        const number = s.phases.length + 1;
        const page = await requestPage(topic, s, {
          number,
          title: '',
          goal: '',
          plan: s.phases,
          others: otherTitles(s, null),
          kept: [],
          focus: s.focus,
        });
        mutate(
          (cur) => {
            const r = appendPhases(cur, [
              { title: page.title, goal: page.goal, questions: page.questions },
            ]);
            return r.added ? r.state : null;
          },
          { immediate: true }
        );
      }),
    [run, get, mutate, topic]
  );

  /**
   * A path pasted as JSON (importPath.ts), with no AI call. `replace` starts the page's path with it (progress is replaced, as with
   * Start over); `append` adds its phases after the last one and before the boss, keeping everything the learner has done.
   */
  const importPath = useCallback(
    (path: ImportedPath, focus: string, mode: 'replace' | 'append' = 'replace') => {
      if (!topic) return;
      if (mode === 'append') {
        mutate(
          (cur) => {
            const r = appendPhases(cur, path.curriculum.phases);
            return r.added ? r.state : null;
          },
          { immediate: true }
        );
      } else {
        create(createState(topic, path.curriculum, focus.trim()));
      }
    },
    [topic, create, mutate]
  );

  // ── Moving around ─────────────────────────────────────────────────────────

  const select = useCallback(
    (qid: string | null) => {
      mutate((cur) => {
        if (qid === cur.ui.questionId) return cur;
        const q = qid ? cur.questions[qid] : null;
        const phaseId = q && q.phaseId !== 'boss' ? q.phaseId : cur.ui.phaseId;
        return { ...cur, ui: { ...cur.ui, questionId: qid, phaseId } };
      });
    },
    [mutate]
  );

  const toggleOpen = useCallback(
    (key: string, fallback = false) => {
      mutate((cur) => ({
        ...cur,
        ui: { ...cur.ui, open: { ...cur.ui.open, [key]: !(cur.ui.open[key] ?? fallback) } },
      }));
    },
    [mutate]
  );

  const setOpen = useCallback(
    (key: string, value: boolean) => {
      mutate((cur) =>
        cur.ui.open[key] === value
          ? cur
          : { ...cur, ui: { ...cur.ui, open: { ...cur.ui.open, [key]: value } } }
      );
    },
    [mutate]
  );

  // ── A question's lesson ───────────────────────────────────────────────────

  const lesson = useCallback(
    (qid: string, force = false) =>
      run(`lesson:${qid}`, async () => {
        const s = get();
        const q = s?.questions[qid];
        if (!s || !q || !topic || (q.content && !force)) return;
        const reply = await aiLesson({
          ...baseFields(topic, s),
          ...questionFields(s, q),
          sibling_titles: siblingTitles(s, q),
        });
        const content = parseLesson(reply.text);
        mutate((cur) => (cur.questions[qid] ? setLesson(cur, qid, content) : null), {
          immediate: true,
        });
      }),
    [run, get, mutate, topic]
  );

  // ── Breakdown and Dive Deeper ─────────────────────────────────────────────

  const branch = useCallback(
    (qid: string, kind: BranchKind, regenerate = false) =>
      run(`${kind === 'breakdown' ? 'bd' : 'dp'}:${qid}`, async () => {
        const s = get();
        const q = s?.questions[qid];
        if (!s || !q || !topic) return;
        if (!canGrow(s, qid)) throw new Error('This step is already as small as it gets.');
        const kids = childrenOf(s, qid, kind);
        // A regenerate drops the children that were never worked on; a new question may reuse their wording.
        const doomed = new Set(
          regenerate
            ? kids
                .filter((k) => !hasProgress(s, k.id))
                .flatMap((k) => [k.id, ...descendantsOf(s, k.id).map((d) => d.id)])
            : []
        );
        const known = knownTitles({
          ...s,
          questions: Object.fromEntries(
            Object.entries(s.questions).filter(([id]) => !doomed.has(id))
          ),
        });
        const existing = kids.map((k) =>
          kind === 'breakdown'
            ? { title: clip(k.title, 400), completed: isDone(s, k.id) }
            : { title: clip(k.title, 400), level: k.level ?? 1, completed: isDone(s, k.id) }
        );
        const body = {
          ...baseFields(topic, s),
          ...questionFields(s, q),
          [kind === 'breakdown' ? 'existing_children' : 'existing_deeper']: existing,
          path_titles: pathTitles(s, q),
          regenerate,
        };
        const reply = await (kind === 'breakdown' ? aiBreakdown(body) : aiDeeper(body));
        const parsed = parseBranch(reply.text, kind === 'deeper', known);
        mutate(
          (cur) =>
            cur.questions[qid] ? applyBranch(cur, qid, kind, parsed, regenerate).state : null,
          { immediate: true }
        );
      }),
    [run, get, mutate, topic]
  );

  const breakdown = useCallback(
    (qid: string, regenerate = false) => branch(qid, 'breakdown', regenerate),
    [branch]
  );
  const dive = useCallback(
    (qid: string, regenerate = false) => branch(qid, 'deeper', regenerate),
    [branch]
  );

  // ── Coding ────────────────────────────────────────────────────────────────

  const setCode = useCallback(
    (qid: string, code: string) => {
      mutate((cur) => (cur.questions[qid] ? patchProgress(cur, qid, { code }) : null));
    },
    [mutate]
  );

  /** Runs the exercise's tests (checking them against the reference solution first, once). */
  const test = useCallback(
    (qid: string) =>
      run(`run:${qid}`, async () => {
        const s = get();
        const q = s?.questions[qid];
        let exercise = q?.content?.exercise;
        if (!s || !q || !q.content || !exercise) return;
        const code = progressOf(s, qid).code ?? exercise.starterCode;
        if (!exercise.verified) {
          exercise = await verifyExercise(exercise);
          const checked = exercise;
          mutate((cur) => {
            const content = cur.questions[qid]?.content;
            return content ? setLesson(cur, qid, { ...content, exercise: checked }) : null;
          });
        }
        if (!exercise.gradable) {
          throw new Error(
            'The tests of this exercise could not be checked against a reference solution, so they cannot grade your code. Work through it, then mark the question complete yourself.'
          );
        }
        const result = await runTests(code, exercise);
        setRuns((r) => ({ ...r, [qid]: result }));
        const summary = summarize(result);
        mutate((cur) => (cur.questions[qid] ? recordRun(cur, qid, summary) : null), {
          immediate: true,
        });
      }),
    [run, get, mutate]
  );

  const takeHint = useCallback(
    (qid: string) => {
      mutate((cur) => {
        const hints = cur.questions[qid]?.content?.hints ?? [];
        const used = progressOf(cur, qid).hintsUsed;
        return used >= hints.length ? null : patchProgress(cur, qid, { hintsUsed: used + 1 });
      });
    },
    [mutate]
  );

  const revealSolution = useCallback(
    (qid: string) => {
      mutate(
        (cur) => (cur.questions[qid] ? patchProgress(cur, qid, { solutionRevealed: true }) : null),
        { immediate: true }
      );
    },
    [mutate]
  );

  // ── Completing ────────────────────────────────────────────────────────────

  const complete = useCallback(
    (qid: string) => {
      mutate((cur) => completeQuestion(cur, qid, 'manual'), { immediate: true });
    },
    [mutate]
  );

  const completeViaTutor = useCallback(
    (qid: string) => {
      mutate((cur) => completeQuestion(cur, qid, 'tutor'), { immediate: true });
    },
    [mutate]
  );

  const uncomplete = useCallback(
    (qid: string) => {
      mutate((cur) => uncompleteQuestion(cur, qid), { immediate: true });
    },
    [mutate]
  );

  // ── AI Tutor ──────────────────────────────────────────────────────────────

  const tutorSend = useCallback(
    (qid: string, action: TutorAction, message = '', opts: { retry?: boolean } = {}) =>
      run(`tutor:${qid}`, async () => {
        let s = get();
        const q = s?.questions[qid];
        if (!s || !q || !topic) return;
        const text = message.trim();
        if (action === 'ask' && !text && !opts.retry) return;

        // The learner's side of the thread, shown at once (not on a retry: it is already there).
        if (!opts.retry && action !== 'start') {
          const learnerMessage: TutorMessage = {
            id: uid('m'),
            role: 'learner',
            text:
              action === 'ask'
                ? text
                : action === 'exercise'
                  ? `Give me a ${labConfig(topic.lab).exerciseLabel}`
                  : TUTOR_ACTION_LABELS[action],
            action: action === 'ask' ? undefined : action,
            at: nowIso(),
          };
          s = mutate(
            (cur) => {
              const p = progressOf(cur, qid);
              return patchProgress(cur, qid, {
                mode: 'tutor',
                tutor: { ...p.tutor, messages: [...p.tutor.messages, learnerMessage] },
              });
            },
            { immediate: true }
          );
          if (!s) return;
        } else {
          s = mutate((cur) => patchProgress(cur, qid, { mode: 'tutor' }));
          s = s ?? get();
          if (!s) return;
        }

        const p = progressOf(s, qid);
        // The thread before the message being answered (that one travels as `message`).
        const trailingLearner =
          p.tutor.messages[p.tutor.messages.length - 1]?.role === 'learner' && action !== 'start';
        const history = (trailingLearner ? p.tutor.messages.slice(0, -1) : p.tutor.messages)
          .slice(-16)
          .map((m) => ({ role: m.role, text: clip(m.text, 3000) }));
        const completedExercises = Object.values(s.questions)
          .filter((c) => progressOf(s!, c.id).codingDone)
          .slice(0, 20)
          .map((c) => clip(c.title, 300));
        const star = activeStar(s, qid);
        const body = {
          ...baseFields(topic, s),
          ...questionFields(s, q),
          explanation: clip(q.content?.explanation, 2500),
          exercise_prompt: clip(q.content?.exercise?.prompt, 1500),
          child_titles: childrenOf(s, qid, 'breakdown')
            .slice(0, 10)
            .map((c) => clip(c.title, 400)),
          completed_exercise_titles: completedExercises,
          action,
          // Only a free-text question travels as `message`; a quick action is named by `action` alone.
          message: action === 'ask' ? clip(text, 2000) : '',
          hint_level: Math.min(3, p.tutor.hintLevel + 1),
          history,
          learner_code: clip(p.code, 6000),
          test_report: clip(p.lastRun?.report, 1800),
          star_answer: action === 'star' ? clip(star?.text, 8000) : '',
          solution_revealed: p.solutionRevealed,
        };
        failedTutor.current.set(qid, { action, message: text });
        const reply = await aiTutor(body);
        failedTutor.current.delete(qid);
        const split = splitTutorReply(reply.text);
        if (!split.text) throw new Error('The tutor sent an empty reply. Try again.');
        const answer: TutorMessage = {
          id: uid('m'),
          role: 'tutor',
          text: split.text,
          verdict: split.verdict ?? undefined,
          at: nowIso(),
        };
        mutate(
          (cur) => {
            if (!cur.questions[qid]) return null;
            const now = progressOf(cur, qid);
            const next = patchProgress(cur, qid, {
              tutor: {
                messages: [...now.tutor.messages, answer],
                understood: now.tutor.understood || split.verdict === 'understood',
                hintLevel:
                  action === 'hint' ? Math.min(3, now.tutor.hintLevel + 1) : now.tutor.hintLevel,
              },
              // A hint from the tutor counts like any hint when the answer is judged independent.
              hintsUsed: action === 'hint' ? now.hintsUsed + 1 : now.hintsUsed,
            });
            return evaluateAchievements(next);
          },
          { immediate: true }
        );
      }),
    [run, get, mutate, topic]
  );

  const tutorRetry = useCallback(
    (qid: string) => {
      const failed = failedTutor.current.get(qid);
      if (failed) void tutorSend(qid, failed.action, failed.message, { retry: true });
    },
    [tutorSend]
  );

  // ── Answer in STAR ────────────────────────────────────────────────────────

  const starRun = useCallback(
    (qid: string, variant: StarVariant) =>
      run(`star:${qid}`, async () => {
        const s = get();
        const q = s?.questions[qid];
        if (!s || !q || !topic) return;
        const current = activeStar(s, qid);
        const original =
          progressOf(s, qid).star.versions.find((v) => v.variant === 'generate') ?? current;
        const reply = await aiStar({
          ...baseFields(topic, s),
          ...questionFields(s, q),
          explanation: clip(q.content?.explanation, 2500),
          exercise_prompt: clip(q.content?.exercise?.prompt, 1500),
          variant,
          existing_answer:
            variant === 'generate'
              ? ''
              : clip((variant === 'example' ? original : current)?.text, 12000),
        });
        const text = cleanMarkdown(reply.text);
        if (!text) throw new Error('The AI returned an empty answer. Try again.');
        mutate(
          (cur) => {
            if (!cur.questions[qid]) return null;
            const p = progressOf(cur, qid);
            const examples = p.star.versions.filter((v) => v.variant === 'example').length;
            const label =
              variant === 'generate'
                ? 'Answer'
                : variant === 'simplify'
                  ? 'Simplified'
                  : `Example ${examples + 1}`;
            const version: StarVersion = { id: uid('s'), variant, label, text, at: nowIso() };
            return patchProgress(cur, qid, {
              mode: 'star',
              // Reading an answer never completes a question; it only means the answer was not worked out alone.
              starViewed: p.starViewed || !p.completed,
              star: {
                versions: [...p.star.versions, version],
                activeId: version.id,
                hidden: false,
              },
            });
          },
          { immediate: true }
        );
      }),
    [run, get, mutate, topic]
  );

  const starSelect = useCallback(
    (qid: string, versionId: string) => {
      mutate((cur) => {
        const p = progressOf(cur, qid);
        return p.star.activeId === versionId
          ? null
          : patchProgress(cur, qid, { star: { ...p.star, activeId: versionId } });
      });
    },
    [mutate]
  );

  const starHide = useCallback(
    (qid: string, hidden: boolean) => {
      mutate((cur) => {
        const p = progressOf(cur, qid);
        return p.star.hidden === hidden
          ? null
          : patchProgress(cur, qid, { star: { ...p.star, hidden } });
      });
    },
    [mutate]
  );

  // ── Choosing the learning mode ────────────────────────────────────────────

  /**
   * Opens (or, pressed again, closes) the AI Tutor or the STAR panel of a question, starting it the first time: the tutor
   * opens with its first question, the STAR answer is written (that press is the learner asking for it). `autoStart: false`
   * only shows the panel, for callers that send their own first request (the tutor about a STAR answer, "explain differently").
   */
  const setMode = useCallback(
    (qid: string, mode: LearnMode | null, opts: { autoStart?: boolean } = {}) => {
      const before = get();
      if (!before?.questions[qid]) return;
      const p = progressOf(before, qid);
      mutate((cur) => patchProgress(cur, qid, { mode }), { immediate: true });
      if (opts.autoStart === false) return;
      if (mode === 'tutor' && p.tutor.messages.length === 0) void tutorSend(qid, 'start');
      if (mode === 'star' && p.star.versions.length === 0) void starRun(qid, 'generate');
      if (mode === 'star' && p.star.hidden) starHide(qid, false);
    },
    [get, mutate, tutorSend, starRun, starHide]
  );

  const actions = useMemo(
    () => ({
      generatePath,
      regeneratePath,
      writePhase,
      addPhase,
      importPath,
      select,
      toggleOpen,
      setOpen,
      lesson,
      breakdown,
      dive,
      setCode,
      test,
      takeHint,
      revealSolution,
      complete,
      completeViaTutor,
      uncomplete,
      tutorSend,
      tutorRetry,
      starRun,
      starSelect,
      starHide,
      setMode,
      clearError,
    }),
    [
      generatePath,
      regeneratePath,
      writePhase,
      addPhase,
      importPath,
      select,
      toggleOpen,
      setOpen,
      lesson,
      breakdown,
      dive,
      setCode,
      test,
      takeHint,
      revealSolution,
      complete,
      completeViaTutor,
      uncomplete,
      tutorSend,
      tutorRetry,
      starRun,
      starSelect,
      starHide,
      setMode,
      clearError,
    ]
  );

  return { ...store, busy, errors, runs, stage, actions };
}

export type Guided = ReturnType<typeof useGuided>;
export type GuidedActions = Guided['actions'];

/** Handy for the views: the question and whether it exists. */
export const questionOf = (state: GuidedState | null, id: string | null): Question | null =>
  state && id ? (state.questions[id] ?? null) : null;

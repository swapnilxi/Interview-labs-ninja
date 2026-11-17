'use client';

/**
 * Runs the learner's Python against an exercise's tests, in the browser (public/runner/python-worker.js, Pyodide).
 *
 * The AI writes an exercise's tests and a reference solution together, and an expected value it computed by hand can be
 * wrong. So the first run of an exercise (`verifyExercise`) executes the reference solution against the tests and drops
 * every test it disagrees with; only then is the learner's code graded. If too few tests survive, the exercise is
 * shown but not graded rather than failing a correct answer.
 */

import { MIN_VERIFIED_TESTS } from './constants';
import type { Exercise, RunSummary, TestCase } from './types';

export interface TestOutcome {
  index: number;
  label: string;
  passed: boolean;
  got?: string;
  expected: string;
  error?: string;
}

export interface RunResult {
  /** Why nothing could be graded (a syntax error, a missing function, the runtime not loading, a timeout). */
  error: string | null;
  timedOut: boolean;
  /** The runner itself failed (it did not load, or crashed): nothing is known about the code. */
  crashed: boolean;
  results: TestOutcome[];
  passed: number;
  total: number;
  stdout: string;
  /** How long the run took, in ms (the worker's round trip). 0 when nothing ran. */
  ms: number;
}

const WORKER_URL = '/runner/python-worker.js';
/** The runtime is a few MB the first time; a slow connection gets a minute and a half. */
const LOAD_TIMEOUT_MS = 90_000;
const RUN_TIMEOUT_MS = 8_000;

interface Pending {
  resolve: (value: unknown) => void;
  reject: (reason: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

let worker: Worker | null = null;
let nextId = 1;
const pending = new Map<number, Pending>();
let ready: Promise<void> | null = null;

function stop(reason: string) {
  worker?.terminate();
  worker = null;
  ready = null;
  for (const [id, p] of pending) {
    clearTimeout(p.timer);
    p.reject(new Error(reason));
    pending.delete(id);
  }
}

function spawn(): Worker {
  const w = new Worker(WORKER_URL);
  w.onmessage = (event: MessageEvent) => {
    const { id, type, result, message } = event.data ?? {};
    const p = pending.get(id);
    if (!p) return;
    clearTimeout(p.timer);
    pending.delete(id);
    if (type === 'error') p.reject(new Error(String(message || 'The Python runner failed.')));
    else p.resolve(result ?? true);
  };
  w.onerror = () => stop('The Python runner could not start. Check your connection and try again.');
  return w;
}

function send(message: Record<string, unknown>, timeoutMs: number): Promise<unknown> {
  if (!worker) worker = spawn();
  const w = worker;
  const id = nextId++;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => stop('timeout'), timeoutMs);
    pending.set(id, { resolve, reject, timer });
    w.postMessage({ ...message, id });
  });
}

/** Loads the runtime (once). Safe to call early, for example when the learner first focuses the editor. */
export function warmUp(): Promise<void> {
  if (!ready) {
    ready = send({ type: 'init' }, LOAD_TIMEOUT_MS).then(
      () => undefined,
      (err: Error) => {
        ready = null;
        throw err.message === 'timeout'
          ? new Error(
              'The Python runner took too long to load. Check your connection and try again.'
            )
          : err;
      }
    );
  }
  return ready;
}

async function execute(
  code: string,
  fn: string,
  tests: TestCase[],
  compare: Exercise['compare']
): Promise<RunResult> {
  try {
    await warmUp();
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : 'The Python runner could not start.',
      timedOut: false,
      crashed: true,
      results: [],
      passed: 0,
      total: tests.length,
      stdout: '',
      ms: 0,
    };
  }
  try {
    const began = performance.now();
    const raw = (await send({ type: 'run', code, fn, tests, compare }, RUN_TIMEOUT_MS)) as {
      error: string | null;
      results: TestOutcome[];
      stdout: string;
    };
    const passed = raw.results.filter((r) => r.passed).length;
    return {
      error: raw.error,
      timedOut: false,
      crashed: false,
      results: raw.results,
      passed,
      total: tests.length,
      stdout: raw.stdout ?? '',
      ms: Math.max(1, Math.round(performance.now() - began)),
    };
  } catch (err) {
    if (err instanceof Error && err.message === 'timeout') {
      return {
        error: `Time limit exceeded (${RUN_TIMEOUT_MS / 1000} s). Look for an endless loop or a very slow approach.`,
        timedOut: true,
        crashed: false,
        results: [],
        passed: 0,
        total: tests.length,
        stdout: '',
        ms: 0,
      };
    }
    return {
      error: err instanceof Error ? err.message : 'The run failed.',
      timedOut: false,
      crashed: true,
      results: [],
      passed: 0,
      total: tests.length,
      stdout: '',
      ms: 0,
    };
  }
}

/** Runs the learner's code against the exercise's tests. */
export function runTests(code: string, exercise: Exercise): Promise<RunResult> {
  return execute(code, exercise.functionName, exercise.tests, exercise.compare);
}

/**
 * Runs the reference solution against the exercise's own tests and keeps only the tests it passes. An exercise with no
 * solution, or with too few surviving tests, comes back not gradable. Run once per exercise (`verified` is saved).
 */
export async function verifyExercise(exercise: Exercise): Promise<Exercise> {
  if (exercise.verified) return exercise;
  if (!exercise.solution.trim() || exercise.tests.length === 0)
    return { ...exercise, verified: true, gradable: false };
  const res = await execute(
    exercise.solution,
    exercise.functionName,
    exercise.tests,
    exercise.compare
  );
  // The runtime failed (offline, crashed, timed out): that says nothing about the exercise, so it is not marked verified
  // and the next run tries again.
  if (res.crashed || res.timedOut) throw new Error(res.error ?? 'The Python runner failed.');
  // The reference solution does not even run: its tests cannot be trusted.
  if (res.error) return { ...exercise, verified: true, gradable: false };
  const kept = exercise.tests.filter((_, i) => res.results[i]?.passed);
  return {
    ...exercise,
    tests: kept,
    verified: true,
    droppedTests: exercise.tests.length - kept.length,
    gradable: kept.length >= MIN_VERIFIED_TESTS,
  };
}

/** A short plain-text account of a run, for the tutor ("Explain my mistake"). */
export function reportOf(res: RunResult): string {
  if (res.error) return `The run could not grade the code: ${res.error}`;
  const failed = res.results.filter((r) => !r.passed);
  if (!failed.length) return `All ${res.total} tests passed.`;
  const lines = failed
    .slice(0, 4)
    .map((r) => `- ${r.label}: ${r.error ?? `got ${r.got ?? '?'}, expected ${r.expected}`}`);
  return `${res.passed} of ${res.total} tests passed. Failing:\n${lines.join('\n')}`.slice(0, 1700);
}

export function summarize(res: RunResult): RunSummary {
  return {
    passed: res.passed,
    total: res.total,
    ok: !res.error && res.total > 0 && res.passed === res.total,
    at: new Date().toISOString(),
    report: reportOf(res),
  };
}

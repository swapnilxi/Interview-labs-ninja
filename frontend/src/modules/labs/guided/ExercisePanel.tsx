'use client';

import Icon from '@/components/ui/AppIcon';
import { confirmDialog } from '@/lib/ui/confirm';
import { toast } from '@/lib/ui/toast';
import Markdown from '@/modules/labs/common/Markdown';
import CodeEditor from './CodeEditor';
import { highlightFence } from './highlight';
import { setPref, usePrefs, type FontSize } from './prefs';
import { Switch } from './Switch';
import { InlineError, Spinner } from './ui';
import type { RunResult } from './runner';
import type { Exercise, Question, QuestionProgress, TestCase } from './types';

const SHORT = 140;
const short = (s: string) => (s.length > SHORT ? `${s.slice(0, SHORT - 1)}…` : s);
const SIZES: FontSize[] = ['s', 'm', 'l'];

/** JSON with a space after every comma and colon (outside strings), the way Python prints it, so Expected and Got line up. */
function spaced(json: string): string {
  let out = '';
  let inString = false;
  let escaped = false;
  for (const ch of json) {
    out += ch;
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
    } else if (ch === '"') inString = true;
    else if (ch === ',' || ch === ':') out += ' ';
  }
  return out;
}

function show(value: unknown): string {
  try {
    return short(spaced(JSON.stringify(value)));
  } catch {
    return short(String(value));
  }
}

function call(exercise: Exercise, test: TestCase): string {
  return `${exercise.functionName}(${test.args.map((a) => show(a)).join(', ')})`;
}

/**
 * The coding exercise: the task, the starter code in an editor, Run tests, and the test cases. Every test case is shown (a
 * learner reads them to understand the task); after a run each one says whether it passed, and a failing one shows what it
 * expected and what the code returned, line under line. The toolbar has the editor's own switches (line numbers, text size).
 */
export default function ExercisePanel({
  question,
  progress,
  exercise,
  result,
  running,
  error,
  onCode,
  onRun,
  onClearError,
}: {
  question: Question;
  progress: QuestionProgress;
  exercise: Exercise;
  /** The detail of this session's last run (the saved summary survives a refresh; the per-test detail does not). */
  result: RunResult | undefined;
  running: boolean;
  error: string | undefined;
  onCode: (code: string) => void;
  onRun: () => void;
  onClearError: () => void;
}) {
  const prefs = usePrefs();
  const code = progress.code ?? exercise.starterCode;
  const edited = code !== exercise.starterCode;
  const last = progress.lastRun;
  const size = SIZES.indexOf(prefs.fontSize);

  const reset = async () => {
    if (
      edited &&
      !(await confirmDialog({
        title: 'Reset to the starter code?',
        message: 'Your changes to this exercise are replaced.',
        confirmLabel: 'Reset',
        tone: 'danger',
      }))
    )
      return;
    onCode(exercise.starterCode);
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      toast.success('Code copied');
    } catch {
      toast.error('Could not copy. Select the code and copy it instead.');
    }
  };

  return (
    <section className="gp-card p-4 sm:p-[1.25rem]" aria-label="Coding exercise">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-foreground">Coding exercise</h3>
        {progress.codingDone ? (
          <span className="inline-flex items-center gap-1 text-xs font-medium text-success">
            <Icon name="CheckCircleIcon" variant="solid" size={14} /> All tests passed
          </span>
        ) : last ? (
          <span className="text-xs tabular-nums text-muted-foreground">
            Last run: {last.passed} of {last.total} tests passed
          </span>
        ) : null}
      </div>

      <Markdown content={exercise.prompt} highlight={highlightFence} className="text-sm" />

      <div className="mb-2 mt-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <span className="text-xs font-medium text-muted-foreground">Python 3</span>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
            Line numbers
            <Switch
              size="sm"
              checked={prefs.lineNumbers}
              onChange={(v) => setPref('lineNumbers', v)}
            />
          </label>
          <div className="hidden items-center sm:flex" role="group" aria-label="Editor text size">
            <button
              type="button"
              aria-label="Smaller text"
              disabled={size <= 0}
              onClick={() => setPref('fontSize', SIZES[size - 1])}
              className="todo-btn todo-btn-ghost h-8 px-2 text-xs"
            >
              A−
            </button>
            <button
              type="button"
              aria-label="Larger text"
              disabled={size >= SIZES.length - 1}
              onClick={() => setPref('fontSize', SIZES[size + 1])}
              className="todo-btn todo-btn-ghost h-8 px-2 text-xs"
            >
              A+
            </button>
          </div>
          <button
            type="button"
            onClick={copy}
            aria-label="Copy code"
            className="todo-btn todo-btn-ghost h-8 px-2"
          >
            <Icon name="ClipboardDocumentIcon" size={14} />
            <span className="text-xs">Copy</span>
          </button>
        </div>
      </div>

      <CodeEditor
        value={code}
        onChange={onCode}
        onRun={onRun}
        numbers={prefs.lineNumbers}
        size={prefs.fontSize}
        label={`Python code for ${question.title}`}
      />
      <p className="mt-2 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-muted-foreground">
        <kbd className="gp-key">Tab</kbd> indents <span aria-hidden="true">·</span>{' '}
        <kbd className="gp-key">Esc</kbd> then <kbd className="gp-key">Tab</kbd> leaves the editor{' '}
        <span aria-hidden="true">·</span>
        <kbd className="gp-key">Ctrl</kbd>
        <kbd className="gp-key">Enter</kbd> runs the tests
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={onRun}
          disabled={running}
          className="todo-btn todo-btn-primary"
        >
          {running ? <Spinner size={13} /> : <Icon name="PlayIcon" size={14} />}
          {running ? 'Running…' : 'Run tests'}
        </button>
        <button
          type="button"
          onClick={reset}
          disabled={running || !edited}
          className="todo-btn todo-btn-quiet"
        >
          <Icon name="ArrowPathIcon" size={14} />
          Reset code
        </button>
      </div>

      {error && (
        <div className="mt-3">
          <InlineError message={error} onRetry={onRun} onDismiss={onClearError} />
        </div>
      )}

      {exercise.verified && !exercise.gradable && !error && (
        <p className="mt-3 text-xs leading-snug text-muted-foreground">
          These test cases could not be checked against a reference solution, so they are examples
          only. Work through the exercise, then mark the question complete.
        </p>
      )}

      {result?.error && (
        <pre
          role="alert"
          className="mt-3 overflow-x-auto whitespace-pre-wrap break-words rounded-[12px] p-3 text-xs leading-relaxed text-error mix-bg-error/10 font-code"
        >
          {result.error}
        </pre>
      )}

      {exercise.tests.length > 0 && (
        <div className="mt-4">
          <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
            <h4 className="text-xs font-semibold text-muted-foreground">Test cases</h4>
            {result && !result.error && (
              <p className="text-xs tabular-nums text-muted-foreground" role="status">
                Ran {result.total} test{result.total === 1 ? '' : 's'} in {result.ms} ms ·{' '}
                <span className={result.passed === result.total ? 'text-success' : 'text-error'}>
                  {result.passed} passed
                </span>
              </p>
            )}
          </div>
          <ul className="space-y-1.5">
            {exercise.tests.map((test, i) => {
              const outcome = result && !result.error ? result.results[i] : undefined;
              return (
                <li
                  key={i}
                  className="gp-test"
                  data-pass={outcome ? String(outcome.passed) : undefined}
                >
                  <span className="gp-test-mark mt-0.5 shrink-0 text-muted-foreground">
                    {outcome ? (
                      <Icon
                        name={outcome.passed ? 'CheckCircleIcon' : 'XCircleIcon'}
                        variant="solid"
                        size={16}
                        aria-label={outcome.passed ? 'Passed' : 'Failed'}
                      />
                    ) : (
                      <span
                        aria-hidden="true"
                        className="inline-block h-4 w-4 rounded-full border-2 mix-border-foreground/25"
                      />
                    )}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium text-foreground">{test.label}</p>
                    <p className="gp-test-code mt-0.5 text-muted-foreground">
                      {call(exercise, test)}
                    </p>
                    {outcome && !outcome.passed ? (
                      <div className="mt-1 space-y-0.5">
                        <p className="gp-test-code text-success">
                          <span className="inline-block w-[4.5rem] text-muted-foreground">
                            Expected
                          </span>
                          {show(test.expected)}
                        </p>
                        <p className="gp-test-code text-error">
                          <span className="inline-block w-[4.5rem] text-muted-foreground">
                            {outcome.error ? 'Error' : 'Got'}
                          </span>
                          {outcome.error ? outcome.error : (outcome.got ?? '?')}
                        </p>
                      </div>
                    ) : (
                      <p className="gp-test-code mt-0.5 text-foreground">
                        <span className="inline-block w-[4.5rem] text-muted-foreground">
                          Expected
                        </span>
                        {show(test.expected)}
                      </p>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
          {exercise.droppedTests > 0 && (
            <p className="mt-2 text-xs leading-snug text-muted-foreground">
              {exercise.droppedTests} generated test case
              {exercise.droppedTests === 1 ? ' was' : 's were'} removed because the reference
              solution disagreed with {exercise.droppedTests === 1 ? 'it' : 'them'}.
            </p>
          )}
        </div>
      )}

      {result && !result.error && result.stdout.trim() && (
        <details className="mt-3">
          <summary className="todo-focus cursor-pointer rounded text-xs font-medium text-muted-foreground hover:text-foreground">
            Printed output
          </summary>
          <pre className="mt-1.5 overflow-x-auto whitespace-pre-wrap break-words rounded-[12px] p-3 text-xs leading-relaxed font-code mix-bg-foreground/5">
            {result.stdout}
          </pre>
        </details>
      )}
    </section>
  );
}

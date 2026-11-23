'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import Icon from '@/components/ui/AppIcon';
import { LmsRequestError, lmsService } from '../services/lmsService';
import type { LmsQuestionTopicResult, LmsSubject, LmsTopicSection } from '../types';

/**
 * "Add question or topic" inside a project: input → editable preview (original input, title, section) → generate.
 *
 * Duplicates: one operation id per request (input + type + title + section). Every retry of that request (a network
 * error, a 5xx, the FastAPI -> Next.js fallback, a refresh mid-generation) sends the same id, so the server returns
 * the topic it already saved instead of making a second one. The draft (with the id) is kept in localStorage until
 * the lesson exists, so nothing typed is lost when generation fails.
 */

const NEW_SECTION = '__new__';
const USER_QUESTIONS = 'User Questions Topics';
const MAX_INPUT = 2000;

interface Draft {
  step: 'input' | 'preview';
  input: string;
  inputType: 'question' | 'topic';
  title: string;
  sectionId: string;
  guiding: string;
  reason: string;
  opId: string;
  opKey: string;
}

const emptyDraft: Draft = {
  step: 'input',
  input: '',
  inputType: 'question',
  title: '',
  sectionId: NEW_SECTION,
  guiding: '',
  reason: '',
  opId: '',
  opKey: '',
};

const draftKey = (projectId: string) => `lms.questionTopicDraft.${projectId}`;
// The confirmation outlives this component: saving reloads the project, which remounts the panel.
const savedKey = (projectId: string) => `lms.questionTopicSaved.${projectId}`;

interface SavedNote {
  title: string;
  section: string;
  url: string | null;
}

function readSaved(projectId: string): SavedNote | null {
  try {
    const raw = localStorage.getItem(savedKey(projectId));
    return raw ? (JSON.parse(raw) as SavedNote) : null;
  } catch {
    return null;
  }
}

function writeSaved(projectId: string, note: SavedNote | null) {
  try {
    if (note) localStorage.setItem(savedKey(projectId), JSON.stringify(note));
    else localStorage.removeItem(savedKey(projectId));
  } catch {
    /* private mode */
  }
}

function readDraft(projectId: string): Draft | null {
  try {
    const raw = localStorage.getItem(draftKey(projectId));
    return raw ? { ...emptyDraft, ...(JSON.parse(raw) as Draft) } : null;
  } catch {
    return null;
  }
}

function writeDraft(projectId: string, draft: Draft | null) {
  try {
    if (draft) localStorage.setItem(draftKey(projectId), JSON.stringify(draft));
    else localStorage.removeItem(draftKey(projectId));
  } catch {
    /* private mode: the draft lives in memory only */
  }
}

function newOpId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `op-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function guessType(text: string): 'question' | 'topic' {
  const s = text.trim();
  if (s.endsWith('?')) return 'question';
  const first = s.split(/\s+/)[0]?.toLowerCase() ?? '';
  return /^(what|why|how|when|where|which|who|whom|whose|is|are|can|could|should|would|does|do|did|will|explain)$/.test(
    first
  )
    ? 'question'
    : 'topic';
}

export default function AddQuestionTopicPanel({
  project,
  onClose,
  onSaved,
}: {
  project: LmsSubject;
  onClose: () => void;
  onSaved: (result: LmsQuestionTopicResult) => void;
}) {
  const [draft, setDraft] = useState<Draft>(() => readDraft(project.id) ?? emptyDraft);
  const [sections, setSections] = useState<LmsTopicSection[]>([]);
  const [busy, setBusy] = useState<'preview' | 'generate' | null>(null);
  const [status, setStatus] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<SavedNote | null>(() => readSaved(project.id));
  const alive = useRef(true);
  // Set on every mount: React's dev StrictMode unmounts and remounts once, which would otherwise leave it false.
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  // Sections of THIS project (the outline's modules); the server re-checks whatever is sent.
  const outlineSections = useMemo<LmsTopicSection[]>(
    () =>
      (project.project_plan || [])
        .filter((m) => m.id)
        .map((m) => ({
          id: m.id as string,
          title: m.title,
          is_questions:
            m.kind === 'questions' || m.title.trim().toLowerCase() === USER_QUESTIONS.toLowerCase(),
        })),
    [project.project_plan]
  );
  const choices = sections.length ? sections : outlineSections;
  const hasQuestionsSection = choices.some((s) => s.is_questions);

  const update = (patch: Partial<Draft>) =>
    setDraft((d) => {
      const next = { ...d, ...patch };
      writeDraft(project.id, next.input.trim() ? next : null);
      return next;
    });

  // A refresh while a lesson was generating: ask the server how that operation ended.
  useEffect(() => {
    const d = readDraft(project.id);
    if (!d?.opId) return;
    lmsService
      .getQuestionTopicOperation(project.id, d.opId)
      .then((res) => {
        if ('topic' in res && alive.current) finish(res);
      })
      .catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.id]);

  const finish = (res: LmsQuestionTopicResult) => {
    writeDraft(project.id, null);
    setDraft(emptyDraft);
    const note = { title: res.topic.title, section: res.topic.section_title, url: res.lesson_url };
    writeSaved(project.id, note);
    setSaved(note);
    setBusy(null);
    setStatus('');
    onSaved(res);
  };

  const dismissSaved = () => {
    writeSaved(project.id, null);
    setSaved(null);
  };

  const handlePreview = async () => {
    const input = draft.input.trim();
    if (!input) return;
    dismissSaved();
    setBusy('preview');
    setError(null);
    try {
      const p = await lmsService.previewQuestionTopic(project.id, input);
      if (!alive.current) return;
      setSections(p.sections);
      update({
        step: 'preview',
        inputType: p.input_type,
        title: p.title,
        sectionId: p.section.is_new ? NEW_SECTION : p.section.id,
        guiding: p.guiding_question,
        reason: p.reason,
      });
    } catch (err) {
      // No suggestion: still let the learner fill the preview in by hand.
      const q = outlineSections.find((s) => s.is_questions);
      update({
        step: 'preview',
        inputType: guessType(input),
        title: draft.title || input.slice(0, 80).replace(/[?.! ]+$/, ''),
        sectionId: q ? q.id : NEW_SECTION,
        reason: '',
      });
      setError(err instanceof Error ? err.message : 'Could not suggest a title and section.');
    } finally {
      if (alive.current) setBusy(null);
    }
  };

  const handleGenerate = async () => {
    const payload = {
      input: draft.input.trim(),
      input_type: draft.inputType,
      title: draft.title.trim(),
      section_id: draft.sectionId === NEW_SECTION ? '' : draft.sectionId,
      guiding_question: draft.inputType === 'topic' ? draft.guiding.trim() : '',
    };
    if (!payload.input || !payload.title) {
      setError('Add a title before generating.');
      return;
    }
    // Same request -> same operation id (a retry); a changed request -> a new one.
    const key = JSON.stringify(payload);
    const opId = draft.opKey === key && draft.opId ? draft.opId : newOpId();
    update({ opId, opKey: key });
    setBusy('generate');
    setError(null);
    setStatus('Writing the lesson… this can take a minute or two');

    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const res = await lmsService.generateQuestionTopic(project.id, {
          operation_id: opId,
          ...payload,
        });
        if (alive.current) finish(res);
        return;
      } catch (err) {
        if (!alive.current) return;
        const status = err instanceof LmsRequestError ? err.status : 0;
        if (status === 409 && err instanceof LmsRequestError && err.body.operation) {
          // Another tab or a retry is already generating it: wait for that run instead of starting a second one.
          const done = await pollOperation(opId);
          if (done) return;
          break;
        }
        if (status === 0 || (status >= 500 && status !== 502)) {
          setStatus('Connection lost, retrying with the same request…');
          await sleep(2000 * (attempt + 1));
          continue;
        }
        setError(
          err instanceof Error ? err.message : 'Generation failed. Your input is kept; try again.'
        );
        break;
      }
    }
    if (alive.current) {
      setBusy(null);
      setStatus('');
    }
  };

  const pollOperation = async (opId: string): Promise<boolean> => {
    setStatus('Already generating this lesson; waiting for it…');
    for (let i = 0; i < 100 && alive.current; i++) {
      await sleep(3000);
      try {
        const res = await lmsService.getQuestionTopicOperation(project.id, opId);
        if ('topic' in res) {
          finish(res);
          return true;
        }
        if (res.operation.status === 'failed') {
          setError(res.operation.error || 'Generation failed. Your input is kept; try again.');
          return false;
        }
      } catch {
        /* keep waiting */
      }
    }
    return false;
  };

  const inputLabel = draft.inputType === 'question' ? 'Your question' : 'Your topic';

  return (
    <section
      className="rounded-2xl border border-border bg-card p-4 sm:p-5 space-y-4"
      aria-label="Add question or topic"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-heading text-base font-semibold text-foreground">
            Add question or topic
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Ask anything or name a concept. You get a practical lesson tied to {project.name}.
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
        >
          <Icon name="XMarkIcon" size={16} />
        </button>
      </div>

      {saved && (
        <div className="rounded-xl border border-border bg-background p-3 flex flex-wrap items-center justify-between gap-2 text-sm">
          <span className="text-foreground">
            Saved <span className="font-medium">{saved.title}</span> in {saved.section}
          </span>
          {saved.url && (
            <Link
              href={saved.url}
              className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
            >
              Open lesson <Icon name="ArrowRightIcon" size={14} />
            </Link>
          )}
          <button
            type="button"
            onClick={dismissSaved}
            aria-label="Dismiss"
            className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          >
            <Icon name="XMarkIcon" size={14} />
          </button>
        </div>
      )}

      {error && (
        <div
          role="alert"
          className="rounded-xl border border-destructive bg-background p-3 text-sm text-destructive"
        >
          {error}
        </div>
      )}

      {draft.step === 'input' ? (
        <div className="space-y-3">
          <textarea
            value={draft.input}
            onChange={(e) => update({ input: e.target.value.slice(0, MAX_INPUT) })}
            rows={3}
            disabled={busy !== null}
            placeholder="What type of algorithm relies on a similarity measure to make predictions?  or  K-nearest neighbors"
            className="w-full px-3 py-2.5 rounded-lg border border-border bg-background text-sm text-foreground resize-y focus:outline-none focus:ring-2 focus:ring-primary"
          />
          <div className="flex items-center justify-between gap-3">
            <span className="text-xs text-muted-foreground tabular-nums">
              {draft.input.length} / {MAX_INPUT}
            </span>
            <button
              type="button"
              onClick={handlePreview}
              disabled={!draft.input.trim() || busy !== null}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 disabled:opacity-50 transition-[opacity]"
            >
              {busy === 'preview' ? 'Suggesting…' : 'Continue'}
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="rounded-xl bg-background border border-border p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-medium text-muted-foreground">{inputLabel}</span>
              <button
                type="button"
                disabled={busy !== null}
                onClick={() => update({ step: 'input' })}
                className="text-xs font-medium text-muted-foreground hover:text-foreground disabled:opacity-50 transition-colors"
              >
                Edit
              </button>
            </div>
            <p className="text-sm text-foreground mt-1 whitespace-pre-wrap break-words">
              {draft.input}
            </p>
          </div>

          <div
            className="inline-flex rounded-full bg-muted p-1"
            role="radiogroup"
            aria-label="Input type"
          >
            {(['question', 'topic'] as const).map((t) => (
              <button
                key={t}
                type="button"
                role="radio"
                aria-checked={draft.inputType === t}
                disabled={busy !== null}
                onClick={() => update({ inputType: t })}
                className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                  draft.inputType === t
                    ? 'bg-card text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {t === 'question' ? 'Question' : 'Topic'}
              </button>
            ))}
          </div>

          <label className="block space-y-1">
            <span className="text-xs font-medium text-muted-foreground">Title</span>
            <input
              value={draft.title}
              maxLength={120}
              disabled={busy !== null}
              onChange={(e) => update({ title: e.target.value })}
              className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </label>

          {draft.inputType === 'topic' && (
            <label className="block space-y-1">
              <span className="text-xs font-medium text-muted-foreground">Guiding question</span>
              <input
                value={draft.guiding}
                maxLength={300}
                disabled={busy !== null}
                placeholder="The question this topic answers (the lesson answers it)"
                onChange={(e) => update({ guiding: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </label>
          )}

          <label className="block space-y-1">
            <span className="text-xs font-medium text-muted-foreground">Section</span>
            <select
              value={draft.sectionId}
              disabled={busy !== null}
              onChange={(e) => update({ sectionId: e.target.value })}
              className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
            >
              {!hasQuestionsSection && <option value={NEW_SECTION}>{USER_QUESTIONS} (new)</option>}
              {choices.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.title}
                </option>
              ))}
            </select>
            {draft.reason && (
              <span className="block text-xs text-muted-foreground">{draft.reason}</span>
            )}
          </label>

          <div className="flex flex-wrap items-center justify-end gap-2">
            {status && <span className="mr-auto text-xs text-muted-foreground">{status}</span>}
            <button
              type="button"
              onClick={() => update({ step: 'input' })}
              disabled={busy !== null}
              className="px-3 py-2 rounded-lg border border-border bg-card text-sm font-medium text-foreground hover:bg-muted disabled:opacity-50 transition-colors"
            >
              Back
            </button>
            <button
              type="button"
              onClick={handleGenerate}
              disabled={busy !== null || !draft.title.trim()}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 disabled:opacity-50 transition-[opacity]"
            >
              <Icon name="SparklesIcon" size={14} />
              {busy === 'generate' ? 'Generating…' : 'Generate lesson'}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

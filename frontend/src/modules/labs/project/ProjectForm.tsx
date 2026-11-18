'use client';

import { useEffect, useId, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import Icon from '@/components/ui/AppIcon';
import BackButton from '@/components/ui/BackButton';
import {
  DOCUMENT_ACCEPT,
  DOCUMENT_TYPES_LABEL,
  fitToLimit,
  readDocumentText,
  titleFromFilename,
} from '@/lib/documents/documentText';
import { createProject, projectHref } from '@/lib/services/labProjectsService';
import { upsertProject } from '@/modules/labs/common/project/projectStore';
import { PROJECT_TEMPLATES, templateById } from '@/modules/labs/project/projectTemplates';
import {
  errorInk,
  fieldClass,
  primaryButton,
  quietButton,
  Spinner,
} from '@/modules/labs/project/ui';

export const NAME_MAX = 120;
export const DESCRIPTION_MAX = 1000;
export const CONTEXT_MAX = 12000;

const labelClass = 'mb-1.5 block text-[13px] font-medium text-foreground';

/**
 * New project, on its own page (/labs-project/new): a name (required), one line about it and, if you have it, the first draft of its
 * context. Creating goes straight to the new project: its Context tab when there is none yet, else its sections.
 *
 * `?example=<id>` fills the form from an example project (projectTemplates.ts); nothing is created until Create is pressed.
 *
 * The context can also come from a document (PDF, DOCX, TXT or Markdown), like the resume upload in Daily Session: the text is read
 * in the browser (lib/documents), added to the context box for the person to review and trim, and a blank name is taken from the file
 * name. Nothing is sent anywhere until Create is pressed.
 */
export default function ProjectForm() {
  const router = useRouter();
  const example = templateById(useSearchParams().get('example'));
  const nameId = useId();
  const descId = useId();
  const contextId = useId();
  const [name, setName] = useState(example?.name ?? '');
  const [description, setDescription] = useState(example?.description ?? '');
  const [context, setContext] = useState(example?.context ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Document import: `reading` is the progress text while a file is being read, `docNote` what happened to the last one
  const fileInput = useRef<HTMLInputElement>(null);
  const [reading, setReading] = useState<string | null>(null);
  const [docNote, setDocNote] = useState<{ kind: 'ok' | 'warn' | 'error'; text: string } | null>(
    null
  );
  // The reading is asynchronous: use what is in the form when it finishes, not when the file was chosen
  const latest = useRef({ name, context });
  latest.current = { name, context };

  // Choosing another example (or none) changes the address, and the form follows it
  const filledFrom = useRef<string | null>(example?.id ?? null);
  useEffect(() => {
    const id = example?.id ?? null;
    if (filledFrom.current === id) return;
    filledFrom.current = id;
    setName(example?.name ?? '');
    setDescription(example?.description ?? '');
    setContext(example?.context ?? '');
    setDocNote(null);
  }, [example]);

  const addDocument = async (file: File) => {
    setReading('Reading…');
    setDocNote(null);
    try {
      const text = await readDocumentText(file, setReading);
      // Nothing the person typed is lost: a document is added after what is already there
      const before = latest.current.context.trim();
      const fit = fitToLimit(before ? `${before}\n\n${text}` : text, CONTEXT_MAX);
      setContext(fit.text);
      if (!latest.current.name.trim()) setName(titleFromFilename(file.name, NAME_MAX));
      setDocNote(
        fit.cut
          ? {
              kind: 'warn',
              text: `Added “${file.name}”, but the context holds ${CONTEXT_MAX.toLocaleString()} characters and this came to ${fit.total.toLocaleString()}, so the end was left out. Trim the text to keep what matters most.`,
            }
          : {
              kind: 'ok',
              text: `Added “${file.name}” (${text.length.toLocaleString()} characters). Check it below before you create the project.`,
            }
      );
    } catch (e) {
      setDocNote({
        kind: 'error',
        text: e instanceof Error ? e.message : 'Could not read this file. Try another one.',
      });
    } finally {
      setReading(null);
    }
  };
  const choose = (id: string | null) =>
    router.replace(
      id ? `/labs-project/new?example=${encodeURIComponent(id)}` : '/labs-project/new',
      { scroll: false }
    );

  const submit = async () => {
    const trimmed = name.trim();
    if (!trimmed || busy) return;
    setBusy(true);
    setError(null);
    try {
      const project = await createProject({ name: trimmed, description, context });
      upsertProject(project);
      router.push(projectHref(project.id, project.context ? 'sections' : 'context'));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not create the project. Try again.');
      setBusy(false);
    }
  };

  return (
    <div className="max-w-[720px]">
      <div className="mb-5">
        <BackButton href="/labs-project" label="Projects" />
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
        className="lab-edge rounded-2xl border bg-card p-5 sm:p-[1.5rem]"
      >
        <h1 className="font-heading text-[1.25rem] font-semibold leading-tight tracking-[-0.018em] text-foreground">
          New project
        </h1>
        <p className="mt-1 text-sm mix-text-foreground/[0.68]">
          Every lab can generate for it, using what you write here.
        </p>

        <section aria-label="Start from an example" className="mt-[1.5rem]">
          <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <p className="text-[13px] font-medium text-foreground">Start from an example</p>
            {example && (
              <button
                type="button"
                onClick={() => choose(null)}
                disabled={busy}
                className="text-[13px] text-muted-foreground hover:text-foreground hover:underline"
              >
                Start blank
              </button>
            )}
          </div>
          <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
            {PROJECT_TEMPLATES.map((t) => {
              const on = example?.id === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  aria-pressed={on}
                  disabled={busy}
                  onClick={() => choose(t.id)}
                  className={`todo-focus flex flex-col items-stretch justify-start rounded-xl border p-3 text-left transition-colors ${
                    on
                      ? 'border-transparent bg-[var(--color-fill-strong)]'
                      : 'hover:bg-[var(--color-fill)]'
                  }`}
                >
                  <span className="flex items-start justify-between gap-2">
                    <span className="break-words text-sm font-medium text-foreground">
                      {t.name}
                    </span>
                    {on && <Icon name="CheckIcon" size={14} className="mt-0.5 flex-shrink-0" />}
                  </span>
                  <span className="mt-1 line-clamp-4 text-[13px] text-muted-foreground">
                    {t.description}
                  </span>
                  <span className="mt-auto pt-2 text-xs text-muted-foreground">
                    {t.tags.join(' · ')}
                  </span>
                </button>
              );
            })}
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Enterprise-scale systems with the context already written. The numbers are illustrative:
            change anything before you create it.
          </p>
        </section>

        <div className="mt-[1.5rem] space-y-5">
          <div>
            <label htmlFor={nameId} className={labelClass}>
              Name
            </label>
            <input
              id={nameId}
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={NAME_MAX}
              placeholder="Crop disease detection"
              className={fieldClass}
              autoFocus={!example}
              disabled={busy}
              required
            />
          </div>
          <div>
            <label htmlFor={descId} className={labelClass}>
              Description
            </label>
            <input
              id={descId}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={DESCRIPTION_MAX}
              placeholder="One line on what the project is"
              className={fieldClass}
              disabled={busy}
            />
          </div>
          <div>
            <div className="mb-1.5 flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
              <div className="min-w-0">
                <label htmlFor={contextId} className="text-[13px] font-medium text-foreground">
                  Context
                </label>
                <span className="ml-2 text-xs text-muted-foreground">
                  Optional, you can add it later
                </span>
              </div>
              <button
                type="button"
                onClick={() => fileInput.current?.click()}
                disabled={busy || reading !== null}
                className={quietButton}
              >
                {reading !== null ? (
                  <Spinner className="h-3.5 w-3.5" />
                ) : (
                  <Icon name="DocumentArrowUpIcon" size={15} />
                )}
                {reading ?? 'Add from a document'}
              </button>
              <input
                ref={fileInput}
                type="file"
                accept={DOCUMENT_ACCEPT}
                className="hidden"
                tabIndex={-1}
                aria-hidden="true"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = ''; // choosing the same file again must still fire
                  if (file) void addDocument(file);
                }}
              />
            </div>
            <p className="mb-2 text-xs text-muted-foreground">
              Write or paste it, or add a {DOCUMENT_TYPES_LABEL} file. Files are read in your
              browser.
            </p>
            {docNote && (
              <p
                role={docNote.kind === 'error' ? 'alert' : 'status'}
                className={`mb-2 flex items-start gap-1.5 text-[0.8125rem] ${
                  docNote.kind === 'error'
                    ? errorInk
                    : docNote.kind === 'warn'
                      ? 'text-amber-800 dark:text-amber-300'
                      : 'text-muted-foreground'
                }`}
              >
                <Icon
                  name={docNote.kind === 'ok' ? 'CheckCircleIcon' : 'ExclamationTriangleIcon'}
                  size={15}
                  className="mt-0.5 flex-shrink-0"
                />
                <span className="min-w-0 break-words">{docNote.text}</span>
              </p>
            )}
            <textarea
              id={contextId}
              value={context}
              onChange={(e) => setContext(e.target.value)}
              maxLength={CONTEXT_MAX}
              rows={8}
              placeholder="Background, objectives, requirements, constraints, technical decisions"
              className={`${fieldClass} resize-y text-[0.8125rem] leading-relaxed`}
              disabled={busy}
            />
            <p className="mt-1.5 text-right text-xs tabular-nums text-muted-foreground">
              {context.length.toLocaleString()} / {CONTEXT_MAX.toLocaleString()}
            </p>
          </div>
          {error && (
            <p role="alert" className="text-[0.8125rem] text-error">
              {error}
            </p>
          )}
        </div>

        <div className="mt-[1.5rem] flex justify-end gap-2 border-t border-border pt-5">
          <Link href="/labs-project" className="todo-btn todo-btn-secondary" aria-disabled={busy}>
            Cancel
          </Link>
          <button
            type="submit"
            disabled={!name.trim() || busy || reading !== null}
            className={primaryButton}
          >
            {busy && <Spinner />}
            {busy ? 'Creating…' : 'Create project'}
          </button>
        </div>
      </form>
    </div>
  );
}

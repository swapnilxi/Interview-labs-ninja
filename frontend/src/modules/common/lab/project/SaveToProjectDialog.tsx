'use client';

import { useEffect, useId, useState } from 'react';
import Link from 'next/link';
import Icon from '@/components/ui/AppIcon';
import Modal from '@/components/ui/Modal';
import {
  saveSection,
  sectionHref,
  type LabProject,
  type ProjectSection,
} from '@/lib/services/labProjectsService';
import { loadProjects } from '@/modules/common/lab/project/projectStore';
import { useLabProjects } from '@/modules/common/lab/project/useLabProjects';

export interface SaveSource {
  /** The response text, exactly as generated (Markdown, code blocks and tables included). */
  content: string;
  /** Pre-filled section title; the user confirms or edits it. */
  defaultTitle: string;
  sourceLabId: string;
  sourceLabName: string;
  /** Points back at the lab page and generation this came from. */
  sourceGenerationId?: string | null;
  /** The project this response was written for, if any: saving it into another one gets a heads-up. */
  generatedForProjectId?: number | null;
}

const TITLE_MAX = 200;

/**
 * "Save to Project": keeps a response as a NEW section of a project, after the user has confirmed the
 * title and the destination. Nothing is ever saved automatically, and saving never overwrites an
 * existing section: the saved section is a copy that later regenerations of the lab page leave alone.
 */
export default function SaveToProjectDialog({
  isOpen,
  onClose,
  source,
  onSaved,
}: {
  isOpen: boolean;
  onClose: () => void;
  source: SaveSource;
  onSaved?: (project: LabProject, section: ProjectSection) => void;
}) {
  const { projects, selected, loaded, loading, error: loadError, refresh } = useLabProjects();
  const headingId = useId();
  const titleId = useId();
  const projectFieldId = useId();
  const [title, setTitle] = useState(source.defaultTitle);
  const [projectId, setProjectId] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ project: LabProject; section: ProjectSection } | null>(null);

  // Every time the dialog opens it starts fresh: the suggested title, the selected project as destination.
  useEffect(() => {
    if (!isOpen) return;
    setTitle(source.defaultTitle);
    setProjectId(selected?.id ?? null);
    setBusy(false);
    setError(null);
    setDone(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only a fresh opening resets the form
  }, [isOpen]);

  // A project picked in the lab's selector while the list was still loading becomes the default.
  useEffect(() => {
    if (isOpen && projectId === null && selected && !done) setProjectId(selected.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.id]);

  const destination = projects.find((p) => p.id === projectId) ?? null;
  const trimmed = title.trim();
  const canSave = !!destination && !!trimmed && !busy;
  const writtenForOther =
    destination &&
    source.generatedForProjectId != null &&
    source.generatedForProjectId !== destination.id;

  const save = async () => {
    if (!destination || !trimmed || busy) return;
    setBusy(true);
    setError(null);
    try {
      const section = await saveSection(destination.id, {
        title: trimmed,
        content: source.content,
        sourceLabId: source.sourceLabId,
        sourceLabName: source.sourceLabName,
        sourceGenerationId: source.sourceGenerationId,
      });
      setDone({ project: destination, section });
      void loadProjects(true); // section counts in every open selector
      onSaved?.(destination, section);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save the section. Try again.');
    } finally {
      setBusy(false);
    }
  };

  const field =
    'w-full rounded-lg border border-border bg-input px-3 py-2 text-sm text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring';

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      labelledBy={headingId}
      closeOnBackdrop={!busy}
      closeOnEscape={!busy}
      className="w-full max-w-md rounded-2xl border border-border bg-card shadow-2xl"
    >
      <div className="p-5">
        <div className="flex items-start justify-between gap-3">
          <h2 id={headingId} className="font-heading text-base font-semibold text-foreground">
            {done ? 'Saved to project' : 'Save to Project'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <Icon name="XMarkIcon" size={16} />
          </button>
        </div>

        {done ? (
          <div className="mt-4 space-y-4" role="status">
            <div className="flex items-start gap-3 rounded-xl border mix-border-success/30 mix-bg-success/10 p-3">
              <Icon
                name="CheckCircleIcon"
                variant="solid"
                size={20}
                className="mt-0.5 flex-shrink-0 text-success"
              />
              <p className="text-sm text-foreground">
                <span className="font-semibold">{done.section.title}</span> was saved to{' '}
                <span className="font-semibold">{done.project.name}</span>.
              </p>
            </div>
            <div className="flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                data-autofocus
                className="rounded-lg px-4 py-2 text-sm font-semibold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                Done
              </button>
              <Link
                href={sectionHref(done.project.id, done.section.id)}
                className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
              >
                Open section
                <Icon name="ArrowRightIcon" size={14} />
              </Link>
            </div>
          </div>
        ) : (
          <form
            className="mt-4 space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              void save();
            }}
          >
            <div>
              <label htmlFor={titleId} className="mb-1 block text-xs font-semibold text-foreground">
                Section title
              </label>
              <input
                id={titleId}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={TITLE_MAX}
                className={field}
                data-autofocus
                disabled={busy}
              />
            </div>

            <div>
              <label
                htmlFor={projectFieldId}
                className="mb-1 block text-xs font-semibold text-foreground"
              >
                Destination project
              </label>
              {loaded && projects.length === 0 ? (
                <div className="rounded-lg border border-dashed border-border p-3 text-sm text-muted-foreground">
                  <p>
                    You don&apos;t have a project yet. Create one first, then save this response to
                    it.
                  </p>
                  <Link
                    href="/labs-project?new=1"
                    className="mt-2 inline-flex items-center gap-1.5 font-semibold text-primary hover:underline"
                  >
                    <Icon name="FolderPlusIcon" size={14} />
                    Create a project
                  </Link>
                </div>
              ) : (
                <select
                  id={projectFieldId}
                  value={projectId ?? ''}
                  onChange={(e) => setProjectId(e.target.value ? Number(e.target.value) : null)}
                  className={field}
                  disabled={busy || (!loaded && loading)}
                >
                  <option value="">{loaded ? 'Choose a project…' : 'Loading projects…'}</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              )}
              {loadError && (
                <p className="mt-1 text-xs text-error" role="alert">
                  {loadError}{' '}
                  <button
                    type="button"
                    onClick={() => void refresh()}
                    className="font-semibold underline"
                  >
                    Retry
                  </button>
                </p>
              )}
              {!selected && projects.length > 0 && !destination && (
                <p className="mt-1 text-xs text-muted-foreground">
                  No project is selected in this lab, so pick where this should go.
                </p>
              )}
            </div>

            {writtenForOther && (
              <p className="rounded-lg bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
                This response was written for a different project than “{destination?.name}”. Check
                that it fits before you keep it there.
              </p>
            )}

            <p className="text-xs text-muted-foreground">
              Saved as a copy ({source.content.length.toLocaleString()} characters, formatting
              kept). Regenerating this lab page later won&apos;t change it, and you can edit or
              delete it in Labs Project.
            </p>

            {error && (
              <p className="text-sm text-error" role="alert">
                {error}
              </p>
            )}

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                disabled={busy}
                className="rounded-lg px-4 py-2 text-sm font-semibold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={!canSave}
                className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {busy && (
                  <span className="h-3.5 w-3.5 flex-shrink-0 animate-spin rounded-full border-2 border-current border-t-transparent" />
                )}
                {busy ? 'Saving…' : 'Save to Project'}
              </button>
            </div>
          </form>
        )}
      </div>
    </Modal>
  );
}

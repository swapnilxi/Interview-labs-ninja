'use client';

import { useCallback, useEffect, useId, useState } from 'react';
import Icon from '@/components/ui/AppIcon';
import BackButton from '@/components/ui/BackButton';
import { confirmDialog } from '@/lib/ui/confirm';
import { toast } from '@/lib/ui/toast';
import {
  deleteSection,
  fetchSection,
  formatServerDate,
  projectHref,
  updateSection,
  type LabProject,
  type ProjectSection,
} from '@/lib/services/labProjectsService';
import Markdown from '@/modules/common/lab/Markdown';
import { loadProjects } from '@/modules/common/lab/project/projectStore';
import {
  dangerButton,
  ErrorBlock,
  fieldClass,
  LabBadge,
  LoadingBlock,
  primaryButton,
  quietButton,
  Spinner,
} from '@/modules/labs-project/ui';

type Editing = null | 'rename' | 'edit';

const TITLE_MAX = 200;
const CONTENT_MAX = 60000;

/**
 * One saved section, in full: its title, the lab it came from, the text as it was generated (Markdown,
 * code blocks and tables rendered), and the actions to rename, edit, delete and get back to the project.
 */
export default function SectionDetail({
  project,
  sectionId,
  onDeleted,
}: {
  project: LabProject;
  sectionId: number;
  /** After a delete: go back to the project's section list. */
  onDeleted: () => void;
}) {
  const titleId = useId();
  const contentId = useId();
  const [section, setSection] = useState<ProjectSection | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Editing>(null);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [preview, setPreview] = useState(false);
  const [busy, setBusy] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const load = useCallback(() => {
    setError(null);
    setSection(null);
    fetchSection(project.id, sectionId)
      .then(setSection)
      .catch((e) => setError(e instanceof Error ? e.message : 'Could not load this section.'));
  }, [project.id, sectionId]);

  useEffect(() => {
    setEditing(null);
    load();
  }, [load]);

  const startEdit = (mode: Exclude<Editing, null>) => {
    if (!section) return;
    setTitle(section.title);
    setContent(section.content ?? '');
    setPreview(false);
    setSaveError(null);
    setEditing(mode);
  };

  const dirty =
    !!section &&
    editing !== null &&
    (title.trim() !== section.title || (editing === 'edit' && content !== (section.content ?? '')));

  // A refresh or tab close in the middle of an edit asks first.
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const save = async () => {
    if (!section || !title.trim() || (editing === 'edit' && !content.trim()) || busy) return;
    setBusy(true);
    setSaveError(null);
    try {
      const changes: { title?: string; content?: string } = {};
      if (title.trim() !== section.title) changes.title = title;
      if (editing === 'edit' && content !== section.content) changes.content = content;
      const updated = Object.keys(changes).length
        ? await updateSection(project.id, section.id, changes)
        : section;
      setSection(updated);
      setEditing(null);
      toast.success(editing === 'rename' ? 'Section renamed.' : 'Section saved.');
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : 'Could not save the section. Try again.');
    } finally {
      setBusy(false);
    }
  };

  const cancel = async () => {
    if (dirty) {
      const discard = await confirmDialog({
        title: 'Discard your changes?',
        message: 'What you changed in this section has not been saved.',
        confirmLabel: 'Discard',
        cancelLabel: 'Keep editing',
        tone: 'danger',
      });
      if (!discard) return;
    }
    setEditing(null);
  };

  const remove = async () => {
    if (!section) return;
    const ok = await confirmDialog({
      title: `Delete “${section.title}”?`,
      message: `This permanently removes the section from “${project.name}”. The lab page it came from is not affected. This can't be undone.`,
      confirmLabel: 'Delete section',
      tone: 'danger',
    });
    if (!ok) return;
    setBusy(true);
    try {
      await deleteSection(project.id, section.id);
      toast.success('Section deleted.');
      void loadProjects(true); // section counts in the project list and the labs' selectors
      onDeleted();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not delete the section. Try again.');
      setBusy(false);
    }
  };

  const back = projectHref(project.id, 'sections');

  return (
    <div className="max-w-[880px]">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <BackButton href={back} label={project.name} />
      </div>

      {error ? (
        <ErrorBlock message={error} onRetry={load} />
      ) : !section ? (
        <LoadingBlock label="Loading section…" />
      ) : (
        <article className="rounded-lg border border-border bg-card">
          <header className="border-b border-border p-4 sm:p-5">
            {editing ? (
              <div>
                <label
                  htmlFor={titleId}
                  className="mb-1 block text-xs font-semibold text-foreground"
                >
                  Title
                </label>
                <input
                  id={titleId}
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  maxLength={TITLE_MAX}
                  className={fieldClass}
                  disabled={busy}
                  data-autofocus
                />
              </div>
            ) : (
              <h2 className="break-words font-heading text-xl font-semibold text-foreground">
                {section.title}
              </h2>
            )}
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs font-medium text-muted-foreground">
              <span className="inline-flex items-center gap-1.5">
                Generated in <LabBadge name={section.sourceLabName} />
              </span>
              <span>Saved {formatServerDate(section.createdAt)}</span>
              {section.updatedAt !== section.createdAt && (
                <span>Edited {formatServerDate(section.updatedAt)}</span>
              )}
            </div>
            {!editing && (
              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => startEdit('rename')}
                  disabled={busy}
                  className={quietButton}
                >
                  <Icon name="TagIcon" size={14} />
                  Rename
                </button>
                <button
                  type="button"
                  onClick={() => startEdit('edit')}
                  disabled={busy}
                  className={quietButton}
                >
                  <Icon name="PencilSquareIcon" size={14} />
                  Edit
                </button>
                <button
                  type="button"
                  onClick={remove}
                  disabled={busy}
                  className={`${dangerButton} sm:ml-auto`}
                >
                  <Icon name="TrashIcon" size={14} />
                  Delete
                </button>
              </div>
            )}
          </header>

          <div className="p-4 sm:p-5">
            {editing === 'edit' ? (
              <div>
                <div className="mb-1 flex items-center justify-between gap-2">
                  <label htmlFor={contentId} className="text-xs font-semibold text-foreground">
                    Content (Markdown)
                  </label>
                  <div
                    role="group"
                    aria-label="Editor view"
                    className="todo-segmented todo-segmented-accent"
                  >
                    {[
                      ['Write', false],
                      ['Preview', true],
                    ].map(([label, value]) => (
                      <button
                        key={String(label)}
                        type="button"
                        aria-pressed={preview === value}
                        onClick={() => setPreview(value as boolean)}
                        className="todo-segment"
                      >
                        {label as string}
                      </button>
                    ))}
                  </div>
                </div>
                {preview ? (
                  <div className="min-h-[16rem] rounded-md border border-border p-3">
                    <Markdown content={content} />
                  </div>
                ) : (
                  <textarea
                    id={contentId}
                    value={content}
                    onChange={(e) => setContent(e.target.value)}
                    maxLength={CONTENT_MAX}
                    rows={20}
                    className={`${fieldClass} min-h-[16rem] resize-y font-mono leading-relaxed`}
                    disabled={busy}
                  />
                )}
              </div>
            ) : (
              <Markdown content={section.content ?? ''} />
            )}

            {editing && (
              <div className="mt-4">
                {saveError && (
                  <p role="alert" className="mb-3 text-sm text-error">
                    {saveError}
                  </p>
                )}
                <div className="flex flex-wrap items-center justify-end gap-2">
                  {dirty && (
                    <span className="mr-auto text-xs font-medium text-warning">
                      Unsaved changes
                    </span>
                  )}
                  <button type="button" onClick={cancel} disabled={busy} className={quietButton}>
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={save}
                    disabled={
                      !dirty || !title.trim() || (editing === 'edit' && !content.trim()) || busy
                    }
                    className={primaryButton}
                  >
                    {busy && <Spinner />}
                    {busy ? 'Saving…' : 'Save'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </article>
      )}
    </div>
  );
}

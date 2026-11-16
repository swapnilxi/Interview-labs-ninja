'use client';

import { useEffect, useId, useState } from 'react';
import Icon from '@/components/ui/AppIcon';
import Modal from '@/components/ui/Modal';
import { createProject, type LabProject } from '@/lib/services/labProjectsService';
import { upsertProject } from '@/modules/labs/common/project/projectStore';
import { fieldClass, primaryButton, Spinner } from '@/modules/labs/project/ui';

export const NAME_MAX = 120;
export const DESCRIPTION_MAX = 1000;
export const CONTEXT_MAX = 12000;

/** "New project": name (required), a one-line description and, optionally, the first draft of its context. */
export default function ProjectFormDialog({
  isOpen,
  onClose,
  onCreated,
}: {
  isOpen: boolean;
  onClose: () => void;
  onCreated: (project: LabProject) => void;
}) {
  const headingId = useId();
  const nameId = useId();
  const descId = useId();
  const contextId = useId();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [context, setContext] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setName('');
    setDescription('');
    setContext('');
    setBusy(false);
    setError(null);
  }, [isOpen]);

  const submit = async () => {
    const trimmed = name.trim();
    if (!trimmed || busy) return;
    setBusy(true);
    setError(null);
    try {
      const project = await createProject({ name: trimmed, description, context });
      upsertProject(project);
      onCreated(project);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not create the project. Try again.');
      setBusy(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      labelledBy={headingId}
      closeOnBackdrop={false}
      closeOnEscape={!busy}
      className="lab-page w-full max-w-lg rounded-2xl border border-border bg-card shadow-xl"
    >
      <form
        className="p-5"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <div className="flex items-start justify-between gap-3 border-b border-border pb-4">
          <div>
            <h2 id={headingId} className="font-heading text-base font-semibold text-foreground">
              New project
            </h2>
            <p className="mt-0.5 text-[0.8125rem] mix-text-foreground/[0.65]">
              Every lab can generate for it, using what you write here.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            aria-label="Close"
            className="todo-focus -mt-0.5 rounded-full p-1.5 text-muted-foreground transition-colors hover:mix-bg-foreground/[0.06] hover:text-foreground"
          >
            <Icon name="XMarkIcon" size={18} />
          </button>
        </div>

        <div className="mt-4 space-y-4">
          <div>
            <label htmlFor={nameId} className="mb-1.5 block text-[0.75rem] font-semibold text-foreground">
              Name <span className="text-error">*</span>
            </label>
            <input
              id={nameId}
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={NAME_MAX}
              placeholder="e.g. Crop disease detection"
              className={fieldClass}
              data-autofocus
              disabled={busy}
              required
            />
          </div>
          <div>
            <label htmlFor={descId} className="mb-1.5 block text-[0.75rem] font-semibold text-foreground">
              Short description
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
            <label htmlFor={contextId} className="mb-1.5 block text-[0.75rem] font-semibold text-foreground">
              Context{' '}
              <span className="font-normal text-muted-foreground">— add it later if you like</span>
            </label>
            <textarea
              id={contextId}
              value={context}
              onChange={(e) => setContext(e.target.value)}
              maxLength={CONTEXT_MAX}
              rows={5}
              placeholder="Background, objectives, requirements, constraints, technical decisions…"
              className={`${fieldClass} resize-y text-[0.8125rem]`}
              disabled={busy}
            />
          </div>
          {error && (
            <p role="alert" className="text-[0.8125rem] text-error">
              {error}
            </p>
          )}
        </div>

        <div className="mt-5 flex justify-end gap-2 border-t border-border pt-4">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="todo-btn todo-btn-secondary disabled:opacity-50"
          >
            Cancel
          </button>
          <button type="submit" disabled={!name.trim() || busy} className={primaryButton}>
            {busy && <Spinner />}
            {busy ? 'Creating…' : 'Create project'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

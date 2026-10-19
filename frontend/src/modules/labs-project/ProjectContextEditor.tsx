'use client';

import { useEffect, useId, useState } from 'react';
import { toast } from '@/lib/ui/toast';
import { updateProject, type LabProject } from '@/lib/services/labProjectsService';
import { upsertProject } from '@/modules/common/lab/project/projectStore';
import { CONTEXT_MAX, DESCRIPTION_MAX, NAME_MAX } from '@/modules/labs-project/ProjectFormDialog';
import { fieldClass, primaryButton, quietButton, Spinner } from '@/modules/labs-project/ui';

/**
 * Project Context: the name, description and context the labs read when they generate for this project.
 * Saving changes only the project: sections already saved to it are separate and are never rewritten.
 */
export default function ProjectContextEditor({ project }: { project: LabProject }) {
  const nameId = useId();
  const descId = useId();
  const contextId = useId();
  const [name, setName] = useState(project.name);
  const [description, setDescription] = useState(project.description);
  const [context, setContext] = useState(project.context);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dirty =
    name.trim() !== project.name ||
    description.trim() !== project.description ||
    context.trim() !== project.context;

  // Another save (or another tab's) changed the project and nothing is being edited here: follow it.
  useEffect(() => {
    if (dirty) return;
    setName(project.name);
    setDescription(project.description);
    setContext(project.context);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.updatedAt]);

  // A refresh or tab close with unsaved edits asks first.
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
    if (!dirty || !name.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      const updated = await updateProject(project.id, { name, description, context });
      upsertProject(updated);
      toast.success('Project saved.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save the project. Try again.');
    } finally {
      setBusy(false);
    }
  };

  const discard = () => {
    setName(project.name);
    setDescription(project.description);
    setContext(project.context);
    setError(null);
  };

  const counter = (value: string, max: number) => (
    <span
      className={`text-xs ${value.length > max * 0.95 ? 'text-error' : 'text-muted-foreground'}`}
    >
      {value.length.toLocaleString()} / {max.toLocaleString()}
    </span>
  );

  return (
    <form
      className="space-y-5 rounded-lg border border-border bg-card p-4 sm:p-5"
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
      aria-labelledby={`${contextId}-heading`}
    >
      <div>
        <h2
          id={`${contextId}-heading`}
          className="font-heading text-base font-semibold text-foreground"
        >
          Project context
        </h2>
        <p className="mt-1 text-sm mix-text-foreground/[0.74]">
          The labs read this every time they generate for the project, so be specific: background,
          objectives, requirements, constraints, technical decisions and anything else a
          collaborator would need. Say what is still undecided too; the labs are told not to invent
          what you leave out.
        </p>
      </div>

      <div>
        <div className="mb-1 flex items-baseline justify-between gap-2">
          <label htmlFor={nameId} className="text-xs font-semibold text-foreground">
            Name
          </label>
          {counter(name, NAME_MAX)}
        </div>
        <input
          id={nameId}
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={NAME_MAX}
          className={fieldClass}
          disabled={busy}
          required
        />
      </div>

      <div>
        <div className="mb-1 flex items-baseline justify-between gap-2">
          <label htmlFor={descId} className="text-xs font-semibold text-foreground">
            Description
          </label>
          {counter(description, DESCRIPTION_MAX)}
        </div>
        <input
          id={descId}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          maxLength={DESCRIPTION_MAX}
          className={fieldClass}
          disabled={busy}
        />
      </div>

      <div>
        <div className="mb-1 flex items-baseline justify-between gap-2">
          <label htmlFor={contextId} className="text-xs font-semibold text-foreground">
            Context
          </label>
          {counter(context, CONTEXT_MAX)}
        </div>
        <textarea
          id={contextId}
          value={context}
          onChange={(e) => setContext(e.target.value)}
          maxLength={CONTEXT_MAX}
          rows={14}
          placeholder={
            'Objectives:\n- …\n\nRequirements & constraints:\n- …\n\nTechnical decisions so far:\n- …'
          }
          className={`${fieldClass} min-h-[12rem] resize-y font-mono leading-relaxed`}
          disabled={busy}
        />
      </div>

      {error && (
        <p role="alert" className="text-sm text-error">
          {error}
        </p>
      )}

      <div className="flex flex-wrap items-center justify-end gap-2">
        {dirty && <span className="mr-auto text-xs font-medium text-warning">Unsaved changes</span>}
        <button type="button" onClick={discard} disabled={!dirty || busy} className={quietButton}>
          Discard
        </button>
        <button type="submit" disabled={!dirty || !name.trim() || busy} className={primaryButton}>
          {busy && <Spinner />}
          {busy ? 'Saving…' : 'Save changes'}
        </button>
      </div>
    </form>
  );
}

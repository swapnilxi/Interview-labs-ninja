'use client';

import { useState } from 'react';
import Modal from '@/components/ui/Modal';
import type { LabName } from '@/lib/services/labSectionsService';
import type { Project } from '@/lib/services/projectService';
import { toast } from '@/lib/ui/toast';
import LabContentPicker from './LabContentPicker';
import { addLabPicksToProject, plannedItems, type LabSelection } from './labContent';

interface AddFromLabSheetProps {
  project: Project;
  /** Lab pages this project already has (linkedLabNodes of its tree). */
  existing: ReadonlyMap<string, number>;
  onClose: () => void;
  /** Called after anything was added, so the Explorer reloads its tree. */
  onAdded: () => void;
}

/** A project's Explorer → "From lab": pick topics and lessons from any lab and add them to this project. */
export default function AddFromLabSheet({
  project,
  existing,
  onClose,
  onAdded,
}: AddFromLabSheetProps) {
  const [lab, setLab] = useState<LabName>('dsa');
  const [selection, setSelection] = useState<LabSelection>(new Map());
  const [running, setRunning] = useState<{ done: number; total: number } | null>(null);

  const count = plannedItems(selection.values(), existing);
  const busy = running !== null;

  const add = async () => {
    if (busy || count === 0) return;
    setRunning({ done: 0, total: count });
    const result = await addLabPicksToProject(project.id, Array.from(selection.values()), {
      existing,
      onProgress: (done, total) => setRunning({ done, total }),
    });
    setRunning(null);
    if (result.added > 0) {
      onAdded();
      toast.success(`Added ${result.added} item${result.added === 1 ? '' : 's'} from the labs.`);
    }
    if (result.ok) onClose();
  };

  return (
    <Modal
      isOpen
      onClose={onClose}
      labelledBy="add-from-lab-title"
      closeOnEscape={!busy}
      closeOnBackdrop={!busy && selection.size === 0}
      className="ios-sheet flex h-[88vh] w-full flex-col overflow-hidden rounded-[22px] sm:h-[min(48rem,88vh)] sm:max-w-2xl"
    >
      <div className="ios-sheet-grabber sm:hidden" data-sheet-grabber="" aria-hidden="true">
        <span />
      </div>
      <div className="ios-sheet-head sm:pt-4">
        <div className="min-w-0">
          <h2 id="add-from-lab-title" className="ios-sheet-title">
            Add from a lab
          </h2>
          <p className="mt-0.5 truncate text-[13px] text-muted-foreground">To {project.title}</p>
        </div>
        <button type="button" onClick={onClose} className="sheet-done" disabled={busy}>
          Cancel
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4 sm:px-5">
        <LabContentPicker
          layout="sheet"
          lab={lab}
          onLabChange={setLab}
          selection={selection}
          onSelectionChange={setSelection}
          existing={existing}
        />
      </div>

      <div
        className="flex flex-shrink-0 items-center gap-3 border-t px-4 pb-[calc(0.75rem+var(--safe-bottom,0px))] pt-3 sm:px-5 sm:pb-4"
        style={{ borderColor: 'var(--color-separator)' }}
      >
        <p className="min-w-0 flex-1 text-[13px] text-muted-foreground" aria-live="polite">
          {selection.size === 0
            ? 'Pick topics or lessons to add.'
            : `${selection.size} topic${selection.size === 1 ? '' : 's'} selected`}
        </p>
        {selection.size > 0 && !busy && (
          <button
            type="button"
            className="lp-text-btn px-1"
            onClick={() => setSelection(new Map())}
          >
            Clear
          </button>
        )}
        <button
          type="button"
          className="todo-btn todo-btn-primary h-10 px-4"
          onClick={add}
          disabled={busy || count === 0}
        >
          {running ? (
            <>
              <span
                className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent"
                aria-hidden="true"
              />
              {running.done} of {running.total}…
            </>
          ) : (
            `Add${count > 0 ? ` ${count}` : ''}`
          )}
        </button>
      </div>
    </Modal>
  );
}

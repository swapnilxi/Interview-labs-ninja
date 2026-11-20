import Icon from '@/components/ui/AppIcon';
import type { WorkbookProgress } from './useWorkbookProgress';

/** Quiet autosave status, with a way out when a save fails or another tab saved first. */
export default function SaveIndicator({ progress }: { progress: WorkbookProgress }) {
  const { status, saveError } = progress;
  if (status === 'conflict') {
    return (
      <span className="wb-save wb-save-problem" role="alert">
        <Icon name="ExclamationTriangleIcon" size={14} />
        Changed elsewhere.
        <button type="button" className="wb-link" onClick={() => progress.reload()}>
          Reload
        </button>
      </span>
    );
  }
  if (status === 'error') {
    return (
      <span className="wb-save wb-save-problem" role="alert" title={saveError || undefined}>
        <Icon name="ExclamationTriangleIcon" size={14} />
        Not saved.
        <button type="button" className="wb-link" onClick={() => progress.retry()}>
          Retry
        </button>
      </span>
    );
  }
  const label =
    status === 'pending' || status === 'saving'
      ? 'Saving…'
      : status === 'saved'
        ? 'Saved'
        : 'Private to you';
  return (
    <span className="wb-save" aria-live="polite">
      <Icon name={status === 'saved' ? 'CheckIcon' : 'LockClosedIcon'} size={14} />
      {label}
    </span>
  );
}

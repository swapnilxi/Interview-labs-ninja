import { toast } from '@/lib/ui/toast';

function endWithPeriod(text: string): string {
  const trimmed = text.trim();
  return /[.!?]$/.test(trimmed) ? trimmed : `${trimmed}.`;
}

/**
 * Many service methods swallow failures on purpose — they return `null`/`false` so existing
 * callers keep working — which used to leave the user with no sign that an edit didn't save.
 * Those methods call this instead of only `console.error`, so every failed save shows up as a toast.
 *
 * `action` completes "Couldn't …" ("save that change", "delete the task"). `error.message` is
 * expected to already be a human sentence (see `todoApiError`), e.g. "Your account is pending
 * admin approval." or "Log in to use this feature."
 *
 * Methods whose callers already show their own inline error (e.g. `createInboxItem`,
 * `saveDailyPlan`) deliberately don't call this, to avoid saying it twice.
 */
export function reportFailure(action: string, error?: unknown): void {
  const detail = error instanceof Error ? error.message.trim() : '';
  // The network message already says what happened ("Couldn't reach the server…").
  if (/^couldn't reach the server/i.test(detail)) {
    toast.error(endWithPeriod(detail));
    return;
  }
  toast.error(
    detail
      ? `Couldn't ${action}. ${endWithPeriod(detail)}`
      : `Couldn't ${action}. Please try again.`
  );
}

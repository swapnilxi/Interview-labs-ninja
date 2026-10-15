/**
 * Where to go after logging in.
 *
 * - Logging in from the popup keeps the user exactly where they are (no navigation at all).
 * - The /login URL has no screen of its own. It sends the user back to the page they came from
 *   (`?next=` first, then the last page this tab showed), and only when there is no such page does it
 *   fall back to the To-Do app, which is the app's landing page.
 *
 * Not `/`: next.config.mjs redirects `/` to /daily-session, so it is not the landing page.
 */

export const LOGIN_RETURN_KEY = 'ninja_login_return_to';
export const DEFAULT_LOGIN_LANDING = '/ai-todo?tab=quick';

/** A same-origin, in-app path that isn't the login route itself (never an open redirect). */
export function isSafeReturnPath(path: unknown): path is string {
  if (typeof path !== 'string' || !path.startsWith('/') || path.startsWith('//')) return false;
  if (path === '/login' || path.startsWith('/login?') || path.startsWith('/login/')) return false;
  try {
    // Catches `/\evil.com`-style tricks: browsers read the backslash as a slash.
    return new URL(path, window.location.origin).origin === window.location.origin;
  } catch {
    return false;
  }
}

export function rememberReturnPath(path: string): void {
  if (!isSafeReturnPath(path)) return;
  try {
    sessionStorage.setItem(LOGIN_RETURN_KEY, path);
  } catch {
    // storage blocked (private window): the fallback landing page is used instead
  }
}

/** `?next=` if it is safe, else the page this tab was last on, else the To-Do landing page. */
export function resolveLoginReturnPath(next?: string | null): string {
  if (isSafeReturnPath(next)) return next;
  try {
    const remembered = sessionStorage.getItem(LOGIN_RETURN_KEY);
    if (isSafeReturnPath(remembered)) return remembered;
  } catch {
    // fall through
  }
  return DEFAULT_LOGIN_LANDING;
}

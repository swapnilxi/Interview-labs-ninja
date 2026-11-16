/**
 * Where to go after logging in.
 *
 * - Logging in from the popup keeps the user exactly where they are (no navigation at all).
 * - The /login screen (the app is login-only: AuthGate sends every guest there with `?next=`) sends the
 *   user on to `?next=` first, then the last page this tab showed, and only when there is no such page
 *   to the To-Do app, which is the app's landing page.
 *
 * Not `/`: next.config.mjs redirects `/` to /daily-session, so it is not the landing page.
 */

export const LOGIN_RETURN_KEY = 'ninja_login_return_to';
export const DEFAULT_LOGIN_LANDING = '/ai-todo?tab=today';

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

/**
 * What the person is on their way to, in words, when `?next=` points at a shared AI LMS link (a class someone sent them).
 * The login screen says it ("Log in to open the class you were sent."), so a link opened logged out does not land on an
 * unexplained login form. null for every other page.
 */
export function describeReturnTarget(next?: string | null): string | null {
  if (!isSafeReturnPath(next)) return null;
  const path = next.split(/[?#]/)[0];
  if (/^\/ai-lms\/classes\/[^/]+\/?$/.test(path)) return 'the class you were sent';
  if (/^\/ai-lms\/classes\//.test(path)) return 'the page you were sent';
  return null;
}

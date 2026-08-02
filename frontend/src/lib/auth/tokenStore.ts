/**
 * Plain (non-React) JWT token store, backed by localStorage.
 *
 * Lives outside React so the data-service layer (todoService, projectService,
 * etc.) can synchronously check auth state without needing a hook. The app
 * already trusts localStorage for AI provider API keys (see settingsService),
 * which are more sensitive than a session token, so this is consistent with
 * the app's existing security posture.
 */

const TOKEN_KEY = 'labninja.auth.token.v1';

let memoryToken: string | null = null;
let hydrated = false;
const listeners = new Set<() => void>();

function hydrate() {
  if (hydrated || typeof window === 'undefined') return;
  memoryToken = window.localStorage.getItem(TOKEN_KEY);
  hydrated = true;
}

export function getToken(): string | null {
  hydrate();
  return memoryToken;
}

export function setToken(token: string): void {
  memoryToken = token;
  hydrated = true;
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(TOKEN_KEY, token);
  }
  listeners.forEach((cb) => cb());
}

export function clearToken(): void {
  memoryToken = null;
  hydrated = true;
  if (typeof window !== 'undefined') {
    window.localStorage.removeItem(TOKEN_KEY);
  }
  listeners.forEach((cb) => cb());
}

export function isLoggedIn(): boolean {
  return !!getToken();
}

/** Subscribe to login/logout transitions (e.g. a 401 forcing a drop back to guest mode). Returns an unsubscribe function. */
export function onAuthChange(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

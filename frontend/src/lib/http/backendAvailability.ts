'use client';

/**
 * Backend-reachability helper for features that need to keep working when the
 * FastAPI backend itself is unreachable (not just returning an error status) —
 * e.g. it isn't running, crashed, or a network hiccup drops the connection.
 *
 * This is deliberately separate from apiClient.ts: apiFetch's job is auth +
 * error-body parsing for a backend assumed to be up. This layer adds a short
 * timeout and a circuit breaker so callers can distinguish "backend responded
 * (even with an error)" from "backend unreachable" and route the latter to a
 * local fallback without every subsequent call re-waiting out its own timeout.
 */

import { apiFetch } from './apiClient';

const DOWN_TTL_MS = 15_000;
const TIMEOUT_MS = 5_000;
/** For calls that wait on an AI provider (several rounds of generation): 5 minutes, not the 5-second default. */
export const AI_TIMEOUT_MS = 5 * 60_000;

let downUntil = 0;

/** True if a recent call already found the backend unreachable and the cooldown hasn't elapsed. */
export function isBackendKnownDown(): boolean {
  return Date.now() < downUntil;
}

/** True if `err` indicates the request never reached the backend (vs. a valid HTTP error response). */
export function isNetworkFailure(err: unknown): boolean {
  return err instanceof TypeError || (err instanceof DOMException && err.name === 'AbortError');
}

/** Thrown by backendFetch when a call outlives its own `timeoutMs`: the backend answered nothing in time, which is
 * not the same as being unreachable, so it doesn't trip the circuit breaker and isNetworkFailure() is false. */
export class BackendTimeoutError extends Error {
  constructor(timeoutMs: number) {
    super(`The server took longer than ${Math.round(timeoutMs / 1000)}s to answer. Try again.`);
    this.name = 'BackendTimeoutError';
  }
}

/**
 * apiFetch wrapped with a request timeout and circuit-breaker bookkeeping.
 * Throws exactly like apiFetch on network failure; callers should check
 * `isNetworkFailure()` on the caught error to decide whether to fall back.
 *
 * `timeoutMs` (default 5s) is for quick data calls; a call that waits on an AI provider must pass a long one
 * (AI_TIMEOUT_MS). Before it existed, generating Daily Session questions was cut off after 5s every time and the
 * page silently fell back to the same built-in questions.
 */
export async function backendFetch(
  path: string,
  options: RequestInit & { timeoutMs?: number } = {}
): Promise<Response> {
  const { timeoutMs = TIMEOUT_MS, ...init } = options;
  const controller = new AbortController();
  let timedOut = false;
  const timeoutId = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  try {
    const res = await apiFetch(path, { ...init, signal: init.signal ?? controller.signal });
    downUntil = 0;
    return res;
  } catch (err) {
    // A long call that simply ran out of time reached the backend: report it as a timeout, not as "offline".
    if (timedOut && timeoutMs > TIMEOUT_MS) throw new BackendTimeoutError(timeoutMs);
    if (isNetworkFailure(err)) downUntil = Date.now() + DOWN_TTL_MS;
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
}

/** Active probe of the unauthenticated /health endpoint. Also updates the circuit breaker. */
export async function checkBackendHealth(): Promise<boolean> {
  try {
    const res = await backendFetch('/health');
    return res.ok;
  } catch {
    return false;
  }
}

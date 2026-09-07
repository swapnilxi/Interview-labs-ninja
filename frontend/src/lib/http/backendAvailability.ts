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

let downUntil = 0;

/** True if a recent call already found the backend unreachable and the cooldown hasn't elapsed. */
export function isBackendKnownDown(): boolean {
  return Date.now() < downUntil;
}

/** True if `err` indicates the request never reached the backend (vs. a valid HTTP error response). */
export function isNetworkFailure(err: unknown): boolean {
  return err instanceof TypeError || (err instanceof DOMException && err.name === 'AbortError');
}

/**
 * apiFetch wrapped with a request timeout and circuit-breaker bookkeeping.
 * Throws exactly like apiFetch on network failure; callers should check
 * `isNetworkFailure()` on the caught error to decide whether to fall back.
 */
export async function backendFetch(path: string, options: RequestInit = {}): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await apiFetch(path, { ...options, signal: options.signal ?? controller.signal });
    downUntil = 0;
    return res;
  } catch (err) {
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

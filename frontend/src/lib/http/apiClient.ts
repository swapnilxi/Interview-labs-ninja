'use client';

/**
 * Shared authenticated fetch wrapper for the backend API.
 *
 * Consolidates what used to be duplicated per-service: the base URL, the
 * Authorization header, and FastAPI error-body parsing.
 */

import { clearToken, getToken, isLoggedIn } from '@/lib/auth/tokenStore';

export const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8082';

/** Extract a human-readable error message from a failed API response (FastAPI returns {"detail": "..."}). */
export async function parseApiError(res: Response): Promise<string> {
  if (res.status === 401) {
    return 'Log in to use this feature.';
  }
  try {
    const data = await res.json();
    if (data?.detail) return typeof data.detail === 'string' ? data.detail : JSON.stringify(data.detail);
  } catch {
    // response body wasn't JSON
  }
  return `Request failed (HTTP ${res.status})`;
}

/**
 * fetch() against the backend, with the Bearer token attached automatically
 * when logged in. On a 401, drops the stored token (it's stale/invalid) so
 * the app falls back to guest mode rather than repeatedly failing with it.
 */
export async function apiFetch(path: string, options: RequestInit = {}): Promise<Response> {
  const headers = new Headers(options.headers);
  const isFormData = typeof FormData !== 'undefined' && options.body instanceof FormData;
  if (!isFormData && options.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  if (isLoggedIn()) {
    headers.set('Authorization', `Bearer ${getToken()}`);
  }

  const res = await fetch(`${API_BASE_URL}${path}`, { ...options, headers });

  if (res.status === 401 && isLoggedIn()) {
    clearToken();
  }

  return res;
}

export async function apiJson<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await apiFetch(path, options);
  if (!res.ok) throw new Error(await parseApiError(res));
  return (await res.json()) as T;
}

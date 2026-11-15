'use client';

/**
 * Client for the shared per-user AI memory (backend/modules/memory, twin fe-apis/memory).
 *
 * Modules call `remember()` when something happens (a card saved, a quiz missed); the server folds repeats into one
 * stronger fact and puts the strongest few into that module's next AI prompt. Login-required, so a guest's calls do
 * nothing. `remember` never throws and never blocks the UI: memory is a bonus, not part of the action.
 */

import { isLoggedIn } from '@/lib/auth/tokenStore';
import { apiFetch, parseApiError } from '@/lib/http/apiClient';

export type MemoryKind = 'interest' | 'struggle' | 'mastered' | 'preference';

export interface MemoryFact {
  id: number;
  module: string;
  topic: string;
  kind: MemoryKind;
  fact: string;
  weight: number;
  hits: number;
  updatedAt: string;
}

export const MEMORY_KIND_LABEL: Record<MemoryKind, string> = {
  interest: 'Likes',
  struggle: 'Struggles with',
  mastered: 'Knows well',
  preference: 'Prefers',
};

/** Records (or strengthens) one fact. Fire and forget. */
export function remember(event: { module: string; topic?: string; kind: MemoryKind; fact: string }): void {
  if (!isLoggedIn()) return;
  void apiFetch('/memory/events', { method: 'POST', body: JSON.stringify({ topic: '', ...event }) }).catch(() => {});
}

/** Prompt-ready memory lines for a module, for AI calls the browser makes itself ([] for guests or on failure). */
export async function fetchMemoryLines(module: string, topic = ''): Promise<string[]> {
  if (!isLoggedIn()) return [];
  try {
    const res = await apiFetch(`/memory/lines?module=${encodeURIComponent(module)}&topic=${encodeURIComponent(topic)}`);
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data?.lines) ? data.lines.filter((l: unknown) => typeof l === 'string') : [];
  } catch {
    return [];
  }
}

export async function listMemory(module?: string): Promise<MemoryFact[]> {
  const res = await apiFetch(module ? `/memory?module=${encodeURIComponent(module)}` : '/memory');
  if (!res.ok) throw new Error(await parseApiError(res));
  const data = await res.json();
  return Array.isArray(data?.facts) ? data.facts : [];
}

export async function forgetMemory(id: number): Promise<void> {
  const res = await apiFetch(`/memory/${id}`, { method: 'DELETE' });
  if (!res.ok) throw new Error(await parseApiError(res));
}

export async function clearMemory(module?: string): Promise<number> {
  const res = await apiFetch(module ? `/memory?module=${encodeURIComponent(module)}` : '/memory', { method: 'DELETE' });
  if (!res.ok) throw new Error(await parseApiError(res));
  return (await res.json())?.deleted ?? 0;
}

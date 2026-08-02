'use client';

import { parseApiError } from './todoService';
import { aiRequestFields } from './settingsService';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8082';

export type ParetoTable = 'tasks' | 'quick_tasks' | 'project_nodes' | 'projects';
export type ParetoScope = 'smart' | 'quick' | 'plan' | 'all';

export interface TopTask {
  id: number;
  title: string;
  pareto_score: number | null;
  reason?: string | null;
  locked?: boolean;
  table?: ParetoTable;
}

export interface Top20Response {
  smart: TopTask[];
  quick: TopTask[];
  plan: TopTask[];
}

export interface AnalyzeResult {
  results: { table: ParetoTable; id: number; pareto_score: number; is_top_20: boolean; reason?: string }[];
  analyzed_count?: number;
  top20_count?: number;
  message?: string;
}

/** Maps a Pareto scope to the tab it lives in — used for "Focus on this" navigation. */
export const SCOPE_TO_TAB: Record<ParetoScope, 'quick' | 'smart' | 'plan' | null> = {
  quick: 'quick',
  smart: 'smart',
  plan: 'plan',
  all: null,
};

export const paretoService = {
  async analyze(scope: ParetoScope, model: 'ollama' | 'gemini' = 'gemini'): Promise<AnalyzeResult> {
    const res = await fetch(`${API_BASE_URL}/pareto/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scope, ...aiRequestFields(model) }),
    });
    if (!res.ok) throw new Error(await parseApiError(res));
    return await res.json();
  },

  async getTop20(): Promise<Top20Response> {
    try {
      const res = await fetch(`${API_BASE_URL}/pareto/top20`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (err) {
      console.error('Failed to fetch top 20', err);
      return { smart: [], quick: [], plan: [] };
    }
  },

  async reanalyze(table: ParetoTable, itemId: number, model: 'ollama' | 'gemini' = 'gemini'): Promise<{
    status: string; pareto_score: number; is_top_20: boolean; reason?: string;
  }> {
    const res = await fetch(`${API_BASE_URL}/pareto/reanalyze/${table}/${itemId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(aiRequestFields(model)),
    });
    if (!res.ok) throw new Error(await parseApiError(res));
    return await res.json();
  },

  /** True if an 80/20 analysis has already been run for this scope today (client-side reminder only). */
  hasAnalyzedToday(scope: ParetoScope): boolean {
    if (typeof window === 'undefined') return false;
    const today = new Date().toISOString().slice(0, 10);
    return window.localStorage.getItem(`pareto-last-run-${scope}`) === today;
  },

  markAnalyzedToday(scope: ParetoScope): void {
    if (typeof window === 'undefined') return;
    const today = new Date().toISOString().slice(0, 10);
    window.localStorage.setItem(`pareto-last-run-${scope}`, today);
  },
};

const TOP20_COMPLETED_EVENT = 'pareto:top20-completed';

/** Dispatched whenever a Top 20% task/quick task/node is marked done, so the Copilot
 *  sidebar can proactively congratulate the user and offer to find the next one. */
export function notifyTopTaskCompleted(title: string) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(TOP20_COMPLETED_EVENT, { detail: { title } }));
}

export function onTopTaskCompleted(handler: (title: string) => void): () => void {
  if (typeof window === 'undefined') return () => {};
  const listener = (e: Event) => handler((e as CustomEvent<{ title: string }>).detail.title);
  window.addEventListener(TOP20_COMPLETED_EVENT, listener);
  return () => window.removeEventListener(TOP20_COMPLETED_EVENT, listener);
}

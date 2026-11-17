/**
 * fe-apis/todo/agent/webStep.ts
 *
 * Port of backend/modules/ai_todo/agent/web_step.py: the web step shared by the Assistant chat and AI jobs with
 * "search the web" on. The model asks with `"web_search": "<query>"`; the server runs it through the read-only,
 * SSRF-guarded research module (fe-apis/research/web.ts) and asks again with the results in the prompt. One search
 * per answer, at most. Same limits and prompt text as the Python file, change both.
 */

import { pyJsonDumps } from '../py';
import type { Row } from '../_shared';
import { research } from '../../research/web';

const QUERY_MAX = 200;
const PAGES_TO_READ = 3;
const RESULTS_IN_PROMPT = 5;
const SOURCES_MAX = 5;

/** `search_query`: the query the model asked for, or null when it didn't ask (null, "", "null", not a string). */
export function searchQuery(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const query = value.trim().slice(0, QUERY_MAX);
  return query && !['null', 'none'].includes(query.toLowerCase()) ? query : null;
}

/** `run_search`: search results with page text for the top few; [] when the search is unavailable. */
export async function runSearch(query: string): Promise<Row[]> {
  try {
    const found = await research(query, PAGES_TO_READ);
    return found.results.filter((r) => r && typeof r === 'object').slice(0, RESULTS_IN_PROMPT);
  } catch {
    return [];
  }
}

/** `web_block`: the prompt section that hands the results to the model. */
export function webBlock(query: string, results: Row[]): string {
  if (!results.length) {
    return `You searched the web for "${query}" and found nothing usable. Answer without it and say so.\n\n`;
  }
  const rows = results.map((r) => ({
    title: r.title || '',
    url: r.url || '',
    snippet: r.snippet || '',
    text: r.text || '',
  }));
  return `Web results for "${query}" (JSON; use them for current facts and name the sites you used):\n${pyJsonDumps(rows)}\n\n`;
}

/** `sources_of`: [{title, url}] for the UI. */
export function sourcesOf(results: Row[]): { title: string; url: string }[] {
  const out: { title: string; url: string }[] = [];
  for (const r of results.slice(0, SOURCES_MAX)) {
    if (typeof r.url === 'string' && r.url.startsWith('http')) {
      out.push({ title: r.title || r.url, url: r.url });
    }
  }
  return out;
}

/**
 * The organizer's own UI state, kept in `sessionStorage` so it survives the organizer being unmounted while a question is
 * open (opening a question replaces the board; its Back remounts it). Without it the search, the filters, the sort order, the
 * phone's Queue / Weeks pane and both scroll positions all came back reset.
 *
 * One record per plan (`dsa-organizer-ui:v1:<plan id | suggested>`). The lab drops every record when the learner leaves the
 * organizer for good (see `clearOrganizerUi`), so the next visit starts clean. Every storage access is wrapped: a private
 * window or blocked storage just means the state is not remembered.
 */
import type { DifficultyGroup } from '../weekPlan';
import type { QueueFilters, QueueSort } from './QueuePanel';

const PREFIX = 'dsa-organizer-ui:v1:';
const SORTS: readonly QueueSort[] = ['recommended', 'learning', 'difficulty', 'pattern'];
const DIFFICULTIES: readonly DifficultyGroup[] = ['easy', 'medium', 'hard'];

export type OrganizerPane = 'queue' | 'weeks';

export interface OrganizerUi {
  filters: QueueFilters;
  pane: OrganizerPane;
  /** `scrollTop` of the weeks board and of the queue list, in px. */
  boardScroll: number;
  queueScroll: number;
}

const keyOf = (planId: number | string | null | undefined) => `${PREFIX}${planId ?? 'suggested'}`;

const px = (v: unknown) =>
  typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.round(v) : 0;

/** The saved state for a plan, or null when there is none (or it is not a record this version wrote). */
export function readOrganizerUi(planId: number | string | null | undefined): OrganizerUi | null {
  try {
    const raw = window.sessionStorage.getItem(keyOf(planId));
    if (!raw) return null;
    const data = JSON.parse(raw) as Record<string, unknown> | null;
    const f = data && typeof data === 'object' ? (data.filters as Record<string, unknown>) : null;
    if (!data || !f || typeof f !== 'object') return null;
    const sort = SORTS.find((s) => s === f.sort) ?? 'recommended';
    const difficulties = new Set<DifficultyGroup>(
      Array.isArray(f.difficulties)
        ? DIFFICULTIES.filter((d) => (f.difficulties as unknown[]).includes(d))
        : []
    );
    return {
      filters: {
        search: typeof f.search === 'string' ? f.search.slice(0, 200) : '',
        pattern: typeof f.pattern === 'string' ? f.pattern : '',
        difficulties,
        hideDone: f.hideDone === true,
        sort,
      },
      pane: data.pane === 'queue' ? 'queue' : 'weeks',
      boardScroll: px(data.boardScroll),
      queueScroll: px(data.queueScroll),
    };
  } catch {
    return null;
  }
}

export function writeOrganizerUi(planId: number | string | null | undefined, ui: OrganizerUi) {
  try {
    window.sessionStorage.setItem(
      keyOf(planId),
      JSON.stringify({
        filters: {
          search: ui.filters.search,
          pattern: ui.filters.pattern,
          difficulties: [...ui.filters.difficulties],
          hideDone: ui.filters.hideDone,
          sort: ui.filters.sort,
        },
        pane: ui.pane,
        boardScroll: px(ui.boardScroll),
        queueScroll: px(ui.queueScroll),
      })
    );
  } catch {
    /* storage blocked or full: the state is simply not remembered */
  }
}

/** Forget every plan's saved state (the learner left the organizer for good). */
export function clearOrganizerUi() {
  try {
    const stale: string[] = [];
    for (let i = 0; i < window.sessionStorage.length; i++) {
      const key = window.sessionStorage.key(i);
      if (key?.startsWith(PREFIX)) stale.push(key);
    }
    stale.forEach((key) => window.sessionStorage.removeItem(key));
  } catch {
    /* nothing to clear */
  }
}

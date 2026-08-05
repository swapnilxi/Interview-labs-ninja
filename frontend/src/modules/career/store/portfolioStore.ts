'use client';

/** Zustand store for the portfolio builder — mirrors resumeStore (widgets + theme). */

import { create } from 'zustand';
import { portfolioService } from '@/lib/services/portfolioService';
import type { Portfolio, PortfolioTheme, PortfolioVersion, PortfolioWidget } from '../types';

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

const saveTimers: Record<string, ReturnType<typeof setTimeout>> = {};
let savedFlashTimer: ReturnType<typeof setTimeout> | undefined;
let lastHistory = { key: '', at: 0 };
const DEBOUNCE_MS = 1500;
const HISTORY_COALESCE_MS = 700;

interface PortfolioStore {
  portfolio: Portfolio | null;
  loading: boolean;
  error: string | null;
  saveStatus: SaveStatus;
  past: PortfolioWidget[][];
  future: PortfolioWidget[][];

  load: (masterId: string) => Promise<void>;
  reset: () => void;
  setTitle: (title: string) => void;
  setTheme: (patch: Partial<PortfolioTheme>) => void;
  editWidget: (widgetId: string, patch: Partial<Pick<PortfolioWidget, 'content' | 'title' | 'is_hidden'>>) => void;
  addWidget: (widgetType: string, title?: string) => Promise<void>;
  duplicateWidget: (widgetId: string) => Promise<void>;
  removeWidget: (widgetId: string) => Promise<void>;
  reorder: (orderedIds: string[]) => Promise<void>;
  snapshot: (label?: string) => Promise<PortfolioVersion | null>;
  restore: (versionId: string) => Promise<void>;
  undo: () => void;
  redo: () => void;
}

const deepCopy = <T,>(v: T): T => JSON.parse(JSON.stringify(v));

export const usePortfolioStore = create<PortfolioStore>((set, get) => {
  const flashSaved = () => {
    set({ saveStatus: 'saved' });
    if (savedFlashTimer) clearTimeout(savedFlashTimer);
    savedFlashTimer = setTimeout(() => {
      if (get().saveStatus === 'saved') set({ saveStatus: 'idle' });
    }, 1600);
  };

  const pushHistory = (key: string) => {
    const now = Date.now();
    if (lastHistory.key === key && now - lastHistory.at < HISTORY_COALESCE_MS) {
      lastHistory.at = now;
      return;
    }
    lastHistory = { key, at: now };
    const { portfolio, past } = get();
    if (!portfolio) return;
    set({ past: [...past.slice(-49), deepCopy(portfolio.widgets)], future: [] });
  };

  const scheduleWidgetSave = (widgetId: string) => {
    set({ saveStatus: 'saving' });
    if (saveTimers[widgetId]) clearTimeout(saveTimers[widgetId]);
    saveTimers[widgetId] = setTimeout(async () => {
      const { portfolio } = get();
      const w = portfolio?.widgets.find((x) => x.id === widgetId);
      if (!portfolio || !w) return;
      try {
        await portfolioService.updateWidget(portfolio.id, widgetId, { content: w.content, title: w.title, is_hidden: w.is_hidden });
        flashSaved();
      } catch {
        set({ saveStatus: 'error' });
      }
    }, DEBOUNCE_MS);
  };

  // See resumeStore: undo/redo only tracks id-set-stable ops (edits, reorder).
  // Structural changes clear history so persistAllWidgets never PATCHes a
  // widget id the server no longer has.
  const clearHistory = () => {
    lastHistory = { key: '', at: 0 };
    set({ past: [], future: [] });
  };

  const persistAllWidgets = async () => {
    const { portfolio } = get();
    if (!portfolio) return;
    set({ saveStatus: 'saving' });
    try {
      await Promise.all(portfolio.widgets.map((w) => portfolioService.updateWidget(portfolio.id, w.id, { content: w.content, title: w.title, is_hidden: w.is_hidden })));
      await portfolioService.reorderWidgets(portfolio.id, portfolio.widgets.map((w) => w.id));
      flashSaved();
    } catch {
      set({ saveStatus: 'error' });
    }
  };

  return {
    portfolio: null,
    loading: false,
    error: null,
    saveStatus: 'idle',
    past: [],
    future: [],

    async load(masterId) {
      set({ loading: true, error: null, past: [], future: [] });
      try {
        set({ portfolio: await portfolioService.getPortfolio(masterId), loading: false });
      } catch (e: any) {
        set({ error: e?.message || 'Failed to load portfolio', loading: false });
      }
    },

    reset() {
      set({ portfolio: null, past: [], future: [], saveStatus: 'idle', error: null });
    },

    setTitle(title) {
      const { portfolio } = get();
      if (!portfolio) return;
      set({ portfolio: { ...portfolio, title }, saveStatus: 'saving' });
      if (saveTimers['__title__']) clearTimeout(saveTimers['__title__']);
      saveTimers['__title__'] = setTimeout(async () => {
        try {
          await portfolioService.updatePortfolio(portfolio.id, { title: get().portfolio?.title || title });
          flashSaved();
        } catch {
          set({ saveStatus: 'error' });
        }
      }, DEBOUNCE_MS);
    },

    setTheme(patch) {
      const { portfolio } = get();
      if (!portfolio) return;
      const theme = { ...portfolio.theme, ...patch };
      set({ portfolio: { ...portfolio, theme }, saveStatus: 'saving' });
      if (saveTimers['__theme__']) clearTimeout(saveTimers['__theme__']);
      saveTimers['__theme__'] = setTimeout(async () => {
        try {
          await portfolioService.updatePortfolio(portfolio.id, { theme: get().portfolio?.theme });
          flashSaved();
        } catch {
          set({ saveStatus: 'error' });
        }
      }, 600);
    },

    editWidget(widgetId, patch) {
      const { portfolio } = get();
      if (!portfolio) return;
      pushHistory(widgetId);
      set({ portfolio: { ...portfolio, widgets: portfolio.widgets.map((w) => (w.id === widgetId ? { ...w, ...patch } : w)) } });
      scheduleWidgetSave(widgetId);
    },

    async addWidget(widgetType, title) {
      const { portfolio } = get();
      if (!portfolio) return;
      try {
        const w = await portfolioService.addWidget(portfolio.id, widgetType, title);
        set({ portfolio: { ...get().portfolio!, widgets: [...get().portfolio!.widgets, w] } });
        clearHistory();
      } catch (e: any) {
        set({ saveStatus: 'error', error: e?.message || 'Failed to add widget' });
      }
    },

    async duplicateWidget(widgetId) {
      const { portfolio } = get();
      const src = portfolio?.widgets.find((w) => w.id === widgetId);
      if (!portfolio || !src) return;
      try {
        const w = await portfolioService.addWidget(portfolio.id, src.widget_type, `${src.title || ''} (copy)`, src.content);
        set({ portfolio: { ...get().portfolio!, widgets: [...get().portfolio!.widgets, w] } });
        clearHistory();
      } catch (e: any) {
        set({ saveStatus: 'error', error: e?.message || 'Failed to duplicate' });
      }
    },

    async removeWidget(widgetId) {
      const { portfolio } = get();
      if (!portfolio) return;
      set({ portfolio: { ...portfolio, widgets: portfolio.widgets.filter((w) => w.id !== widgetId) } });
      clearHistory();
      try {
        await portfolioService.deleteWidget(portfolio.id, widgetId);
        flashSaved();
      } catch {
        set({ saveStatus: 'error' });
      }
    },

    async reorder(orderedIds) {
      const { portfolio } = get();
      if (!portfolio) return;
      pushHistory('reorder');
      const byId = new Map(portfolio.widgets.map((w) => [w.id, w]));
      const reordered = orderedIds
        .map((id) => byId.get(id))
        .filter((w): w is PortfolioWidget => Boolean(w))
        .map((w, i) => ({ ...w, sort_order: i }));
      set({ portfolio: { ...portfolio, widgets: reordered }, saveStatus: 'saving' });
      try {
        await portfolioService.reorderWidgets(portfolio.id, orderedIds);
        flashSaved();
      } catch {
        set({ saveStatus: 'error' });
      }
    },

    async snapshot(label) {
      const { portfolio } = get();
      if (!portfolio) return null;
      try {
        const v = await portfolioService.snapshotVersion(portfolio.id, label);
        set({ portfolio: { ...get().portfolio!, current_version_id: v.id } });
        return v;
      } catch (e: any) {
        set({ saveStatus: 'error', error: e?.message || 'Failed to save version' });
        return null;
      }
    },

    async restore(versionId) {
      const { portfolio } = get();
      if (!portfolio) return;
      try {
        set({ portfolio: await portfolioService.restoreVersion(portfolio.id, versionId) });
        clearHistory();
        flashSaved();
      } catch (e: any) {
        set({ saveStatus: 'error', error: e?.message || 'Failed to restore' });
      }
    },

    undo() {
      const { past, future, portfolio } = get();
      if (!portfolio || past.length === 0) return;
      const previous = past[past.length - 1];
      set({ past: past.slice(0, -1), future: [deepCopy(portfolio.widgets), ...future].slice(0, 50), portfolio: { ...portfolio, widgets: deepCopy(previous) } });
      void persistAllWidgets();
    },

    redo() {
      const { past, future, portfolio } = get();
      if (!portfolio || future.length === 0) return;
      const next = future[0];
      set({ future: future.slice(1), past: [...past, deepCopy(portfolio.widgets)].slice(-50), portfolio: { ...portfolio, widgets: deepCopy(next) } });
      void persistAllWidgets();
    },
  };
});

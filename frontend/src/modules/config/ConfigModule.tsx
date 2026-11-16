'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Icon from '@/components/ui/AppIcon';
import SaveControl from '@/components/ui/SaveControl';
import { useAutoSave, type AutoSaveState } from '@/lib/ui/useAutoSave';
import { useLocationSearch } from '@/lib/navigation/useLocationSearch';
import {
  settingsService,
  DEFAULT_SETTINGS,
  type OllamaStatus,
  type UserSettings,
} from '@/lib/services/settingsService';
import LabSettingsManager, { type LabSaveReport } from '@/modules/labs/common/LabSettingsManager';
import AppearanceSettingsCard from './AppearanceSettingsCard';
import {
  ConfigContext,
  type ConfigContextValue,
  type KeyTest,
  type SectionId,
} from './ConfigContext';
import type { AiDefaultState, KeyField } from './catalog';
import ModelSection from './ModelSection';
import KeysSection from './KeysSection';
import AdvancedSection from './AdvancedSection';
import MemorySection from './MemorySection';
import InstallSection from './InstallSection';
import { SectionHeader } from './parts';

/*
 * Settings. The page sits in a `.lab-page` frame (app/config/page.tsx): every `border` is the one lab hairline and the
 * Settings accent is the only interactive colour. Seven sections, one shown at a time: a side rail on tablets and
 * desktop, a segmented band under the header on phones. Every edit saves itself shortly after it is made; the Save
 * button (rail on desktop, a capsule above the tab bar on phones, Ctrl/⌘+S anywhere) saves at once and confirms it.
 */

const SECTIONS: { id: SectionId; label: string; short: string; icon: string }[] = [
  { id: 'model', label: 'AI model', short: 'Model', icon: 'SparklesIcon' },
  { id: 'keys', label: 'API keys', short: 'Keys', icon: 'KeyIcon' },
  { id: 'appearance', label: 'Appearance', short: 'Appearance', icon: 'SwatchIcon' },
  { id: 'prompts', label: 'Lab prompts', short: 'Prompts', icon: 'AdjustmentsHorizontalIcon' },
  { id: 'memory', label: 'AI memory', short: 'Memory', icon: 'CpuChipIcon' },
  { id: 'install', label: 'Install app', short: 'Install', icon: 'ArrowDownTrayIcon' },
  { id: 'advanced', label: 'Advanced', short: 'Advanced', icon: 'WrenchScrewdriverIcon' },
];

const isSection = (v: string | null): v is SectionId => SECTIONS.some((s) => s.id === v);

/** `?section=keys`, or a hash such as the menu's `/config#appearance`. */
function sectionFromUrl(): SectionId {
  const query = new URLSearchParams(window.location.search).get('section');
  if (isSection(query)) return query;
  const hash = window.location.hash.replace('#', '');
  return isSection(hash) ? hash : 'model';
}

type SaveView = { state: AutoSaveState; error: string | null; retry: () => void };

/** One status for several forms: a failure first, then work in progress, then "saved". */
function mergeSaves(list: SaveView[]): SaveView {
  const rank: Record<AutoSaveState, number> = {
    error: 4,
    saving: 3,
    pending: 2,
    saved: 1,
    idle: 0,
  };
  return list.reduce((a, b) => (rank[b.state] > rank[a.state] ? b : a));
}

export default function ConfigInteractive() {
  const [settings, setSettings] = useState<UserSettings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [section, setSection] = useState<SectionId>('model');
  const [focusTarget, setFocusTarget] = useState<string | null>(null);
  const [sameModel, setSameModel] = useState(true);
  const [aiDefault, setAiDefault] = useState<AiDefaultState>(undefined);
  const [keyTests, setKeyTests] = useState<Partial<Record<KeyField, KeyTest>>>({});

  const [ollamaStatus, setOllamaStatus] = useState<OllamaStatus | null>(null);
  const [ollamaDetecting, setOllamaDetecting] = useState(false);
  const [ollamaModels, setOllamaModels] = useState<string[]>([]);
  const [ollamaModelsLoading, setOllamaModelsLoading] = useState(false);
  const [ollamaModelsError, setOllamaModelsError] = useState('');
  const ollamaRequest = useRef(0);
  const ollamaDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Saving: every edit is scheduled (600 ms after typing pauses); Save / Ctrl+S saves at once ──────────────────────
  const autosave = useAutoSave<UserSettings>((next) => settingsService.saveSettings(next), 600);
  const scheduleSave = autosave.schedule;
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  // The lab prompts form (Lab prompts section) reports its own auto-save here, so one Save button covers both.
  const labSave = useRef<LabSaveReport | null>(null);
  const [labView, setLabView] = useState<SaveView | null>(null);
  const onLabSaveState = useCallback((report: LabSaveReport) => {
    labSave.current = report;
    setLabView({ state: report.state, error: report.error, retry: report.retry });
  }, []);

  const saveAll = useCallback(async (): Promise<boolean> => {
    const [settingsOk, labOk] = await Promise.all([
      autosave.saveNow(settingsRef.current),
      labSave.current ? labSave.current.flush() : Promise.resolve(true),
    ]);
    return settingsOk && labOk;
  }, [autosave.saveNow]); // eslint-disable-line react-hooks/exhaustive-deps

  const saveView = mergeSaves([
    { state: autosave.state, error: autosave.error, retry: autosave.retry },
    ...(section === 'prompts' && labView ? [labView] : []),
  ]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === 's') {
        e.preventDefault();
        void saveAll();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [saveAll]);

  // ── Ollama: is it running, and which models has it pulled ─────────────────────────────────────────────────────────
  const refreshOllama = useCallback(async (url: string) => {
    const request = ++ollamaRequest.current;
    setOllamaDetecting(true);
    setOllamaModelsLoading(true);
    setOllamaModelsError('');
    const [status, models] = await Promise.allSettled([
      settingsService.getOllamaStatus(url),
      settingsService.getOllamaModels(url),
    ]);
    if (request !== ollamaRequest.current) return; // a newer address was typed meanwhile
    if (status.status === 'fulfilled') {
      setOllamaStatus(status.value);
      const first = status.value.running ? status.value.models[0]?.name : undefined;
      // Not an edit: fill an empty model name in memory only, as before (the next real edit saves it).
      if (first && !settingsRef.current.ollamaModel) {
        const next = { ...settingsRef.current, ollamaModel: first };
        settingsRef.current = next;
        setSettings(next);
      }
    } else {
      setOllamaStatus({ running: false, url, models: [], error: 'Could not reach the backend' });
    }
    if (models.status === 'fulfilled') {
      setOllamaModels(models.value);
      if (models.value.length === 0)
        setOllamaModelsError('Ollama is reachable but has no models pulled yet.');
    } else {
      setOllamaModels([]);
      setOllamaModelsError(
        models.reason instanceof Error ? models.reason.message : 'Could not reach Ollama.'
      );
    }
    setOllamaDetecting(false);
    setOllamaModelsLoading(false);
  }, []);

  // ── Every user edit ───────────────────────────────────────────────────────────────────────────────────────────────
  const edit = useCallback(
    (patch: Partial<UserSettings>) => {
      const next = { ...settingsRef.current, ...patch };
      settingsRef.current = next;
      setSettings(next);
      scheduleSave(next);
      // A changed key makes its last test result stale.
      setKeyTests((prev) => {
        const stale = Object.keys(patch).filter((k) => k in prev);
        if (stale.length === 0) return prev;
        const copy = { ...prev };
        stale.forEach((k) => delete copy[k as KeyField]);
        return copy;
      });
      if (patch.ollamaUrl !== undefined) {
        if (ollamaDebounce.current) clearTimeout(ollamaDebounce.current);
        ollamaDebounce.current = setTimeout(() => void refreshOllama(next.ollamaUrl), 800);
      }
    },
    [scheduleSave, refreshOllama]
  );

  const testKey = useCallback(async (field: KeyField) => {
    const apiKey = settingsRef.current[field] || '';
    if (!apiKey.trim()) return;
    const provider = field.replace(/Key$/, '');
    const baseUrl = provider === 'openrouter' ? settingsRef.current.openrouterUrl : undefined;
    setKeyTests((prev) => ({ ...prev, [field]: { loading: true } }));
    try {
      const result = await settingsService.testApiKey(provider, apiKey, baseUrl);
      setKeyTests((prev) => ({
        ...prev,
        [field]: { loading: false, ok: result.ok, message: result.message },
      }));
    } catch (err) {
      setKeyTests((prev) => ({
        ...prev,
        [field]: {
          loading: false,
          ok: false,
          message: err instanceof Error ? err.message : 'Test failed',
        },
      }));
    }
  }, []);

  // ── Load ──────────────────────────────────────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    settingsService
      .getSettings()
      .then((data) => {
        const loaded = { ...DEFAULT_SETTINGS, ...data };
        settingsRef.current = loaded;
        setSettings(loaded);
        setSameModel(loaded.answerModel === loaded.textGenerationModel);
        void refreshOllama(loaded.ollamaUrl);
      })
      .catch((err) => console.error('Failed to load settings:', err))
      .finally(() => {
        setSection(sectionFromUrl());
        setLoading(false);
      });
    settingsService
      .getAiDefault()
      .then(setAiDefault)
      .catch(() => setAiDefault(null));
    return () => {
      if (ollamaDebounce.current) clearTimeout(ollamaDebounce.current);
    };
  }, [refreshOllama]);

  // The menu's "Accent colour" link (/config#appearance) also works while this page is open.
  useEffect(() => {
    const onHash = () => {
      const hash = window.location.hash.replace('#', '');
      if (isSection(hash)) setSection(hash);
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  // A link to /config?section=… while this page is already open (the menu's "Install app" row): Next keeps the page
  // mounted, so only the query changes.
  const search = useLocationSearch();
  useEffect(() => {
    const query = new URLSearchParams(search).get('section');
    if (isSection(query)) setSection(query);
  }, [search]);

  // Phones: seven segments overflow the band, so scroll the open one into view (only the band moves, not the page).
  useEffect(() => {
    if (loading) return;
    const active = document.querySelector<HTMLElement>('.cfg-band .ios-segment-active');
    const strip = active?.parentElement;
    if (!active || !strip || strip.scrollWidth <= strip.clientWidth) return;
    const a = active.getBoundingClientRect();
    const b = strip.getBoundingClientRect();
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    strip.scrollTo({
      left: Math.max(0, strip.scrollLeft + a.left - b.left - (b.width - a.width) / 2),
      behavior: reduce ? 'auto' : 'smooth',
    });
  }, [section, loading]);

  // ── Navigation ────────────────────────────────────────────────────────────────────────────────────────────────────
  const goTo = useCallback((id: SectionId, focusId?: string) => {
    setSection(id);
    setFocusTarget(focusId ?? null);
    if (id !== 'prompts') {
      labSave.current = null;
      setLabView(null);
    }
    // Keep the address shareable without adding history entries: Back still leaves Settings, as before.
    const url = new URL(window.location.href);
    if (id === 'model') url.searchParams.delete('section');
    else url.searchParams.set('section', id);
    url.hash = '';
    window.history.replaceState(window.history.state, '', url.toString());
    if (window.scrollY > 0) window.scrollTo({ top: 0 });
  }, []);

  useEffect(() => {
    if (!focusTarget) return;
    const frame = requestAnimationFrame(() => {
      const el = document.getElementById(focusTarget);
      if (el) {
        el.scrollIntoView({ block: 'center' });
        el.focus({ preventScroll: true });
      }
      setFocusTarget(null);
    });
    return () => cancelAnimationFrame(frame);
  }, [focusTarget, section]);

  const ctx = useMemo<ConfigContextValue>(
    () => ({
      settings,
      edit,
      aiDefault,
      ollama: {
        status: ollamaStatus,
        detecting: ollamaDetecting,
        models: ollamaModels,
        modelsLoading: ollamaModelsLoading,
        modelsError: ollamaModelsError,
        refresh: () => void refreshOllama(settingsRef.current.ollamaUrl),
      },
      keyTests,
      testKey,
      sameModel,
      setSameModel,
      goTo,
      focusTarget,
    }),
    [
      settings,
      edit,
      aiDefault,
      ollamaStatus,
      ollamaDetecting,
      ollamaModels,
      ollamaModelsLoading,
      ollamaModelsError,
      refreshOllama,
      keyTests,
      testKey,
      sameModel,
      goTo,
      focusTarget,
    ]
  );

  if (loading) {
    return (
      <div
        className="flex items-center justify-center py-[3.75rem]"
        role="status"
        aria-label="Loading settings"
      >
        <div className="h-9 w-9 animate-spin rounded-full border-[3px] border-border border-t-primary" />
      </div>
    );
  }

  const saveControl = (layout: 'inline' | 'stacked') => (
    <SaveControl
      layout={layout}
      state={saveView.state}
      error={saveView.error}
      onRetry={saveView.retry}
      onSave={saveAll}
      savedText="All changes saved"
    />
  );

  return (
    <ConfigContext.Provider value={ctx}>
      <div className="cfg-layout">
        {/* Phones: the sections as a segmented control that stays under the header. */}
        <nav aria-label="Settings sections" className="cfg-band md:hidden">
          <div className="ios-segmented todo-section-switch flex w-full">
            {SECTIONS.map((s) => (
              <button
                key={s.id}
                type="button"
                aria-current={section === s.id ? 'page' : undefined}
                onClick={() => goTo(s.id)}
                className={`ios-segment ${section === s.id ? 'ios-segment-active' : ''}`}
              >
                {s.short}
              </button>
            ))}
          </div>
        </nav>

        {/* Tablet and desktop: a side rail with the sections and the save control. */}
        <aside className="cfg-rail hidden md:block">
          <nav aria-label="Settings sections" className="drawer-group cfg-rail-group">
            {SECTIONS.map((s) => (
              <button
                key={s.id}
                type="button"
                aria-current={section === s.id ? 'page' : undefined}
                onClick={() => goTo(s.id)}
                className={`drawer-row ${section === s.id ? 'drawer-row-active' : ''}`}
              >
                <span className="drawer-icon drawer-icon-sm" aria-hidden="true">
                  <Icon name={s.icon} size={16} />
                </span>
                <span className="min-w-0 flex-1">{s.label}</span>
              </button>
            ))}
          </nav>
          <div className="cfg-rail-save">{saveControl('stacked')}</div>
        </aside>

        <div className="min-w-0">
          {section === 'model' && <ModelSection />}
          {section === 'keys' && <KeysSection />}
          {section === 'appearance' && (
            <div>
              <SectionHeader
                title="Appearance"
                sub="The accent colour and the menu layout. Both apply right away and are kept in this browser."
              />
              <AppearanceSettingsCard hideHeader />
            </div>
          )}
          {section === 'prompts' && (
            <div>
              <SectionHeader
                title="Lab prompts"
                sub="Extra instructions and your background for each lab (DSA, System Design, CV, Communication, Finance, Python, GenAI & AI). Sign in to save them."
              />
              <LabSettingsManager onSaveStateChange={onLabSaveState} />
            </div>
          )}
          {section === 'memory' && <MemorySection />}
          {section === 'install' && <InstallSection />}
          {section === 'advanced' && <AdvancedSection />}

          {/* Phones: the save control floats above the tab bar. */}
          <div className="cfg-savebar md:hidden">{saveControl('inline')}</div>
        </div>
      </div>
    </ConfigContext.Provider>
  );
}

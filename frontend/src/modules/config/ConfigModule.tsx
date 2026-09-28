'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import Icon from '@/components/ui/AppIcon';
import {
  settingsService,
  DEFAULT_SETTINGS,
  UserSettings,
  OllamaStatus,
  AiDefaultInfo,
  USE_ENV_DEFAULT_MODEL,
} from '@/lib/services/settingsService';
import { API_BASE_URL } from '@/lib/http/apiClient';

const PROVIDERS = [
  {
    key: 'Google',
    label: 'Google Gemini',
    icon: 'SparklesIcon',
    color: 'text-blue-500',
    bg: 'bg-blue-500/10',
    models: [
      { id: 'gemini-flash-latest', name: 'Gemini Flash (Latest)', badge: 'Fast · Auto-updates · Recommended', tier: 'free' },
      { id: 'gemini-pro-latest',   name: 'Gemini Pro (Latest)',   badge: 'High Quality · Auto-updates', tier: 'pro' },
      { id: 'gemini-3.5-flash',       name: 'Gemini 3.5 Flash',        badge: 'Newest Gen', tier: 'cheap' },
      { id: 'gemini-3.1-pro-preview', name: 'Gemini 3.1 Pro',          badge: 'Preview · Most Capable', tier: 'pro' },
      { id: 'gemini-3-pro-preview',   name: 'Gemini 3 Pro',            badge: 'Preview', tier: 'pro' },
      { id: 'gemini-2.5-flash',       name: 'Gemini 2.5 Flash',        badge: 'Stable', tier: 'free' },
      { id: 'gemini-2.5-pro',         name: 'Gemini 2.5 Pro',          badge: 'Stable · High Quality', tier: 'pro' },
    ],
  },
  {
    key: 'Vertex',
    label: 'Vertex AI (GCP $300)',
    icon: 'CloudIcon',
    color: 'text-sky-500',
    bg: 'bg-sky-500/10',
    models: [
      { id: 'vertex_gemini_gemini-2.5-flash', name: 'Gemini 2.5 Flash · Vertex', badge: 'Uses GCP $300 credits', tier: 'cheap' },
      { id: 'vertex_gemini_gemini-2.5-pro',   name: 'Gemini 2.5 Pro · Vertex',   badge: 'Uses GCP $300 credits', tier: 'pro' },
      { id: 'vertex_gemini_gemini-2.0-flash', name: 'Gemini 2.0 Flash · Vertex', badge: 'Uses GCP $300 credits', tier: 'cheap' },
    ],
  },
  {
    key: 'DeepSeek',
    label: 'DeepSeek',
    icon: 'BoltIcon',
    color: 'text-teal-500',
    bg: 'bg-teal-500/10',
    models: [
      { id: 'deepseek-chat',     name: 'DeepSeek V3',   badge: 'Very Cheap', tier: 'cheap' },
      { id: 'deepseek-reasoner', name: 'DeepSeek R1',   badge: 'Reasoning · Cheap', tier: 'cheap' },
    ],
  },
  {
    key: 'Groq',
    label: 'Groq (Free Tier)',
    icon: 'RocketLaunchIcon',
    color: 'text-orange-500',
    bg: 'bg-orange-500/10',
    models: [
      { id: 'llama-3.3-70b-versatile', name: 'Llama 3.3 70B',   badge: 'Powerful', tier: 'free' },
      { id: 'llama-3.1-8b-instant',    name: 'Llama 3.1 8B',    badge: 'Very Fast', tier: 'free' },
      { id: 'gemma2-9b-it',            name: 'Gemma 2 9B',      badge: 'Lightweight', tier: 'free' },
      { id: 'mixtral-8x7b-32768',      name: 'Mixtral 8x7B',    badge: 'MoE', tier: 'free' },
    ],
  },
  {
    key: 'OpenAI',
    label: 'OpenAI',
    icon: 'CpuChipIcon',
    color: 'text-emerald-500',
    bg: 'bg-emerald-500/10',
    models: [
      { id: 'gpt-4o',      name: 'GPT-4o',      badge: 'Premium', tier: 'pro' },
      { id: 'gpt-4o-mini', name: 'GPT-4o Mini', badge: 'Cost Effective', tier: 'cheap' },
    ],
  },
  {
    key: 'Anthropic',
    label: 'Anthropic',
    icon: 'AcademicCapIcon',
    color: 'text-violet-500',
    bg: 'bg-violet-500/10',
    models: [
      {
        id: 'claude-sonnet-5',
        name: 'Claude Sonnet 5',
        badge: 'Latest · Recommended',
        tier: 'pro',
      },
      { id: 'claude-3-5-sonnet-latest', name: 'Claude 3.5 Sonnet', badge: 'State-of-the-Art', tier: 'pro' },
      { id: 'claude-3-5-haiku-latest',  name: 'Claude 3.5 Haiku',  badge: 'Fast', tier: 'cheap' },
    ],
  },
  {
    key: 'OpenRouter',
    label: 'OpenRouter',
    icon: 'GlobeAltIcon',
    color: 'text-pink-500',
    bg: 'bg-pink-500/10',
    models: [
      { id: 'openrouter/auto',                   name: 'OpenRouter Auto',          badge: 'Auto Best · Cost-optimized', tier: 'cheap' },
      { id: 'meta-llama/llama-3.3-70b-instruct', name: 'Llama 3.3 70B · OpenRouter', badge: 'High Quality', tier: 'cheap' },
      { id: 'deepseek/deepseek-r1',              name: 'DeepSeek R1 · OpenRouter', badge: 'Reasoning · Cheap', tier: 'cheap' },
      { id: 'deepseek/deepseek-chat',            name: 'DeepSeek V3 · OpenRouter', badge: 'Fast · Very Cheap', tier: 'cheap' },
      { id: 'google/gemini-2.0-flash-001',       name: 'Gemini 2.0 Flash · OpenRouter', badge: 'Fast', tier: 'cheap' },
      { id: 'anthropic/claude-3.5-sonnet',       name: 'Claude 3.5 Sonnet · OpenRouter', badge: 'SOTA', tier: 'pro' },
      { id: 'openai/gpt-4o-mini',                name: 'GPT-4o Mini · OpenRouter', badge: 'Fast', tier: 'cheap' },
    ],
  },
  {
    key: 'Ollama',
    label: 'Ollama (Local)',
    icon: 'ComputerDesktopIcon',
    color: 'text-slate-400',
    bg: 'bg-slate-500/10',
    models: [
      { id: 'ollama', name: 'Ollama — use configured model', badge: 'Local', tier: 'free' },
    ],
  },
  {
    key: 'Custom',
    label: 'Custom (OpenAI-compatible)',
    icon: 'WrenchScrewdriverIcon',
    color: 'text-fuchsia-500',
    bg: 'bg-fuchsia-500/10',
    models: [
      { id: 'custom', name: 'Custom endpoint — use configured model', badge: 'Together.ai, Fireworks, local server…', tier: 'free' },
    ],
  },
];

const ALL_MODELS = PROVIDERS.flatMap(p => p.models.map(m => ({ ...m, provider: p.key })));

function findModel(id: string) {
  return ALL_MODELS.find((m) => m.id === (id.startsWith('ollama::') ? 'ollama' : id));
}

function ollamaModelName(id: string, configured: string): string | null {
  if (id === 'ollama') return configured || null;
  return id.startsWith('ollama::') ? id.slice('ollama::'.length) : null;
}

const ENV_PROVIDER_KEYS: Record<string, string> = {
  gemini: 'Google',
  vertex: 'Vertex',
  deepseek: 'DeepSeek',
  groq: 'Groq',
  openai: 'OpenAI',
  anthropic: 'Anthropic',
  openrouter: 'OpenRouter',
  ollama: 'Ollama',
  custom: 'Custom',
};

/** undefined = GET /config/ai-default still in flight, null = it failed. */
type AiDefaultState = AiDefaultInfo | null | undefined;

const IS_FASTAPI_MODE = API_BASE_URL !== '';

function describeEnvDefault(aiDefault: AiDefaultState, ollamaModel: string) {
  if (!aiDefault) return null;
  const { model, provider } = aiDefault;
  const found = findModel(model);
  // AI_PROVIDER decides where the request goes, except for ids the backend always routes by
  // their own prefix (Vertex/Ollama/Custom); a bare '/' id with no provider goes to OpenRouter.
  const selfRouted = model.startsWith('vertex_gemini_')
    ? 'Vertex'
    : model === 'ollama' || model.startsWith('ollama::')
      ? 'Ollama'
      : model === 'custom'
        ? 'Custom'
        : undefined;
  const providerKey =
    selfRouted ??
    (provider ? ENV_PROVIDER_KEYS[provider] : undefined) ??
    found?.provider ??
    (model.includes('/') ? 'OpenRouter' : undefined);
  const known = found && found.provider === providerKey ? found : undefined;
  const name = ollamaModelName(model, ollamaModel) ?? known?.name ?? model;
  const sources = {
    AI_MODEL: provider ? `AI_PROVIDER=${provider} · AI_MODEL` : 'AI_MODEL',
    AI_PROVIDER: `AI_PROVIDER=${provider}`,
    builtin: 'built-in default',
  };
  return {
    label: providerKey ? `${providerKey} · ${name}` : name,
    providerKey,
    tier: known?.tier,
    source: sources[aiDefault.source] ?? sources.builtin,
  };
}

function envDefaultText(aiDefault: AiDefaultState, ollamaModel: string): string {
  if (aiDefault === undefined) return 'resolving…';
  const d = describeEnvDefault(aiDefault, ollamaModel);
  return d ? `${d.label} (${d.source})` : 'backend unreachable, model unknown';
}

function envPinnedOllamaModel(aiDefault: AiDefaultState): string | null {
  if (!aiDefault) return null;
  const { model, provider } = aiDefault;
  if (model.startsWith('ollama::')) return model.slice('ollama::'.length);
  return provider === 'ollama' && model !== 'ollama' ? model : null;
}

/** Pricing tier → small colored chip. free = usable at $0, cheap = low-cost paid, pro = premium paid. */
const TIER_CHIP: Record<string, { label: string; cls: string }> = {
  free:  { label: 'Free',  cls: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400' },
  cheap: { label: 'Cheap', cls: 'bg-amber-500/15 text-amber-600 dark:text-amber-400' },
  pro:   { label: 'Pro',   cls: 'bg-sky-500/15 text-sky-600 dark:text-sky-400' },
};

function TierChip({ tier }: { tier?: string }) {
  const chip = tier ? TIER_CHIP[tier] : undefined;
  if (!chip) return null;
  return (
    <span className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide leading-none shrink-0 ${chip.cls}`}>
      {chip.label}
    </span>
  );
}

const API_KEY_FIELDS = [
  { key: 'geminiKey',     label: 'Google Gemini API Key',    placeholder: 'AIzaSy…',     note: 'Required for Gemini models',   provider: 'Google'    },
  { key: 'deepseekKey',   label: 'DeepSeek API Key',         placeholder: 'sk-…',        note: 'Required for DeepSeek models', provider: 'DeepSeek'  },
  { key: 'groqKey',       label: 'Groq API Key',             placeholder: 'gsk_…',       note: 'Required for Groq models',     provider: 'Groq'      },
  { key: 'openrouterKey', label: 'OpenRouter API Key',       placeholder: 'sk-or-v1-…',  note: 'Required for OpenRouter models', provider: 'OpenRouter' },
  { key: 'openaiKey',     label: 'OpenAI API Key',           placeholder: 'sk-proj-…',   note: 'Required for GPT models',      provider: 'OpenAI'    },
  { key: 'anthropicKey',  label: 'Anthropic Claude API Key', placeholder: 'sk-ant-…',    note: 'Required for Claude models',   provider: 'Anthropic' },
  { key: 'customKey',     label: 'Custom Endpoint API Key',  placeholder: 'sk-…',        note: 'Required for the custom endpoint', provider: 'Custom' },
] as const;

interface ModelOption { value: string; name: string; badge: string; tier?: string }

/**
 * Custom dropdown (not a native <select>) so each model row can show a small
 * colored tier chip — native <option> elements only render plain text.
 */
function ModelSelect({
  id,
  value,
  onChange,
  ollamaModels,
  currentOllamaModel,
  aiDefault,
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  ollamaModels: string[];
  currentOllamaModel: string;
  aiDefault: AiDefaultState;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const ollamaOptions = Array.from(new Set([...(currentOllamaModel ? [currentOllamaModel] : []), ...ollamaModels]));
  const envDefault = describeEnvDefault(aiDefault, currentOllamaModel);
  const groups: { label: string; items: ModelOption[] }[] = [
    {
      label: 'Server default',
      items: [
        {
          value: USE_ENV_DEFAULT_MODEL,
          name: 'Use .env default',
          badge: envDefaultText(aiDefault, currentOllamaModel),
          tier: envDefault?.tier,
        },
      ],
    },
    ...PROVIDERS.filter(p => p.key !== 'Ollama').map(p => ({
      label: p.label,
      items: p.models.map(m => ({ value: m.id, name: m.name, badge: m.badge, tier: m.tier })),
    })),
    {
      label: 'Ollama (Local)',
      items: ollamaOptions.length === 0
        ? [{ value: 'ollama', name: 'Ollama — use configured model', badge: 'Local', tier: 'free' }]
        : ollamaOptions.map(name => ({ value: `ollama::${name}`, name, badge: 'Local', tier: 'free' })),
    },
  ];

  const selected = groups.flatMap(g => g.items).find(i => i.value === value);

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        id={id}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between gap-2 rounded-md border border-border bg-input px-12 py-9 text-sm text-foreground focus-ring transition-smooth"
      >
        <span className="flex items-center gap-2 min-w-0">
          {selected ? (
            <>
              <span className="truncate">{selected.name}</span>
              <TierChip tier={selected.tier} />
            </>
          ) : (
            <span className="text-muted-foreground">Select a model…</span>
          )}
        </span>
        <Icon name="ChevronUpDownIcon" size={16} className="text-muted-foreground shrink-0" />
      </button>

      {open && (
        <div
          role="listbox"
          className="absolute z-30 mt-1 w-full max-h-[320px] overflow-auto rounded-md border border-border bg-popover py-1 shadow-lg"
        >
          {groups.map(g => (
            <div key={g.label}>
              <div className="px-3 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{g.label}</div>
              {g.items.map(it => (
                <button
                  key={it.value}
                  type="button"
                  role="option"
                  aria-selected={it.value === value}
                  onClick={() => { onChange(it.value); setOpen(false); }}
                  className={`w-full flex items-center justify-between gap-2 px-3 py-1.5 text-left transition-smooth hover:bg-muted ${it.value === value ? 'bg-muted/60' : ''}`}
                >
                  <span className="flex items-center gap-2 min-w-0">
                    <span className="truncate text-sm text-foreground">{it.name}</span>
                    <span className="truncate text-[11px] text-muted-foreground">{it.badge}</span>
                  </span>
                  <TierChip tier={it.tier} />
                </button>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

interface EnvPrefillEntry {
  setting: string;
  label: string;
  env: string;
  masked?: string;
}

type ToastState = { type: 'success' | 'warning' | 'error'; message: string };

const TOAST_STYLES: Record<ToastState['type'], { box: string; icon: string; iconCls: string }> = {
  success: {
    box: 'bg-success/15 border-success text-success-foreground',
    icon: 'CheckCircleIcon',
    iconCls: 'text-success',
  },
  warning: {
    box: 'bg-warning/15 border-warning text-foreground',
    icon: 'ExclamationTriangleIcon',
    iconCls: 'text-warning',
  },
  error: {
    box: 'bg-error/15 border-error text-error-foreground',
    icon: 'ExclamationTriangleIcon',
    iconCls: 'text-error',
  },
};

const MODEL_FIELDS = [
  { key: 'textGenerationModel', env: 'TEXT_GENERATION_MODEL', label: 'Text Generation' },
  { key: 'answerModel', env: 'ANSWER_MODEL', label: 'Answer Evaluation' },
] as const;
type ModelField = (typeof MODEL_FIELDS)[number];

/** What "Import from .env" will write, so the button count and the toast agree. */
function planEnvImport(found: EnvPrefillEntry[]) {
  const patch: Partial<UserSettings> = {};
  let count = 0;
  for (const entry of found) {
    if (entry.masked && entry.setting !== 'aiDefault') {
      (patch as Record<string, string>)[entry.setting] = entry.masked;
      count++;
    }
  }
  // An explicit TEXT_GENERATION_MODEL / ANSWER_MODEL still wins over AI_PROVIDER / AI_MODEL.
  const aiDefaultEnvs = found
    .filter((e) => e.setting === 'aiDefault' && e.masked)
    .map((e) => e.env);
  const followEnv: ModelField[] =
    aiDefaultEnvs.length > 0 ? MODEL_FIELDS.filter((f) => patch[f.key] === undefined) : [];
  for (const f of followEnv) patch[f.key] = USE_ENV_DEFAULT_MODEL;
  if (followEnv.length > 0) count += aiDefaultEnvs.length;
  const providerEntry = found.find((e) => e.env === 'AI_PROVIDER');
  const provider = providerEntry?.masked?.trim().toLowerCase() || null;
  const model = found.find((e) => e.env === 'AI_MODEL')?.masked?.trim() || null;
  return { patch, count, aiDefaultEnvs, followEnv, provider, model };
}

function envImportToast(
  plan: ReturnType<typeof planEnvImport>,
  aiDefault: AiDefaultState,
  ollamaModel: string,
  fastapiMode: boolean
): ToastState {
  const { count, aiDefaultEnvs, followEnv, provider, model } = plan;
  const parts = [`Imported ${count} value${count !== 1 ? 's' : ''} from .env.`];
  let type: ToastState['type'] = 'success';
  if (aiDefaultEnvs.length > 0 && followEnv.length === 0) {
    parts.push(
      `${aiDefaultEnvs.join('/')} not applied: TEXT_GENERATION_MODEL and ANSWER_MODEL take precedence.`
    );
  } else if (followEnv.length > 0) {
    const fields = followEnv.map((f) => f.label).join(' and ');
    const explicit = MODEL_FIELDS.find((f) => !followEnv.includes(f));
    const kept = explicit ? ` (${explicit.label} model comes from ${explicit.env})` : '';
    parts.push(
      `${fields} model${followEnv.length > 1 ? 's' : ''} set to "Use .env default"${kept}.`
    );
    const backendReads =
      'the FastAPI backend reads AI_PROVIDER/AI_MODEL from backend/.env, not frontend/.env';
    if (aiDefault === undefined) {
      if (fastapiMode) type = 'warning';
      parts.push(
        `${fastapiMode ? `Note: ${backendReads}; its` : 'The server'} default is still resolving — check the model hints below.`
      );
    } else if (aiDefault === null) {
      type = 'warning';
      parts.push(
        fastapiMode
          ? `Note: ${backendReads}, and it couldn't be reached to confirm what it resolves to.`
          : `Couldn't reach the server to confirm what "Use .env default" resolves to.`
      );
    } else {
      const resolved = envDefaultText(aiDefault, ollamaModel);
      // The backend prefixes ollama/vertex ids and ignores AI_MODEL for custom, so compare those forms.
      const modelMismatch =
        model !== null &&
        provider !== 'custom' &&
        ![model, `ollama::${model}`, `vertex_gemini_${model}`].includes(aiDefault.model);
      const mismatch =
        aiDefault.source === 'builtin' ||
        (provider !== null && provider !== aiDefault.provider) ||
        modelMismatch;
      if (fastapiMode && mismatch) {
        type = 'warning';
        parts.push(
          `Heads up: ${backendReads}, and it currently resolves "Use .env default" to ${resolved}. Edit backend/.env and restart the backend to change that.`
        );
      } else {
        parts.push(`This backend resolves "Use .env default" to ${resolved}.`);
      }
    }
  }
  parts.push('Click "Save Configuration" to persist.');
  return { type, message: parts.join(' ') };
}

export default function ConfigInteractive() {
  const [settings, setSettings] = useState<UserSettings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<ToastState | null>(null);
  const [visibleKeys, setVisibleKeys] = useState<Record<string, boolean>>({});

  const [ollamaModels, setOllamaModels] = useState<string[]>([]);
  const [ollamaModelsLoading, setOllamaModelsLoading] = useState(false);
  const [ollamaModelsError, setOllamaModelsError] = useState('');
  const [customOllamaModel, setCustomOllamaModel] = useState(false);

  const [ollamaLoading, setOllamaLoading] = useState(false);
  const [ollamaStatus, setOllamaStatus] = useState<OllamaStatus | null>(null);
  const detectDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [testStatus, setTestStatus] = useState<Record<string, { loading: boolean; ok?: boolean; message?: string }>>({});

  const [aiDefault, setAiDefault] = useState<AiDefaultState>(undefined);

  // ── .env prefill state ─────────────────────────────────────────────────────
  const [envPanel, setEnvPanel] = useState<{
    open: boolean;
    loading: boolean;
    found: EnvPrefillEntry[];
    missing: EnvPrefillEntry[];
    imported: boolean;
  }>({ open: false, loading: false, found: [], missing: [], imported: false });

  const fetchEnvPrefill = async () => {
    setEnvPanel(p => ({ ...p, open: true, loading: true, imported: false }));
    try {
      const res = await fetch('/api/config/env-prefill');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setEnvPanel(p => ({ ...p, loading: false, found: data.found ?? [], missing: data.missing ?? [] }));
    } catch {
      setEnvPanel(p => ({ ...p, loading: false, found: [], missing: [] }));
      setToast({ type: 'error', message: 'Could not read env vars from server. Is the app running?' });
    }
  };

  const envImportPlan = planEnvImport(envPanel.found);

  const importFromEnv = () => {
    const { patch } = envImportPlan;
    setSettings(prev => ({ ...prev, ...patch }));
    setEnvPanel(p => ({ ...p, imported: true }));
    const next = envImportToast(
      envImportPlan,
      aiDefault,
      patch.ollamaModel ?? settings.ollamaModel,
      IS_FASTAPI_MODE
    );
    setToast(next);
    setTimeout(() => setToast(null), next.type === 'success' ? 6000 : 12000);
  };

  useEffect(() => {
    settingsService.getSettings()
      .then(data => {
        if (data) setSettings({ ...DEFAULT_SETTINGS, ...data });
        // Auto-detect Ollama on page load
        detectOllama(data?.ollamaUrl);
      })
      .catch(err => console.error('Failed to load settings:', err))
      .finally(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    settingsService
      .getAiDefault()
      .then(setAiDefault)
      .catch(() => setAiDefault(null));
  }, []);

  const detectOllama = useCallback(async (url?: string) => {
    setOllamaLoading(true);
    try {
      const status = await settingsService.getOllamaStatus(url);
      setOllamaStatus(status);
      // Auto-select first model if none configured
      if (status.running && status.models.length > 0) {
        setSettings(prev => ({
          ...prev,
          ollamaModel: prev.ollamaModel || status.models[0].name,
        }));
      }
    } catch {
      setOllamaStatus({ running: false, url: url || '', models: [], error: 'Could not reach backend' });
    } finally {
      setOllamaLoading(false);
    }
  }, []);

  const fetchOllamaModels = async (url: string) => {
    setOllamaModelsLoading(true);
    setOllamaModelsError('');
    try {
      const models = await settingsService.getOllamaModels(url);
      setOllamaModels(models);
      if (models.length === 0) setOllamaModelsError('Ollama is reachable but has no models pulled yet.');
    } catch (err) {
      setOllamaModels([]);
      setOllamaModelsError(err instanceof Error ? err.message : 'Could not reach Ollama.');
    } finally {
      setOllamaModelsLoading(false);
    }
  };

  const handleChange = (key: keyof UserSettings, value: string) => {
    setSettings(prev => ({ ...prev, [key]: value }));
    // Re-probe Ollama with a debounce when URL field changes
    if (key === 'ollamaUrl') {
      if (detectDebounceRef.current) clearTimeout(detectDebounceRef.current);
      detectDebounceRef.current = setTimeout(() => detectOllama(value), 800);
    }
  };

  const handleModelSelectChange = (key: 'textGenerationModel' | 'answerModel') => (value: string) => {
    if (value.startsWith('ollama::')) {
      const model = value.slice('ollama::'.length);
      setSettings(prev => ({ ...prev, [key]: 'ollama', ollamaModel: model }));
      return;
    }
    handleChange(key, value);
  };

  const modelSelectValue = (key: 'textGenerationModel' | 'answerModel') =>
    settings[key] === 'ollama' ? `ollama::${settings.ollamaModel}` : settings[key];

  const toggleKeyVisibility = (key: string) =>
    setVisibleKeys(prev => ({ ...prev, [key]: !prev[key] }));

  const testKey = async (fieldKey: string) => {
    const apiKey = (settings[fieldKey as keyof UserSettings] as string) || '';
    if (!apiKey.trim()) return;
    const provider = fieldKey.replace(/Key$/, '');
    const baseUrl = provider.toLowerCase() === 'openrouter' ? settings.openrouterUrl : undefined;
    setTestStatus(prev => ({ ...prev, [fieldKey]: { loading: true } }));
    try {
      const result = await settingsService.testApiKey(provider, apiKey, baseUrl);
      setTestStatus(prev => ({ ...prev, [fieldKey]: { loading: false, ok: result.ok, message: result.message } }));
    } catch (err) {
      setTestStatus(prev => ({ ...prev, [fieldKey]: { loading: false, ok: false, message: err instanceof Error ? err.message : 'Test failed' } }));
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setToast(null);
    try {
      await settingsService.saveSettings(settings);
      setToast({ type: 'success', message: 'Saved to this browser’s local storage.' });
      setTimeout(() => setToast(null), 4000);
    } catch (err) {
      console.error(err);
      setToast({ type: 'error', message: 'Failed to save — this browser may be blocking local storage (e.g. private/incognito mode).' });
    } finally {
      setSaving(false);
    }
  };

  type ModelKey = 'textGenerationModel' | 'answerModel';
  const isOllamaModel = (id: string) => id === 'ollama' || id.startsWith('ollama::');
  const effectiveModel = (key: ModelKey) => settings[key] || (aiDefault?.model ?? '');
  const envDefault = describeEnvDefault(aiDefault, settings.ollamaModel);
  const providerOf = (key: ModelKey) =>
    settings[key] ? findModel(settings[key])?.provider : envDefault?.providerKey;

  const usesOllama = MODEL_FIELDS.some(
    ({ key }) =>
      isOllamaModel(effectiveModel(key)) || (!settings[key] && aiDefault?.provider === 'ollama')
  );
  const activeProviders = [providerOf('textGenerationModel'), providerOf('answerModel')];
  const envOllamaModel = MODEL_FIELDS.some(({ key }) => !settings[key])
    ? envPinnedOllamaModel(aiDefault)
    : null;
  const ollamaFieldInUse = MODEL_FIELDS.some(({ key }) => effectiveModel(key) === 'ollama');
  const isOllamaChecked = (name: string) =>
    settings.ollamaModel === name && (ollamaFieldInUse || !envOllamaModel);

  const modelHint = (key: ModelKey): string | null => {
    const id = settings[key];
    if (!id) return `Server default → ${envDefaultText(aiDefault, settings.ollamaModel)}`;
    const m = findModel(id);
    return m ? `${m.provider} · ${ollamaModelName(id, settings.ollamaModel) ?? m.badge}` : null;
  };
  const textModelHint = modelHint('textGenerationModel');
  const answerModelHint = modelHint('answerModel');

  const aiDefaultRowsIn = envPanel.found.some((e) => e.setting === 'aiDefault')
    ? 'found'
    : envPanel.missing.some((e) => e.setting === 'aiDefault')
      ? 'missing'
      : null;
  const aiDefaultEnvNote = IS_FASTAPI_MODE && (
    <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
      <Icon name="InformationCircleIcon" size={12} className="shrink-0" />
      <span>
        AI_PROVIDER / AI_MODEL are read from{' '}
        <code className="bg-muted px-1 rounded text-[10px] font-code">backend/.env</code> by the
        FastAPI backend — importing them only sets models to &quot;Use .env default&quot; (now:{' '}
        {envDefaultText(aiDefault, settings.ollamaModel)}).
      </span>
    </p>
  );

  useEffect(() => {
    if (!loading && settings.ollamaUrl) {
      fetchOllamaModels(settings.ollamaUrl);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, settings.ollamaUrl]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-60">
        <div className="w-48 h-48 border-4 border-primary/30 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-24">
      {toast && (
        <div
          className={`p-18 rounded-lg border flex items-center gap-12 animate-fade-in shadow-lg ${
            TOAST_STYLES[toast.type].box
          }`}
        >
          <Icon
            name={TOAST_STYLES[toast.type].icon}
            size={20}
            variant="solid"
            className={`shrink-0 ${TOAST_STYLES[toast.type].iconCls}`}
          />
          <span className="text-sm font-medium">{toast.message}</span>
        </div>
      )}

      {/* ── Import from .env card ─────────────────────────────────────────── */}
      <div className="bg-card border border-border rounded-lg shadow-md overflow-hidden">
        <button
          type="button"
          id="env-import-toggle"
          onClick={() => envPanel.open ? setEnvPanel(p => ({ ...p, open: false })) : fetchEnvPrefill()}
          className="w-full flex items-center justify-between p-24 hover:bg-muted/30 transition-smooth text-left"
        >
          <div className="flex items-center gap-12">
            <div className="w-9 h-9 rounded-md bg-amber-500/15 flex items-center justify-center shrink-0">
              <Icon name="DocumentTextIcon" size={18} className="text-amber-500" />
            </div>
            <div>
              <h3 className="font-heading text-base font-semibold text-foreground">Import from .env</h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                Auto-fill API keys and model config from environment variables set on this server
              </p>
            </div>
          </div>
          <Icon
            name={envPanel.open ? 'ChevronUpIcon' : 'ChevronDownIcon'}
            size={18}
            className="text-muted-foreground shrink-0"
          />
        </button>

        {envPanel.open && (
          <div className="border-t border-border p-24 space-y-18">

            {/* How-to banner */}
            <div className="flex items-start gap-10 p-14 rounded-lg bg-amber-500/8 border border-amber-500/25">
              <Icon name="InformationCircleIcon" size={18} className="text-amber-500 shrink-0 mt-0.5" />
              <div className="space-y-6">
                <p className="text-xs text-foreground font-semibold">How to add keys via .env</p>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Create or edit <code className="bg-muted px-1.5 py-0.5 rounded text-[10px] font-code">frontend/.env.local</code> (or set
                  environment variables in your Vercel / hosting dashboard) using the names shown
                  below. Restart the server after editing the file — Next.js reads env vars at
                  startup, not at runtime.
                </p>
                <p className="text-xs font-mono bg-muted/60 border border-border rounded p-10 leading-relaxed text-muted-foreground select-all">
                  {'# frontend/.env.local example\n'}GEMINI_API_KEY=AIzaSy…{'\n'}OPENAI_API_KEY=sk-proj-…{'\n'}GROQ_API_KEY=gsk_…
                </p>
              </div>
            </div>

            {envPanel.loading ? (
              <div className="flex items-center gap-8 text-sm text-muted-foreground py-12">
                <span className="w-16 h-16 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
                Reading environment variables…
              </div>
            ) : (
              <>
                {/* Found entries */}
                {envPanel.found.length > 0 && (
                  <div className="space-y-8">
                    <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                      ✅ Found in environment ({envPanel.found.length})
                    </p>
                    <div className="space-y-4">
                      {envPanel.found.map(e => (
                        <div key={e.env} className="flex items-center justify-between gap-8 px-12 py-8 rounded-md bg-emerald-500/8 border border-emerald-500/20">
                          <div className="flex items-center gap-8 min-w-0">
                            <Icon name="CheckCircleIcon" size={14} className="text-emerald-500 shrink-0" variant="solid" />
                            <span className="text-xs font-medium text-foreground truncate">{e.label}</span>
                          </div>
                          <code className="text-[10px] font-code text-muted-foreground shrink-0">{e.env}</code>
                        </div>
                      ))}
                    </div>
                    {aiDefaultRowsIn === 'found' && aiDefaultEnvNote}
                  </div>
                )}

                {/* Missing entries */}
                {envPanel.missing.length > 0 && (
                  <div className="space-y-8">
                    <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                      ⚠️ Not set ({envPanel.missing.length}) — add to frontend/.env.local
                    </p>
                    <div className="space-y-4">
                      {envPanel.missing.map(e => (
                        <div key={e.env} className="flex items-center justify-between gap-8 px-12 py-8 rounded-md bg-muted/40 border border-border">
                          <div className="flex items-center gap-8 min-w-0">
                            <Icon name="MinusCircleIcon" size={14} className="text-muted-foreground shrink-0" />
                            <span className="text-xs text-muted-foreground truncate">{e.label}</span>
                          </div>
                          <code className="text-[10px] font-code text-amber-500 shrink-0">{e.env}=</code>
                        </div>
                      ))}
                    </div>
                    {aiDefaultRowsIn === 'missing' && aiDefaultEnvNote}
                  </div>
                )}

                {envPanel.found.length === 0 && envPanel.missing.length > 0 && (
                  <p className="text-xs text-muted-foreground">
                    No environment variables are set yet. Add them to{' '}
                    <code className="bg-muted px-1.5 py-0.5 rounded text-[10px] font-code">frontend/.env.local</code>{' '}
                    and restart the server (or redeploy on Vercel).
                  </p>
                )}

                {/* Import button */}
                {envPanel.found.length > 0 && (
                  <div className="flex items-center gap-12 pt-4">
                    <button
                      id="env-import-apply"
                      type="button"
                      onClick={importFromEnv}
                      disabled={envPanel.imported}
                      className="inline-flex items-center gap-8 px-18 py-9 rounded-md bg-amber-500 hover:bg-amber-500/90 text-white text-sm font-medium transition-smooth disabled:opacity-60 disabled:cursor-not-allowed"
                    >
                      {envPanel.imported ? (
                        <><Icon name="CheckIcon" size={14} />Imported — save below</>
                      ) : (
                        <>
                          <Icon name="ArrowDownTrayIcon" size={14} />
                          Import {envImportPlan.count} value{envImportPlan.count !== 1 ? 's' : ''}{' '}
                          into fields
                        </>
                      )}
                    </button>
                    <span className="text-[11px] text-muted-foreground">
                      Values are copied into the fields below — hit{' '}
                      <span className="font-semibold text-foreground">Save Configuration</span> to persist them.
                    </span>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>

      <form onSubmit={handleSave} className="space-y-24">

        {/* Model Configuration */}
        <div className="bg-card border border-border rounded-lg p-24 shadow-md space-y-18">
          <div className="flex items-center gap-12 pb-12 border-b border-border">
            <Icon name="CpuChipIcon" size={24} className="text-primary" />
            <div>
              <h3 className="font-heading text-lg font-semibold text-foreground">Model Configuration</h3>
              <p className="text-xs text-muted-foreground">Choose the main LLM used for AI generation across the app, and the model used for answer evaluation</p>
            </div>
          </div>

          {/* Provider pills */}
          <div className="flex flex-wrap gap-2">
            {PROVIDERS.map(p => {
              const active = activeProviders.includes(p.key);
              return (
                <span key={p.key}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium border transition-all ${
                    active ? `${p.bg} ${p.color} border-current/30` : 'border-border text-muted-foreground bg-muted/30'
                  }`}>
                  <Icon name={p.icon} size={11} />
                  {p.label}
                </span>
              );
            })}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-18">
            <div className="space-y-6">
              <label htmlFor="textGenerationModel" className="block text-sm font-medium text-foreground">
                Text Generation Model
              </label>
              <ModelSelect
                id="textGenerationModel"
                value={modelSelectValue('textGenerationModel')}
                onChange={handleModelSelectChange('textGenerationModel')}
                ollamaModels={ollamaModels}
                currentOllamaModel={settings.ollamaModel}
                aiDefault={aiDefault}
              />
              {textModelHint && (
                <span className="text-[11px] text-muted-foreground">{textModelHint}</span>
              )}
              <span className="block text-[11px] text-muted-foreground/60">The main LLM for the app — used for daily topic expansion, parsing CV details, and all other AI generation (e.g. LinkedIn Post Generator).</span>
            </div>

            <div className="space-y-6">
              <label htmlFor="answerModel" className="block text-sm font-medium text-foreground">
                Answer Evaluation Model
              </label>
              <ModelSelect
                id="answerModel"
                value={modelSelectValue('answerModel')}
                onChange={handleModelSelectChange('answerModel')}
                ollamaModels={ollamaModels}
                currentOllamaModel={settings.ollamaModel}
                aiDefault={aiDefault}
              />
              {answerModelHint && (
                <span className="text-[11px] text-muted-foreground">{answerModelHint}</span>
              )}
              <span className="block text-[11px] text-muted-foreground/60">Used to score answers, provide STAR guidelines, and highlight improvements.</span>
            </div>
          </div>

          {aiDefault?.warning && (
            <p className="flex items-center gap-1.5 text-[11px] text-amber-500">
              <Icon name="ExclamationTriangleIcon" size={12} className="shrink-0" />
              {aiDefault.warning}
            </p>
          )}
        </div>

        {/* Ollama Local Config */}
        {usesOllama && (
          <div className="bg-card border border-border rounded-lg p-24 shadow-md space-y-18">
            <div className="flex items-center justify-between pb-12 border-b border-border">
              <div className="flex items-center gap-12">
                <Icon name="ComputerDesktopIcon" size={24} className="text-slate-400" />
                <div>
                  <h3 className="font-heading text-lg font-semibold text-foreground">Ollama Local Settings</h3>
                  <p className="text-xs text-muted-foreground">Auto-detects pulled models from your running Ollama instance.</p>
                </div>
              </div>

              {/* Live status badge */}
              <div className="flex items-center gap-2">
                {ollamaLoading ? (
                  <span className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
                    <span className="w-3 h-3 border-2 border-muted-foreground/30 border-t-muted-foreground rounded-full animate-spin" />
                    Detecting...
                  </span>
                ) : ollamaStatus?.running ? (
                  <span className="flex items-center gap-1.5 text-[11px] font-semibold text-emerald-500 bg-emerald-500/10 px-2.5 py-1 rounded-full border border-emerald-500/20">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    Online · {ollamaStatus.models.length} model{ollamaStatus.models.length !== 1 ? 's' : ''}
                  </span>
                ) : ollamaStatus ? (
                  <span className="flex items-center gap-1.5 text-[11px] font-medium text-red-500 bg-red-500/10 px-2.5 py-1 rounded-full border border-red-500/20">
                    <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
                    Offline
                  </span>
                ) : null}

                <button
                  type="button"
                  onClick={() => detectOllama(settings.ollamaUrl)}
                  disabled={ollamaLoading}
                  className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-smooth disabled:opacity-40"
                  title="Re-detect Ollama"
                >
                  <Icon name="ArrowPathIcon" size={14} className={ollamaLoading ? 'animate-spin' : ''} />
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-18">
              {/* URL field */}
              <div className="space-y-6">
                <label htmlFor="ollamaUrl" className="block text-sm font-medium text-foreground">Ollama Server URL</label>
                <input
                  id="ollamaUrl"
                  type="text"
                  value={settings.ollamaUrl}
                  onChange={e => handleChange('ollamaUrl', e.target.value)}
                  placeholder="http://localhost:11434"
                  className="w-full rounded-md border border-border bg-input px-12 py-9 text-sm text-foreground focus-ring font-code"
                />
                {ollamaStatus && !ollamaStatus.running && ollamaStatus.error && (
                  <p className="text-[11px] text-red-500">{ollamaStatus.error}</p>
                )}
                {!ollamaStatus?.running && (
                  <span className="text-[11px] text-muted-foreground/60">
                    Run <code className="bg-muted px-1 rounded text-[10px]">ollama serve</code> to start the server
                  </span>
                )}
              </div>

              {/* Model — dropdown if detected, text input if offline */}
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <label htmlFor="ollamaModel" className="block text-sm font-medium text-foreground">Ollama Model Name</label>
                  <button
                    type="button"
                    onClick={() => fetchOllamaModels(settings.ollamaUrl)}
                    disabled={ollamaModelsLoading}
                    className="flex items-center gap-1 text-[11px] font-medium text-primary hover:opacity-80 transition-smooth disabled:opacity-50"
                  >
                    <Icon name="ArrowPathIcon" size={11} className={ollamaModelsLoading ? 'animate-spin' : ''} />
                    {ollamaModelsLoading ? 'Checking…' : 'Refresh'}
                  </button>
                </div>
                {ollamaModels.length > 0 && !customOllamaModel ? (
                  <select
                    id="ollamaModel"
                    value={settings.ollamaModel || '__custom__'}
                    onChange={e => {
                      if (e.target.value === '__custom__') {
                        setCustomOllamaModel(true);
                        return;
                      }
                      handleChange('ollamaModel', e.target.value);
                    }}
                    className="w-full rounded-md border border-border bg-input px-12 py-9 text-sm text-foreground focus-ring font-code"
                  >
                    {!ollamaModels.includes(settings.ollamaModel) && settings.ollamaModel && (
                      <option value={settings.ollamaModel}>{settings.ollamaModel} (current)</option>
                    )}
                    {ollamaModels.map(name => (
                      <option key={name} value={name}>{name}</option>
                    ))}
                    <option value="__custom__">Type a model name manually…</option>
                  </select>
                ) : (
                  <input
                    id="ollamaModel"
                    type="text"
                    value={settings.ollamaModel}
                    onChange={e => handleChange('ollamaModel', e.target.value)}
                    placeholder="llama3.2"
                    className="w-full rounded-md border border-border bg-input px-12 py-9 text-sm text-foreground focus-ring font-code"
                  />
                )}
                {ollamaModelsError ? (
                  <span className="block text-[11px] text-amber-500">{ollamaModelsError}</span>
                ) : ollamaModels.length > 0 ? (
                  <span className="flex items-center justify-between text-[11px] text-emerald-500">
                    {ollamaModels.length} model{ollamaModels.length > 1 ? 's' : ''} found locally
                    {customOllamaModel && (
                      <button
                        type="button"
                        onClick={() => setCustomOllamaModel(false)}
                        className="font-medium text-primary hover:opacity-80 transition-smooth"
                      >
                        Choose from list
                      </button>
                    )}
                  </span>
                ) : (
                  <span className="block text-[11px] text-muted-foreground/60">Any model pulled via <code className="bg-muted px-1 rounded text-[10px]">ollama pull &lt;name&gt;</code></span>
                )}
                {envOllamaModel && (
                  <p className="flex items-start gap-1.5 text-[11px] text-muted-foreground">
                    <Icon name="InformationCircleIcon" size={12} className="shrink-0 mt-0.5" />
                    <span>
                      Server default uses <span className="font-code">{envOllamaModel}</span>{' '}
                      (AI_MODEL); this field applies to models set to plain{' '}
                      <code className="bg-muted px-1 rounded text-[10px]">ollama</code>, e.g. the
                      To-Do local toggle.
                    </span>
                  </p>
                )}
              </div>
            </div>

            {/* Detected model cards */}
            {ollamaStatus?.running && ollamaStatus.models.length > 0 && (
              <div className="pt-12 border-t border-border">
                <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-12">Pulled Models</p>
                <div className="flex flex-wrap gap-2">
                  {ollamaStatus.models.map(m => (
                    <button
                      key={m.name}
                      type="button"
                      onClick={() => handleChange('ollamaModel', m.name)}
                      className={`group flex items-center gap-2 px-3 py-1.5 rounded-lg border text-[11px] font-medium transition-smooth ${
                        isOllamaChecked(m.name)
                          ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                          : 'border-border text-muted-foreground hover:border-border hover:bg-muted/50 hover:text-foreground'
                      }`}
                    >
                      <span className="font-code">{m.name}</span>
                      {m.size_gb && (
                        <span
                          className={`text-[9px] font-semibold px-1 rounded ${
                            isOllamaChecked(m.name)
                              ? 'bg-emerald-500/20 text-emerald-500'
                              : 'bg-muted text-muted-foreground'
                          }`}
                        >
                          {m.size_gb} GB
                        </span>
                      )}
                      {m.name === envOllamaModel && (
                        <span className="text-[9px] font-semibold px-1 rounded bg-muted text-muted-foreground">
                          AI_MODEL
                        </span>
                      )}
                      {isOllamaChecked(m.name) && (
                        <Icon name="CheckIcon" size={10} className="text-emerald-500" variant="solid" />
                      )}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* API Keys */}
        <div className="bg-card border border-border rounded-lg p-24 shadow-md space-y-18">
          <div className="flex items-center gap-12 pb-12 border-b border-border">
            <Icon name="KeyIcon" size={24} className="text-secondary" />
            <div>
              <h3 className="font-heading text-lg font-semibold text-foreground">API Keys</h3>
              <p className="text-xs text-muted-foreground">Only enter keys for providers you use.</p>
            </div>
          </div>

          <div className="flex items-start gap-10 p-14 rounded-lg bg-primary/5 border border-primary/20">
            <Icon name="ShieldCheckIcon" size={18} className="text-primary shrink-0 mt-1" />
            <p className="text-xs text-muted-foreground leading-relaxed">
              <span className="font-semibold text-foreground">Stored only in this browser's local storage.</span>{' '}
              Your keys never touch our servers or database — each request sends the key straight from your
              browser to the AI provider you chose, for that request only. That also means keys don't sync
              across devices or browsers, and clearing site data will remove them. If other people use this
              app, everyone brings and stores their own keys locally — nobody shares or sees anyone else's.
            </p>
          </div>

          <div className="space-y-18">
            {API_KEY_FIELDS.map(field => (
              <div key={field.key} className="space-y-6">
                <div className="flex justify-between items-center">
                  <label htmlFor={field.key} className="block text-sm font-medium text-foreground">{field.label}</label>
                  <span className="text-xs text-muted-foreground">{field.note}</span>
                </div>
                <div className="relative">
                  <input
                    id={field.key}
                    type={visibleKeys[field.key] ? 'text' : 'password'}
                    value={settings[field.key as keyof UserSettings]}
                    onChange={e => handleChange(field.key as keyof UserSettings, e.target.value)}
                    placeholder={field.placeholder}
                    className="w-full rounded-md border border-border bg-input pl-12 pr-48 py-9 text-sm text-foreground focus-ring font-code"
                  />
                  <button
                    type="button"
                    onClick={() => toggleKeyVisibility(field.key)}
                    className="absolute right-12 top-1/2 -translate-y-1/2 p-6 text-muted-foreground hover:text-foreground transition-smooth"
                    aria-label={visibleKeys[field.key] ? 'Hide key' : 'Show key'}
                  >
                    <Icon name={visibleKeys[field.key] ? 'EyeSlashIcon' : 'EyeIcon'} size={18} />
                  </button>
                </div>
                <div className="flex items-center gap-8">
                  <button
                    type="button"
                    onClick={() => testKey(field.key)}
                    disabled={!settings[field.key as keyof UserSettings] || testStatus[field.key]?.loading}
                    className="inline-flex items-center gap-1.5 text-[11px] font-medium text-primary hover:opacity-80 transition-smooth disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {testStatus[field.key]?.loading ? (
                      <span className="w-3 h-3 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
                    ) : (
                      <Icon name="BoltIcon" size={12} />
                    )}
                    Test connection
                  </button>
                  {testStatus[field.key] && !testStatus[field.key].loading && (
                    testStatus[field.key].ok ? (
                      <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-500">
                        <Icon name="CheckCircleIcon" size={12} variant="solid" /> Connected
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-[11px] font-medium text-red-500 truncate" title={testStatus[field.key].message}>
                        <Icon name="XCircleIcon" size={12} variant="solid" /> {testStatus[field.key].message}
                      </span>
                    )
                  )}
                </div>

                {field.key === 'openrouterKey' && (
                  <div className="mt-8 p-12 rounded-md bg-muted/40 border border-border/80 space-y-6">
                    <div className="flex justify-between items-center">
                      <label htmlFor="openrouterUrl" className="block text-xs font-semibold text-foreground">
                        OpenRouter Base URL
                      </label>
                      <button
                        type="button"
                        onClick={() => handleChange('openrouterUrl', 'https://openrouter.ai/api/v1')}
                        className="text-[11px] font-medium text-primary hover:opacity-80 transition-smooth"
                      >
                        Reset to default
                      </button>
                    </div>
                    <input
                      id="openrouterUrl"
                      type="text"
                      value={settings.openrouterUrl}
                      onChange={e => handleChange('openrouterUrl', e.target.value)}
                      placeholder="https://openrouter.ai/api/v1"
                      className="w-full rounded-md border border-border bg-input px-12 py-7 text-xs text-foreground focus-ring font-code"
                    />
                    <p className="text-[11px] text-muted-foreground">
                      Default: <code className="bg-muted px-1.5 py-0.5 rounded text-[10px] font-code">https://openrouter.ai/api/v1</code>. Supports OpenRouter proxies and compatible endpoints.
                    </p>
                  </div>
                )}

                {field.key === 'customKey' && (
                  <div className="mt-8 p-12 rounded-md bg-muted/40 border border-border/80 space-y-10">
                    <div className="space-y-6">
                      <label htmlFor="customBaseUrl" className="block text-xs font-semibold text-foreground">
                        Base URL
                      </label>
                      <input
                        id="customBaseUrl"
                        type="text"
                        value={settings.customBaseUrl}
                        onChange={e => handleChange('customBaseUrl', e.target.value)}
                        placeholder="https://api.together.xyz/v1"
                        className="w-full rounded-md border border-border bg-input px-12 py-7 text-xs text-foreground focus-ring font-code"
                      />
                    </div>
                    <div className="space-y-6">
                      <label htmlFor="customModel" className="block text-xs font-semibold text-foreground">
                        Model Name
                      </label>
                      <input
                        id="customModel"
                        type="text"
                        value={settings.customModel}
                        onChange={e => handleChange('customModel', e.target.value)}
                        placeholder="meta-llama/Llama-3.3-70B-Instruct-Turbo"
                        className="w-full rounded-md border border-border bg-input px-12 py-7 text-xs text-foreground focus-ring font-code"
                      />
                    </div>
                    <p className="text-[11px] text-muted-foreground">
                      Any server exposing an OpenAI-compatible <code className="bg-muted px-1 rounded text-[10px] font-code">/chat/completions</code> endpoint — Together.ai, Fireworks, a local LM Studio or vLLM server, etc. Select &quot;Custom endpoint&quot; above as your Text Generation Model to use it.
                    </p>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* YouTube Video Generator */}
        <div className="bg-card border border-border rounded-lg p-24 shadow-md space-y-18">
          <div className="flex items-center gap-12 pb-12 border-b border-border">
            <Icon name="PlayCircleIcon" size={24} className="text-red-500" />
            <div>
              <h3 className="font-heading text-lg font-semibold text-foreground">YouTube Video Generator</h3>
              <p className="text-xs text-muted-foreground">Used by the &quot;From YouTube Video&quot; tool in each lab&apos;s question generator.</p>
            </div>
          </div>

          <div className="flex items-start gap-10 p-14 rounded-lg bg-primary/5 border border-primary/20">
            <Icon name="InformationCircleIcon" size={18} className="text-primary shrink-0 mt-1" />
            <p className="text-xs text-muted-foreground leading-relaxed">
              <span className="font-semibold text-foreground">Optional.</span>{' '}
              The video&apos;s transcript is always fetched automatically — no key needed for that. This key only adds
              the video&apos;s title/description as extra context, which can improve generation quality. Without it,
              generation still works from the transcript alone.
            </p>
          </div>

          <div className="space-y-6">
            <div className="flex justify-between items-center">
              <label htmlFor="youtubeApiKey" className="block text-sm font-medium text-foreground">YouTube Data API Key</label>
              <span className="text-xs text-muted-foreground">Optional — enriches context only</span>
            </div>
            <div className="relative">
              <input
                id="youtubeApiKey"
                type={visibleKeys.youtubeApiKey ? 'text' : 'password'}
                value={settings.youtubeApiKey}
                onChange={e => handleChange('youtubeApiKey', e.target.value)}
                placeholder="AIzaSy…"
                className="w-full rounded-md border border-border bg-input pl-12 pr-48 py-9 text-sm text-foreground focus-ring font-code"
              />
              <button
                type="button"
                onClick={() => toggleKeyVisibility('youtubeApiKey')}
                className="absolute right-12 top-1/2 -translate-y-1/2 p-6 text-muted-foreground hover:text-foreground transition-smooth"
                aria-label={visibleKeys.youtubeApiKey ? 'Hide key' : 'Show key'}
              >
                <Icon name={visibleKeys.youtubeApiKey ? 'EyeSlashIcon' : 'EyeIcon'} size={18} />
              </button>
            </div>
            <p className="text-[11px] text-muted-foreground/70 leading-relaxed">
              To get one: open the{' '}
              <a href="https://console.cloud.google.com/apis/library/youtube.googleapis.com" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                Google Cloud Console
              </a>{' '}
              → create or select a project → enable <span className="font-code">YouTube Data API v3</span> → go to
              &quot;Credentials&quot; → &quot;Create Credentials&quot; → &quot;API key&quot;. Optionally restrict the key to the
              YouTube Data API v3 for safety.
            </p>
          </div>
        </div>

        {/* Save */}
        <div className="flex justify-end gap-12">
          <button
            type="submit"
            disabled={saving}
            className="py-12 px-24 rounded-md bg-primary hover:bg-primary/90 text-primary-foreground font-medium transition-smooth flex items-center gap-12 focus-ring disabled:opacity-50"
          >
            {saving ? (
              <span className="w-18 h-18 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
            ) : (
              <Icon name="CheckIcon" size={18} />
            )}
            Save Configuration
          </button>
        </div>
      </form>
    </div>
  );
}

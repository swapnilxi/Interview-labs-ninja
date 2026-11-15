'use client';

/**
 * AI provider settings — model choice + API keys.
 *
 * These live ONLY in this browser's localStorage. They are never sent to or
 * stored by our backend's database; each AI request carries the relevant
 * fields (see aiRequestFields below) straight from here, used for that one
 * call, and nothing is persisted server-side. This is what lets one
 * deployment be shared by multiple people, each using their own keys.
 * A model value of '' (USE_ENV_DEFAULT_MODEL) means "Use .env default": it is
 * sent as model: '' and the server resolves it from AI_PROVIDER / AI_MODEL.
 *
 * Models and endpoints the user adds (customModels) are synced to their account like the model choice; the
 * endpoints' keys (endpointKeys) stay in this browser like every other key.
 */

/** Provider slugs, as the backend names them (modules/common/ai/settings.py AI_PROVIDERS). */
export type ModelProviderSlug =
  | 'gemini'
  | 'vertex'
  | 'deepseek'
  | 'groq'
  | 'openai'
  | 'anthropic'
  | 'openrouter'
  | 'ollama'
  | 'custom';

/**
 * A model the user added to a provider's list, or (provider 'custom') an OpenAI-compatible endpoint of their own.
 * Twin of CustomModelEntry in backend/modules/auth/router.py and normalizeCustomModels in fe-apis/account.
 */
export interface UserModel {
  /** Stable id, [A-Za-z0-9_-]. An endpoint is chosen as `endpoint::<id>`. */
  id: string;
  provider: ModelProviderSlug;
  /** The id the provider's API expects, e.g. "o4-mini" or "qwen/qwen3-32b". */
  model: string;
  /** Optional label shown instead of `model`. */
  name?: string;
  /** Endpoints only: the base URL that serves /chat/completions. */
  baseUrl?: string;
}

export interface UserSettings {
  textGenerationModel: string;
  answerModel: string;
  openaiKey: string;
  geminiKey: string;
  anthropicKey: string;
  deepseekKey: string;
  groqKey: string;
  openrouterKey: string;
  openrouterUrl: string;
  /** Generic OpenAI-compatible endpoint (Together.ai, Fireworks, a local LM Studio/vLLM server, etc.) */
  customKey: string;
  customBaseUrl: string;
  customModel: string;
  ollamaUrl: string;
  ollamaModel: string;
  youtubeApiKey: string;
  /** Added models and endpoints (synced to the account when logged in). */
  customModels: UserModel[];
  /** Endpoint id → API key. Browser only, never sent to our database. */
  endpointKeys: Record<string, string>;
}

export interface OllamaModel {
  name: string;
  size_gb: number | null;
  modified: string;
}

export interface OllamaStatus {
  running: boolean;
  url: string;
  models: OllamaModel[];
  error: string | null;
}

export interface AiDefaultInfo {
  provider: string | null;
  model: string;
  source: 'AI_MODEL' | 'AI_PROVIDER' | 'builtin';
  warning: string | null;
}

import { API_BASE_URL } from '@/lib/http/apiClient';

const STORAGE_KEY = 'labninja.ai-settings.v1';

export const USE_ENV_DEFAULT_MODEL = '';

export const DEFAULT_SETTINGS: UserSettings = {
  textGenerationModel: USE_ENV_DEFAULT_MODEL,
  answerModel: USE_ENV_DEFAULT_MODEL,
  openaiKey: '',
  geminiKey: '',
  anthropicKey: '',
  deepseekKey: '',
  groqKey: '',
  openrouterKey: '',
  openrouterUrl: 'https://openrouter.ai/api/v1',
  customKey: '',
  customBaseUrl: '',
  customModel: '',
  ollamaUrl: 'http://localhost:11434',
  ollamaModel: 'llama3.2',
  youtubeApiKey: '',
  customModels: [],
  endpointKeys: {},
};

function readStoredSettings(): UserSettings {
  if (typeof window === 'undefined') return DEFAULT_SETTINGS;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
    if (!Array.isArray(parsed.customModels)) parsed.customModels = [];
    if (typeof parsed.endpointKeys !== 'object' || parsed.endpointKeys === null)
      parsed.endpointKeys = {};
    return parsed;
  } catch {
    return DEFAULT_SETTINGS;
  }
}

function writeStoredSettings(settings: UserSettings): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}

/** Model/provider fields synced server-side for logged-in users. API keys never leave the browser. */
const SYNCABLE_FIELDS = [
  'textGenerationModel',
  'answerModel',
  'ollamaUrl',
  'ollamaModel',
  'openrouterUrl',
  'customModels',
] as const;
type SyncableSettings = Pick<UserSettings, (typeof SYNCABLE_FIELDS)[number]>;

function toServerProfile(settings: Partial<UserSettings>) {
  return {
    text_generation_model: settings.textGenerationModel,
    answer_model: settings.answerModel,
    ollama_url: settings.ollamaUrl,
    ollama_model: settings.ollamaModel,
    openrouter_url: settings.openrouterUrl,
    // Never a key: only what the model list needs.
    custom_models: settings.customModels?.map((m) => ({
      id: m.id,
      provider: m.provider,
      model: m.model,
      name: m.name || null,
      base_url: m.baseUrl || null,
    })),
  };
}

function fromServerProfile(profile: any): Partial<SyncableSettings> {
  const out: Partial<SyncableSettings> = {};
  // A saved '' ("Use .env default") must still beat a stale local model; never-saved columns are null.
  if (typeof profile.text_generation_model === 'string') {
    out.textGenerationModel = profile.text_generation_model;
  }
  if (typeof profile.answer_model === 'string') out.answerModel = profile.answer_model;
  if (profile.ollama_url) out.ollamaUrl = profile.ollama_url;
  if (profile.ollama_model) out.ollamaModel = profile.ollama_model;
  if (profile.openrouter_url) out.openrouterUrl = profile.openrouter_url;
  // null = never saved from any device: keep this browser's list (e.g. models added before logging in).
  if (Array.isArray(profile.custom_models)) {
    out.customModels = profile.custom_models.map((m: any) => ({
      id: String(m.id),
      provider: m.provider,
      model: String(m.model),
      ...(m.name ? { name: String(m.name) } : {}),
      ...(m.base_url ? { baseUrl: String(m.base_url) } : {}),
    }));
  }
  return out;
}

/** Called right after login/signup so a returning user's model choice loads on a new browser. */
export async function pullServerSettingsIfLoggedIn(): Promise<void> {
  const { isLoggedIn } = await import('../auth/tokenStore');
  if (!isLoggedIn()) return;
  try {
    const { apiFetch } = await import('../http/apiClient');
    const res = await apiFetch('/auth/profile');
    if (!res.ok) return;
    const profile = await res.json();
    const current = readStoredSettings();
    writeStoredSettings({ ...current, ...fromServerProfile(profile) });
  } catch {
    // offline or backend down — local settings stay as-is
  }
}

export const settingsService = {
  /** Reads settings from localStorage; for logged-in users, refreshes the syncable subset from the server first (server wins), falling back to local on failure. */
  async getSettings(): Promise<UserSettings> {
    await pullServerSettingsIfLoggedIn();
    return readStoredSettings();
  },

  async saveSettings(settings: UserSettings): Promise<void> {
    writeStoredSettings(settings);
    const { isLoggedIn } = await import('../auth/tokenStore');
    if (isLoggedIn()) {
      try {
        const { apiFetch } = await import('../http/apiClient');
        await apiFetch('/auth/profile', {
          method: 'PUT',
          body: JSON.stringify(toServerProfile(settings)),
        });
      } catch {
        // best-effort sync; local save already succeeded
      }
    }
  },

  /** Probe the Ollama server and return running status + pulled model list. No key involved — safe to ask the backend to do the network probe. */
  async getOllamaStatus(url?: string): Promise<OllamaStatus> {
    const params = url ? `?url=${encodeURIComponent(url)}` : '';
    const res = await fetch(`${API_BASE_URL}/config/ollama-status${params}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  },

  /** Public endpoint (no secrets, guest-accessible Config page), so plain fetch rather than apiFetch. */
  async getAiDefault(): Promise<AiDefaultInfo> {
    const res = await fetch(`${API_BASE_URL}/config/ai-default`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  },

  async getOllamaModels(url: string): Promise<string[]> {
    const res = await fetch(
      `${API_BASE_URL}/settings/ollama-models?url=${encodeURIComponent(url)}`
    );
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      throw new Error(data?.detail || `HTTP error! status: ${res.status}`);
    }
    const data = await res.json();
    return data.models || [];
  },

  /** Makes one real call to the provider with this key to confirm it actually works. The key is sent straight through, never stored server-side. */
  async testApiKey(
    provider: string,
    apiKey: string,
    baseUrl?: string
  ): Promise<{ ok: boolean; message: string }> {
    const res = await fetch(`${API_BASE_URL}/config/test-key`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider, api_key: apiKey, base_url: baseUrl }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      throw new Error(data?.detail || `HTTP error! status: ${res.status}`);
    }
    return await res.json();
  },
};

/**
 * Resolves a coarse provider choice ('gemini' | 'ollama' — used by the To-Do
 * suite's quick model toggle) or an already-specific model id into the
 * concrete model id to send with a request.
 */
export function resolveModelId(
  choice: string,
  settings: UserSettings = readStoredSettings()
): string {
  if (choice === 'ollama') return 'ollama';
  if (choice === 'gemini') {
    // "Use .env default" stays '' so the server resolves AI_PROVIDER / AI_MODEL.
    if (settings.textGenerationModel === USE_ENV_DEFAULT_MODEL) return USE_ENV_DEFAULT_MODEL;
    const main = settings.textGenerationModel ?? '';
    return (main.startsWith('gemini') || main.startsWith('gemma')) && !main.includes('::')
      ? main
      : 'gemini-flash-latest';
  }
  return choice;
}

/** Same as aiRequestFields, but for call sites with no per-call model toggle — just uses whatever the user configured as their main text generation model in Config. */
export function defaultAIRequestFields(
  settings: UserSettings = readStoredSettings()
): Record<string, string> {
  return aiRequestFields(settings.textGenerationModel, settings);
}

// ── Added models and endpoints: how a request reaches them ──────────────────────────────────────────────────────

/**
 * Provider slug a model id names by itself. Mirror of model_provider_hint() in backend/modules/common/ai/settings.py
 * (and providerOrder() in fe-apis/ai/providers.ts): the backend routes by this and swaps a name its provider
 * wouldn't recognise for that provider's default, so an added model is sent as-is only when this agrees.
 */
const GROQ_NATIVE_MODELS = [
  'llama-3.3-70b-versatile',
  'llama-3.1-8b-instant',
  'gemma2-9b-it',
  'mixtral-8x7b-32768',
];

export function nativeProviderOf(model: string): ModelProviderSlug | null {
  if (model.startsWith('vertex_gemini_')) return 'vertex';
  if (model === 'ollama' || model.startsWith('ollama::')) return 'ollama';
  if (model.includes('/') || model.startsWith('openrouter')) return 'openrouter';
  if (model.startsWith('gemini') || model.startsWith('gemma')) return 'gemini';
  if (model.startsWith('deepseek')) return 'deepseek';
  if (GROQ_NATIVE_MODELS.includes(model)) return 'groq';
  if (model.startsWith('gpt')) return 'openai';
  if (model.startsWith('claude')) return 'anthropic';
  if (model === 'custom') return 'custom';
  return null;
}

/** Providers whose added models can also go through their OpenAI-compatible API (the `custom` request path). */
const COMPAT_BASE_URLS: Partial<Record<ModelProviderSlug, string>> = {
  gemini: 'https://generativelanguage.googleapis.com/v1beta/openai',
  deepseek: 'https://api.deepseek.com',
  groq: 'https://api.groq.com/openai/v1',
  openai: 'https://api.openai.com/v1',
  anthropic: 'https://api.anthropic.com/v1',
  openrouter: 'https://openrouter.ai/api/v1',
};

const KEY_OF: Partial<Record<ModelProviderSlug, keyof UserSettings>> = {
  gemini: 'geminiKey',
  deepseek: 'deepseekKey',
  groq: 'groqKey',
  openai: 'openaiKey',
  anthropic: 'anthropicKey',
  openrouter: 'openrouterKey',
};

/** True when an added model's name reaches its provider directly; otherwise it goes through the compatible API. */
export function routesNatively(provider: ModelProviderSlug, model: string): boolean {
  if (provider === 'vertex' || provider === 'ollama') return true;
  return nativeProviderOf(model) === provider;
}

/** The value stored as textGenerationModel / answerModel when an added model is picked. */
export function userModelValue(m: UserModel): string {
  if (m.provider === 'custom') return `endpoint::${m.id}`;
  if (m.provider === 'vertex') return `vertex_gemini_${m.model}`;
  if (m.provider === 'ollama') return 'ollama';
  return routesNatively(m.provider, m.model) ? m.model : `${m.provider}::${m.model}`;
}

/** `groq::qwen-qwq-32b` → { provider: 'groq', model: 'qwen-qwq-32b' }. */
export function parseCompatValue(
  value: string
): { provider: ModelProviderSlug; model: string } | null {
  const i = value.indexOf('::');
  if (i <= 0) return null;
  const provider = value.slice(0, i) as ModelProviderSlug;
  if (!(provider in COMPAT_BASE_URLS)) return null;
  return { provider, model: value.slice(i + 2) };
}

export function findEndpoint(value: string, settings: UserSettings): UserModel | undefined {
  if (!value.startsWith('endpoint::')) return undefined;
  const id = value.slice('endpoint::'.length);
  return settings.customModels?.find((m) => m.provider === 'custom' && m.id === id);
}

/**
 * Request overrides for an added model or endpoint, or null for everything else. Both go out as the generic
 * OpenAI-compatible path (model 'custom'), which both backends already serve. The key always comes from this
 * browser ('none' when there is none, so the server never falls back to its own CUSTOM_AI_API_KEY for a URL the
 * user typed; a keyless local server ignores it).
 */
function routeAddedModel(model: string, settings: UserSettings): Record<string, string> | null {
  if (model.startsWith('endpoint::')) {
    const ep = findEndpoint(model, settings);
    // A removed endpoint: let the server default answer rather than fail every request.
    if (!ep?.baseUrl) return { model: USE_ENV_DEFAULT_MODEL };
    return {
      model: 'custom',
      customBaseUrl: ep.baseUrl,
      customModel: ep.model,
      customKey: settings.endpointKeys?.[ep.id] || 'none',
    };
  }
  const compat = parseCompatValue(model);
  if (!compat) return null;
  const keyField = KEY_OF[compat.provider];
  const base =
    compat.provider === 'openrouter'
      ? settings.openrouterUrl || COMPAT_BASE_URLS.openrouter!
      : COMPAT_BASE_URLS[compat.provider]!;
  return {
    model: 'custom',
    customBaseUrl: base,
    customModel: compat.model,
    customKey: (keyField ? (settings[keyField] as string) : '') || 'none',
  };
}

/** Fields to spread into any AI-calling request body, alongside its other fields. */
export function aiRequestFields(
  choice: string,
  settings: UserSettings = readStoredSettings()
): Record<string, string> {
  const model = resolveModelId(choice, settings);
  return {
    model,
    geminiKey: settings.geminiKey,
    openaiKey: settings.openaiKey,
    anthropicKey: settings.anthropicKey,
    deepseekKey: settings.deepseekKey,
    groqKey: settings.groqKey,
    openrouterKey: settings.openrouterKey,
    openrouterUrl: settings.openrouterUrl,
    customKey: settings.customKey,
    customBaseUrl: settings.customBaseUrl,
    customModel: settings.customModel,
    ollamaUrl: settings.ollamaUrl,
    ollamaModel: settings.ollamaModel,
    ...routeAddedModel(model, settings),
  };
}

/** Same fields as aiRequestFields, URL-encoded — for GET/SSE endpoints that can't carry a JSON body. */
export function aiQueryString(
  choice: string,
  settings: UserSettings = readStoredSettings()
): string {
  return new URLSearchParams(aiRequestFields(choice, settings)).toString();
}

/** True when an AI call failed because no provider key is configured — the backend's ai_client.py raises exactly this text (see "No API key configured"). Lets callers point the user at Config instead of showing a generic error. */
export function isMissingKeyError(message: string | null | undefined): boolean {
  return !!message && message.includes('No API key configured');
}

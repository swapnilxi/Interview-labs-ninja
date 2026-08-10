'use client';

/**
 * AI provider settings — model choice + API keys.
 *
 * These live ONLY in this browser's localStorage. They are never sent to or
 * stored by our backend's database; each AI request carries the relevant
 * fields (see aiRequestFields below) straight from here, used for that one
 * call, and nothing is persisted server-side. This is what lets one
 * deployment be shared by multiple people, each using their own keys.
 */

export interface UserSettings {
  textGenerationModel: string;
  answerModel: string;
  openaiKey: string;
  geminiKey: string;
  anthropicKey: string;
  deepseekKey: string;
  groqKey: string;
  ollamaUrl: string;
  ollamaModel: string;
  youtubeApiKey: string;
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

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8082';
const STORAGE_KEY = 'labninja.ai-settings.v1';

export const DEFAULT_SETTINGS: UserSettings = {
  textGenerationModel: 'gemini-flash-latest',
  answerModel: 'gemini-flash-latest',
  openaiKey: '',
  geminiKey: '',
  anthropicKey: '',
  deepseekKey: '',
  groqKey: '',
  ollamaUrl: 'http://localhost:11434',
  ollamaModel: 'llama3.2',
  youtubeApiKey: '',
};

function readStoredSettings(): UserSettings {
  if (typeof window === 'undefined') return DEFAULT_SETTINGS;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

function writeStoredSettings(settings: UserSettings): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}

/** Model/provider fields synced server-side for logged-in users. API keys never leave the browser. */
const SYNCABLE_FIELDS = ['textGenerationModel', 'answerModel', 'ollamaUrl', 'ollamaModel'] as const;
type SyncableSettings = Pick<UserSettings, (typeof SYNCABLE_FIELDS)[number]>;

function toServerProfile(settings: Partial<UserSettings>) {
  return {
    text_generation_model: settings.textGenerationModel,
    answer_model: settings.answerModel,
    ollama_url: settings.ollamaUrl,
    ollama_model: settings.ollamaModel,
  };
}

function fromServerProfile(profile: any): Partial<SyncableSettings> {
  const out: Partial<SyncableSettings> = {};
  if (profile.text_generation_model) out.textGenerationModel = profile.text_generation_model;
  if (profile.answer_model) out.answerModel = profile.answer_model;
  if (profile.ollama_url) out.ollamaUrl = profile.ollama_url;
  if (profile.ollama_model) out.ollamaModel = profile.ollama_model;
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
        await apiFetch('/auth/profile', { method: 'PUT', body: JSON.stringify(toServerProfile(settings)) });
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

  async getOllamaModels(url: string): Promise<string[]> {
    const res = await fetch(`${API_BASE_URL}/settings/ollama-models?url=${encodeURIComponent(url)}`);
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      throw new Error(data?.detail || `HTTP error! status: ${res.status}`);
    }
    const data = await res.json();
    return data.models || [];
  },

  /** Makes one real call to the provider with this key to confirm it actually works. The key is sent straight through, never stored server-side. */
  async testApiKey(provider: string, apiKey: string): Promise<{ ok: boolean; message: string }> {
    const res = await fetch(`${API_BASE_URL}/config/test-key`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider, api_key: apiKey }),
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
export function resolveModelId(choice: string, settings: UserSettings = readStoredSettings()): string {
  if (choice === 'ollama') return 'ollama';
  if (choice === 'gemini') {
    return settings.textGenerationModel?.startsWith('gemini') || settings.textGenerationModel?.startsWith('gemma')
      ? settings.textGenerationModel
      : 'gemini-flash-latest';
  }
  return choice;
}

/** Same as aiRequestFields, but for call sites with no per-call model toggle — just uses whatever the user configured as their main text generation model in Config. */
export function defaultAIRequestFields(settings: UserSettings = readStoredSettings()): Record<string, string> {
  return aiRequestFields(settings.textGenerationModel, settings);
}

/** Fields to spread into any AI-calling request body, alongside its other fields. */
export function aiRequestFields(choice: string, settings: UserSettings = readStoredSettings()): Record<string, string> {
  return {
    model: resolveModelId(choice, settings),
    geminiKey: settings.geminiKey,
    openaiKey: settings.openaiKey,
    anthropicKey: settings.anthropicKey,
    deepseekKey: settings.deepseekKey,
    groqKey: settings.groqKey,
    ollamaUrl: settings.ollamaUrl,
    ollamaModel: settings.ollamaModel,
  };
}

/** Same fields as aiRequestFields, URL-encoded — for GET/SSE endpoints that can't carry a JSON body. */
export function aiQueryString(choice: string, settings: UserSettings = readStoredSettings()): string {
  return new URLSearchParams(aiRequestFields(choice, settings)).toString();
}

/** True when an AI call failed because no provider key is configured — the backend's ai_client.py raises exactly this text (see "No API key configured"). Lets callers point the user at Config instead of showing a generic error. */
export function isMissingKeyError(message: string | null | undefined): boolean {
  return !!message && message.includes('No API key configured');
}

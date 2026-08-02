'use client';

/**
 * AI provider settings — model choice + API keys.
 *
 * These live ONLY in this browser's localStorage. They are never sent to or
 * stored by our backend's database; each AI request carries the relevant
 * fields (see aiRequestFields/appendAIFormFields below) straight from here,
 * used for that one call, and nothing is persisted server-side. This is what
 * lets one deployment be shared by multiple people, each using their own keys.
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

export const settingsService = {
  /** Reads settings from this browser's localStorage (async for backward-compat with existing callers). */
  async getSettings(): Promise<UserSettings> {
    return readStoredSettings();
  },

  async saveSettings(settings: UserSettings): Promise<void> {
    writeStoredSettings(settings);
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

/** Same fields as aiRequestFields, appended onto FormData — for multipart file-upload endpoints. */
export function appendAIFormFields(formData: FormData, choice: string, settings: UserSettings = readStoredSettings()): void {
  Object.entries(aiRequestFields(choice, settings)).forEach(([key, value]) => formData.append(key, value));
}

/** Same fields as aiRequestFields, URL-encoded — for GET/SSE endpoints that can't carry a JSON body. */
export function aiQueryString(choice: string, settings: UserSettings = readStoredSettings()): string {
  return new URLSearchParams(aiRequestFields(choice, settings)).toString();
}

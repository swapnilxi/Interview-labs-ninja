/**
 * fe-apis/ai/defaults.ts
 *
 * Server-side default model selection from .env (AI_PROVIDER / AI_MODEL), used when
 * the client sends no model (Config's "Use .env default"). Must stay semantically
 * identical to the Python twin in backend/modules/common/ai/settings.py so both
 * backends resolve the same default for the same env. Env is read at call time.
 */

import { GROQ_MODELS } from './providers';

export const AI_PROVIDERS = [
  'gemini',
  'vertex',
  'deepseek',
  'groq',
  'openai',
  'anthropic',
  'openrouter',
  'ollama',
  'custom',
] as const;

export type AIProvider = (typeof AI_PROVIDERS)[number];

export const PROVIDER_DEFAULT_MODELS: Record<AIProvider, string> = {
  gemini: 'gemini-flash-latest',
  vertex: 'vertex_gemini_gemini-2.5-flash',
  deepseek: 'deepseek-chat',
  groq: 'llama-3.3-70b-versatile',
  openai: 'gpt-4o-mini',
  anthropic: 'claude-sonnet-5',
  openrouter: 'openrouter/auto',
  ollama: 'ollama',
  custom: 'custom',
};

export const FALLBACK_MODEL = 'deepseek-chat';

export interface AIDefaultInfo {
  provider: AIProvider | null;
  model: string;
  source: 'AI_MODEL' | 'AI_PROVIDER' | 'builtin';
  warning: string | null;
}

function rawEnvProvider(): string {
  return (process.env.AI_PROVIDER || '').trim().toLowerCase();
}

export function envProvider(): AIProvider | null {
  const p = rawEnvProvider();
  return (AI_PROVIDERS as readonly string[]).includes(p) ? (p as AIProvider) : null;
}

function envModel(): string {
  return (process.env.AI_MODEL || '').trim();
}

export function envDefaultModel(): string {
  const provider = envProvider();
  const model = envModel();
  if (model) {
    if (provider === 'ollama' && model !== 'ollama' && !model.startsWith('ollama::')) return `ollama::${model}`;
    if (provider === 'vertex' && !model.startsWith('vertex_gemini_')) return `vertex_gemini_${model}`;
    // The custom endpoint's model comes from CUSTOM_AI_MODEL / Config's customModel, not AI_MODEL.
    if (provider === 'custom') return 'custom';
    return model;
  }
  if (provider) return PROVIDER_DEFAULT_MODELS[provider];
  return FALLBACK_MODEL;
}

/** Provider a model id names by its own prefix (same checks/order as Python's model_provider_hint), or null. */
export function modelProviderHint(model: string): AIProvider | null {
  if (model.startsWith('vertex_gemini_')) return 'vertex';
  // Before the '/' check: pulled Ollama models can be named like hf.co/org/model.
  if (model === 'ollama' || model.startsWith('ollama::')) return 'ollama';
  if (model.includes('/') || model.startsWith('openrouter')) return 'openrouter';
  if (model.startsWith('gemini') || model.startsWith('gemma')) return 'gemini';
  if (model.startsWith('deepseek')) return 'deepseek';
  if (GROQ_MODELS.includes(model)) return 'groq';
  if (model.startsWith('gpt')) return 'openai';
  if (model.startsWith('claude')) return 'anthropic';
  if (model === 'custom') return 'custom';
  return null;
}

export function resolveModel(requested?: string | null): string {
  const r = (requested ?? '').trim();
  return r || envDefaultModel();
}

/** Vertex and Ollama have no fe-apis implementation; they only work on the FastAPI backend. */
export function serverOnlyProvider(model: string): 'vertex' | 'ollama' | null {
  if (model.startsWith('vertex_gemini_')) return 'vertex';
  if (model === 'ollama' || model.startsWith('ollama::')) return 'ollama';
  return null;
}

/** Why the resolved .env default can't run in nextjs-api mode, or null if it can. */
export function unsupportedEnvDefaultMessage(model: string = envDefaultModel()): string | null {
  const kind = serverOnlyProvider(model);
  if (!kind) return null;
  const provider = envProvider();
  const setting = [provider && `AI_PROVIDER=${provider}`, envModel() && `AI_MODEL=${envModel()}`]
    .filter(Boolean)
    .join(', ');
  return (
    `${setting} selects ${kind}, which is only supported by the FastAPI backend ` +
    `(NEXT_PUBLIC_BACKEND_MODE=fastapi), not nextjs-api mode. Choose a model in Config, ` +
    `or set a different AI_PROVIDER/AI_MODEL.`
  );
}

export function aiDefaultInfo(): AIDefaultInfo {
  const raw = (process.env.AI_PROVIDER || '').trim();
  const provider = envProvider();
  const model = envDefaultModel();
  const warnings: string[] = [];
  if (raw && !provider) {
    // Only echo short values, so a secret pasted into the wrong variable is never exposed.
    const shown = raw.length <= 20 ? ` '${raw}'` : '';
    warnings.push(`Unknown AI_PROVIDER${shown} — ignored. Valid: ${AI_PROVIDERS.join(', ')}`);
  }
  const rawModel = envModel();
  if (rawModel && !provider && !modelProviderHint(rawModel)) {
    warnings.push(
      `AI_MODEL '${rawModel}' doesn't identify a provider on its own — set AI_PROVIDER too ` +
        `(otherwise it's tried on Gemini first)`
    );
  }
  const unsupported = unsupportedEnvDefaultMessage(model);
  if (unsupported) warnings.push(unsupported);
  return {
    provider,
    model,
    source: envModel() ? 'AI_MODEL' : provider ? 'AI_PROVIDER' : 'builtin',
    warning: warnings.length ? warnings.join('. ') : null,
  };
}

/**
 * fe-apis/ai/client.ts
 *
 * Multi-provider AI generation client for Next.js API routes. Supports Gemini,
 * DeepSeek, OpenAI, Anthropic, Groq, OpenRouter, and any custom OpenAI-compatible
 * endpoint. Provider keys resolve config-first: whatever the client sends (from the
 * browser's Config page) takes priority; a key set in this server's own .env is used
 * only as a fallback when the client didn't supply one -- mirrors the same priority
 * on the Python backend (backend/modules/common/ai/client.py). The model follows the
 * same rule: an empty model means "use the .env default" (see ./defaults.ts).
 */

import {
  GROQ_MODELS,
  providerOrder,
  callOpenAiCompatible,
  callAnthropicText,
  callGeminiText,
  embedOpenAi,
  embedGemini,
  embedOllama,
} from './providers';
import {
  PROVIDER_DEFAULT_MODELS,
  envDefaultModel,
  envProvider,
  modelProviderHint,
  resolveModel,
  unsupportedEnvDefaultMessage,
} from './defaults';

export interface AISettingsPayload {
  model?: string;
  geminiKey?: string;
  openaiKey?: string;
  anthropicKey?: string;
  deepseekKey?: string;
  groqKey?: string;
  openrouterKey?: string;
  openrouterUrl?: string;
  customKey?: string;
  customBaseUrl?: string;
  customModel?: string;
  ollamaUrl?: string;
  ollamaModel?: string;
}

const SELF_ROUTED = ['vertex', 'ollama', 'custom'];

/** AI_PROVIDER when `model` is the env default, else null -- mirrors Python's _preferred_env_provider. */
function preferredEnvProvider(model: string): string | null {
  const provider = envProvider();
  const hint = modelProviderHint(model);
  if (!provider || SELF_ROUTED.includes(provider) || (hint && SELF_ROUTED.includes(hint))) return null;
  return model === envDefaultModel() ? provider : null;
}

/**
 * The id to send to DeepSeek's own API. OpenRouter's ids ("deepseek/deepseek-chat", "deepseek/deepseek-r1") become
 * DeepSeek's names: its API rejects them with a 400. Twin: _deepseek_model() in backend/modules/common/ai/client.py.
 */
function deepseekModel(model: string, exact: boolean): string {
  if (model.startsWith('deepseek/')) {
    const name = model.split('/').slice(1).join('/').toLowerCase();
    return name.includes('r1') || name.includes('reason') ? 'deepseek-reasoner' : 'deepseek-flash';
  }
  return exact || model.startsWith('deepseek') ? model : 'deepseek-flash';
}

// DeepSeek's reasoning models think before answering, and the thinking counts against max_tokens (live-tested
// 2026-11-15: deepseek-v4-pro spent all 8192 tokens thinking on a 2-card prompt and returned nothing). They get low
// reasoning effort, room for the thinking on top of the caller's budget, and a longer timeout.
// Twin: _deepseek_call_options() in backend/modules/common/ai/client.py.
const DEEPSEEK_REASONING_PREFIXES = ['deepseek-v4-pro'];
const DEEPSEEK_REASONING_HEADROOM = 8192;
const DEEPSEEK_REASONING_TIMEOUT_MS = 240_000;

function deepseekCallOptions(
  model: string,
  maxTokens: number,
  timeoutMs: number
): { maxTokens: number; timeoutMs: number; extra: Record<string, unknown> } {
  if (DEEPSEEK_REASONING_PREFIXES.some((p) => model.startsWith(p))) {
    return {
      maxTokens: maxTokens + DEEPSEEK_REASONING_HEADROOM,
      timeoutMs: Math.max(timeoutMs, DEEPSEEK_REASONING_TIMEOUT_MS),
      extra: { reasoning_effort: 'low' },
    };
  }
  return { maxTokens, timeoutMs, extra: {} };
}

function effectiveOrder(model: string): string[] {
  const order = providerOrder(model);
  const preferred = preferredEnvProvider(model);
  return preferred ? [preferred, ...order.filter((p) => p !== preferred)] : order;
}

/**
 * Calls the configured AI provider, falling back through other providers the
 * caller has keys for (in relevance order for the requested model) if the
 * primary choice fails -- mirrors Python's call_ai_text in
 * backend/modules/common/ai/client.py so both backends behave identically.
 *
 * `maxTokens` defaults to a small budget suitable for short answers; callers
 * generating a large document (a full lesson) must pass a much higher value
 * explicitly -- every provider here silently truncates mid-output rather than
 * erroring on an undersized budget, so it looks like a valid-but-incomplete
 * response, not a failure (confirmed live against DeepSeek: a real generate
 * call came back cut off mid-tag with no error at all).
 */
export async function callAIText(
  prompt: string,
  settings: AISettingsPayload = {},
  timeoutMs: number = 55000,
  maxTokens: number = 2048
): Promise<string> {
  const model = resolveModel(settings.model);
  if (!(settings.model ?? '').trim()) {
    // providerOrder() has no vertex/ollama path, so fail loudly instead of silently answering via Gemini.
    const unsupported = unsupportedEnvDefaultMessage(model);
    if (unsupported) throw new Error(unsupported);
  }
  const preferred = preferredEnvProvider(model);
  const errors: Record<string, string> = {};

  for (const provider of effectiveOrder(model)) {
    const exact = provider === preferred;
    try {
      if (provider === 'gemini') {
        const key = settings.geminiKey || process.env.GEMINI_API_KEY || '';
        if (key) {
          const geminiModel =
            exact || model.startsWith('gemini') || model.startsWith('gemma') ? model : 'gemini-2.5-flash';
          return await callGeminiText(prompt, key, geminiModel, timeoutMs, maxTokens);
        }
      } else if (provider === 'openrouter') {
        const key = settings.openrouterKey || process.env.OPENROUTER_API_KEY || '';
        if (key) {
          const url = settings.openrouterUrl || 'https://openrouter.ai/api/v1';
          const openrouterModel = exact || model.includes('/') ? model : 'meta-llama/llama-3.3-70b-instruct';
          return await callOpenAiCompatible(prompt, key, url, openrouterModel, timeoutMs, maxTokens);
        }
      } else if (provider === 'deepseek') {
        const key = settings.deepseekKey || process.env.DEEPSEEK_API_KEY || '';
        if (key) {
          const dsModel = deepseekModel(model, exact);
          const opts = deepseekCallOptions(dsModel, maxTokens, timeoutMs);
          return await callOpenAiCompatible(prompt, key, 'https://api.deepseek.com', dsModel, opts.timeoutMs, opts.maxTokens, opts.extra);
        }
      } else if (provider === 'groq') {
        const key = settings.groqKey || process.env.GROQ_API_KEY || '';
        if (key) {
          const groqModel = exact || GROQ_MODELS.includes(model) ? model : 'llama-3.3-70b-versatile';
          return await callOpenAiCompatible(prompt, key, 'https://api.groq.com/openai/v1', groqModel, timeoutMs, maxTokens);
        }
      } else if (provider === 'openai') {
        const key = settings.openaiKey || process.env.OPENAI_API_KEY || '';
        if (key) {
          const openaiModel = exact || model.startsWith('gpt') ? model : 'gpt-4o-mini';
          return await callOpenAiCompatible(prompt, key, 'https://api.openai.com/v1', openaiModel, timeoutMs, maxTokens);
        }
      } else if (provider === 'anthropic') {
        const key = settings.anthropicKey || process.env.ANTHROPIC_API_KEY || '';
        if (key) {
          const anthropicModel = exact || model.startsWith('claude') ? model : PROVIDER_DEFAULT_MODELS.anthropic;
          return await callAnthropicText(prompt, key, anthropicModel, timeoutMs, maxTokens);
        }
      } else if (provider === 'custom') {
        // Generic OpenAI-compatible endpoint (Together.ai, Fireworks, a local
        // LM Studio/vLLM server, etc.) for anything not natively named above.
        const key = settings.customKey || process.env.CUSTOM_AI_API_KEY || '';
        const baseUrl = settings.customBaseUrl || process.env.CUSTOM_AI_BASE_URL || '';
        const customModel = settings.customModel || process.env.CUSTOM_AI_MODEL || '';
        if (key && baseUrl && customModel) {
          return await callOpenAiCompatible(prompt, key, baseUrl, customModel, timeoutMs, maxTokens);
        }
      }
    } catch (err) {
      errors[provider] = err instanceof Error ? err.message : String(err);
    }
  }

  if (Object.keys(errors).length === 0) {
    throw new Error('No API key configured for this model. Add one in Config.');
  }
  const [firstProvider, detail] = Object.entries(errors)[0];
  throw new Error(`${firstProvider} failed: ${detail}`);
}

/** Thrown by embedTexts when no embedding-capable provider is configured or
 * reachable. Distinct from a plain Error so callers can catch it specifically and
 * degrade gracefully (e.g. skip RAG indexing) instead of surfacing a generic
 * failure. Mirrors backend/modules/common/ai/client.py's NoEmbeddingProviderError. */
export class NoEmbeddingProviderError extends Error {}

/**
 * Embed a batch of texts, trying each embedding-capable provider the caller has a
 * key for: OpenAI, then Gemini, then a local Ollama (no key needed, tried last --
 * same "always attempt, but never let its failure drown out a real provider error"
 * treatment callAIText gives it). Anthropic has no embeddings API, and the other
 * OpenAI-compatible providers (DeepSeek/Groq/OpenRouter/custom) aren't wired up
 * here since they'd each need their own embedding model id, which
 * AISettingsPayload doesn't carry.
 *
 * Mirrors backend/modules/common/ai/client.py's embed_texts.
 */
export async function embedTexts(texts: string[], settings: AISettingsPayload = {}): Promise<number[][]> {
  if (texts.length === 0) return [];

  const errors: Record<string, string> = {};

  const openaiKey = settings.openaiKey || process.env.OPENAI_API_KEY || '';
  if (openaiKey) {
    try {
      return await embedOpenAi(texts, openaiKey);
    } catch (err) {
      errors.openai = err instanceof Error ? err.message : String(err);
    }
  }

  const geminiKey = settings.geminiKey || process.env.GEMINI_API_KEY || '';
  if (geminiKey) {
    try {
      return await embedGemini(texts, geminiKey);
    } catch (err) {
      errors.gemini = err instanceof Error ? err.message : String(err);
    }
  }

  try {
    return await embedOllama(texts, settings.ollamaUrl || 'http://localhost:11434');
  } catch (err) {
    errors.ollama = err instanceof Error ? err.message : String(err);
  }

  const detail = Object.entries(errors).length
    ? Object.entries(errors).map(([k, v]) => `${k}: ${v}`).join('; ')
    : 'no provider configured';
  throw new NoEmbeddingProviderError(
    `No embedding-capable provider is configured or reachable (${detail}). RAG indexing ` +
      'needs an OpenAI key, a Gemini key, or a running local Ollama with an embedding ' +
      'model pulled (e.g. `ollama pull nomic-embed-text`).'
  );
}

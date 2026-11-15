/**
 * Settings page data: the providers and models the picker offers, the API-key fields, and the helpers that explain
 * what "Server default" (an empty model id, USE_ENV_DEFAULT_MODEL) resolves to. No React here.
 */
import {
  findEndpoint,
  parseCompatValue,
  routesNatively,
  userModelValue,
  type AiDefaultInfo,
  type ModelProviderSlug,
  type UserModel,
  type UserSettings,
} from '@/lib/services/settingsService';

export type Tier = 'free' | 'cheap' | 'pro';

export type ProviderKey =
  | 'Google'
  | 'Vertex'
  | 'DeepSeek'
  | 'Groq'
  | 'OpenAI'
  | 'Anthropic'
  | 'OpenRouter'
  | 'Ollama'
  | 'Custom';

/** The picker's first tab: "use whatever the server's .env says". */
export type ProviderTab = ProviderKey | 'Default';

export interface ModelEntry {
  id: string;
  name: string;
  /** One short plain phrase: what this model is good for. */
  note: string;
  tier: Tier;
  recommended?: boolean;
}

export type KeyField =
  | 'geminiKey'
  | 'deepseekKey'
  | 'groqKey'
  | 'openrouterKey'
  | 'openaiKey'
  | 'anthropicKey'
  | 'customKey';

export interface ProviderEntry {
  key: ProviderKey;
  /** Chip label. */
  name: string;
  /** One line under the chips when this provider is open. */
  blurb: string;
  icon: string;
  keyField?: KeyField;
  models: ModelEntry[];
}

export const PROVIDERS: ProviderEntry[] = [
  {
    key: 'Google',
    name: 'Gemini',
    blurb: 'Google’s models. A free key from AI Studio covers light daily use.',
    icon: 'SparklesIcon',
    keyField: 'geminiKey',
    models: [
      {
        id: 'gemini-flash-latest',
        name: 'Gemini Flash (latest)',
        note: 'Fast, always the newest Flash',
        tier: 'free',
        recommended: true,
      },
      {
        id: 'gemini-pro-latest',
        name: 'Gemini Pro (latest)',
        note: 'Higher quality, always the newest Pro',
        tier: 'pro',
      },
      {
        id: 'gemini-3.5-flash',
        name: 'Gemini 3.5 Flash',
        note: 'Newest generation',
        tier: 'cheap',
      },
      {
        id: 'gemini-3.1-pro-preview',
        name: 'Gemini 3.1 Pro',
        note: 'Preview, most capable',
        tier: 'pro',
      },
      { id: 'gemini-3-pro-preview', name: 'Gemini 3 Pro', note: 'Preview', tier: 'pro' },
      { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash', note: 'Stable', tier: 'free' },
      { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro', note: 'Stable, higher quality', tier: 'pro' },
    ],
  },
  {
    key: 'DeepSeek',
    name: 'DeepSeek',
    blurb: 'Strong models at a very low price per request.',
    icon: 'BoltIcon',
    keyField: 'deepseekKey',
    models: [
      {
        id: 'deepseek-flash',
        name: 'DeepSeek V4.1 Flash',
        note: 'Fast and very cheap',
        tier: 'cheap',
        recommended: true,
      },
      { id: 'deepseek-v4-pro', name: 'DeepSeek V4 Pro', note: 'Most capable', tier: 'pro' },
      // Old API names: DeepSeek now answers both with deepseek-flash (checked 2026-11-15).
      {
        id: 'deepseek-chat',
        name: 'DeepSeek Chat (old name)',
        note: 'Now runs V4.1 Flash',
        tier: 'cheap',
      },
      {
        id: 'deepseek-reasoner',
        name: 'DeepSeek Reasoner (old name)',
        note: 'Now runs V4.1 Flash',
        tier: 'cheap',
      },
    ],
  },
  {
    key: 'Groq',
    name: 'Groq',
    blurb: 'Open models on a free tier, with very quick replies.',
    icon: 'RocketLaunchIcon',
    keyField: 'groqKey',
    models: [
      {
        id: 'llama-3.3-70b-versatile',
        name: 'Llama 3.3 70B',
        note: 'Strong all-rounder',
        tier: 'free',
      },
      { id: 'llama-3.1-8b-instant', name: 'Llama 3.1 8B', note: 'Very fast', tier: 'free' },
      { id: 'gemma2-9b-it', name: 'Gemma 2 9B', note: 'Lightweight', tier: 'free' },
      { id: 'mixtral-8x7b-32768', name: 'Mixtral 8x7B', note: 'Mixture of experts', tier: 'free' },
    ],
  },
  {
    key: 'OpenAI',
    name: 'OpenAI',
    blurb: 'GPT models, billed to your OpenAI account.',
    icon: 'CpuChipIcon',
    keyField: 'openaiKey',
    models: [
      { id: 'gpt-4o', name: 'GPT-4o', note: 'Premium quality', tier: 'pro' },
      { id: 'gpt-4o-mini', name: 'GPT-4o mini', note: 'Low cost', tier: 'cheap' },
    ],
  },
  {
    key: 'Anthropic',
    name: 'Claude',
    blurb: 'Anthropic’s Claude models, billed to your Anthropic account.',
    icon: 'AcademicCapIcon',
    keyField: 'anthropicKey',
    models: [
      {
        id: 'claude-sonnet-5',
        name: 'Claude Sonnet 5',
        note: 'Latest',
        tier: 'pro',
        recommended: true,
      },
      {
        id: 'claude-3-5-sonnet-latest',
        name: 'Claude 3.5 Sonnet',
        note: 'Older, still strong',
        tier: 'pro',
      },
      { id: 'claude-3-5-haiku-latest', name: 'Claude 3.5 Haiku', note: 'Fast', tier: 'cheap' },
    ],
  },
  {
    key: 'OpenRouter',
    name: 'OpenRouter',
    blurb: 'One key for models from many companies.',
    icon: 'GlobeAltIcon',
    keyField: 'openrouterKey',
    models: [
      {
        id: 'openrouter/auto',
        name: 'OpenRouter Auto',
        note: 'Picks a model for each request',
        tier: 'cheap',
      },
      {
        id: 'meta-llama/llama-3.3-70b-instruct',
        name: 'Llama 3.3 70B',
        note: 'High quality',
        tier: 'cheap',
      },
      { id: 'deepseek/deepseek-r1', name: 'DeepSeek R1', note: 'Reasoning, cheap', tier: 'cheap' },
      {
        id: 'deepseek/deepseek-chat',
        name: 'DeepSeek V3',
        note: 'Fast, very cheap',
        tier: 'cheap',
      },
      { id: 'google/gemini-2.0-flash-001', name: 'Gemini 2.0 Flash', note: 'Fast', tier: 'cheap' },
      {
        id: 'anthropic/claude-3.5-sonnet',
        name: 'Claude 3.5 Sonnet',
        note: 'Strong writing',
        tier: 'pro',
      },
      { id: 'openai/gpt-4o-mini', name: 'GPT-4o mini', note: 'Fast', tier: 'cheap' },
    ],
  },
  {
    key: 'Vertex',
    name: 'Vertex AI',
    blurb: 'Gemini through Google Cloud, billed to the server’s GCP credits. No key needed here.',
    icon: 'CloudIcon',
    models: [
      {
        id: 'vertex_gemini_gemini-2.5-flash',
        name: 'Gemini 2.5 Flash',
        note: 'Uses Google Cloud credits',
        tier: 'cheap',
      },
      {
        id: 'vertex_gemini_gemini-2.5-pro',
        name: 'Gemini 2.5 Pro',
        note: 'Uses Google Cloud credits',
        tier: 'pro',
      },
      {
        id: 'vertex_gemini_gemini-2.0-flash',
        name: 'Gemini 2.0 Flash',
        note: 'Uses Google Cloud credits',
        tier: 'cheap',
      },
    ],
  },
  {
    key: 'Ollama',
    name: 'Ollama',
    blurb: 'Models running on your own computer. Free and private; needs Ollama installed.',
    icon: 'ComputerDesktopIcon',
    models: [{ id: 'ollama', name: 'Ollama model', note: 'Runs on this computer', tier: 'free' }],
  },
  {
    key: 'Custom',
    name: 'Other API',
    blurb: 'Any OpenAI-compatible API: Together.ai, Fireworks, LM Studio, vLLM… Tap + to add one.',
    icon: 'WrenchScrewdriverIcon',
    keyField: 'customKey',
    models: [
      {
        id: 'custom',
        name: 'Custom endpoint',
        note: 'Uses the address and model name below',
        tier: 'free',
      },
    ],
  },
];

export const PROVIDER_BY_KEY = Object.fromEntries(PROVIDERS.map((p) => [p.key, p])) as Record<
  ProviderKey,
  ProviderEntry
>;

const ALL_MODELS = PROVIDERS.flatMap((p) => p.models.map((m) => ({ ...m, provider: p.key })));

export function findModel(id: string) {
  return ALL_MODELS.find((m) => m.id === (id.startsWith('ollama::') ? 'ollama' : id));
}

export function isOllamaId(id: string) {
  return id === 'ollama' || id.startsWith('ollama::');
}

export function ollamaModelName(id: string, configured: string): string | null {
  if (id === 'ollama') return configured || null;
  return id.startsWith('ollama::') ? id.slice('ollama::'.length) : null;
}

/** The picker tab a stored model id belongs to. An id the catalog no longer lists opens on "Default". */
// ── Models and endpoints the user added ─────────────────────────────────────────────────────────────────────────

export const SLUG_OF: Record<ProviderKey, ModelProviderSlug> = {
  Google: 'gemini',
  Vertex: 'vertex',
  DeepSeek: 'deepseek',
  Groq: 'groq',
  OpenAI: 'openai',
  Anthropic: 'anthropic',
  OpenRouter: 'openrouter',
  Ollama: 'ollama',
  Custom: 'custom',
};

export const PROVIDER_OF_SLUG = Object.fromEntries(
  Object.entries(SLUG_OF).map(([k, v]) => [v, k])
) as Record<ModelProviderSlug, ProviderKey>;

/** What the add-model form suggests typing, per provider. */
export const MODEL_ID_EXAMPLES: Record<ProviderKey, string> = {
  Google: 'gemini-2.5-flash-lite',
  Vertex: 'gemini-2.5-flash-lite',
  DeepSeek: 'deepseek-v4-pro',
  Groq: 'qwen/qwen3-32b',
  OpenAI: 'o4-mini',
  Anthropic: 'claude-opus-4-1',
  OpenRouter: 'mistralai/mistral-large',
  Ollama: 'llama3.1:8b',
  Custom: 'meta-llama/Llama-3.3-70B-Instruct-Turbo',
};

export function userModelsFor(provider: ProviderKey, settings: UserSettings): UserModel[] {
  const slug = SLUG_OF[provider];
  return (settings.customModels ?? []).filter((m) => m.provider === slug);
}

/** The added model a stored value points at (an endpoint, `groq::x`, or a plain id the user added). */
export function findUserModel(value: string, settings: UserSettings): UserModel | undefined {
  if (!value || value === 'ollama' || value.startsWith('ollama::')) return undefined;
  if (value.startsWith('endpoint::')) return findEndpoint(value, settings);
  return (settings.customModels ?? []).find(
    (m) => m.provider !== 'ollama' && userModelValue(m) === value
  );
}

/** Is this provider+model already offered (built in, or added before)? */
export function alreadyListed(
  provider: ProviderKey,
  model: string,
  settings: UserSettings
): boolean {
  const slug = SLUG_OF[provider];
  const wanted = model.trim().toLowerCase();
  if (provider === 'Custom') return false; // the same model on two endpoints is fine
  const builtIn = PROVIDER_BY_KEY[provider].models.some((m) => {
    const id = provider === 'Vertex' ? m.id.replace(/^vertex_gemini_/, '') : m.id;
    return id.toLowerCase() === wanted;
  });
  return (
    builtIn ||
    (settings.customModels ?? []).some(
      (m) => m.provider === slug && m.model.toLowerCase() === wanted
    )
  );
}

/** One-line explanation of how an added model will be reached. */
export function routeNote(provider: ProviderKey, model: string): string | null {
  if (provider === 'Custom' || provider === 'Vertex' || provider === 'Ollama' || !model.trim())
    return null;
  return routesNatively(SLUG_OF[provider], model.trim())
    ? null
    : `Sent through ${PROVIDER_BY_KEY[provider].name}’s OpenAI-compatible API, with your key from this browser.`;
}

export function newUserModelId(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

/** The picker tab a stored model id belongs to. An id nothing lists any more opens on "Default". */
export function tabOf(id: string, settings?: UserSettings): ProviderTab {
  if (!id) return 'Default';
  const builtIn = findModel(id)?.provider;
  if (builtIn) return builtIn;
  if (id.startsWith('endpoint::')) return 'Custom';
  const compat = parseCompatValue(id);
  if (compat) return PROVIDER_OF_SLUG[compat.provider];
  if (id.startsWith('vertex_gemini_')) return 'Vertex';
  const added = settings ? findUserModel(id, settings) : undefined;
  return added ? PROVIDER_OF_SLUG[added.provider] : 'Default';
}

export const TIERS: Record<Tier, { label: string; cls: string }> = {
  free: { label: 'Free', cls: 'bg-emerald-500/15 text-emerald-800 dark:text-emerald-300' },
  cheap: { label: 'Low cost', cls: 'bg-amber-500/15 text-amber-800 dark:text-amber-300' },
  pro: { label: 'Premium', cls: 'bg-sky-500/15 text-sky-800 dark:text-sky-300' },
};

export interface KeyFieldEntry {
  key: KeyField;
  provider: ProviderKey;
  label: string;
  placeholder: string;
  /** Where to create a key (opens in a new tab). */
  getKeyUrl?: string;
}

export const KEY_FIELDS: KeyFieldEntry[] = [
  {
    key: 'geminiKey',
    provider: 'Google',
    label: 'Gemini API key',
    placeholder: 'AIzaSy…',
    getKeyUrl: 'https://aistudio.google.com/apikey',
  },
  {
    key: 'deepseekKey',
    provider: 'DeepSeek',
    label: 'DeepSeek API key',
    placeholder: 'sk-…',
    getKeyUrl: 'https://platform.deepseek.com/api_keys',
  },
  {
    key: 'groqKey',
    provider: 'Groq',
    label: 'Groq API key',
    placeholder: 'gsk_…',
    getKeyUrl: 'https://console.groq.com/keys',
  },
  {
    key: 'openaiKey',
    provider: 'OpenAI',
    label: 'OpenAI API key',
    placeholder: 'sk-proj-…',
    getKeyUrl: 'https://platform.openai.com/api-keys',
  },
  {
    key: 'anthropicKey',
    provider: 'Anthropic',
    label: 'Anthropic API key',
    placeholder: 'sk-ant-…',
    getKeyUrl: 'https://console.anthropic.com/settings/keys',
  },
  {
    key: 'openrouterKey',
    provider: 'OpenRouter',
    label: 'OpenRouter API key',
    placeholder: 'sk-or-v1-…',
    getKeyUrl: 'https://openrouter.ai/keys',
  },
  { key: 'customKey', provider: 'Custom', label: 'Other API key', placeholder: 'sk-…' },
];

export const KEY_FIELD_BY_PROVIDER = Object.fromEntries(
  KEY_FIELDS.map((f) => [f.provider, f])
) as Partial<Record<ProviderKey, KeyFieldEntry>>;

export const DEFAULT_OPENROUTER_URL = 'https://openrouter.ai/api/v1';

// ── "Server default" (an empty model id) ────────────────────────────────────────────────────────────────────────────

/** undefined = GET /config/ai-default still in flight, null = it failed. */
export type AiDefaultState = AiDefaultInfo | null | undefined;

const ENV_PROVIDER_KEYS: Record<string, ProviderKey> = {
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

/** "OpenAI · GPT-4o", but just "DeepSeek V4.1 Flash" when the name already says who makes it. */
function label(providerKey: ProviderKey | undefined, name: string) {
  if (!providerKey) return name;
  const provider = PROVIDER_BY_KEY[providerKey].name;
  return name.toLowerCase().startsWith(provider.toLowerCase()) ? name : `${provider} · ${name}`;
}

export function describeEnvDefault(aiDefault: AiDefaultState, ollamaModel: string) {
  if (!aiDefault) return null;
  const { model, provider } = aiDefault;
  const found = findModel(model);
  // AI_PROVIDER decides where the request goes, except for ids the backend always routes by
  // their own prefix (Vertex/Ollama/Custom); a bare '/' id with no provider goes to OpenRouter.
  const selfRouted: ProviderKey | undefined = model.startsWith('vertex_gemini_')
    ? 'Vertex'
    : isOllamaId(model)
      ? 'Ollama'
      : model === 'custom'
        ? 'Custom'
        : undefined;
  const providerKey: ProviderKey | undefined =
    selfRouted ??
    (provider ? ENV_PROVIDER_KEYS[provider] : undefined) ??
    found?.provider ??
    (model.includes('/') ? 'OpenRouter' : undefined);
  const known = found && found.provider === providerKey ? found : undefined;
  const name = ollamaModelName(model, ollamaModel) ?? known?.name ?? model;
  const sources = {
    AI_MODEL: provider ? `AI_PROVIDER=${provider}, AI_MODEL` : 'AI_MODEL',
    AI_PROVIDER: `AI_PROVIDER=${provider}`,
    builtin: 'built-in default',
  };
  return {
    name,
    label: label(providerKey, name),
    providerKey,
    tier: known?.tier,
    source: sources[aiDefault.source] ?? sources.builtin,
  };
}

export function envDefaultText(aiDefault: AiDefaultState, ollamaModel: string): string {
  if (aiDefault === undefined) return 'checking the server…';
  const d = describeEnvDefault(aiDefault, ollamaModel);
  return d ? `${d.label} (${d.source})` : 'server unreachable, model unknown';
}

export function envPinnedOllamaModel(aiDefault: AiDefaultState): string | null {
  if (!aiDefault) return null;
  const { model, provider } = aiDefault;
  if (model.startsWith('ollama::')) return model.slice('ollama::'.length);
  return provider === 'ollama' && model !== 'ollama' ? model : null;
}

// ── What a stored choice means, in words ────────────────────────────────────────────────────────────────────────────

export interface Choice {
  name: string;
  provider?: ProviderKey;
  note: string;
  tier?: Tier;
  serverDefault: boolean;
}

export function describeChoice(
  id: string,
  settings: UserSettings,
  aiDefault: AiDefaultState
): Choice {
  if (!id) {
    const d = describeEnvDefault(aiDefault, settings.ollamaModel);
    return {
      name: d?.name ?? 'Server default',
      provider: d?.providerKey,
      note:
        aiDefault === undefined
          ? 'Checking the server…'
          : d
            ? 'Set in the server’s .env file'
            : 'Server not reachable',
      tier: d?.tier,
      serverDefault: true,
    };
  }
  if (isOllamaId(id)) {
    return {
      name: ollamaModelName(id, settings.ollamaModel) ?? 'Ollama model',
      provider: 'Ollama',
      note: 'Runs on this computer',
      tier: 'free',
      serverDefault: false,
    };
  }
  if (id.startsWith('endpoint::')) {
    const ep = findEndpoint(id, settings);
    if (!ep)
      return {
        name: 'Removed endpoint',
        provider: 'Custom',
        note: 'This endpoint was deleted',
        serverDefault: false,
      };
    return {
      name: ep.name || ep.model,
      provider: 'Custom',
      note: `${hostOf(ep.baseUrl ?? '')}${ep.name ? ` · ${ep.model}` : ''}`,
      serverDefault: false,
    };
  }
  const compat = parseCompatValue(id);
  const added = findUserModel(id, settings);
  if (compat || added) {
    const provider = compat ? PROVIDER_OF_SLUG[compat.provider] : PROVIDER_OF_SLUG[added!.provider];
    return {
      name: added?.name || added?.model || compat!.model,
      provider,
      note: 'Custom model',
      serverDefault: false,
    };
  }
  if (id === 'custom') {
    let host = '';
    try {
      host = settings.customBaseUrl ? new URL(settings.customBaseUrl).host : '';
    } catch {
      host = settings.customBaseUrl;
    }
    return {
      name: settings.customModel || 'Your endpoint',
      provider: 'Custom',
      note: host || 'No endpoint address yet',
      serverDefault: false,
    };
  }
  const m = findModel(id);
  if (!m)
    return { name: id, note: 'Not in the list any more; sent as typed', serverDefault: false };
  return { name: m.name, provider: m.provider, note: m.note, tier: m.tier, serverDefault: false };
}

export function hostOf(url: string): string {
  try {
    return new URL(url).host || url;
  } catch {
    return url;
  }
}

/** Which provider a stored choice actually calls (Server default resolves through the server's .env). */
export function providerOfChoice(id: string, settings: UserSettings, aiDefault: AiDefaultState) {
  return describeChoice(id, settings, aiDefault).provider;
}

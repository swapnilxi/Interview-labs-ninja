/**
 * fe-apis/ai/providers.ts
 *
 * Per-provider HTTP calling logic (OpenAI-compatible endpoints, Anthropic, Gemini),
 * plus providerOrder(model), which decides fallback order across providers for a
 * given model. Consumed by fe-apis/ai/client.ts -- not part of the public surface,
 * see fe-apis/ai/index.ts for what other modules should import.
 */

export const GROQ_MODELS = [
  'llama-3.3-70b-versatile',
  'llama-3.1-8b-instant',
  'gemma2-9b-it',
  'mixtral-8x7b-32768',
];

// A connection that never got going (a dropped packet, a DNS hiccup, a refused or reset connect) is worth another try; a request
// the provider answered, or one that waited a long time for its answer, is not. Twin: _urlopen_retrying() in
// backend/modules/common/ai/utils.py (same retries, same wait, same quick-failure rule).
const CONNECT_RETRIES = 2;
const CONNECT_QUICK_FAIL_MS = 20_000;

/**
 * fetch that tries again (after 1 s, then 2 s) when the connection could not be made. Node's fetch reports every such failure
 * as `TypeError: fetch failed` and hides the reason in `cause`, so the final error names the cause ("fetch failed
 * (UND_ERR_CONNECT_TIMEOUT)") instead of leaving a person to guess. `init` is a function because a timeout signal is used up
 * by the attempt it was made for. Timeouts, HTTP statuses and failures after a long wait are returned or thrown as they are.
 */
async function fetchRetrying(url: string, init: () => RequestInit): Promise<Response> {
  for (let attempt = 0; ; attempt++) {
    const started = Date.now();
    try {
      return await fetch(url, init());
    } catch (err) {
      if (!(err instanceof TypeError) || err.message !== 'fetch failed') throw err;
      const code = (err.cause as { code?: string } | undefined)?.code;
      if (attempt >= CONNECT_RETRIES || Date.now() - started > CONNECT_QUICK_FAIL_MS) {
        throw new Error(code ? `fetch failed (${code})` : 'fetch failed', { cause: err });
      }
      await new Promise((resolve) => setTimeout(resolve, 1000 * (attempt + 1)));
    }
  }
}

/**
 * Mirrors Python's _provider_order(model) in ai_client.py: puts whichever provider
 * the selected model actually belongs to first, with the rest as fallbacks -- so a
 * user who picked e.g. Claude doesn't silently get answered by Gemini just because
 * both keys happen to be configured.
 */
export function providerOrder(model: string): string[] {
  if (model.includes('/') || model.startsWith('openrouter')) {
    // OpenRouter's DeepSeek ids ("deepseek/deepseek-chat"): without an OpenRouter key, DeepSeek's own API comes
    // next, before Gemini (twin of the same rule in Python's _provider_order).
    if (model.startsWith('deepseek/'))
      return ['openrouter', 'deepseek', 'gemini', 'groq', 'openai', 'anthropic', 'custom'];
    return ['openrouter', 'gemini', 'deepseek', 'groq', 'openai', 'anthropic', 'custom'];
  }
  if (model.startsWith('gemini') || model.startsWith('gemma')) {
    return ['gemini', 'openrouter', 'deepseek', 'groq', 'openai', 'anthropic', 'custom'];
  }
  if (model.startsWith('deepseek')) {
    return ['deepseek', 'openrouter', 'gemini', 'groq', 'openai', 'anthropic', 'custom'];
  }
  if (GROQ_MODELS.includes(model)) {
    return ['groq', 'openrouter', 'gemini', 'deepseek', 'openai', 'anthropic', 'custom'];
  }
  if (model.startsWith('gpt')) {
    return ['openai', 'openrouter', 'gemini', 'groq', 'deepseek', 'anthropic', 'custom'];
  }
  if (model.startsWith('claude')) {
    return ['anthropic', 'openrouter', 'gemini', 'groq', 'deepseek', 'openai', 'custom'];
  }
  if (model === 'custom') {
    return ['custom', 'openrouter', 'gemini', 'deepseek', 'groq', 'openai', 'anthropic'];
  }
  return ['gemini', 'openrouter', 'deepseek', 'groq', 'openai', 'anthropic', 'custom'];
}

/**
 * @param timeoutMs Per-provider request timeout. Lesson generation/visualization
 * prompts ask for a large, complete HTML document and routinely take well past 5s —
 * the old hardcoded timeout here (vs. 45-60s on the Python backend, see
 * backend/modules/common/ai_client.py) caused most generations to time out and
 * silently fall back to the generic template. Short conversational calls (voice
 * chat) should pass a smaller value instead of waiting the full default.
 */
export async function callOpenAiCompatible(
  prompt: string,
  apiKey: string,
  baseUrl: string,
  model: string,
  timeoutMs: number,
  maxTokens: number,
  /** Provider-specific body fields (e.g. DeepSeek's reasoning_effort). */
  extra: Record<string, unknown> = {}
): Promise<string> {
  const post = async (tokens: number): Promise<{ text: string; finish: string | null }> => {
    const res = await fetchRetrying(`${baseUrl.replace(/\/$/, '')}/chat/completions`, () => ({
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.7,
        // Omitting this isn't "use the provider's generous default" -- live-tested
        // against DeepSeek and confirmed it silently truncates mid-document without
        // it (verified via a real generate call: 24471 chars in, cut off mid-tag,
        // no error, just missing </html>). Every OpenAI-compatible provider here
        // (OpenAI, DeepSeek, Groq, OpenRouter, custom) shares this one function, so
        // they all need an explicit budget, not just Gemini/Anthropic.
        max_tokens: tokens,
        ...extra,
      }),
      signal: AbortSignal.timeout(timeoutMs),
    }));
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const choice = (await res.json()).choices?.[0];
    const content = choice?.message?.content;
    return {
      text: typeof content === 'string' ? content : '',
      finish: choice?.finish_reason ?? null,
    };
  };

  // A reply with no text is a failure, not an answer, so callAIText moves on to the next provider and, when there is none,
  // the error says why. A reasoning model's hidden thinking counts against max_tokens: when that used the whole budget
  // (finish_reason "length") the call is retried once with room for the thinking.
  // Twin: _call_openai_compatible() in backend/modules/common/ai/providers.py (same retry, same message).
  let { text, finish } = await post(maxTokens);
  if (!text.trim() && finish === 'length') {
    try {
      ({ text, finish } = await post(maxTokens + EMPTY_RETRY_HEADROOM));
    } catch {
      // the first reply's diagnosis is the useful one
    }
  }
  if (!text.trim()) throw new Error(noTextMessage(model, finish, maxTokens));
  return text;
}

/** Extra tokens for the one retry of an OpenAI-compatible call whose whole budget went on hidden reasoning. */
const EMPTY_RETRY_HEADROOM = 8192;

/** Why an OpenAI-compatible reply had no text. Twin: _no_text_message() in backend/modules/common/ai/providers.py. */
function noTextMessage(model: string, finish: string | null, maxTokens: number): string {
  if (finish === 'length') {
    return (
      `${model} used its whole ${maxTokens}-token budget before writing an answer ` +
      "(a reasoning model's hidden thinking counts against it). Pick a non-reasoning model in Config."
    );
  }
  return `${model} returned no text (finish_reason: ${finish || 'none'}).`;
}

export async function callAnthropicText(
  prompt: string,
  apiKey: string,
  model: string,
  timeoutMs: number,
  maxTokens: number
): Promise<string> {
  const res = await fetchRetrying('https://api.anthropic.com/v1/messages', () => ({
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      messages: [{ role: 'user', content: prompt }],
    }),
    signal: AbortSignal.timeout(timeoutMs),
  }));
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  return data.content?.[0]?.text || '';
}

export async function callGeminiText(
  prompt: string,
  apiKey: string,
  model: string,
  timeoutMs: number,
  maxTokens: number
): Promise<string> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
  // thinkingBudget 0 turns off Gemini 2.5's hidden reasoning, which otherwise can spend the whole maxOutputTokens and leave
  // no text part. Not every model/alias accepts the field (some 400 on it), so a 400 retries once without it.
  // Twin: _generation_config() and _post_generate_content() in backend/modules/common/ai/providers.py.
  let res: Response | null = null;
  for (const thinking of [true, false]) {
    res = await fetchRetrying(url, () => ({
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.7,
          // A full interactive lesson document (styling + objectives + concepts + code
          // examples + quiz) empirically needs well past 8192 output tokens to finish --
          // confirmed against the equivalent Python path, where 8192 reliably cut
          // generations off mid-document (verified truncated after cleanup, not just an
          // unclosed markdown fence) and 16000 reliably completed them.
          maxOutputTokens: maxTokens,
          ...(thinking ? { thinkingConfig: { thinkingBudget: 0 } } : {}),
        },
      }),
      signal: AbortSignal.timeout(timeoutMs),
    }));
    if (thinking && res.status === 400) continue;
    break;
  }
  if (!res || !res.ok) throw new Error(`HTTP ${res?.status}`);
  const data = await res.json();
  // The answer can come in several text parts (and a thinking model's thought parts are not the answer): join them, or a
  // JSON answer split across parts reads as cut off. Twin: _gemini_text() in backend/modules/common/ai/providers.py.
  const parts: { text?: unknown; thought?: unknown }[] = data.candidates?.[0]?.content?.parts ?? [];
  const text = parts
    .filter((p) => !p?.thought && typeof p?.text === 'string')
    .map((p) => p.text as string)
    .join('');
  if (!text) throw new Error('Empty response');
  return text;
}

// ── Embeddings (for RAG-style retrieval, e.g. fe-apis/lms's context indexing) ──
// Mirrors backend/modules/common/ai/providers.py's _embed_openai/_embed_gemini/
// _embed_ollama. A separate, smaller provider order than text generation:
// Anthropic has no public embeddings API, and the other OpenAI-compatible
// providers wired up above (DeepSeek/Groq/OpenRouter/custom) aren't included here
// since they'd each need their own embedding-specific model name, which
// AISettingsPayload doesn't carry.

export async function embedOpenAi(
  texts: string[],
  apiKey: string,
  model: string = 'text-embedding-3-small'
): Promise<number[][]> {
  const res = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model, input: texts }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  // Preserve input order via each item's own "index" -- providers aren't
  // guaranteed to return them in request order.
  const ordered = [...data.data].sort((a: any, b: any) => a.index - b.index);
  return ordered.map((d: any) => d.embedding);
}

export async function embedGemini(
  texts: string[],
  apiKey: string,
  model: string = 'gemini-embedding-001'
): Promise<number[][]> {
  const embeddings: number[][] = [];
  for (const text of texts) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:embedContent?key=${apiKey}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: `models/${model}`, content: { parts: [{ text }] } }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    embeddings.push(data.embedding.values);
  }
  return embeddings;
}

export async function embedOllama(
  texts: string[],
  baseUrl: string,
  model: string = 'nomic-embed-text'
): Promise<number[][]> {
  const embeddings: number[][] = [];
  for (const text of texts) {
    const res = await fetch(`${baseUrl.replace(/\/$/, '')}/api/embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, prompt: text }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    embeddings.push(data.embedding);
  }
  return embeddings;
}

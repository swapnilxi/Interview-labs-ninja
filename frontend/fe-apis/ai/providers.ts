/**
 * fe-apis/ai/providers.ts
 *
 * Per-provider HTTP calling logic (OpenAI-compatible endpoints, Anthropic, Gemini),
 * plus providerOrder(model), which decides fallback order across providers for a
 * given model. Consumed by fe-apis/ai/client.ts -- not part of the public surface,
 * see fe-apis/ai/index.ts for what other modules should import.
 */

export const GROQ_MODELS = ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant', 'gemma2-9b-it', 'mixtral-8x7b-32768'];

/**
 * Mirrors Python's _provider_order(model) in ai_client.py: puts whichever provider
 * the selected model actually belongs to first, with the rest as fallbacks -- so a
 * user who picked e.g. Claude doesn't silently get answered by Gemini just because
 * both keys happen to be configured.
 */
export function providerOrder(model: string): string[] {
  if (model.includes('/') || model.startsWith('openrouter')) {
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
  maxTokens: number
): Promise<string> {
  const res = await fetch(`${baseUrl.replace(/\/$/, '')}/chat/completions`, {
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
      max_tokens: maxTokens,
    }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  return data.choices?.[0]?.message?.content || '';
}

export async function callAnthropicText(
  prompt: string,
  apiKey: string,
  model: string,
  timeoutMs: number,
  maxTokens: number
): Promise<string> {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
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
  });
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
  const res = await fetch(url, {
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
      },
    }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error('Empty response');
  return text;
}

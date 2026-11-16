import { NextResponse } from 'next/server';
import { callAnthropicText, callGeminiText, callOpenAiCompatible } from 'fe-apis/ai/providers';
import { userIdOrAuthError } from 'fe-apis/todo/_shared';

/**
 * POST /api/config/test-key (rewritten from /config/test-key)
 *
 * Twin of `test_provider_key` in backend/modules/common/ai/client.py behind FastAPI's POST /config/test-key: one
 * minimal real call to the provider to confirm the key works. The Config page's "Test connection" button calls it.
 * The key is used for this one call and never stored. Same probe models and the same { ok, message } reply.
 */

export const dynamic = 'force-dynamic';

const PROBE = 'Reply with exactly one word: OK';
const TIMEOUT_MS = 45_000;

/** The provider's own error message, not the bare status (a 402 "Insufficient Balance" is billing, not a bad key). */
async function probeCompatible(baseUrl: string, apiKey: string, model: string): Promise<void> {
  const res = await fetch(`${baseUrl.replace(/\/$/, '')}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model, messages: [{ role: 'user', content: PROBE }], temperature: 0.7, max_tokens: 8 }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (res.ok) return;
  let detail = '';
  try {
    const data = await res.json();
    detail = data?.error?.message || data?.message || '';
  } catch {
    /* no JSON body */
  }
  throw new Error(detail ? `HTTP ${res.status}: ${detail}` : `HTTP ${res.status}`);
}

export async function POST(request: Request) {
  const auth = userIdOrAuthError(request);
  if (auth instanceof Response) return auth;
  const body = (await request.json().catch(() => null)) as { provider?: string; api_key?: string; base_url?: string } | null;
  const provider = body?.provider ?? '';
  const apiKey = (body?.api_key ?? '').trim();
  if (!apiKey) return NextResponse.json({ ok: false, message: 'No key entered.' });
  try {
    if (provider === 'gemini') await callGeminiText(PROBE, apiKey, 'gemini-flash-latest', TIMEOUT_MS, 8);
    else if (provider === 'openai') await probeCompatible('https://api.openai.com/v1', apiKey, 'gpt-4o-mini');
    else if (provider === 'anthropic') await callAnthropicText(PROBE, apiKey, 'claude-3-5-haiku-latest', TIMEOUT_MS, 8);
    else if (provider === 'deepseek') await probeCompatible('https://api.deepseek.com', apiKey, 'deepseek-flash');
    else if (provider === 'groq') await probeCompatible('https://api.groq.com/openai/v1', apiKey, 'llama-3.3-70b-versatile');
    else if (provider === 'openrouter')
      await probeCompatible(body?.base_url || 'https://openrouter.ai/api/v1', apiKey, 'meta-llama/llama-3.3-70b-instruct');
    else return NextResponse.json({ ok: false, message: `Unknown provider: ${provider}` });
  } catch (err) {
    return NextResponse.json({ ok: false, message: err instanceof Error ? err.message : String(err) });
  }
  return NextResponse.json({ ok: true, message: 'Key works — got a response.' });
}

/**
 * fe-apis/swipeLearn/index.ts
 *
 * Twin (nextjs-api mode) of backend/modules/swipe_learn/router.py:
 *
 *   POST /swipe-learn/generate   (login, like every AI endpoint)
 *
 * Runs the SwipeLearn card prompt with the AI model chosen in Config (any provider, or this server's .env default)
 * and returns the model's raw answer; the client parses, cleans and de-duplicates the cards. The prompt itself is
 * src/modules/swipe-learn/services/cardPrompt.ts, shared with the browser's direct Gemini path; its Python twin is
 * backend/modules/swipe_learn/prompt.py. Statuses and error texts match the Python router.
 */

import { NextResponse } from 'next/server';
import { callAIText, resolveModel } from '../ai';
import { HttpError, aiSettings, requireTodoUserId, type Row } from '../todo/_shared';
import { CardRequestError, buildCardPrompt, normalizeCardRequest } from '@/modules/swipe-learn/services/cardPrompt';

// Ten cards with their depth sections run to ~5k tokens; leave room so the JSON is never cut off mid-card.
const MAX_TOKENS = 8192;
// A slow model writing ten cards can take a while; the route's maxDuration (300s) leaves room for this.
const AI_TIMEOUT_MS = 240_000;
const NO_KEY_MARKER = 'No API key configured';

function json(data: unknown, status = 200): NextResponse {
  return NextResponse.json(data, { status });
}

export async function handleSwipeLearnGenerate(req: Request): Promise<Response> {
  try {
    requireTodoUserId(req);
    const text = await req.text();
    let body: unknown;
    try {
      body = text.trim() ? JSON.parse(text) : {};
    } catch {
      throw new HttpError(422, 'Invalid JSON body');
    }
    if (typeof body !== 'object' || body === null || Array.isArray(body)) {
      throw new HttpError(422, 'Input should be a valid dictionary');
    }

    let cardReq;
    try {
      cardReq = normalizeCardRequest(body);
    } catch (err) {
      if (err instanceof CardRequestError) throw new HttpError(422, err.message);
      throw err;
    }

    const settings = aiSettings(body as Row);
    let answer: string;
    try {
      answer = await callAIText(buildCardPrompt(cardReq), settings, AI_TIMEOUT_MS, MAX_TOKENS);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes(NO_KEY_MARKER)) throw new HttpError(400, message);
      throw new HttpError(502, `The AI call failed: ${message}`);
    }

    if (!(answer || '').trim()) throw new HttpError(502, 'The AI returned an empty answer. Try again.');
    // `model` is the id the request resolved to (an empty choice means the server's .env default).
    return json({ text: answer, model: resolveModel(settings.model) });
  } catch (err) {
    if (err instanceof HttpError) return json({ detail: err.detail }, err.status);
    console.error('[swipe-learn fe-api] POST /swipe-learn/generate failed:', err);
    return json({ detail: 'Internal Server Error' }, 500);
  }
}

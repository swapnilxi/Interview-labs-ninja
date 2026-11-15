/**
 * fe-apis/research/index.ts
 *
 * Twin (nextjs-api mode) of backend/modules/research/router.py:
 *   POST /research/search   {query, fetch?}  ->  {query, results: [{title, url, snippet, text}]}   (login required)
 */

import { NextResponse } from 'next/server';
import { HttpError, requireTodoUserId } from '../todo/_shared';
import { MAX_FETCH, MAX_QUERY_CHARS, research } from './web';

function json(data: unknown, status = 200): NextResponse {
  return NextResponse.json(data, { status });
}

export async function handleResearch(req: Request, segments: string[]): Promise<Response> {
  try {
    requireTodoUserId(req);
    if (!(req.method === 'POST' && segments.length === 1 && segments[0] === 'search')) {
      throw new HttpError(segments.length === 1 && segments[0] === 'search' ? 405 : 404, segments.length === 1 && segments[0] === 'search' ? 'Method Not Allowed' : 'Not Found');
    }
    const text = await req.text();
    let body: Record<string, unknown> = {};
    try {
      body = text.trim() ? JSON.parse(text) : {};
    } catch {
      throw new HttpError(422, 'Invalid JSON body');
    }
    if (typeof body.query !== 'string' || !body.query.trim()) throw new HttpError(422, 'query: a non-empty string is required.');
    const fetchCount = typeof body.fetch === 'number' && Number.isInteger(body.fetch) ? body.fetch : 3;
    return json(await research(body.query.slice(0, MAX_QUERY_CHARS), Math.min(Math.max(fetchCount, 0), MAX_FETCH)));
  } catch (err) {
    if (err instanceof HttpError) return json({ detail: err.detail }, err.status);
    console.error('[research fe-api] failed:', err);
    return json({ detail: 'Internal Server Error' }, 500);
  }
}

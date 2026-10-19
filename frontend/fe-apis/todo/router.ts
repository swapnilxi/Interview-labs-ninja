/**
 * fe-apis/todo/router.ts
 *
 * A tiny FastAPI-style router so the ~70 To-Do endpoints can live behind two
 * catch-all App Router routes (src/app/api/todo/[...path], src/app/api/pareto/[...path])
 * instead of one route.ts per endpoint. Each todo module exports a `routes` table whose
 * paths match the Python decorators (minus the /todo or /pareto prefix).
 */

import { NextResponse } from 'next/server';
import { HttpError, requireTodoUserId, type Row } from './_shared';

export type HttpMethod = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';

export interface TodoCtx {
  req: Request;
  userId: number;
  /** Raw path params, e.g. { task_id: '12' } for '/tasks/:task_id'. */
  params: Record<string, string>;
  query: URLSearchParams;
  /** Parsed JSON body; {} when the body is empty. 422 on malformed JSON (like FastAPI). */
  json<T = Row>(): Promise<T>;
  formData(): Promise<FormData>;
  /** Integer path param; 422 when it isn't one (FastAPI's int path validation). */
  intParam(name: string): number;
}

export type TodoHandler = (ctx: TodoCtx) => unknown | Promise<unknown>;

export interface TodoRoute {
  method: HttpMethod;
  /** Python decorator path without the router prefix, e.g. '/tasks/:task_id/notes'. */
  path: string;
  handler: TodoHandler;
  /** FastAPI `status_code=` (default 200). */
  status?: number;
}

interface CompiledRoute extends TodoRoute {
  parts: string[];
  paramCount: number;
}

export function compileRoutes(routes: TodoRoute[]): CompiledRoute[] {
  return routes
    .map((r) => {
      const parts = r.path.split('/').filter(Boolean);
      return { ...r, parts, paramCount: parts.filter((p) => p.startsWith(':')).length };
    })
    // Static segments win over params ('/tasks/tree' before '/tasks/:task_id').
    .sort((a, b) => a.paramCount - b.paramCount);
}

/**
 * Next hands a catch-all route its segments already URL-decoded, so this is a second decode: it throws
 * (an uncaught URIError, a bare 500) for a value that decodes to a stray '%', such as '/profiles/%25zz'
 * arriving here as '%zz'. A segment that can't be decoded is used as it is, so the handler's own
 * validation answers it (`intParam` -> 422, a lookup -> 404), like FastAPI does.
 */
function decodeSegment(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

function match(route: CompiledRoute, segments: string[]): Record<string, string> | null {
  if (route.parts.length !== segments.length) return null;
  const params: Record<string, string> = {};
  for (let i = 0; i < segments.length; i++) {
    const part = route.parts[i];
    if (part.startsWith(':')) params[part.slice(1)] = decodeSegment(segments[i]);
    else if (part !== segments[i]) return null;
  }
  return params;
}

function errorResponse(status: number, detail: string): NextResponse {
  return NextResponse.json({ detail }, { status });
}

export async function dispatch(routes: CompiledRoute[], req: Request, segments: string[]): Promise<Response> {
  const method = req.method.toUpperCase();
  let pathMatched = false;
  for (const route of routes) {
    const params = match(route, segments);
    if (!params) continue;
    pathMatched = true;
    if (route.method !== method) continue;

    try {
      // Every todo/pareto router depends on get_current_user_id at the router level.
      const userId = requireTodoUserId(req);
      let bodyCache: Promise<any> | null = null;
      const ctx: TodoCtx = {
        req,
        userId,
        params,
        query: new URL(req.url).searchParams,
        json: () => {
          bodyCache ??= req.text().then((text) => {
            if (!text.trim()) return {};
            try {
              return JSON.parse(text);
            } catch {
              throw new HttpError(422, 'Invalid JSON body');
            }
          });
          return bodyCache;
        },
        formData: () => req.formData(),
        intParam: (name) => {
          const raw = params[name];
          if (!/^-?\d+$/.test(raw ?? '')) throw new HttpError(422, `Invalid integer for '${name}'`);
          return parseInt(raw, 10);
        },
      };
      const result = await route.handler(ctx);
      if (result instanceof Response) return result;
      return NextResponse.json(result ?? null, { status: route.status ?? 200 });
    } catch (err) {
      if (err instanceof HttpError) return errorResponse(err.status, err.detail);
      // Like FastAPI's unhandled-exception response: details go to the server log, not the client.
      console.error(`[todo fe-api] ${method} /${segments.join('/')} failed:`, err);
      return errorResponse(500, 'Internal Server Error');
    }
  }
  return pathMatched ? errorResponse(405, 'Method Not Allowed') : errorResponse(404, 'Not Found');
}

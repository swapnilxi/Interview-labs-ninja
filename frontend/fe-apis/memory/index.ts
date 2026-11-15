/**
 * fe-apis/memory/index.ts
 *
 * Twin (nextjs-api mode) of backend/modules/memory/router.py:
 *   GET /memory?module=   GET /memory/lines?module=&topic=   POST /memory/events   DELETE /memory/{id}   DELETE /memory?module=
 * All login-required; every row belongs to the caller. Writes push the DB snapshot to Neon like the other modules.
 */

import { withNeonSync } from '@/lib/server/neonSync';
import { compileRoutes, dispatch, type TodoRoute } from '../todo/router';
import { HttpError } from '../todo/_shared';
import { MemoryInputError, clearMemory, deleteFact, listFacts, memoryLines, record } from './db';

const optional = (q: URLSearchParams, key: string) => q.get(key) || null;

const ROUTES: TodoRoute[] = [
  { method: 'GET', path: '/', handler: (ctx) => ({ facts: listFacts(ctx.userId, optional(ctx.query, 'module')) }) },
  {
    method: 'GET',
    path: '/lines',
    handler: (ctx) => {
      const module = ctx.query.get('module');
      if (!module) throw new HttpError(422, "module: Field required");
      return { lines: memoryLines(ctx.userId, module, ctx.query.get('topic') ?? '') };
    },
  },
  {
    method: 'POST',
    path: '/events',
    handler: async (ctx) => {
      const body = await ctx.json();
      try {
        return record(ctx.userId, body.module, body.topic ?? '', body.kind, body.fact);
      } catch (err) {
        if (err instanceof MemoryInputError) throw new HttpError(422, err.message);
        throw err;
      }
    },
  },
  {
    method: 'DELETE',
    path: '/:fact_id',
    handler: (ctx) => {
      if (!deleteFact(ctx.userId, ctx.intParam('fact_id'))) throw new HttpError(404, 'Memory not found');
      return { status: 'success' };
    },
  },
  { method: 'DELETE', path: '/', handler: (ctx) => ({ deleted: clearMemory(ctx.userId, optional(ctx.query, 'module')) }) },
];
const COMPILED = compileRoutes(ROUTES);

const write = withNeonSync((req: Request, segments: string[]) => dispatch(COMPILED, req, segments));

/** Entry point for src/app/api/memory/[[...path]]/route.ts (`segments` exclude the 'memory' prefix). */
export function handleMemory(req: Request, segments: string[]): Promise<Response> {
  return req.method === 'GET' ? dispatch(COMPILED, req, segments) : write(req, segments);
}

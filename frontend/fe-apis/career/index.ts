/**
 * fe-apis/career/index.ts
 *
 * Next.js backend (nextjs-api mode) for Career Studio — a TypeScript twin of
 * backend/modules/career_studio. Serves /career/* (next.config.mjs rewrites the
 * API path prefixes to /api/career/*). A change to a Python router, prompt or
 * table must be mirrored here, or the two backend modes silently diverge.
 *
 * Career Studio owns its own SQLite file (career_studio.sqlite3), so both Neon
 * wrappers are bound to that DB name — using the default lab_ninja here would
 * sync the wrong file and lose data across Vercel instances.
 */

import { withNeonRead, withNeonSync } from '@/lib/server/neonSync';
import { compileRoutes, dispatch } from '../todo/router';
import { handlePublic, routes } from './handlers';

const ROUTES = compileRoutes(routes);

async function dispatchCareer(req: Request, segments: string[]): Promise<Response> {
  return dispatch(ROUTES, req, segments);
}

const writeCareer = withNeonSync(dispatchCareer, 'career_studio');
const readCareer = withNeonRead(dispatchCareer, 'career_studio');

export function handleCareer(req: Request, segments: string[]): Promise<Response> {
  // The Python public_router has no auth guard; keep it outside the dispatcher
  // (which requires a Bearer token for every route).
  if (segments[0] === 'public') return handlePublic(req, segments);
  return req.method === 'GET' ? readCareer(req, segments) : writeCareer(req, segments);
}

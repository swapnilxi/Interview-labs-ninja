/**
 * fe-apis/guidedPractice/index.ts
 *
 * Next.js backend (nextjs-api mode) for Guided Practice, the dedicated page behind a DSA topic's "Guided Practice"
 * card -- a TypeScript twin of backend/modules/guided_practice. Serves /guided-practice/* (next.config.mjs rewrites it
 * to /api/guided-practice/*). A change to the Python router, prompts or table must be mirrored here, or the two
 * backend modes silently diverge (see CLAUDE.md, "Dual deployment modes").
 *
 * Reuses the To-Do suite's plumbing (router, auth, DB connection, AI helpers) from ../todo.
 */

import { withNeonRead, withNeonSync } from '@/lib/server/neonSync';
import { compileRoutes, dispatch } from '../todo/router';
import { routes } from './handlers';

const ROUTES = compileRoutes(routes);

async function dispatchGuided(req: Request, segments: string[]): Promise<Response> {
  return dispatch(ROUTES, req, segments);
}

// Saving or resetting progress pushes lab_ninja.sqlite3 to Neon afterwards (Vercel's /tmp isn't durable). The AI
// endpoints are POSTs that write nothing, so they skip the push.
const writeGuided = withNeonSync(dispatchGuided);
const readGuided = withNeonRead(dispatchGuided);

export function handleGuidedPractice(req: Request, segments: string[]): Promise<Response> {
  const savesProgress = req.method === 'PUT' || req.method === 'DELETE';
  return savesProgress ? writeGuided(req, segments) : readGuided(req, segments);
}

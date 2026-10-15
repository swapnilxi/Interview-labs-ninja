/**
 * fe-apis/labSections/index.ts
 *
 * Next.js backend (nextjs-api mode) for the labs' AI-written sections and quizzes -- a TypeScript
 * twin of backend/modules/lab_sections. Serves /lab-sections/* (next.config.mjs rewrites it to
 * /api/lab-sections/*). A change to the Python router, prompts or tables must be mirrored here, or
 * the two backend modes silently diverge (see CLAUDE.md, "Dual deployment modes").
 *
 * Reuses the To-Do suite's plumbing (router, auth, DB connection, AI helpers) from ../todo.
 */

import { withNeonSync } from '@/lib/server/neonSync';
import { compileRoutes, dispatch } from '../todo/router';
import { routes } from './handlers';

const ROUTES = compileRoutes(routes);

async function dispatchLabSections(req: Request, segments: string[]): Promise<Response> {
  return dispatch(ROUTES, req, segments);
}

// Writes push lab_ninja.sqlite3 to Neon afterwards (Vercel's /tmp isn't durable).
const writeLabSections = withNeonSync(dispatchLabSections);

export function handleLabSections(req: Request, segments: string[]): Promise<Response> {
  return req.method === 'GET'
    ? dispatchLabSections(req, segments)
    : writeLabSections(req, segments);
}

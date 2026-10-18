/**
 * fe-apis/labProjects/index.ts
 *
 * Next.js backend (nextjs-api mode) for Labs Projects and their saved sections -- a TypeScript twin of
 * backend/modules/lab_projects. Serves /lab-projects/* (next.config.mjs rewrites it to
 * /api/lab-projects/*). A change to the Python router, prompts or tables must be mirrored here, or the
 * two backend modes silently diverge (see CLAUDE.md, "Dual deployment modes").
 *
 * Reuses the To-Do suite's plumbing (router, auth, DB connection) from ../todo. `knowledge.ts` is what
 * the labs' generation twin (../labSections) calls to put the selected project into a prompt.
 */

import { withNeonSync } from '@/lib/server/neonSync';
import { compileRoutes, dispatch } from '../todo/router';
import { routes } from './handlers';

const ROUTES = compileRoutes(routes);

async function dispatchLabProjects(req: Request, segments: string[]): Promise<Response> {
  return dispatch(ROUTES, req, segments);
}

// Writes push lab_ninja.sqlite3 to Neon afterwards (Vercel's /tmp isn't durable).
const writeLabProjects = withNeonSync(dispatchLabProjects);

export function handleLabProjects(req: Request, segments: string[]): Promise<Response> {
  return req.method === 'GET'
    ? dispatchLabProjects(req, segments)
    : writeLabProjects(req, segments);
}

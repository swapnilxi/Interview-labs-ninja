/**
 * fe-apis/dsaLab/index.ts
 *
 * The DSA lab's Next.js backend (nextjs-api mode). Only /dsa/week-plan has a twin so far -- the
 * rest of backend/modules/dsa_lab (topics, sections) is FastAPI-only, and the page falls back to
 * its built-in topic list without it. next.config.mjs rewrites /dsa/week-plan to /api/dsa/week-plan.
 * A change to the Python week-plan code must be mirrored here (see CLAUDE.md, "Dual deployment modes").
 */

import { withNeonSync } from '@/lib/server/neonSync';
import { compileRoutes, dispatch } from '../todo/router';
import { routes } from './weekPlan';

const ROUTES = compileRoutes(routes);

async function dispatchDsaLab(req: Request, segments: string[]): Promise<Response> {
  return dispatch(ROUTES, req, segments);
}

// Writes push lab_ninja.sqlite3 to Neon afterwards (Vercel's /tmp isn't durable).
const writeDsaLab = withNeonSync(dispatchDsaLab);

export function handleDsaLab(req: Request, segments: string[]): Promise<Response> {
  return req.method === 'GET' ? dispatchDsaLab(req, segments) : writeDsaLab(req, segments);
}

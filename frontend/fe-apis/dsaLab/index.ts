/**
 * fe-apis/dsaLab/index.ts
 *
 * The DSA lab's Next.js backend (nextjs-api mode). Only the week plan has a twin so far -- /dsa/week-plan
 * (the active plan), /dsa/week-plan/profiles/* (saved plan profiles) and /dsa/week-plan/auto (the AI
 * organizer), all in ./weekPlan + ./autoPlan. The rest of backend/modules/dsa_lab (topics, sections) is
 * FastAPI-only, and the page falls back to its built-in topic list without it. next.config.mjs rewrites
 * /dsa/week-plan/:path* to /api/dsa/week-plan/:path* (served by src/app/api/dsa/[...path]/route.ts).
 * A change to the Python week-plan code must be mirrored here (see CLAUDE.md, "Dual deployment modes").
 * A malformed path id (`/profiles/%25zz`) is answered by the shared router (fe-apis/todo/router.ts) with the
 * handler's own 422, like FastAPI, not an uncaught URIError.
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
  // The AI organizer changes nothing (apart from the idempotent legacy migration, which every route
  // repeats): skip the Neon upload, which would eat into its 60 s and gains nothing.
  const readOnly =
    req.method === 'GET' || (req.method === 'POST' && segments.join('/') === 'week-plan/auto');
  return readOnly ? dispatchDsaLab(req, segments) : writeDsaLab(req, segments);
}

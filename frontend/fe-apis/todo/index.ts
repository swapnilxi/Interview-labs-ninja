/**
 * fe-apis/todo/index.ts
 *
 * The To-Do suite's Next.js backend (nextjs-api mode) — a TypeScript reimplementation of
 * backend/modules/ai_todo. Serves /todo/* and /pareto/* (next.config.mjs rewrites them to
 * /api/todo/* and /api/pareto/*). A change to ai_todo's Python routers/db must be mirrored
 * here, or the two backend modes silently diverge (see CLAUDE.md, "Dual deployment modes").
 */

import { withNeonRead, withNeonSync } from '@/lib/server/neonSync';
import { compileRoutes, dispatch } from './router';
import { routes as tasksCoreRoutes } from './tasks/handlersCore';
import { routes as tasksPlanningRoutes } from './tasks/handlersPlanning';
import { routes as quickRoutes } from './quick/handlers';
import { routes as projectRoutes } from './projects/handlers';
import { routes as projectPlanRoutes } from './projects/planHandlers';
import { routes as goalRoutes } from './goals/handlers';
import { routes as scheduleRoutes } from './schedules/handlers';
import { routes as routineRoutes } from './routines/handlers';
import { routes as agentRoutes } from './agent/handlers';
import { routes as importRoutes } from './importData/handlers';
import { routes as paretoRoutes } from './pareto/handlers';

const TODO_ROUTES = compileRoutes([
  ...tasksCoreRoutes,
  ...tasksPlanningRoutes,
  ...quickRoutes,
  ...projectRoutes,
  ...projectPlanRoutes,
  ...goalRoutes,
  ...scheduleRoutes,
  ...routineRoutes,
  ...agentRoutes,
  ...importRoutes,
]);

const PARETO_ROUTES = compileRoutes(paretoRoutes);

async function dispatchTodo(req: Request, segments: string[]): Promise<Response> {
  return dispatch(TODO_ROUTES, req, segments);
}

async function dispatchPareto(req: Request, segments: string[]): Promise<Response> {
  return dispatch(PARETO_ROUTES, req, segments);
}

// Writes push lab_ninja.sqlite3 to Neon afterwards (Vercel's /tmp isn't durable).
const writeTodo = withNeonSync(dispatchTodo);
const writePareto = withNeonSync(dispatchPareto);
// Reads first pull Neon's copy if another Vercel instance wrote since (phone vs desktop).
const readTodo = withNeonRead(dispatchTodo);
const readPareto = withNeonRead(dispatchPareto);

/** POSTs that only read (the Assistant chat): no Neon push afterwards. */
const READ_ONLY_POSTS = new Set(['agent/chat']);

export function handleTodo(req: Request, segments: string[]): Promise<Response> {
  const readOnly = req.method === 'GET' || READ_ONLY_POSTS.has(segments.join('/'));
  return readOnly ? readTodo(req, segments) : writeTodo(req, segments);
}

export function handlePareto(req: Request, segments: string[]): Promise<Response> {
  return req.method === 'GET' ? readPareto(req, segments) : writePareto(req, segments);
}

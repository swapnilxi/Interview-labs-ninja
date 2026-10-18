import { handleLabProjects } from 'fe-apis/labProjects';

// Optional catch-all: the bare /api/lab-projects (the project list) has no path segments.
type Ctx = { params: Promise<{ path?: string[] }> };

async function handle(req: Request, { params }: Ctx) {
  const { path = [] } = await params;
  return handleLabProjects(req, path);
}

// Every verb the twin serves: a missing one is a 405 (it happened once with PUT in lab-sections).
export const GET = handle;
export const POST = handle;
export const PUT = handle;
export const PATCH = handle;
export const DELETE = handle;

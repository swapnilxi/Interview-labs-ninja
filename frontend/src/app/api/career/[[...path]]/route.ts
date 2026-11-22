import { handleCareer } from 'fe-apis/career';

// Optional catch-all: the bare /api/career has no path segments.
type Ctx = { params: Promise<{ path?: string[] }> };

async function handle(req: Request, { params }: Ctx) {
  const { path = [] } = await params;
  return handleCareer(req, path);
}

// Every verb the twin serves: a missing one is a 405.
export const GET = handle;
export const POST = handle;
export const PUT = handle;
export const PATCH = handle;
export const DELETE = handle;

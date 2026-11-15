import { handleResearch } from 'fe-apis/research';

// nextjs-api twin of /research/* (backend/modules/research). See fe-apis/research.
// A search plus up to 4 page fetches (8s each, in parallel).
export const maxDuration = 60;

type Ctx = { params: Promise<{ path?: string[] }> };

async function handle(req: Request, { params }: Ctx) {
  const { path = [] } = await params;
  return handleResearch(req, path);
}

export const GET = handle;
export const POST = handle;

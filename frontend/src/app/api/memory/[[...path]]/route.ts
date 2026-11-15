import { handleMemory } from 'fe-apis/memory';

// nextjs-api twin of /memory/* (backend/modules/memory). See fe-apis/memory.
type Ctx = { params: Promise<{ path?: string[] }> };

async function handle(req: Request, { params }: Ctx) {
  const { path = [] } = await params;
  return handleMemory(req, path);
}

export const GET = handle;
export const POST = handle;
export const DELETE = handle;

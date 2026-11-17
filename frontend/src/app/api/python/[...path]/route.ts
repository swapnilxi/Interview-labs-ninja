import { handleLabTopics } from 'fe-apis/labs';

// nextjs-api twin of backend/modules/python_lab/router.py (/python/topics, /python/sections). See fe-apis/labs.
type Ctx = { params: Promise<{ path: string[] }> };

async function handle(req: Request, { params }: Ctx) {
  const { path } = await params;
  return handleLabTopics('python', req, path);
}

export const GET = handle;
export const POST = handle;
export const DELETE = handle;

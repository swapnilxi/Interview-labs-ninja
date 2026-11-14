import { handleLabTopics } from 'fe-apis/labs';

// nextjs-api twin of backend/modules/cv_lab/router.py (/cv/topics, /cv/sections). See fe-apis/labs.
type Ctx = { params: Promise<{ path: string[] }> };

async function handle(req: Request, { params }: Ctx) {
  const { path } = await params;
  return handleLabTopics('cv', req, path);
}

export const GET = handle;
export const POST = handle;

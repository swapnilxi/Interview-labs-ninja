import { handleLabTopics } from 'fe-apis/labs';

// nextjs-api twin of backend/modules/communication_lab/router.py (/communication/topics, /communication/sections). See fe-apis/labs.
type Ctx = { params: Promise<{ path: string[] }> };

async function handle(req: Request, { params }: Ctx) {
  const { path } = await params;
  return handleLabTopics('communication', req, path);
}

export const GET = handle;
export const POST = handle;

import { handleLabTopics } from 'fe-apis/labs';

// nextjs-api twin of backend/modules/finance_lab/router.py (/finance/topics, /finance/sections). See fe-apis/labs.
type Ctx = { params: Promise<{ path: string[] }> };

async function handle(req: Request, { params }: Ctx) {
  const { path } = await params;
  return handleLabTopics('finance', req, path);
}

export const GET = handle;
export const POST = handle;
export const DELETE = handle;

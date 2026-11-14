import { handleLabTopics } from 'fe-apis/labs';

// nextjs-api twin of backend/modules/system_design_lab/router.py (/system-design/topics, /system-design/sections). See fe-apis/labs.
type Ctx = { params: Promise<{ path: string[] }> };

async function handle(req: Request, { params }: Ctx) {
  const { path } = await params;
  return handleLabTopics('system-design', req, path);
}

export const GET = handle;
export const POST = handle;

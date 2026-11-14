import { handleAccessRequests } from 'fe-apis/account';

// nextjs-api twin of /access-requests (backend/modules/auth/access_requests_router.py). See fe-apis/account.
type Ctx = { params: Promise<{ path?: string[] }> };

async function handle(req: Request, { params }: Ctx) {
  const { path } = await params;
  return handleAccessRequests(req, path ?? []);
}

export const GET = handle;
export const POST = handle;

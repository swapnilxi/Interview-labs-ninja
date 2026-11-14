import { handleDailySession } from 'fe-apis/dailySession';

// nextjs-api twin of the Daily Session data routes under /session-progress (backend/modules/daily_session). See fe-apis/dailySession.
type Ctx = { params: Promise<{ path?: string[] }> };

async function handle(req: Request, { params }: Ctx) {
  const { path } = await params;
  return handleDailySession(req, ['session-progress', ...(path ?? [])]);
}

export const GET = handle;
export const POST = handle;
export const PATCH = handle;

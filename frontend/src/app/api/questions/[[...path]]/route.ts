import { handleDailySession } from 'fe-apis/dailySession';

// nextjs-api twin of the Daily Session data routes under /questions (backend/modules/daily_session). See fe-apis/dailySession.
type Ctx = { params: Promise<{ path?: string[] }> };

async function handle(req: Request, { params }: Ctx) {
  const { path } = await params;
  return handleDailySession(req, ['questions', ...(path ?? [])]);
}

export const GET = handle;
export const POST = handle;
export const PATCH = handle;
// PUT /questions/{id}/workspace and DELETE /questions/{id}/quiz (Question Review).
export const PUT = handle;
export const DELETE = handle;

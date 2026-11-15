import { handleDailySession } from 'fe-apis/dailySession';

// nextjs-api twin of the Daily Session data routes under /sessions (backend/modules/daily_session). See fe-apis/dailySession.
// POST /sessions/generate-session-questions makes several AI rounds (up to a 60s budget, each call up to 55s), so it
// gets the full 5 minutes; the data routes finish in milliseconds either way.
export const maxDuration = 300;

type Ctx = { params: Promise<{ path?: string[] }> };

async function handle(req: Request, { params }: Ctx) {
  const { path } = await params;
  return handleDailySession(req, ['sessions', ...(path ?? [])]);
}

export const GET = handle;
export const POST = handle;
export const PATCH = handle;

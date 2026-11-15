import { handleDailySession } from 'fe-apis/dailySession';

// nextjs-api twin of the labs' Generate Practice routes, POST /lab/generate-questions and /lab/generate-from-youtube
// (backend/modules/daily_session/daily_session.py; fe-apis/dailySession/labGenerate.ts). One AI call of up to 55s,
// after an optional 15s YouTube Data API lookup on the video route, so the 60s default is too short.
export const maxDuration = 90;

type Ctx = { params: Promise<{ path: string[] }> };

async function handle(req: Request, { params }: Ctx) {
  const { path } = await params;
  return handleDailySession(req, ['lab', ...path]);
}

export const POST = handle;

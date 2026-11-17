import { handleGuidedPractice } from 'fe-apis/guidedPractice';

// The AI endpoints (path outline, lessons, tutor turns, STAR answers) can wait minutes for a slow model
// (fe-apis/guidedPractice/handlers.ts allows 240s), like /swipe-learn/generate.
export const maxDuration = 300;

// Optional catch-all: every endpoint has at least one segment, but the router answers a bare /api/guided-practice with 404.
type Ctx = { params: Promise<{ path?: string[] }> };

async function handle(req: Request, { params }: Ctx) {
  const { path = [] } = await params;
  return handleGuidedPractice(req, path);
}

export const GET = handle;
export const POST = handle;
export const PUT = handle;
export const DELETE = handle;

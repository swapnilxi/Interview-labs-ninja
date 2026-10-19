import { handleDsaLab } from 'fe-apis/dsaLab';

// The AI organizer (POST /dsa/week-plan/auto) waits at most 45 s for the provider (fe-apis/dsaLab/weekPlan.ts answers a JSON 504
// then), so the platform's own non-JSON 504 at 60 s never reaches the page.
export const maxDuration = 60;

type Ctx = { params: Promise<{ path: string[] }> };

async function handle(req: Request, { params }: Ctx) {
  const { path } = await params;
  return handleDsaLab(req, path);
}

// Every verb the twin serves: a missing one is a 405 (it happened once with PUT in lab-sections).
export const GET = handle;
export const POST = handle;
export const PUT = handle;
export const PATCH = handle;
export const DELETE = handle;

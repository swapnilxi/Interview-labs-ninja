import { handleLabSections } from 'fe-apis/labSections';

// AI endpoints wait up to 55s on the provider (fe-apis/ai/client.ts).
export const maxDuration = 60;

// Optional catch-all: the bare /api/lab-sections (saved sections list) has no path segments.
type Ctx = { params: Promise<{ path?: string[] }> };

async function handle(req: Request, { params }: Ctx) {
  const { path = [] } = await params;
  return handleLabSections(req, path);
}

export const GET = handle;
export const POST = handle;
export const PUT = handle;
export const DELETE = handle;


import { handleDsaLab } from 'fe-apis/dsaLab';

type Ctx = { params: Promise<{ path: string[] }> };

async function handle(req: Request, { params }: Ctx) {
  const { path } = await params;
  return handleDsaLab(req, path);
}

export const GET = handle;
export const PUT = handle;
export const DELETE = handle;

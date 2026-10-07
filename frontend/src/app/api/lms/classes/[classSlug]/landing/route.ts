import { handleGetClassLanding, handlePutClassLanding } from 'fe-apis/lms';

export async function GET(req: Request, { params }: { params: Promise<{ classSlug: string }> }) {
  const { classSlug } = await params;
  return handleGetClassLanding(classSlug, req);
}

export async function PUT(req: Request, { params }: { params: Promise<{ classSlug: string }> }) {
  const { classSlug } = await params;
  return handlePutClassLanding(classSlug, req);
}

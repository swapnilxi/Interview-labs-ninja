import { handleGetClassLandingStatus } from 'fe-apis/lms';

export async function GET(req: Request, { params }: { params: Promise<{ classSlug: string }> }) {
  const { classSlug } = await params;
  return handleGetClassLandingStatus(classSlug, req);
}

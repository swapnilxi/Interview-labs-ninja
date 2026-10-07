import { handleLandingAi } from 'fe-apis/lms';

export async function POST(req: Request, { params }: { params: Promise<{ classSlug: string }> }) {
  const { classSlug } = await params;
  return handleLandingAi(classSlug, req);
}

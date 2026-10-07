import { handleAddLandingSection, handleListLandingSections } from 'fe-apis/lms';

export async function GET(req: Request, { params }: { params: Promise<{ classSlug: string }> }) {
  const { classSlug } = await params;
  return handleListLandingSections(classSlug, req);
}

export async function POST(req: Request, { params }: { params: Promise<{ classSlug: string }> }) {
  const { classSlug } = await params;
  return handleAddLandingSection(classSlug, req);
}

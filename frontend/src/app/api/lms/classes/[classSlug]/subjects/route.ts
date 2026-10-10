import { handleListSubjects, handleCreateSubject } from 'fe-apis/lms';

export async function GET(
  req: Request,
  { params }: { params: Promise<{ classSlug: string }> }
) {
  const { classSlug } = await params;
  return handleListSubjects(classSlug, req);
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ classSlug: string }> }
) {
  const { classSlug } = await params;
  return handleCreateSubject(classSlug, req);
}

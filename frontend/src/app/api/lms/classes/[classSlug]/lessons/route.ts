import { handleListDirectLessons } from 'fe-apis/lms';

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ classSlug: string }> }
) {
  const { classSlug } = await params;
  return handleListDirectLessons(classSlug);
}

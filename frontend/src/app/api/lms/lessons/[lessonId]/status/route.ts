import { handleGetLessonStatus } from 'fe-apis/lms';

export async function GET(req: Request, { params }: { params: Promise<{ lessonId: string }> }) {
  const { lessonId } = await params;
  return handleGetLessonStatus(lessonId, req);
}

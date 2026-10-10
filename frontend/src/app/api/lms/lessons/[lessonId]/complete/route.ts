import { handleMarkLessonComplete } from 'fe-apis/lms';

export async function POST(
  req: Request,
  { params }: { params: Promise<{ lessonId: string }> }
) {
  const { lessonId } = await params;
  return handleMarkLessonComplete(lessonId, req);
}

import { handleCreateLesson } from 'fe-apis/lms';

export async function POST(req: Request) {
  return handleCreateLesson(req);
}

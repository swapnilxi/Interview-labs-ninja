import { handleGenerateLesson } from 'fe-apis/lms';

export async function POST(req: Request) {
  return handleGenerateLesson(req);
}

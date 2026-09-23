import { handleReorderLessons } from 'fe-apis/lms';

export async function POST(req: Request) {
  return handleReorderLessons(req);
}

import { handleGetRecentLessons } from 'fe-apis/lms';

export async function GET(req: Request) {
  return handleGetRecentLessons(req);
}

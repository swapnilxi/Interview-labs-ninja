import { handleReorderSubjects } from 'fe-apis/lms';

export async function POST(req: Request) {
  return handleReorderSubjects(req);
}

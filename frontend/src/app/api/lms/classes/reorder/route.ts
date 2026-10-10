import { handleReorderClasses } from 'fe-apis/lms';

export async function POST(req: Request) {
  return handleReorderClasses(req);
}

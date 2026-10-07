import { handleResolvePath } from 'fe-apis/lms';

export async function GET(req: Request) {
  return handleResolvePath(req);
}

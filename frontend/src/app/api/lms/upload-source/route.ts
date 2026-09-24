import { handleUploadSource } from 'fe-apis/lms';

export async function POST(req: Request) {
  return handleUploadSource(req);
}

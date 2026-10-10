import { handlePushDb } from 'fe-apis/admin/db';

export async function POST(req: Request) {
  return handlePushDb(req);
}

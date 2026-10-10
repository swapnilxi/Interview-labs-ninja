import { handlePullDb } from 'fe-apis/admin/db';

export async function POST(req: Request) {
  return handlePullDb(req);
}

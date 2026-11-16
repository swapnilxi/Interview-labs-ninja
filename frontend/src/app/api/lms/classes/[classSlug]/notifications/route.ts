import { handleListClassUpdates, handleSendClassUpdate } from 'fe-apis/lms';

// Twin of GET/POST /api/lms/classes/{class}/notifications in backend/modules/ai_lms/router.py.
type Ctx = { params: Promise<{ classSlug: string }> };

export async function GET(req: Request, { params }: Ctx) {
  const { classSlug } = await params;
  return handleListClassUpdates(classSlug, req);
}

export async function POST(req: Request, { params }: Ctx) {
  const { classSlug } = await params;
  return handleSendClassUpdate(classSlug, req);
}

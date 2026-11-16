import { handleGetClassMembership, handleSetClassMembership, handleRemoveClassMembership } from 'fe-apis/lms';

// Twin of GET/PUT/DELETE /api/lms/classes/{class}/membership in backend/modules/ai_lms/router.py.
type Ctx = { params: Promise<{ classSlug: string }> };

export async function GET(req: Request, { params }: Ctx) {
  const { classSlug } = await params;
  return handleGetClassMembership(classSlug, req);
}

export async function PUT(req: Request, { params }: Ctx) {
  const { classSlug } = await params;
  return handleSetClassMembership(classSlug, req);
}

export async function DELETE(req: Request, { params }: Ctx) {
  const { classSlug } = await params;
  return handleRemoveClassMembership(classSlug, req);
}

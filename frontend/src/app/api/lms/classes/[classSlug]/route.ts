import { handleGetClass, handleUpdateClass, handleDeleteClass } from 'fe-apis/lms';

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ classSlug: string }> }
) {
  const { classSlug } = await params;
  return handleGetClass(classSlug);
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ classSlug: string }> }
) {
  const { classSlug } = await params;
  return handleUpdateClass(classSlug, req);
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ classSlug: string }> }
) {
  const { classSlug } = await params;
  return handleDeleteClass(classSlug);
}

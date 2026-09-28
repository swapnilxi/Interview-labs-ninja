import { handleGetClass, handleUpdateClass, handleDeleteClass } from 'fe-apis/lms';

export async function GET(
  req: Request,
  { params }: { params: Promise<{ classSlug: string }> }
) {
  const { classSlug } = await params;
  return handleGetClass(classSlug, req);
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ classSlug: string }> }
) {
  const { classSlug } = await params;
  return handleUpdateClass(classSlug, req);
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ classSlug: string }> }
) {
  const { classSlug } = await params;
  return handleDeleteClass(classSlug, req);
}

import { handleDeleteLandingSection, handleUpdateLandingSection } from 'fe-apis/lms';

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ classSlug: string; sectionId: string }> }
) {
  const { classSlug, sectionId } = await params;
  return handleDeleteLandingSection(classSlug, sectionId, req);
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ classSlug: string; sectionId: string }> }
) {
  const { classSlug, sectionId } = await params;
  return handleUpdateLandingSection(classSlug, sectionId, req);
}

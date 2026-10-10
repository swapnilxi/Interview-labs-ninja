import { handleDeleteModuleLandingSection, handleUpdateModuleLandingSection } from 'fe-apis/lms';

export async function DELETE(req: Request, { params }: { params: Promise<{ sectionId: string }> }) {
  const { sectionId } = await params;
  return handleDeleteModuleLandingSection(sectionId, req);
}

export async function PATCH(req: Request, { params }: { params: Promise<{ sectionId: string }> }) {
  const { sectionId } = await params;
  return handleUpdateModuleLandingSection(sectionId, req);
}

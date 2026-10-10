import { handleGenerateProjectModule } from 'fe-apis/lms';

export async function POST(
  req: Request,
  { params }: { params: Promise<{ projectId: string; moduleIndex: string }> }
) {
  const { projectId, moduleIndex } = await params;
  return handleGenerateProjectModule(projectId, parseInt(moduleIndex, 10), req);
}

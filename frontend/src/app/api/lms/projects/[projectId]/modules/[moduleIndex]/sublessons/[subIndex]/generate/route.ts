import { handleGenerateProjectSublesson } from 'fe-apis/lms';

export async function POST(
  req: Request,
  { params }: { params: Promise<{ projectId: string; moduleIndex: string; subIndex: string }> }
) {
  const { projectId, moduleIndex, subIndex } = await params;
  return handleGenerateProjectSublesson(
    projectId,
    parseInt(moduleIndex, 10),
    parseInt(subIndex, 10),
    req
  );
}

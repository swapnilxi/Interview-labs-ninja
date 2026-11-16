import { handlePutModuleVideos } from 'fe-apis/lms/videos';

// Twin of PUT /api/lms/projects/{project_id}/modules/{module_index}/videos: replaces a module's video links.
export async function PUT(
  req: Request,
  { params }: { params: Promise<{ projectId: string; moduleIndex: string }> }
) {
  const { projectId, moduleIndex } = await params;
  return handlePutModuleVideos(projectId, moduleIndex, req);
}

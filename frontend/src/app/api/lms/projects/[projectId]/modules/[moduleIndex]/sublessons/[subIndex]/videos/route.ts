import { handlePutSublessonVideos } from 'fe-apis/lms/videos';

// Twin of PUT /api/lms/projects/{project_id}/modules/{module_index}/sublessons/{sub_index}/videos.
export async function PUT(
  req: Request,
  { params }: { params: Promise<{ projectId: string; moduleIndex: string; subIndex: string }> }
) {
  const { projectId, moduleIndex, subIndex } = await params;
  return handlePutSublessonVideos(projectId, moduleIndex, subIndex, req);
}

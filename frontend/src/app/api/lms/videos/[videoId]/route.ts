import { handleDeleteVideo, handleUpdateVideo } from 'fe-apis/lms/videos';

// Twin of PATCH/DELETE /api/lms/videos/{video_id}.
export async function PATCH(req: Request, { params }: { params: Promise<{ videoId: string }> }) {
  const { videoId } = await params;
  return handleUpdateVideo(videoId, req);
}

export async function DELETE(req: Request, { params }: { params: Promise<{ videoId: string }> }) {
  const { videoId } = await params;
  return handleDeleteVideo(videoId, req);
}

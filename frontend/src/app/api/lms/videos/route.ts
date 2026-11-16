import { handleCreateVideo, handleListVideos } from 'fe-apis/lms/videos';

// Twin of GET/POST /api/lms/videos in backend/modules/ai_lms/router.py: video links on a class or a subject.
export async function GET(req: Request) {
  return handleListVideos(req);
}

export async function POST(req: Request) {
  return handleCreateVideo(req);
}

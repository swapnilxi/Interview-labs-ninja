import { handleReorderVideos } from 'fe-apis/lms/videos';

// Twin of POST /api/lms/videos/reorder.
export async function POST(req: Request) {
  return handleReorderVideos(req);
}

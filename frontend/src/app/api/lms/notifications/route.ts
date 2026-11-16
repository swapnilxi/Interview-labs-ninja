import { handleGetMyUpdates } from 'fe-apis/lms';

// Twin of GET /api/lms/notifications in backend/modules/ai_lms/router.py: the caller's own class updates.
export async function GET(req: Request) {
  return handleGetMyUpdates(req);
}

import { handleListDocuments } from 'fe-apis/pdf';
import { userIdOrAuthError } from 'fe-apis/todo/_shared';
import { withNeonRead } from '@/lib/server/neonSync';

// Login required, like FastAPI's /api/pdf router. The documents themselves are not per-user.
async function GETImpl(request: Request) {
  const auth = userIdOrAuthError(request);
  if (auth instanceof Response) return auth;
  return handleListDocuments();
}

export const GET = withNeonRead(GETImpl);

import { handleListDocuments } from 'fe-apis/pdf';
import { userIdOrAuthError } from 'fe-apis/todo/_shared';

// Login required, like FastAPI's /api/pdf router. The documents themselves are not per-user.
export function GET(request: Request) {
  const auth = userIdOrAuthError(request);
  if (auth instanceof Response) return auth;
  return handleListDocuments();
}

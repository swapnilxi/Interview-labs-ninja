import { handleUploadPdf } from 'fe-apis/pdf';
import { userIdOrAuthError } from 'fe-apis/todo/_shared';

// Login required, like FastAPI's /api/pdf router.
export async function POST(request: Request) {
  const auth = userIdOrAuthError(request);
  if (auth instanceof Response) return auth;
  return handleUploadPdf(request);
}

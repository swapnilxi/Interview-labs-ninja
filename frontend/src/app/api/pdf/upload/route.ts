import { handleUploadPdf } from 'fe-apis/pdf';
import { userIdOrAuthError } from 'fe-apis/todo/_shared';
import { withNeonSync } from '@/lib/server/neonSync';

// Login required, like FastAPI's /api/pdf router.
async function POSTImpl(request: Request) {
  const auth = userIdOrAuthError(request);
  if (auth instanceof Response) return auth;
  return handleUploadPdf(request);
}

export const POST = withNeonSync(POSTImpl);

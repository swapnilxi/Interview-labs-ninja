import { handleGetDocumentById, handleDeleteDocumentById } from 'fe-apis/pdf';
import { userIdOrAuthError } from 'fe-apis/todo/_shared';
import { withNeonRead, withNeonSync } from '@/lib/server/neonSync';

// Login required, like FastAPI's /api/pdf router. The documents themselves are not per-user.
async function GETImpl(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = userIdOrAuthError(request);
  if (auth instanceof Response) return auth;
  const { id } = await params;
  return handleGetDocumentById(id);
}

async function DELETEImpl(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = userIdOrAuthError(request);
  if (auth instanceof Response) return auth;
  const { id } = await params;
  return handleDeleteDocumentById(id);
}

export const GET = withNeonRead(GETImpl);

export const DELETE = withNeonSync(DELETEImpl);

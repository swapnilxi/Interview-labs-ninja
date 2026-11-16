import { handleGetDocumentById, handleDeleteDocumentById } from 'fe-apis/pdf';
import { userIdOrAuthError } from 'fe-apis/todo/_shared';

// Login required, like FastAPI's /api/pdf router. The documents themselves are not per-user.
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = userIdOrAuthError(request);
  if (auth instanceof Response) return auth;
  const { id } = await params;
  return handleGetDocumentById(id);
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = userIdOrAuthError(request);
  if (auth instanceof Response) return auth;
  const { id } = await params;
  return handleDeleteDocumentById(id);
}

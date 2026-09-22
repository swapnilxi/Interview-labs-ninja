import { handleGetDocumentById, handleDeleteDocumentById } from 'fe-apis/pdf';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  return handleGetDocumentById(id);
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  return handleDeleteDocumentById(id);
}

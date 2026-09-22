import { handleListDocuments } from 'fe-apis/pdf';

export function GET() {
  return handleListDocuments();
}

import { handleUploadPdf } from 'fe-apis/pdf';

export async function POST(request: Request) {
  return handleUploadPdf(request);
}

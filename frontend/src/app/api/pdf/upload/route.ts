import { NextResponse } from 'next/server';
import { extractPdfTextBestEffort, processDocumentChunks } from '@/modules/swipe-pdf-reader/utils/pdfProcessor';

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json({ detail: 'No file uploaded.' }, { status: 400 });
    }

    if (!file.name.toLowerCase().endsWith('.pdf') && file.type !== 'application/pdf') {
      return NextResponse.json({ detail: 'Only PDF files are supported.' }, { status: 400 });
    }

    const { pageTexts } = await extractPdfTextBestEffort(file);
    const timestamp = Date.now();
    const docId = `cloud-pdf-${timestamp}`;
    const processedDoc = processDocumentChunks(docId, file.name, 'pdf', pageTexts);

    const doc = {
      ...processedDoc,
      source: 'cloud',
      syncStatus: 'synced',
    };

    return NextResponse.json(doc);
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Failed to process PDF upload.';
    return NextResponse.json({ detail: msg }, { status: 500 });
  }
}

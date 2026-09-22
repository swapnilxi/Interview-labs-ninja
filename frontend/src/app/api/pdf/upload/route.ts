import { NextResponse } from 'next/server';
import { extractPdfTextBestEffort, processDocumentChunks } from '@/modules/swipe-pdf-reader/utils/pdfProcessor';
import { getSQLiteDatabase } from '@/lib/server/sqliteReader';

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
    const nowIso = new Date().toISOString();

    // Persist to SQLite if backend/data/lab_ninja.sqlite3 is accessible
    const res = getSQLiteDatabase('lab_ninja');
    if (res) {
      const { db } = res;
      try {
        db.prepare(`
          CREATE TABLE IF NOT EXISTS pdf_documents (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            file_path TEXT,
            total_pages INTEGER DEFAULT 1,
            total_chunks INTEGER DEFAULT 0,
            extracted_text TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
          )
        `).run();

        db.prepare(`
          CREATE TABLE IF NOT EXISTS pdf_chunks (
            id TEXT PRIMARY KEY,
            document_id TEXT NOT NULL,
            chunk_index INTEGER NOT NULL,
            page_number INTEGER DEFAULT 1,
            title TEXT NOT NULL,
            content TEXT NOT NULL
          )
        `).run();

        db.prepare(`
          INSERT OR REPLACE INTO pdf_documents (
            id, name, total_pages, total_chunks, extracted_text, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(
          docId,
          file.name,
          processedDoc.totalPages || 1,
          processedDoc.totalChunks,
          processedDoc.extractedText || '',
          nowIso,
          nowIso
        );

        for (const c of processedDoc.chunks) {
          db.prepare(`
            INSERT INTO pdf_chunks (
              id, document_id, chunk_index, page_number, title, content
            ) VALUES (?, ?, ?, ?, ?, ?)
          `).run(c.id, docId, c.chunkIndex, c.pageNumber || 1, c.title, c.content);
        }
      } catch (err) {
        console.warn('[api/pdf/upload] SQLite write fallback:', err);
      }
    }

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

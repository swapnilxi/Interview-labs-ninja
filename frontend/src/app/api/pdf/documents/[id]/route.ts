import { NextResponse } from 'next/server';
import { getSQLiteDatabase } from '@/lib/server/sqliteReader';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const res = getSQLiteDatabase('lab_ninja');
    if (!res) {
      return NextResponse.json({ detail: `Document ${id} not found.` }, { status: 404 });
    }

    const { db } = res;
    const docRow = db.prepare(`
      SELECT id, name, file_path as filePath, total_pages as totalPages,
             total_chunks as totalChunks, extracted_text as extractedText,
             created_at as createdAt, updated_at as updatedAt
      FROM pdf_documents
      WHERE id = ?
    `).get(id) as Record<string, unknown> | undefined;

    if (!docRow) {
      return NextResponse.json({ detail: `Document ${id} not found.` }, { status: 404 });
    }

    const chunkRows = db.prepare(`
      SELECT id, document_id as documentId, chunk_index as chunkIndex,
             page_number as pageNumber, title, content
      FROM pdf_chunks
      WHERE document_id = ?
      ORDER BY chunk_index ASC
    `).all(id) as Record<string, unknown>[];

    const chunks = chunkRows.map((c) => ({
      ...c,
      documentTitle: docRow.name,
      totalChunks: docRow.totalChunks,
      text: c.content,
    }));

    const doc = {
      ...docRow,
      type: 'pdf',
      sourceType: 'pdf',
      source: 'cloud',
      syncStatus: 'synced',
      chunks,
    };

    return NextResponse.json(doc);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Database error';
    return NextResponse.json({ detail: msg }, { status: 500 });
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const res = getSQLiteDatabase('lab_ninja');
    if (res) {
      const { db } = res;
      db.prepare('DELETE FROM pdf_documents WHERE id = ?').run(id);
      db.prepare('DELETE FROM pdf_chunks WHERE document_id = ?').run(id);
    }
  } catch (err) {
    console.warn('[api/pdf/documents/[id]] Delete error:', err);
  }

  return NextResponse.json({ status: 'deleted', id });
}

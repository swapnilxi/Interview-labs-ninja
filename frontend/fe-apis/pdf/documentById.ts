/**
 * fe-apis/pdf/documentById.ts
 *
 * Business logic for:
 *   GET    /api/pdf/documents/[id]  — fetch a document + its chunks
 *   DELETE /api/pdf/documents/[id]  — remove a document and its chunks
 */

import { NextResponse } from 'next/server';
import { getSQLiteDatabase } from '../_shared/db';

export function handleGetDocumentById(id: string): NextResponse {
  try {
    const res = getSQLiteDatabase('lab_ninja');
    if (!res) {
      return NextResponse.json(
        { detail: `Document ${id} not found.` },
        { status: 404 }
      );
    }

    const { db } = res;

    const docRow = db
      .prepare(
        `SELECT id, name, file_path as filePath, total_pages as totalPages,
                total_chunks as totalChunks, extracted_text as extractedText,
                created_at as createdAt, updated_at as updatedAt
         FROM pdf_documents
         WHERE id = ?`
      )
      .get(id) as Record<string, unknown> | undefined;

    if (!docRow) {
      return NextResponse.json(
        { detail: `Document ${id} not found.` },
        { status: 404 }
      );
    }

    const chunkRows = db
      .prepare(
        `SELECT id, document_id as documentId, chunk_index as chunkIndex,
                page_number as pageNumber, title, content
         FROM pdf_chunks
         WHERE document_id = ?
         ORDER BY chunk_index ASC`
      )
      .all(id) as Record<string, unknown>[];

    const chunks = chunkRows.map((c) => ({
      ...c,
      documentTitle: docRow.name,
      totalChunks: docRow.totalChunks,
      text: c.content,
    }));

    return NextResponse.json({
      ...docRow,
      type: 'pdf',
      sourceType: 'pdf',
      source: 'cloud',
      syncStatus: 'synced',
      chunks,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Database error';
    return NextResponse.json({ detail: msg }, { status: 500 });
  }
}

export function handleDeleteDocumentById(id: string): NextResponse {
  try {
    const res = getSQLiteDatabase('lab_ninja');
    if (res) {
      const { db } = res;
      db.prepare('DELETE FROM pdf_documents WHERE id = ?').run(id);
      db.prepare('DELETE FROM pdf_chunks WHERE document_id = ?').run(id);
    }
  } catch (err) {
    console.warn('[fe-api/pdf/documentById] Delete error:', err);
  }

  return NextResponse.json({ status: 'deleted', id });
}

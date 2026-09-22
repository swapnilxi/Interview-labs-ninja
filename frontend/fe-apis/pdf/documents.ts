/**
 * fe-apis/pdf/documents.ts
 *
 * Business logic for GET /api/pdf/documents.
 * Lists all PDF documents persisted in the SQLite database.
 */

import { NextResponse } from 'next/server';
import { getSQLiteDatabase } from '../_shared/db';

export function handleListDocuments(): NextResponse {
  try {
    const res = getSQLiteDatabase('lab_ninja');
    if (!res) {
      return NextResponse.json([]);
    }

    const { db } = res;

    // Guard: table may not exist on a fresh DB
    const tableCheck = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='pdf_documents'"
      )
      .get();

    if (!tableCheck) {
      return NextResponse.json([]);
    }

    const rows = db
      .prepare(
        `SELECT id, name, file_path as filePath, total_pages as totalPages,
                total_chunks as totalChunks, created_at as createdAt, updated_at as updatedAt
         FROM pdf_documents
         ORDER BY datetime(created_at) DESC`
      )
      .all() as Record<string, unknown>[];

    const docs = rows.map((r) => ({
      ...r,
      type: 'pdf',
      sourceType: 'pdf',
      source: 'cloud',
      syncStatus: 'synced',
    }));

    return NextResponse.json(docs);
  } catch (err) {
    console.warn('[fe-api/pdf/documents] SQLite query fallback:', err);
    return NextResponse.json([]);
  }
}

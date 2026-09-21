from __future__ import annotations

import sqlite3
from pathlib import Path
from typing import Any, Dict, List, Optional
from modules.common.db import get_db_path


def init_pdf_db() -> None:
    """Initialize SQLite tables for cloud PDF documents and chunks."""
    db_path = get_db_path()
    conn = sqlite3.connect(db_path)
    try:
        cursor = conn.cursor()
        cursor.execute("PRAGMA foreign_keys = ON;")

        cursor.execute("""
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
        """)

        cursor.execute("""
            CREATE TABLE IF NOT EXISTS pdf_chunks (
                id TEXT PRIMARY KEY,
                document_id TEXT NOT NULL,
                chunk_index INTEGER NOT NULL,
                page_number INTEGER DEFAULT 1,
                title TEXT NOT NULL,
                content TEXT NOT NULL,
                FOREIGN KEY (document_id) REFERENCES pdf_documents(id) ON DELETE CASCADE
            )
        """)

        cursor.execute("CREATE INDEX IF NOT EXISTS idx_pdf_chunks_document_id ON pdf_chunks(document_id);")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_pdf_chunks_chunk_index ON pdf_chunks(chunk_index);")
        conn.commit()
    finally:
        conn.close()


def save_pdf_document(doc: Dict[str, Any], chunks: List[Dict[str, Any]]) -> None:
    """Save document metadata and chunks into SQLite inside a single transaction."""
    db_path = get_db_path()
    conn = sqlite3.connect(db_path)
    try:
        cursor = conn.cursor()
        cursor.execute("PRAGMA foreign_keys = ON;")

        cursor.execute(
            """
            INSERT OR REPLACE INTO pdf_documents (
                id, name, file_path, total_pages, total_chunks, extracted_text, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                doc["id"],
                doc["name"],
                doc.get("file_path"),
                doc.get("totalPages", 1),
                doc.get("totalChunks", len(chunks)),
                doc.get("extractedText", ""),
                doc["createdAt"],
                doc.get("updatedAt", doc["createdAt"]),
            ),
        )

        cursor.execute("DELETE FROM pdf_chunks WHERE document_id = ?", (doc["id"],))

        for chunk in chunks:
            cursor.execute(
                """
                INSERT INTO pdf_chunks (
                    id, document_id, chunk_index, page_number, title, content
                ) VALUES (?, ?, ?, ?, ?, ?)
                """,
                (
                    chunk["id"],
                    doc["id"],
                    chunk["chunkIndex"],
                    chunk.get("pageNumber", 1),
                    chunk["title"],
                    chunk["content"],
                ),
            )

        conn.commit()
    finally:
        conn.close()


def get_all_pdf_documents() -> List[Dict[str, Any]]:
    """Retrieve all cloud document metadata."""
    db_path = get_db_path()
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    try:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT id, name, file_path, total_pages as totalPages, total_chunks as totalChunks,
                   created_at as createdAt, updated_at as updatedAt
            FROM pdf_documents
            ORDER BY datetime(created_at) DESC
        """)
        rows = cursor.fetchall()
        result = []
        for r in rows:
            d = dict(r)
            d["type"] = "pdf"
            d["sourceType"] = "pdf"
            d["source"] = "cloud"
            d["syncStatus"] = "synced"
            result.append(d)
        return result
    finally:
        conn.close()


def get_pdf_document_by_id(doc_id: str) -> Optional[Dict[str, Any]]:
    """Retrieve complete cloud document including all chunks."""
    db_path = get_db_path()
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    try:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT id, name, file_path, total_pages as totalPages, total_chunks as totalChunks,
                   extracted_text as extractedText, created_at as createdAt, updated_at as updatedAt
            FROM pdf_documents
            WHERE id = ?
        """, (doc_id,))
        doc_row = cursor.fetchone()
        if not doc_row:
            return None

        doc = dict(doc_row)
        doc["type"] = "pdf"
        doc["sourceType"] = "pdf"
        doc["source"] = "cloud"
        doc["syncStatus"] = "synced"

        cursor.execute("""
            SELECT id, document_id as documentId, chunk_index as chunkIndex, page_number as pageNumber,
                   title, content
            FROM pdf_chunks
            WHERE document_id = ?
            ORDER BY chunk_index ASC
        """, (doc_id,))
        chunk_rows = cursor.fetchall()

        chunks = []
        for c in chunk_rows:
            cd = dict(c)
            cd["documentTitle"] = doc["name"]
            cd["totalChunks"] = doc["totalChunks"]
            cd["text"] = cd["content"]
            chunks.append(cd)

        doc["chunks"] = chunks
        return doc
    finally:
        conn.close()


def delete_pdf_document(doc_id: str) -> Optional[str]:
    """Delete document and chunks from database. Returns file_path if existed for filesystem cleanup."""
    db_path = get_db_path()
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    try:
        cursor = conn.cursor()
        cursor.execute("PRAGMA foreign_keys = ON;")
        cursor.execute("SELECT file_path FROM pdf_documents WHERE id = ?", (doc_id,))
        row = cursor.fetchone()
        file_path = row["file_path"] if row else None

        cursor.execute("DELETE FROM pdf_documents WHERE id = ?", (doc_id,))
        conn.commit()
        return file_path
    finally:
        conn.close()

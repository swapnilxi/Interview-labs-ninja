"""Shared SQLite storage for RAG chunks -- a single table used by every module
that indexes text for retrieval, not just one caller. Rows are namespaced (see
`register`/CRUD docstrings below) so callers never collide with each other's
data while sharing one table/schema.

Split out of `modules.common.rag`'s public API (`__init__.py`) the same way
`modules/common/ai/` splits providers.py from client.py -- storage concerns
here, orchestration (chunk + embed + store, or embed-query + search) there.
"""

from __future__ import annotations

import json
import sqlite3
import uuid
from datetime import datetime
from typing import Any, Dict, List, Optional

from modules.common.db import get_db_path


def register(cursor: sqlite3.Cursor) -> None:
    """Create (or migrate) the shared rag_chunks table. Called once from
    modules.common.db.init_db(), alongside every other module's schema
    registration -- so this table exists regardless of which module ends up
    being the first to actually use RAG."""
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS rag_chunks (
            id TEXT PRIMARY KEY,
            namespace TEXT NOT NULL,
            owner_id TEXT NOT NULL,
            chunk_index INTEGER NOT NULL,
            source_label TEXT DEFAULT '',
            content TEXT NOT NULL,
            embedding TEXT NOT NULL,
            created_at TEXT NOT NULL
        );
    """)
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_rag_chunks_owner ON rag_chunks(namespace, owner_id);")


def _get_conn() -> sqlite3.Connection:
    conn = sqlite3.connect(get_db_path())
    conn.row_factory = sqlite3.Row
    return conn


def save_chunks(namespace: str, owner_id: str, chunks: List[Dict[str, Any]]) -> None:
    """Replace all chunks for (namespace, owner_id) with a new set. Each chunk:
    {"content": str, "embedding": List[float], "source_label": str}."""
    now_iso = datetime.utcnow().isoformat() + "Z"
    with _get_conn() as conn:
        conn.execute("DELETE FROM rag_chunks WHERE namespace = ? AND owner_id = ?", (namespace, owner_id))
        for idx, chunk in enumerate(chunks):
            conn.execute(
                """
                INSERT INTO rag_chunks (id, namespace, owner_id, chunk_index, source_label, content, embedding, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    f"rchunk-{uuid.uuid4().hex[:10]}",
                    namespace,
                    owner_id,
                    idx,
                    chunk.get("source_label") or "",
                    chunk["content"],
                    json.dumps(chunk["embedding"]),
                    now_iso,
                ),
            )
        conn.commit()


def get_chunks(namespace: str, owner_id: str) -> List[Dict[str, Any]]:
    """All chunks for (namespace, owner_id), in original order, embeddings decoded
    back into float lists."""
    with _get_conn() as conn:
        cursor = conn.execute(
            """
            SELECT id, namespace, owner_id, chunk_index, source_label, content, embedding, created_at
            FROM rag_chunks
            WHERE namespace = ? AND owner_id = ?
            ORDER BY chunk_index ASC
            """,
            (namespace, owner_id),
        )
        rows = [dict(r) for r in cursor.fetchall()]
    for row in rows:
        try:
            row["embedding"] = json.loads(row["embedding"])
        except (TypeError, ValueError):
            row["embedding"] = []
    return rows


def delete_chunks(namespace: str, owner_id: str) -> int:
    """Clear the index for (namespace, owner_id). Returns the number removed."""
    with _get_conn() as conn:
        cursor = conn.execute("DELETE FROM rag_chunks WHERE namespace = ? AND owner_id = ?", (namespace, owner_id))
        conn.commit()
        return cursor.rowcount


def count_chunks(namespace: str, owner_id: str) -> int:
    with _get_conn() as conn:
        cursor = conn.execute(
            "SELECT COUNT(*) FROM rag_chunks WHERE namespace = ? AND owner_id = ?", (namespace, owner_id)
        )
        return cursor.fetchone()[0]

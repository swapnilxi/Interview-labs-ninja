from __future__ import annotations
import sqlite3
from typing import List, Optional

from modules.common.db import get_db_path


def _row_to_dict(r) -> dict:
    return {
        "id": r[0],
        "type": r[1],
        "title": r[2],
        "description": r[3],
        "content": r[4],
        "styleAnalysis": r[5],
        "tags": [t for t in (r[6] or "").split(",") if t],
        "tone": r[7],
        "postType": r[8],
        "isFavorite": bool(r[9]),
        "createdAt": r[10],
        "updatedAt": r[11],
    }


_COLUMNS = (
    "id, type, title, description, content, style_analysis, tags, tone, "
    "post_type, is_favorite, created_at, updated_at"
)


def fetch_templates(
    template_type: Optional[str] = None,
    search: Optional[str] = None,
    favorites_only: bool = False,
) -> List[dict]:
    conn = sqlite3.connect(get_db_path())
    try:
        cursor = conn.cursor()
        query = f"SELECT {_COLUMNS} FROM linkedin_templates WHERE 1=1"
        params: List[str] = []
        if template_type:
            query += " AND type = ?"
            params.append(template_type)
        if favorites_only:
            query += " AND is_favorite = 1"
        if search:
            query += " AND (title LIKE ? OR content LIKE ? OR tags LIKE ?)"
            like = f"%{search}%"
            params.extend([like, like, like])
        query += " ORDER BY is_favorite DESC, id DESC"
        cursor.execute(query, params)
        return [_row_to_dict(r) for r in cursor.fetchall()]
    finally:
        conn.close()


def fetch_template(template_id: int) -> Optional[dict]:
    conn = sqlite3.connect(get_db_path())
    try:
        cursor = conn.cursor()
        cursor.execute(f"SELECT {_COLUMNS} FROM linkedin_templates WHERE id = ?", (template_id,))
        row = cursor.fetchone()
        return _row_to_dict(row) if row else None
    finally:
        conn.close()


def fetch_templates_by_ids(template_ids: List[int]) -> List[dict]:
    if not template_ids:
        return []
    conn = sqlite3.connect(get_db_path())
    try:
        cursor = conn.cursor()
        placeholders = ",".join("?" * len(template_ids))
        cursor.execute(
            f"SELECT {_COLUMNS} FROM linkedin_templates WHERE id IN ({placeholders})",
            template_ids,
        )
        return [_row_to_dict(r) for r in cursor.fetchall()]
    finally:
        conn.close()


def save_template(template: dict) -> int:
    conn = sqlite3.connect(get_db_path())
    try:
        cursor = conn.cursor()
        tags = template.get("tags")
        tags_str = ",".join(tags) if isinstance(tags, list) else (tags or "")
        cursor.execute(
            """
            INSERT INTO linkedin_templates
                (type, title, description, content, style_analysis, tags, tone, post_type, is_favorite)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                template["type"],
                template["title"],
                template.get("description"),
                template["content"],
                template.get("styleAnalysis"),
                tags_str,
                template.get("tone"),
                template.get("postType"),
                1 if template.get("isFavorite") else 0,
            ),
        )
        conn.commit()
        return cursor.lastrowid
    finally:
        conn.close()


def update_template(template_id: int, fields: dict) -> None:
    column_map = {
        "title": "title",
        "description": "description",
        "content": "content",
        "styleAnalysis": "style_analysis",
        "tone": "tone",
        "postType": "post_type",
        "isFavorite": "is_favorite",
    }
    sets = []
    params: List = []
    for key, column in column_map.items():
        if key not in fields:
            continue
        value = fields[key]
        if key == "isFavorite":
            value = 1 if value else 0
        sets.append(f"{column} = ?")
        params.append(value)
    if "tags" in fields:
        tags = fields["tags"]
        sets.append("tags = ?")
        params.append(",".join(tags) if isinstance(tags, list) else (tags or ""))

    if not sets:
        return

    sets.append("updated_at = datetime('now')")
    conn = sqlite3.connect(get_db_path())
    try:
        cursor = conn.cursor()
        cursor.execute(
            f"UPDATE linkedin_templates SET {', '.join(sets)} WHERE id = ?",
            (*params, template_id),
        )
        conn.commit()
    finally:
        conn.close()


def duplicate_template(template_id: int) -> Optional[int]:
    original = fetch_template(template_id)
    if not original:
        return None
    return save_template({**original, "title": f"{original['title']} (copy)"})


def delete_template(template_id: int) -> None:
    conn = sqlite3.connect(get_db_path())
    try:
        cursor = conn.cursor()
        cursor.execute("DELETE FROM linkedin_templates WHERE id = ?", (template_id,))
        conn.commit()
    finally:
        conn.close()

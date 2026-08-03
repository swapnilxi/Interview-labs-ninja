"""SQLite DDL for the Career Studio module.

Career Studio owns a SEPARATE database file (career_studio.sqlite3) so the whole
module stays lift-and-shift portable — see db.get_career_db_path(). `register()`
is called by db.init_career_db() against THAT connection, not the app's shared
common/db.py init. Same raw-sqlite / idempotent-migration idiom the other
modules use (see linkedin_post_generator/schema.py).
"""

from __future__ import annotations

import sqlite3


def _table_columns(cursor: sqlite3.Cursor, table: str) -> list[str]:
    cursor.execute(f"PRAGMA table_info({table});")
    return [row[1] for row in cursor.fetchall()]


def register(cursor: sqlite3.Cursor) -> None:
    """Create every Career Studio table if missing. Safe to call on every boot."""

    # ── Resume identity: one master row per "resume", pointing at its draft +
    #    latest immutable checkpoint. Content lives in resume_sections.
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS resume_master (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            title TEXT NOT NULL,
            current_version_id TEXT,
            current_draft_id TEXT,
            is_deleted INTEGER NOT NULL DEFAULT 0,
            deleted_at TEXT,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        )
    """)

    # ── A version is a point in the resume's history. is_draft=1 is the single
    #    mutable working copy; is_immutable=1 rows are frozen checkpoints whose
    #    content is snapshotted into content_json and never updated afterwards.
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS resume_versions (
            id TEXT PRIMARY KEY,
            master_id TEXT NOT NULL,
            user_id TEXT NOT NULL,
            parent_version_id TEXT,
            branch_name TEXT,
            label TEXT,
            is_immutable INTEGER NOT NULL DEFAULT 0,
            is_draft INTEGER NOT NULL DEFAULT 0,
            source TEXT NOT NULL DEFAULT 'draft',
            content_json TEXT,
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
        )
    """)

    # ── Editable sections belong to the draft version. section_type is one of
    #    the known kinds (personal_info, summary, experience, …) or 'custom'.
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS resume_sections (
            id TEXT PRIMARY KEY,
            version_id TEXT NOT NULL,
            master_id TEXT NOT NULL,
            user_id TEXT NOT NULL,
            section_type TEXT NOT NULL,
            title TEXT,
            content_json TEXT,
            sort_order INTEGER NOT NULL DEFAULT 0,
            is_hidden INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        )
    """)

    # ── AI analyzer reports, one row per run against a resume version.
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS resume_analysis (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            resume_version_id TEXT NOT NULL,
            master_id TEXT,
            job_description_id TEXT,
            report_json TEXT NOT NULL,
            overall_score INTEGER,
            ats_score INTEGER,
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
        )
    """)

    # ── Audit log: one row per AI call (analyzer, rewrite, copilot, import).
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS ai_runs (
            id TEXT PRIMARY KEY,
            user_id TEXT,
            feature TEXT NOT NULL,
            provider TEXT,
            model TEXT,
            latency_ms INTEGER,
            status TEXT NOT NULL DEFAULT 'success',
            error TEXT,
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
        )
    """)

    # ── Portfolio: mirrors the resume model (master + immutable versions +
    #    widgets). theme_json holds portfolio-level styling (accent, font, …).
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS portfolio_master (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            title TEXT NOT NULL,
            current_version_id TEXT,
            current_draft_id TEXT,
            theme_json TEXT,
            is_deleted INTEGER NOT NULL DEFAULT 0,
            deleted_at TEXT,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        )
    """)

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS portfolio_versions (
            id TEXT PRIMARY KEY,
            master_id TEXT NOT NULL,
            user_id TEXT NOT NULL,
            parent_version_id TEXT,
            branch_name TEXT,
            label TEXT,
            is_immutable INTEGER NOT NULL DEFAULT 0,
            is_draft INTEGER NOT NULL DEFAULT 0,
            source TEXT NOT NULL DEFAULT 'draft',
            content_json TEXT,
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
        )
    """)

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS portfolio_widgets (
            id TEXT PRIMARY KEY,
            version_id TEXT NOT NULL,
            master_id TEXT NOT NULL,
            user_id TEXT NOT NULL,
            widget_type TEXT NOT NULL,
            title TEXT,
            content_json TEXT,
            sort_order INTEGER NOT NULL DEFAULT 0,
            is_hidden INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        )
    """)

    # Helpful indexes for the common per-user / per-resume / per-portfolio lookups.
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_resume_master_user ON resume_master(user_id, is_deleted)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_resume_sections_version ON resume_sections(version_id)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_resume_versions_master ON resume_versions(master_id)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_resume_analysis_version ON resume_analysis(resume_version_id)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_portfolio_master_user ON portfolio_master(user_id, is_deleted)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_portfolio_widgets_version ON portfolio_widgets(version_id)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_portfolio_versions_master ON portfolio_versions(master_id)")

    # Future column additions go here, guarded like the other modules:
    #   cols = _table_columns(cursor, "resume_master")
    #   if "new_col" not in cols:
    #       cursor.execute("ALTER TABLE resume_master ADD COLUMN new_col TEXT;")

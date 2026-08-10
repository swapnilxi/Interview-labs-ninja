"""SQLite DDL for the Career Studio module.

Career Studio owns a SEPARATE database file (career_studio.sqlite3) so the whole
module stays lift-and-shift portable — see db.get_career_db_path(). `register()`
is called by db.init_career_db() against THAT connection, not the app's shared
common/db.py init. Same raw-sqlite / idempotent-migration idiom the other
modules use (see linkedin_post_generator/templates/schema.py).
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

    # ── Saved job descriptions — first-class entities so a resume can be
    #    "tailored to a job id" and the JD reused across analyze/tailor runs.
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS job_descriptions (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            title TEXT,
            company TEXT,
            url TEXT,
            raw_text TEXT NOT NULL,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now'))
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
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_job_descriptions_user ON job_descriptions(user_id)")

    # ── Public portfolio publishing: a shareable snapshot reachable at
    #    /career/public/portfolios/{slug} (no auth). Content is frozen at
    #    publish time so edits don't leak until the user re-publishes.
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS portfolio_published (
            slug TEXT PRIMARY KEY,
            master_id TEXT NOT NULL,
            user_id TEXT NOT NULL,
            title TEXT,
            content_json TEXT NOT NULL,
            theme_json TEXT,
            view_count INTEGER NOT NULL DEFAULT 0,
            is_public INTEGER NOT NULL DEFAULT 1,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        )
    """)
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_portfolio_published_master ON portfolio_published(master_id)")

    # ── Versioned public snapshots: every publish() call ALSO inserts one of
    #    these, numbered per master_id, so old shared links keep working (they
    #    point at portfolio_published's "current" slug) while a NEW url per
    #    snapshot is possible via /v/{version_number}.
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS published_snapshots (
            id TEXT PRIMARY KEY,
            slug TEXT NOT NULL,
            master_id TEXT NOT NULL,
            user_id TEXT NOT NULL,
            kind TEXT NOT NULL,
            version_number INTEGER NOT NULL,
            title TEXT,
            content_json TEXT NOT NULL,
            theme_json TEXT,
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
        )
    """)
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_published_snapshots_master ON published_snapshots(master_id, version_number)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_published_snapshots_slug_version ON published_snapshots(slug, version_number)")

    # ── Analytics: one row per public view/download of a published slug.
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS view_events (
            id TEXT PRIMARY KEY,
            slug TEXT NOT NULL,
            master_id TEXT NOT NULL,
            user_id TEXT NOT NULL,
            event_type TEXT NOT NULL,      -- 'view' | 'download'
            format TEXT,                   -- download format, else NULL
            referrer TEXT,
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
        )
    """)
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_view_events_master ON view_events(master_id, event_type)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_view_events_slug ON view_events(slug)")

    # ── Visitor-submitted testimonials on a published portfolio, held for owner
    #    approval before they're shown publicly. Distinct from the owner-authored
    #    'testimonials' portfolio widget — these are unauthenticated submissions.
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS testimonial_submissions (
            id TEXT PRIMARY KEY,
            slug TEXT NOT NULL,
            master_id TEXT NOT NULL,
            user_id TEXT NOT NULL,
            name TEXT NOT NULL,
            quote TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'pending',   -- 'pending' | 'approved' | 'rejected'
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            decided_at TEXT
        )
    """)
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_testimonial_submissions_master ON testimonial_submissions(master_id, status)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_testimonial_submissions_slug ON testimonial_submissions(slug, created_at)")
    # 'portfolio' (content_json=widgets, theme_json=theme) or 'resume'
    # (content_json=sections, theme_json={"template":..,"spec":..}). Existing
    # rows predate resume publishing, so they're all portfolios.
    if "kind" not in _table_columns(cursor, "portfolio_published"):
        cursor.execute("ALTER TABLE portfolio_published ADD COLUMN kind TEXT NOT NULL DEFAULT 'portfolio';")

    # ── Career "views": a resume/portfolio is a LIVE, template-driven view over a
    #    Master Profile. Content lives in the profile (a resume_master row with
    #    is_profile=1); a view stores only the profile it reads, the template/
    #    theme, and a section config (order + per-section hidden flags). Editing
    #    the profile updates every view that references it.
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS career_views (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            profile_id TEXT NOT NULL,
            kind TEXT NOT NULL,            -- 'resume' | 'portfolio'
            title TEXT NOT NULL,
            template TEXT,
            accent TEXT,
            font TEXT,
            layout TEXT,
            config_json TEXT,              -- {"items":[{"section_id":..,"hidden":bool}]}
            is_deleted INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        )
    """)
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_career_views_user ON career_views(user_id, kind, is_deleted)")

    # ── User-designed templates: the Template Designer & Manager persists custom
    #    resume/portfolio templates as a structured visual "spec" (fonts, accent,
    #    header/heading style, density, background pattern) that render.py turns
    #    into PDF-safe CSS. Built-in presets are seeded here per-user on first
    #    visit so they too can be edited/deleted; the code presets remain a
    #    fallback so new-view creation never breaks when the table is empty.
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS career_templates (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            kind TEXT NOT NULL,            -- 'resume' | 'portfolio'
            name TEXT NOT NULL,
            spec_json TEXT NOT NULL,       -- structured visual knobs (see render.py)
            source TEXT,                   -- preset id it was seeded/forked from, or 'custom'
            is_deleted INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        )
    """)
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_career_templates_user ON career_templates(user_id, kind, is_deleted)")

    # ── Cover letters: a single generated letter tied to a profile (and
    #    optionally a saved job). Content is one text blob, not a section tree,
    #    so it gets its own simple immutable-version idiom rather than reusing
    #    resume_versions/resume_sections.
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS cover_letters (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            profile_id TEXT NOT NULL,
            job_description_id TEXT,
            title TEXT NOT NULL,
            tone TEXT NOT NULL DEFAULT 'professional',
            content_text TEXT NOT NULL DEFAULT '',
            is_deleted INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        )
    """)
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS cover_letter_versions (
            id TEXT PRIMARY KEY,
            letter_id TEXT NOT NULL,
            user_id TEXT NOT NULL,
            label TEXT,
            content_text TEXT NOT NULL,
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
        )
    """)
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_cover_letters_user ON cover_letters(user_id, is_deleted)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_cover_letter_versions_letter ON cover_letter_versions(letter_id)")

    # ── Migrations (guarded ALTERs, matching the other modules' idiom).
    #    Selected resume/portfolio template for rendering + export.
    if "template_key" not in _table_columns(cursor, "resume_master"):
        cursor.execute("ALTER TABLE resume_master ADD COLUMN template_key TEXT;")
    if "template_key" not in _table_columns(cursor, "portfolio_master"):
        cursor.execute("ALTER TABLE portfolio_master ADD COLUMN template_key TEXT;")
    # A resume_master with is_profile=1 is a reusable Master Profile (data source
    # for views), not a standalone resume; it's excluded from resume listings.
    if "is_profile" not in _table_columns(cursor, "resume_master"):
        cursor.execute("ALTER TABLE resume_master ADD COLUMN is_profile INTEGER NOT NULL DEFAULT 0;")
    # Archived profiles are hidden from the default Profile Selector/list but not
    # deleted — distinct from is_deleted (which is permanent/soft-delete).
    if "is_archived" not in _table_columns(cursor, "resume_master"):
        cursor.execute("ALTER TABLE resume_master ADD COLUMN is_archived INTEGER NOT NULL DEFAULT 0;")

    # Profile metadata: freeform context surfaced in the Profile Selector / editor and
    # usable by AI features (target-role optimization, generation). All nullable/empty
    # by default; target_roles/target_companies/tags are JSON arrays stored as TEXT,
    # matching config_json's existing idiom elsewhere in this schema.
    for col, ddl in [
        ("origin", "TEXT"),
        ("primary_role", "TEXT"),
        ("experience_level", "TEXT"),
        ("target_industry", "TEXT"),
        ("target_roles", "TEXT"),
        ("target_companies", "TEXT"),
        ("tags", "TEXT"),
        ("confidence_score", "INTEGER"),
        ("last_used_at", "TEXT"),
        ("description", "TEXT"),
        ("tech_stack", "TEXT"),
    ]:
        if col not in _table_columns(cursor, "resume_master"):
            cursor.execute(f"ALTER TABLE resume_master ADD COLUMN {col} {ddl};")

    # Per-section source attribution — where this section's CURRENT content came
    # from (manual edit, an import, or Profile Enrichment merging in a specific
    # document kind). Nullable: existing/manually-created sections have none.
    if "source" not in _table_columns(cursor, "resume_sections"):
        cursor.execute("ALTER TABLE resume_sections ADD COLUMN source TEXT;")

    # Structured Job Profile extraction: a saved job description can carry a
    # normalized breakdown (location, employment type, skills, etc.) alongside its
    # raw_text, extracted by an LLM and confirmed by the user before saving.
    # List/array fields are stored as JSON TEXT, matching this schema's existing idiom.
    for col, ddl in [
        ("location", "TEXT"),
        ("employment_type", "TEXT"),
        ("experience_level", "TEXT"),
        ("education", "TEXT"),
        ("salary", "TEXT"),
        ("required_skills", "TEXT"),
        ("preferred_skills", "TEXT"),
        ("responsibilities", "TEXT"),
        ("benefits", "TEXT"),
        ("certifications", "TEXT"),
        ("extraction_confidence", "INTEGER"),
    ]:
        if col not in _table_columns(cursor, "job_descriptions"):
            cursor.execute(f"ALTER TABLE job_descriptions ADD COLUMN {col} {ddl};")

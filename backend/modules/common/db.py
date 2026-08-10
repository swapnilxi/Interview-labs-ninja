from __future__ import annotations

import os
import sqlite3
from dataclasses import dataclass
from datetime import date
from enum import Enum
from pathlib import Path
from typing import List, Optional, Union


class Category(str, Enum):
    INTERVIEW = "interview"
    CV_SKILL = "cv_skill"


@dataclass
class QuestionRecord:
    id: Optional[int]
    session_id: int
    question_date: str
    section: str
    number: int
    category: Union[Category, str]
    sub_type: str
    difficulty: str
    topics: str
    question_text: str
    user_performance: Optional[int] = None
    last_reviewed: Optional[str] = None
    question_type: Optional[str] = None


def get_db_path() -> str:
    """Resolve the path to lab_ninja.sqlite3 relative to the backend directory."""
    override = os.environ.get("LABNINJA_TEST_DB_PATH")
    if override:
        return override
    path_rel = Path(__file__).resolve().parent.parent / "lab_ninja.sqlite3"
    if path_rel.exists() or Path(__file__).resolve().parent.parent.exists():
        return str(path_rel)
    return "lab_ninja.sqlite3"


def init_db() -> None:
    """Initialize the SQLite database schema if tables do not exist and handle migrations."""
    db_path = get_db_path()
    os.makedirs(os.path.dirname(os.path.abspath(db_path)), exist_ok=True)
    conn = sqlite3.connect(db_path)
    try:
        cursor = conn.cursor()
        cursor.execute("PRAGMA foreign_keys = ON;")

        # ── shared tables ──────────────────────────────────────────────────────
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS sessions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                session_date TEXT NOT NULL,
                created_at TEXT NOT NULL DEFAULT (datetime('now')),
                difficulty_hint TEXT,
                cv_present INTEGER NOT NULL DEFAULT 0,
                jd_present INTEGER NOT NULL DEFAULT 0
            )
        """)
        cursor.execute("PRAGMA table_info(sessions);")
        if "user_id" not in [row[1] for row in cursor.fetchall()]:
            cursor.execute("ALTER TABLE sessions ADD COLUMN user_id INTEGER DEFAULT NULL;")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);")

        cursor.execute("""
            CREATE TABLE IF NOT EXISTS questions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                session_id INTEGER NOT NULL,
                question_date TEXT NOT NULL,
                section TEXT NOT NULL,
                number INTEGER NOT NULL,
                category TEXT NOT NULL,
                sub_type TEXT NOT NULL,
                difficulty TEXT NOT NULL,
                topics TEXT NOT NULL,
                question_text TEXT NOT NULL,
                FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
            )
        """)

        # migrations
        cursor.execute("PRAGMA table_info(questions);")
        columns = [row[1] for row in cursor.fetchall()]
        if "user_performance" not in columns:
            cursor.execute("ALTER TABLE questions ADD COLUMN user_performance INTEGER DEFAULT NULL;")
        if "last_reviewed" not in columns:
            cursor.execute("ALTER TABLE questions ADD COLUMN last_reviewed TEXT DEFAULT NULL;")
        if "question_type" not in columns:
            cursor.execute("ALTER TABLE questions ADD COLUMN question_type TEXT DEFAULT NULL;")
        if "user_id" not in columns:
            cursor.execute("ALTER TABLE questions ADD COLUMN user_id INTEGER DEFAULT NULL;")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_questions_user_id ON questions(user_id);")

        cursor.execute("""
            CREATE TABLE IF NOT EXISTS session_progress (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                session_date TEXT NOT NULL,
                question_id INTEGER NULL,
                question_text TEXT NOT NULL,
                answer_text TEXT NOT NULL,
                category TEXT NOT NULL,
                difficulty TEXT NOT NULL,
                question_type TEXT NOT NULL,
                is_completed INTEGER NOT NULL DEFAULT 0
            )
        """)
        cursor.execute("PRAGMA table_info(session_progress);")
        if "user_id" not in [row[1] for row in cursor.fetchall()]:
            cursor.execute("ALTER TABLE session_progress ADD COLUMN user_id INTEGER DEFAULT NULL;")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_session_progress_user_id ON session_progress(user_id);")

        cursor.execute("""
            CREATE TABLE IF NOT EXISTS user_settings (
                text_generation_model TEXT NOT NULL,
                answer_model TEXT NOT NULL,
                openai_key TEXT DEFAULT '',
                gemini_key TEXT DEFAULT '',
                anthropic_key TEXT DEFAULT '',
                deepseek_key TEXT DEFAULT '',
                groq_key TEXT DEFAULT '',
                ollama_url TEXT DEFAULT 'http://localhost:11434',
                ollama_model TEXT DEFAULT 'llama3.2'
            )
        """)
        # Migrate existing DBs: add new columns if missing
        for col, default in [
            ("deepseek_key", "''"),
            ("groq_key", "''"),
            ("ollama_url", "'http://localhost:11434'"),
            ("ollama_model", "'llama3.2'"),
        ]:
            try:
                cursor.execute(f"ALTER TABLE user_settings ADD COLUMN {col} TEXT DEFAULT {default}")
            except sqlite3.OperationalError:
                pass  # column already exists

        # Migrate existing DBs: rename question_model -> text_generation_model (preserves configured values)
        cursor.execute("PRAGMA table_info(user_settings);")
        user_settings_columns = [row[1] for row in cursor.fetchall()]
        if "question_model" in user_settings_columns and "text_generation_model" not in user_settings_columns:
            cursor.execute("ALTER TABLE user_settings RENAME COLUMN question_model TO text_generation_model")

        # shared sections table (all labs share this). Rows with user_id NULL are
        # globally-seeded default sections (readable by everyone); rows with a
        # real user_id are that user's own custom sections.
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS lab_sections (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                lab_name TEXT NOT NULL,
                name TEXT NOT NULL,
                is_custom INTEGER NOT NULL DEFAULT 0,
                UNIQUE(lab_name, name)
            )
        """)

        # Migration: lab_sections used to have a global UNIQUE(lab_name, name),
        # which prevented two different users from naming a custom section the
        # same thing. Recreate with a composite UNIQUE(user_id, lab_name, name)
        # so ownership is part of the uniqueness key (NULL-owned default rows
        # are unaffected — SQLite treats each NULL as distinct anyway, which is
        # why the seeding below uses an explicit NOT EXISTS guard instead of
        # relying on INSERT OR IGNORE for the shared rows).
        cursor.execute("PRAGMA table_info(lab_sections);")
        if "user_id" not in [row[1] for row in cursor.fetchall()]:
            cursor.execute("""
                CREATE TABLE lab_sections_new (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    lab_name TEXT NOT NULL,
                    name TEXT NOT NULL,
                    is_custom INTEGER NOT NULL DEFAULT 0,
                    user_id INTEGER DEFAULT NULL,
                    UNIQUE(user_id, lab_name, name)
                )
            """)
            cursor.execute("""
                INSERT INTO lab_sections_new (id, lab_name, name, is_custom, user_id)
                SELECT id, lab_name, name, is_custom, NULL FROM lab_sections
            """)
            cursor.execute("DROP TABLE lab_sections")
            cursor.execute("ALTER TABLE lab_sections_new RENAME TO lab_sections")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_lab_sections_user_id ON lab_sections(user_id);")

        # ── auth: users table must exist before anything references user_id ───
        from modules.auth.schema import register as auth_register

        auth_register(cursor)

        # ── lab modules: create tables + seed ─────────────────────────────────
        from modules.system_design_lab.schema import register as sd_register
        from modules.cv_lab.schema import register as cv_register
        from modules.dsa_lab.schema import register as dsa_register
        from modules.linkedin_post_generator.templates.schema import register as linkedin_register
        from modules.todo.shared.schema import register as todo_register

        sd_register(cursor)
        cv_register(cursor)
        dsa_register(cursor)
        linkedin_register(cursor)
        todo_register(cursor)

        # ── seed lab_sections from topic categories ────────────────────────────
        # These sections stay globally-owned (user_id NULL) since they're seeded
        # from the shared topic banks, not created by a specific user. Note: we
        # can't rely on INSERT OR IGNORE + the UNIQUE(user_id, lab_name, name)
        # constraint here, because SQLite treats every NULL as distinct for
        # uniqueness purposes — that would re-insert duplicate default rows on
        # every init_db() call. Use an explicit NOT EXISTS guard instead.
        for lab, table in [
            ("system_design", "system_design_topics"),
            ("cv", "cv_topics"),
            ("dsa", "dsa_topics"),
        ]:
            cursor.execute(f"""
                INSERT INTO lab_sections (lab_name, name, is_custom, user_id)
                SELECT DISTINCT '{lab}', t.category, 0, NULL FROM {table} t
                WHERE t.is_custom = 0
                  AND NOT EXISTS (
                      SELECT 1 FROM lab_sections ls
                      WHERE ls.lab_name = '{lab}' AND ls.name = t.category AND ls.user_id IS NULL
                  )
            """)
            cursor.execute(f"""
                INSERT INTO lab_sections (lab_name, name, is_custom, user_id)
                SELECT DISTINCT '{lab}', t.category, 1, NULL FROM {table} t
                WHERE t.is_custom = 1
                  AND NOT EXISTS (
                      SELECT 1 FROM lab_sections ls
                      WHERE ls.lab_name = '{lab}' AND ls.name = t.category AND ls.user_id IS NULL
                  )
            """)

        conn.commit()
    finally:
        conn.close()


def create_session(
    user_id: int,
    session_date: str,
    difficulty_hint: Optional[str] = None,
    cv_present: bool = False,
    jd_present: bool = False,
) -> int:
    """Create a new session record and return the session ID."""
    conn = sqlite3.connect(get_db_path())
    try:
        cursor = conn.cursor()
        cursor.execute(
            """
            INSERT INTO sessions (session_date, difficulty_hint, cv_present, jd_present, user_id)
            VALUES (?, ?, ?, ?, ?)
            """,
            (session_date, difficulty_hint, 1 if cv_present else 0, 1 if jd_present else 0, user_id),
        )
        conn.commit()
        return cursor.lastrowid
    finally:
        conn.close()


def insert_questions(user_id: int, session_id: int, questions: List[dict]) -> Optional[List[int]]:
    """Insert a batch of questions under a specific session ID and return their database IDs.

    Returns None if the session doesn't exist or isn't owned by user_id.
    """
    db_path = get_db_path()
    conn = sqlite3.connect(db_path)
    try:
        cursor = conn.cursor()
        cursor.execute("SELECT session_date FROM sessions WHERE id = ? AND user_id = ?", (session_id, user_id))
        row = cursor.fetchone()
        if row is None:
            return None
        session_date = row[0]

        inserted_ids = []
        for q in questions:
            topics_val = q.get("topics", [])
            if isinstance(topics_val, list):
                topics_str = ",".join(topics_val)
            else:
                topics_str = str(topics_val)

            category_val = q["category"]
            category_str = category_val.value if hasattr(category_val, "value") else str(category_val)

            cursor.execute(
                """
                INSERT INTO questions (
                    session_id, question_date, section, number,
                    category, sub_type, difficulty, topics, question_text,
                    question_type, user_id
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    session_id,
                    session_date,
                    q["section"],
                    q["number"],
                    category_str,
                    q["sub_type"],
                    q["difficulty"],
                    topics_str,
                    q["question_text"],
                    q.get("question_type", q["sub_type"]),
                    user_id,
                ),
            )
            inserted_ids.append(cursor.lastrowid)
        conn.commit()
        return inserted_ids
    finally:
        conn.close()


def fetch_questions(
    user_id: int,
    category: Optional[Category] = None,
    session_date: Optional[str] = None,
    topic: Optional[str] = None,
) -> List[QuestionRecord]:
    """Query the questions table with optional filters, scoped to the caller."""
    db_path = get_db_path()
    conn = sqlite3.connect(db_path)
    try:
        cursor = conn.cursor()
        query = """
            SELECT id, session_id, question_date, section, number,
                   category, sub_type, difficulty, topics, question_text,
                   user_performance, last_reviewed, question_type
            FROM questions
            WHERE user_id = ?
        """
        params = [user_id]
        if category is not None:
            category_str = category.value if hasattr(category, "value") else str(category)
            query += " AND category = ?"
            params.append(category_str)
        if session_date is not None:
            query += " AND question_date = ?"
            params.append(session_date)
        if topic is not None:
            query += " AND (topics = ? OR topics LIKE ? OR topics LIKE ? OR topics LIKE ?)"
            params.extend([topic, f"{topic},%", f"%,{topic}", f"%,{topic},%"])

        query += " ORDER BY session_id DESC, section ASC, number ASC"
        cursor.execute(query, params)
        rows = cursor.fetchall()

        records = []
        for row in rows:
            cat_str = row[5]
            try:
                cat_val = Category(cat_str)
            except ValueError:
                cat_val = cat_str

            records.append(
                QuestionRecord(
                    id=row[0],
                    session_id=row[1],
                    question_date=row[2],
                    section=row[3],
                    number=row[4],
                    category=cat_val,
                    sub_type=row[6],
                    difficulty=row[7],
                    topics=row[8],
                    question_text=row[9],
                    user_performance=row[10],
                    last_reviewed=row[11],
                    question_type=row[12],
                )
            )
        return records
    finally:
        conn.close()


def update_question_performance(user_id: int, question_id: int, user_performance: int, last_reviewed: str) -> bool:
    """Update user performance and last reviewed date for a specific question.

    Returns False if the question doesn't exist or isn't owned by user_id.
    """
    conn = sqlite3.connect(get_db_path())
    try:
        cursor = conn.cursor()
        cursor.execute(
            """
            UPDATE questions
            SET user_performance = ?, last_reviewed = ?
            WHERE id = ? AND user_id = ?
            """,
            (user_performance, last_reviewed, question_id, user_id),
        )
        conn.commit()
        return cursor.rowcount > 0
    finally:
        conn.close()


def save_session_progress(user_id: int, answers: List[dict]) -> None:
    """Save or update session answers in the progress table."""
    conn = sqlite3.connect(get_db_path())
    try:
        cursor = conn.cursor()
        for answer in answers:
            q_id = answer.get("questionId")
            q_id_val = int(q_id) if q_id is not None and str(q_id).isdigit() else None

            if q_id_val is not None:
                cursor.execute(
                    "SELECT id FROM session_progress WHERE user_id = ? AND session_date = ? AND question_id = ?",
                    (user_id, answer["sessionDate"], q_id_val),
                )
            else:
                cursor.execute(
                    "SELECT id FROM session_progress WHERE user_id = ? AND session_date = ? AND question_text = ?",
                    (user_id, answer["sessionDate"], answer["questionText"]),
                )

            row = cursor.fetchone()
            is_completed_val = 1 if answer.get("isCompleted", False) else 0

            if row:
                cursor.execute(
                    """
                    UPDATE session_progress
                    SET answer_text = ?, is_completed = ?, category = ?, difficulty = ?, question_type = ?
                    WHERE id = ? AND user_id = ?
                    """,
                    (
                        answer["answerText"],
                        is_completed_val,
                        answer["category"],
                        answer["difficulty"],
                        answer["questionType"],
                        row[0],
                        user_id,
                    ),
                )
            else:
                cursor.execute(
                    """
                    INSERT INTO session_progress (
                        session_date, question_id, question_text, answer_text,
                        category, difficulty, question_type, is_completed, user_id
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        answer["sessionDate"],
                        q_id_val,
                        answer["questionText"],
                        answer["answerText"],
                        answer["category"],
                        answer["difficulty"],
                        answer["questionType"],
                        is_completed_val,
                        user_id,
                    ),
                )
        conn.commit()
    finally:
        conn.close()


def fetch_session_progress(user_id: int, session_date: str) -> List[dict]:
    """Retrieve all session progress records for a given user + date."""
    conn = sqlite3.connect(get_db_path())
    try:
        cursor = conn.cursor()
        cursor.execute(
            """
            SELECT id, session_date, question_id, question_text, answer_text,
                   category, difficulty, question_type, is_completed
            FROM session_progress
            WHERE user_id = ? AND session_date = ?
            """,
            (user_id, session_date),
        )
        rows = cursor.fetchall()
        out = []
        for r in rows:
            out.append({
                "id": str(r[0]),
                "sessionDate": r[1],
                "questionId": str(r[2]) if r[2] is not None else None,
                "questionText": r[3],
                "answerText": r[4],
                "category": r[5],
                "difficulty": r[6],
                "questionType": r[7],
                "isCompleted": bool(r[8]),
            })
        return out
    finally:
        conn.close()


def fetch_progress_stats(user_id: int) -> dict:
    """Retrieve statistics about session progress for a specific user."""
    conn = sqlite3.connect(get_db_path())
    try:
        cursor = conn.cursor()
        cursor.execute("SELECT session_date, is_completed FROM session_progress WHERE user_id = ?", (user_id,))
        rows = cursor.fetchall()

        unique_dates = list(set(r[0] for r in rows))
        completed = sum(1 for r in rows if r[1] == 1)

        unique_dates.sort(reverse=True)
        recent_dates = unique_dates[:7]

        return {
            "totalSessions": len(unique_dates),
            "totalAnswered": len(rows),
            "completedAnswers": completed,
            "recentDates": recent_dates,
        }
    finally:
        conn.close()


## NOTE: There used to be fetch_settings()/save_settings() functions here backing
## a single shared `user_settings` row of AI provider keys. That's gone — keys now
## live only in each browser's localStorage and are sent per-request (see
## modules/common/ai_client.py). The user_settings table above is kept only so
## existing installs don't need a migration; nothing reads or writes it anymore.


def fetch_lab_sections(user_id: Optional[int], lab_name: str) -> List[dict]:
    """Retrieve all sections for a specific lab visible to user_id.

    Returns globally-seeded default sections (user_id IS NULL) plus the
    caller's own custom sections (user_id = user_id). Pass user_id=None to see
    only the shared defaults (used by callers that aren't user-scoped, e.g.
    modules/linkedin_post_generator, which hasn't been migrated to per-user
    categories yet).
    """
    conn = sqlite3.connect(get_db_path())
    try:
        cursor = conn.cursor()
        cursor.execute(
            """
            SELECT id, lab_name, name, is_custom
            FROM lab_sections
            WHERE lab_name = ? AND (user_id IS NULL OR user_id = ?)
            ORDER BY is_custom ASC, id ASC
            """,
            (lab_name, user_id)
        )
        rows = cursor.fetchall()
        return [{"id": r[0], "labName": r[1], "name": r[2], "isCustom": bool(r[3])} for r in rows]
    finally:
        conn.close()


def save_lab_section(user_id: Optional[int], lab_name: str, name: str) -> None:
    """Save a new custom lab section owned by user_id.

    User-created sections are always is_custom=1 — only the seeding step in
    init_db() creates is_custom=0 (default) sections. Pass user_id=None only
    for legacy global-section callers (see fetch_lab_sections docstring).
    """
    conn = sqlite3.connect(get_db_path())
    try:
        cursor = conn.cursor()
        cursor.execute(
            """
            INSERT OR IGNORE INTO lab_sections (lab_name, name, is_custom, user_id)
            VALUES (?, ?, 1, ?)
            """,
            (lab_name, name, user_id)
        )
        conn.commit()
    finally:
        conn.close()


def delete_lab_section(user_id: Optional[int], section_id: int) -> bool:
    """Delete a lab section by id, scoped to its owner. Returns True if deleted."""
    conn = sqlite3.connect(get_db_path())
    try:
        cursor = conn.cursor()
        cursor.execute("DELETE FROM lab_sections WHERE id = ? AND user_id IS ?", (section_id, user_id))
        conn.commit()
        return cursor.rowcount > 0
    finally:
        conn.close()

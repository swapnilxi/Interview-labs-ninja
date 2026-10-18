from __future__ import annotations

import json
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
    raw_json: Optional[str] = None


def get_db_path() -> str:
    """The one real database: backend/data/lab_ninja.sqlite3.

    Only the explicit test overrides below can point elsewhere (see CLAUDE.md: copy the DB, set the
    env var, test against the copy). There is deliberately no fallback to any other location.
    """
    override = os.environ.get("LABNINJA_TEST_DB_PATH")
    if override:
        return override

    env_dir = os.environ.get("LABNINJA_DB_DIR")
    if env_dir:
        return str(Path(env_dir) / "lab_ninja.sqlite3")

    return str(Path(__file__).resolve().parent.parent.parent / "data" / "lab_ninja.sqlite3")


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
        session_cols = [row[1] for row in cursor.fetchall()]
        if "user_id" not in session_cols:
            cursor.execute("ALTER TABLE sessions ADD COLUMN user_id INTEGER DEFAULT NULL;")
        if "deck_json" not in session_cols:
            cursor.execute("ALTER TABLE sessions ADD COLUMN deck_json TEXT DEFAULT NULL;")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);")

        cursor.execute("""
            CREATE TABLE IF NOT EXISTS uploaded_decks (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                session_id INTEGER NULL,
                user_id INTEGER DEFAULT NULL,
                deck_date TEXT NOT NULL,
                session_name TEXT,
                deck_format TEXT,
                question_count INTEGER NOT NULL DEFAULT 0,
                raw_json TEXT NOT NULL,
                created_at TEXT NOT NULL DEFAULT (datetime('now')),
                FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE SET NULL
            )
        """)
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_uploaded_decks_user_id ON uploaded_decks(user_id);")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_uploaded_decks_date ON uploaded_decks(deck_date);")

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
        if "raw_json" not in columns:
            cursor.execute("ALTER TABLE questions ADD COLUMN raw_json TEXT DEFAULT NULL;")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_questions_user_id ON questions(user_id);")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_questions_text ON questions(question_text);")

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
        from modules.lab_sections.schema import register as lab_sections_register
        from modules.lab_projects.schema import register as lab_projects_register
        from modules.linkedin_post_generator.templates.schema import register as linkedin_register
        from modules.ai_todo.shared.schema import register as todo_register
        from modules.common.rag.storage import register as rag_register

        sd_register(cursor)
        cv_register(cursor)
        dsa_register(cursor)
        lab_sections_register(cursor)
        lab_projects_register(cursor)
        linkedin_register(cursor)
        todo_register(cursor)
        # Shared RAG chunk storage (modules.common.rag) -- registered centrally, like
        # every other module's schema, regardless of which module ends up using it
        # first (currently ai_lms; see modules/ai_lms/router.py's thin wrapper).
        rag_register(cursor)

        from modules.ai_lms.db import init_lms_db
        init_lms_db(conn)

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


def fetch_recent_sessions(user_id: int, limit: int = 10) -> List[dict]:
    """The caller's latest sessions that have questions, newest first, with question/answer counts."""
    conn = sqlite3.connect(get_db_path())
    try:
        cursor = conn.cursor()
        cursor.execute(
            """
            SELECT s.id, s.session_date, s.difficulty_hint, s.created_at, COUNT(q.id) AS n_questions
            FROM sessions s
            JOIN questions q ON q.session_id = s.id
            WHERE s.user_id = ?
            GROUP BY s.id
            ORDER BY s.id DESC
            LIMIT ?
            """,
            (user_id, limit),
        )
        rows = cursor.fetchall()
        out = []
        for sid, sdate, hint, created, n in rows:
            cursor.execute(
                """
                SELECT COUNT(*) FROM session_progress sp
                WHERE sp.user_id = ? AND sp.session_date = ? AND sp.is_completed = 1
                  AND sp.question_text IN (SELECT question_text FROM questions WHERE session_id = ?)
                """,
                (user_id, sdate, sid),
            )
            answered = cursor.fetchone()[0]
            out.append(
                {
                    "session_id": sid,
                    "session_date": sdate,
                    "difficulty_hint": hint,
                    "created_at": created,
                    "question_count": n,
                    "answered_count": answered,
                }
            )
        return out
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
            question_text = (q.get("question_text") or "").strip()
            if not question_text:
                continue

            # A session owns its questions. Only skip a repeat *within this same session*; never
            # point a session at another session's (or another user's) row, or it would load
            # fewer questions than it generated. Cross-session repeats are the generator's job
            # to avoid and the Question Bank's "Clear Duplicates" job to clean up.
            cursor.execute(
                """
                SELECT id FROM questions
                WHERE session_id = ? AND trim(lower(question_text)) = trim(lower(?))
                ORDER BY id ASC LIMIT 1
                """,
                (session_id, question_text),
            )
            existing_row = cursor.fetchone()
            if existing_row:
                inserted_ids.append(existing_row[0])
                continue

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
                    question_text,
                    q.get("question_type", q["sub_type"]),
                    user_id,
                ),
            )
            inserted_ids.append(cursor.lastrowid)
        conn.commit()
        return inserted_ids
    finally:
        conn.close()


def clear_duplicate_questions() -> int:
    """Find duplicate questions using SQL and delete duplicate records,
    keeping the earliest record (MIN id). Re-links any session_progress
    entries to the surviving question id.
    Returns the count of deleted duplicate records.
    """
    db_path = get_db_path()
    conn = sqlite3.connect(db_path)
    try:
        cursor = conn.cursor()
        cursor.execute(
            """
            SELECT id FROM questions
            WHERE id NOT IN (
                SELECT MIN(id) FROM questions GROUP BY trim(lower(question_text))
            )
            """
        )
        dup_rows = cursor.fetchall()
        dup_ids = [r[0] for r in dup_rows]
        if not dup_ids:
            return 0

        cursor.execute(
            """
            UPDATE session_progress
            SET question_id = (
                SELECT MIN(q.id)
                FROM questions q
                JOIN questions q2 ON trim(lower(q.question_text)) = trim(lower(q2.question_text))
                WHERE q2.id = session_progress.question_id
            )
            WHERE question_id IN (
                SELECT id FROM questions WHERE id NOT IN (
                    SELECT MIN(id) FROM questions GROUP BY trim(lower(question_text))
                )
            );
            """
        )
        cursor.execute(
            """
            DELETE FROM questions
            WHERE id NOT IN (
                SELECT MIN(id) FROM questions GROUP BY trim(lower(question_text))
            );
            """
        )
        conn.commit()
        return len(dup_ids)
    finally:
        conn.close()


def import_quick_practice_questions(
    questions: List[dict],
    user_id: Optional[int] = None,
    session_date: Optional[str] = None,
    session_title: Optional[str] = None,
    raw_payload: Optional[dict] = None,
) -> dict:
    """Import questions from Quick Practice deck into questions and session_progress tables.
    Also saves the entire raw JSON into the uploaded_decks table and sessions table in SQLite,
    and each question's raw JSON into questions.raw_json.
    Uses SQL deduplication to avoid adding duplicate questions.
    """
    db_path = get_db_path()
    conn = sqlite3.connect(db_path)
    try:
        cursor = conn.cursor()
        effective_user_id = user_id if user_id is not None else 8
        target_date = session_date or date.today().isoformat()
        deck_format = (raw_payload.get("format") if isinstance(raw_payload, dict) else None) or "2-minute quick learning"

        # Reconstruct or serialize complete raw JSON payload
        full_payload = raw_payload if raw_payload is not None else {
            "date": target_date,
            "session": session_title or "Daily Interview Revision",
            "format": deck_format,
            "questions": questions,
        }
        raw_json_str = json.dumps(full_payload, ensure_ascii=False)

        # Find or create a session for this date & user
        cursor.execute(
            """
            SELECT id FROM sessions
            WHERE session_date = ? AND (user_id = ? OR user_id = 8)
            ORDER BY id DESC LIMIT 1
            """,
            (target_date, effective_user_id),
        )
        row = cursor.fetchone()
        if row:
            session_id = row[0]
            cursor.execute(
                "UPDATE sessions SET deck_json = ? WHERE id = ?",
                (raw_json_str, session_id),
            )
        else:
            cursor.execute(
                """
                INSERT INTO sessions (session_date, difficulty_hint, user_id, deck_json)
                VALUES (?, ?, ?, ?)
                """,
                (target_date, session_title or "quick-practice", effective_user_id, raw_json_str),
            )
            session_id = cursor.lastrowid

        # Save full deck JSON into uploaded_decks table in SQLite
        cursor.execute(
            """
            INSERT INTO uploaded_decks (
                session_id, user_id, deck_date, session_name, deck_format, question_count, raw_json
            ) VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (
                session_id,
                effective_user_id,
                target_date,
                session_title or "Daily Interview Revision",
                deck_format,
                len(questions),
                raw_json_str,
            ),
        )
        deck_id = cursor.lastrowid

        inserted_ids = []
        duplicate_count = 0

        for i, q in enumerate(questions):
            q_text = (q.get("question") or q.get("question_text") or "").strip()
            if not q_text:
                continue

            # SQL deduplication check
            cursor.execute(
                """
                SELECT id FROM questions
                WHERE trim(lower(question_text)) = trim(lower(?))
                ORDER BY id ASC LIMIT 1
                """,
                (q_text,),
            )
            existing = cursor.fetchone()
            if existing:
                duplicate_count += 1
                continue

            topic_raw = q.get("topic") or q.get("sub_type") or q.get("subType") or "General"
            topic_str = str(topic_raw).strip()
            title_str = str(q.get("title") or "").strip()

            is_cv = "vision" in topic_str.lower() or "cv" in topic_str.lower()
            category = "cv_skill" if is_cv else "interview"

            diff_raw = str(q.get("difficulty") or "Medium").capitalize()
            difficulty = diff_raw if diff_raw in ["Easy", "Medium", "Hard"] else "Medium"

            q_num = q.get("id") or (i + 1)
            try:
                q_num = int(q_num)
            except Exception:
                q_num = i + 1

            topics_field = topic_str
            if title_str and title_str.lower() not in topic_str.lower():
                topics_field = f"{topic_str},{title_str}"

            # Store individual question raw JSON in questions table
            single_question_json = json.dumps(q, ensure_ascii=False)

            cursor.execute(
                """
                INSERT INTO questions (
                    session_id, question_date, section, number,
                    category, sub_type, difficulty, topics, question_text,
                    question_type, user_id, raw_json
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    session_id,
                    target_date,
                    "Quick Practice",
                    q_num,
                    category,
                    topic_str,
                    difficulty,
                    topics_field,
                    q_text,
                    title_str or topic_str,
                    effective_user_id,
                    single_question_json,
                ),
            )
            new_qid = cursor.lastrowid
            inserted_ids.append(new_qid)

            # Store answer, formula, example, remember tips in session_progress
            ans_text = (q.get("answer") or q.get("model_answer") or "").strip()
            if ans_text:
                extra_parts = []
                if q.get("example"):
                    extra_parts.append(f"Example: {q['example']}")
                if q.get("formula"):
                    form_val = q["formula"]
                    if isinstance(form_val, dict):
                        form_lines = "\n".join(f"{k}: {v}" for k, v in form_val.items())
                        extra_parts.append(f"Formula:\n{form_lines}")
                    else:
                        extra_parts.append(f"Formula: {form_val}")
                if q.get("remember"):
                    rem = q["remember"]
                    if isinstance(rem, list) and rem:
                        extra_parts.append("Key takeaways:\n" + "\n".join(f"- {x}" for x in rem))
                tip = q.get("interview_tip") or q.get("interviewTip")
                if tip:
                    extra_parts.append(f"Interview Tip: {tip}")
                troff = q.get("tradeoffs")
                if isinstance(troff, list) and troff:
                    extra_parts.append("Trade-offs:\n" + "\n".join(f"- {x}" for x in troff))
                chk = q.get("checklist")
                if isinstance(chk, list) and chk:
                    extra_parts.append("Checklist:\n" + "\n".join(f"- {x}" for x in chk))
                stps = q.get("steps")
                if isinstance(stps, list) and stps:
                    extra_parts.append("Steps:\n" + "\n".join(f"- {x}" for x in stps))

                full_answer = ans_text
                if extra_parts:
                    full_answer += "\n\n" + "\n\n".join(extra_parts)

                cursor.execute(
                    """
                    INSERT INTO session_progress (
                        session_date, question_id, question_text, answer_text,
                        category, difficulty, question_type, is_completed, user_id
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        target_date,
                        new_qid,
                        q_text,
                        full_answer,
                        category,
                        difficulty,
                        title_str or topic_str,
                        0,
                        effective_user_id,
                    ),
                )

        conn.commit()
        return {
            "deck_id": deck_id,
            "total": len(questions),
            "inserted": len(inserted_ids),
            "duplicates": duplicate_count,
            "inserted_ids": inserted_ids,
            "session_id": session_id,
            "session_date": target_date,
        }
    finally:
        conn.close()


def fetch_uploaded_decks(user_id: Optional[int] = None) -> List[dict]:
    """Retrieve list of uploaded JSON decks saved in SQLite."""
    conn = sqlite3.connect(get_db_path())
    try:
        cursor = conn.cursor()
        query = "SELECT id, session_id, user_id, deck_date, session_name, deck_format, question_count, created_at FROM uploaded_decks"
        params: list = []
        if user_id is not None:
            query += " WHERE (user_id = ? OR user_id = 8 OR user_id IS NULL)"
            params.append(user_id)
        query += " ORDER BY id DESC"
        cursor.execute(query, params)
        rows = cursor.fetchall()
        return [
            {
                "id": r[0],
                "session_id": r[1],
                "user_id": r[2],
                "deck_date": r[3],
                "session_name": r[4],
                "deck_format": r[5],
                "question_count": r[6],
                "created_at": r[7],
            }
            for r in rows
        ]
    finally:
        conn.close()


def fetch_uploaded_deck_by_id(deck_id: int, user_id: Optional[int] = None) -> Optional[dict]:
    """Retrieve full saved JSON deck from SQLite by ID."""
    conn = sqlite3.connect(get_db_path())
    try:
        cursor = conn.cursor()
        query = "SELECT id, session_id, user_id, deck_date, session_name, deck_format, question_count, raw_json, created_at FROM uploaded_decks WHERE id = ?"
        params: list = [deck_id]
        if user_id is not None:
            query += " AND (user_id = ? OR user_id = 8 OR user_id IS NULL)"
            params.append(user_id)
        cursor.execute(query, params)
        row = cursor.fetchone()
        if not row:
            return None
        return {
            "id": row[0],
            "session_id": row[1],
            "user_id": row[2],
            "deck_date": row[3],
            "session_name": row[4],
            "deck_format": row[5],
            "question_count": row[6],
            "raw_json": json.loads(row[7]) if row[7] else {},
            "created_at": row[8],
        }
    finally:
        conn.close()


def fetch_questions(
    user_id: Optional[int] = None,
    category: Optional[Category] = None,
    session_date: Optional[str] = None,
    topic: Optional[str] = None,
) -> List[QuestionRecord]:
    """Query the questions table with optional filters, scoped to the caller or shared repository."""
    db_path = get_db_path()
    conn = sqlite3.connect(db_path)
    try:
        cursor = conn.cursor()
        query = """
            SELECT id, session_id, question_date, section, number,
                   category, sub_type, difficulty, topics, question_text,
                   user_performance, last_reviewed, question_type
            FROM questions
            WHERE 1=1
        """
        params = []
        if user_id is not None:
            query += " AND (user_id = ? OR user_id = 8 OR user_id IS NULL)"
            params.append(user_id)
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


def fetch_question_by_id(question_id: int) -> Optional[QuestionRecord]:
    """Fetch a single question by primary key ID."""
    db_path = get_db_path()
    conn = sqlite3.connect(db_path)
    try:
        cursor = conn.cursor()
        query = """
            SELECT id, session_id, question_date, section, number,
                   category, sub_type, difficulty, topics, question_text,
                   user_performance, last_reviewed, question_type
            FROM questions
            WHERE id = ?
        """
        cursor.execute(query, (question_id,))
        row = cursor.fetchone()
        if not row:
            return None
        cat_str = row[5]
        try:
            cat_val = Category(cat_str)
        except ValueError:
            cat_val = cat_str

        return QuestionRecord(
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

        per_date: dict = {}
        for d, done in rows:
            agg = per_date.setdefault(d, {"date": d, "answered": 0, "completed": 0})
            agg["answered"] += 1
            agg["completed"] += 1 if done == 1 else 0
        recent_sessions = sorted(per_date.values(), key=lambda a: a["date"], reverse=True)[:10]

        unique_dates = list(set(r[0] for r in rows))
        completed = sum(1 for r in rows if r[1] == 1)

        unique_dates.sort(reverse=True)
        recent_dates = unique_dates[:7]

        return {
            "totalSessions": len(unique_dates),
            "totalAnswered": len(rows),
            "completedAnswers": completed,
            "recentDates": recent_dates,
            "recentSessions": recent_sessions,
        }
    finally:
        conn.close()


## NOTE: There used to be fetch_settings()/save_settings() functions here backing
## a single shared `user_settings` row of AI provider keys. That's gone — keys now
## live only in each browser's localStorage and are sent per-request (see
## modules/common/ai/). The user_settings table above is kept only so
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

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

        cursor.execute("""
            CREATE TABLE IF NOT EXISTS user_settings (
                question_model TEXT NOT NULL,
                answer_model TEXT NOT NULL,
                openai_key TEXT DEFAULT '',
                gemini_key TEXT DEFAULT '',
                anthropic_key TEXT DEFAULT ''
            )
        """)

        # shared sections table (all labs share this)
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS lab_sections (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                lab_name TEXT NOT NULL,
                name TEXT NOT NULL,
                is_custom INTEGER NOT NULL DEFAULT 0,
                UNIQUE(lab_name, name)
            )
        """)

        # ── lab modules: create tables + seed ─────────────────────────────────
        from modules.system_design_lab.schema import register as sd_register
        from modules.cv_lab.schema import register as cv_register
        from modules.dsa_lab.schema import register as dsa_register
        from modules.todo.schema import register as todo_register

        sd_register(cursor)
        cv_register(cursor)
        dsa_register(cursor)
        todo_register(cursor)

        # ── seed lab_sections from topic categories ────────────────────────────
        for lab, table in [
            ("system_design", "system_design_topics"),
            ("cv", "cv_topics"),
            ("dsa", "dsa_topics"),
        ]:
            cursor.execute(f"""
                INSERT OR IGNORE INTO lab_sections (lab_name, name, is_custom)
                SELECT DISTINCT '{lab}', category, 0 FROM {table} WHERE is_custom = 0
            """)
            cursor.execute(f"""
                INSERT OR IGNORE INTO lab_sections (lab_name, name, is_custom)
                SELECT DISTINCT '{lab}', category, 1 FROM {table} WHERE is_custom = 1
            """)

        conn.commit()
    finally:
        conn.close()


def create_session(
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
            INSERT INTO sessions (session_date, difficulty_hint, cv_present, jd_present)
            VALUES (?, ?, ?, ?)
            """,
            (session_date, difficulty_hint, 1 if cv_present else 0, 1 if jd_present else 0),
        )
        conn.commit()
        return cursor.lastrowid
    finally:
        conn.close()


def insert_questions(session_id: int, questions: List[dict]) -> List[int]:
    """Insert a batch of questions under a specific session ID and return their database IDs."""
    db_path = get_db_path()
    conn = sqlite3.connect(db_path)
    try:
        cursor = conn.cursor()
        cursor.execute("SELECT session_date FROM sessions WHERE id = ?", (session_id,))
        row = cursor.fetchone()
        session_date = row[0] if row else date.today().isoformat()

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
                    question_type
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
                ),
            )
            inserted_ids.append(cursor.lastrowid)
        conn.commit()
        return inserted_ids
    finally:
        conn.close()


def fetch_questions(
    category: Optional[Category] = None,
    session_date: Optional[str] = None,
    topic: Optional[str] = None,
) -> List[QuestionRecord]:
    """Query the questions table with optional filters."""
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


def update_question_performance(question_id: int, user_performance: int, last_reviewed: str) -> None:
    """Update user performance and last reviewed date for a specific question."""
    conn = sqlite3.connect(get_db_path())
    try:
        cursor = conn.cursor()
        cursor.execute(
            """
            UPDATE questions
            SET user_performance = ?, last_reviewed = ?
            WHERE id = ?
            """,
            (user_performance, last_reviewed, question_id),
        )
        conn.commit()
    finally:
        conn.close()


def save_session_progress(answers: List[dict]) -> None:
    """Save or update session answers in the progress table."""
    conn = sqlite3.connect(get_db_path())
    try:
        cursor = conn.cursor()
        for answer in answers:
            q_id = answer.get("questionId")
            q_id_val = int(q_id) if q_id is not None and str(q_id).isdigit() else None

            if q_id_val is not None:
                cursor.execute(
                    "SELECT id FROM session_progress WHERE session_date = ? AND question_id = ?",
                    (answer["sessionDate"], q_id_val),
                )
            else:
                cursor.execute(
                    "SELECT id FROM session_progress WHERE session_date = ? AND question_text = ?",
                    (answer["sessionDate"], answer["questionText"]),
                )

            row = cursor.fetchone()
            is_completed_val = 1 if answer.get("isCompleted", False) else 0

            if row:
                cursor.execute(
                    """
                    UPDATE session_progress
                    SET answer_text = ?, is_completed = ?, category = ?, difficulty = ?, question_type = ?
                    WHERE id = ?
                    """,
                    (
                        answer["answerText"],
                        is_completed_val,
                        answer["category"],
                        answer["difficulty"],
                        answer["questionType"],
                        row[0],
                    ),
                )
            else:
                cursor.execute(
                    """
                    INSERT INTO session_progress (
                        session_date, question_id, question_text, answer_text,
                        category, difficulty, question_type, is_completed
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
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
                    ),
                )
        conn.commit()
    finally:
        conn.close()


def fetch_session_progress(session_date: str) -> List[dict]:
    """Retrieve all session progress records for a given date."""
    conn = sqlite3.connect(get_db_path())
    try:
        cursor = conn.cursor()
        cursor.execute(
            """
            SELECT id, session_date, question_id, question_text, answer_text,
                   category, difficulty, question_type, is_completed
            FROM session_progress
            WHERE session_date = ?
            """,
            (session_date,),
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


def fetch_progress_stats() -> dict:
    """Retrieve statistics about session progress."""
    conn = sqlite3.connect(get_db_path())
    try:
        cursor = conn.cursor()
        cursor.execute("SELECT session_date, is_completed FROM session_progress")
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


def fetch_settings() -> dict:
    """Retrieve user configurations, or return defaults if unset."""
    conn = sqlite3.connect(get_db_path())
    try:
        cursor = conn.cursor()
        cursor.execute(
            "SELECT question_model, answer_model, openai_key, gemini_key, anthropic_key FROM user_settings LIMIT 1"
        )
        row = cursor.fetchone()
        if row:
            return {
                "questionModel": row[0],
                "answerModel": row[1],
                "openaiKey": row[2] or "",
                "geminiKey": row[3] or "",
                "anthropicKey": row[4] or "",
            }
        else:
            return {
                "questionModel": "gemini-2.5-flash",
                "answerModel": "gemini-2.5-flash",
                "openaiKey": "",
                "geminiKey": "",
                "anthropicKey": "",
            }
    finally:
        conn.close()


def save_settings(settings: dict) -> None:
    """Save or update user configurations."""
    conn = sqlite3.connect(get_db_path())
    try:
        cursor = conn.cursor()
        cursor.execute("DELETE FROM user_settings")
        cursor.execute(
            """
            INSERT INTO user_settings (question_model, answer_model, openai_key, gemini_key, anthropic_key)
            VALUES (?, ?, ?, ?, ?)
            """,
            (
                settings["questionModel"],
                settings["answerModel"],
                settings.get("openaiKey", ""),
                settings.get("geminiKey", ""),
                settings.get("anthropicKey", ""),
            ),
        )
        conn.commit()
    finally:
        conn.close()


def fetch_lab_sections(lab_name: str) -> List[dict]:
    """Retrieve all sections for a specific lab."""
    conn = sqlite3.connect(get_db_path())
    try:
        cursor = conn.cursor()
        cursor.execute(
            """
            SELECT id, lab_name, name, is_custom
            FROM lab_sections
            WHERE lab_name = ?
            ORDER BY is_custom ASC, id ASC
            """,
            (lab_name,)
        )
        rows = cursor.fetchall()
        return [{"id": r[0], "labName": r[1], "name": r[2], "isCustom": bool(r[3])} for r in rows]
    finally:
        conn.close()


def save_lab_section(lab_name: str, name: str, is_custom: int = 1) -> None:
    """Save a new lab section."""
    conn = sqlite3.connect(get_db_path())
    try:
        cursor = conn.cursor()
        cursor.execute(
            """
            INSERT OR IGNORE INTO lab_sections (lab_name, name, is_custom)
            VALUES (?, ?, ?)
            """,
            (lab_name, name, is_custom)
        )
        conn.commit()
    finally:
        conn.close()

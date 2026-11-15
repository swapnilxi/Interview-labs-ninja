from __future__ import annotations

import sqlite3
from pathlib import Path

from modules.common.topic_lab import create_topics_table, load_seed_topics, seed_topics

# The Finance Lab's topics. Seed data lives in topics.json, which the Next.js twin (frontend/fe-apis/labs/) also reads.
TABLE = "finance_topics"
SEED_PATH = Path(__file__).with_name("topics.json")


def register(cursor: sqlite3.Cursor) -> None:
    """Create the table and add any seed topic not in it yet. Called from init_db."""
    create_topics_table(cursor, TABLE)
    seed_topics(cursor, TABLE, load_seed_topics(SEED_PATH))

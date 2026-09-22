import sqlite3
from datetime import datetime, timedelta

from modules.common.db import get_db_path

def seed_db():
    conn = sqlite3.connect(get_db_path())
    cursor = conn.cursor()

    # Clear existing tables
    cursor.execute("DELETE FROM sessions")
    cursor.execute("DELETE FROM questions")
    cursor.execute("DELETE FROM session_progress")
    cursor.execute("DELETE FROM user_settings")
    conn.commit()

    print("Cleared existing tables.")

    # Dates
    today = datetime.now().date()
    date_1 = (today - timedelta(days=9)).isoformat()
    date_2 = (today - timedelta(days=6)).isoformat()
    date_3 = (today - timedelta(days=3)).isoformat()
    date_4 = (today - timedelta(days=1)).isoformat()

    # 1. Insert sessions
    sessions_data = [
        (1, date_1, 'hard', 1, 1),
        (2, date_2, 'medium', 1, 0),
        (3, date_3, 'easy', 0, 1),
        (4, date_4, 'mixed', 0, 0)
    ]
    cursor.executemany(
        """
        INSERT INTO sessions (id, session_date, difficulty_hint, cv_present, jd_present)
        VALUES (?, ?, ?, ?, ?)
        """,
        sessions_data
    )
    print("Inserted mock sessions.")

    # 2. Insert questions with performance metrics and review states
    questions_data = [
        # Session 1 (Date 1 - Hard)
        (1, date_1, 'A', 1, 'interview', 'Data Structures', 'Hard', 'dsa,lru-cache,hash-map',
         'Design and implement an LRU Cache with O(1) time complexity for get and put operations.',
         5, date_1, 'DSA'),
        (1, date_1, 'A', 2, 'interview', 'Large-Scale System Design', 'Hard', 'scalability,load-balancing,redundancy',
         'Design a globally distributed rate-limiting service capable of handling 500k QPS.',
         4, date_1, 'System Design'),
        (1, date_1, 'B', 1, 'cv_skill', 'Classical CV', 'Hard', 'geometry,camera-calibration,epipolar',
         'Derive the fundamental matrix mathematically in stereo vision. How is it related to the essential matrix?',
         3, date_1, 'Stereo Geometry'),
        (1, date_1, 'B', 2, 'cv_skill', 'CV Optimization', 'Hard', 'quantization,edge-inference,tensorrt',
         'Analyze latency trade-offs for 8-bit integer quantization on Transformer-based vision backbones.',
         5, date_1, 'Edge Quantization'),

        # Session 2 (Date 2 - Medium)
        (2, date_2, 'A', 1, 'interview', 'System Design (Mid-Scale)', 'Medium', 'apis,database-schema,sharding',
         'Design a database schema and API endpoints for a collaborative real-time document editor.',
         4, date_2, 'System Design'),
        (2, date_2, 'A', 2, 'interview', 'Algorithms', 'Medium', 'graphs,dijkstra,shortest-path',
         'Implement Dijkstra\'s algorithm for sparse graphs. Analyze its big-O space complexity.',
         5, date_2, 'DSA'),
        (2, date_2, 'B', 1, 'cv_skill', 'Deep Learning Vision', 'Medium', 'object-detection,yolo,anchors',
         'How do multi-scale feature pyramids (FPN) enhance small object detection accuracy in CNNs?',
         4, date_2, 'Object Detection'),
        (2, date_2, 'B', 2, 'cv_skill', 'CV Training Strategy', 'Medium', 'overfitting,regularization,dropout',
         'Explain the mechanism of adversarial validation. How does it diagnose distribution shift?',
         3, date_2, 'ML Validation'),

        # Session 3 (Date 3 - Easy)
        (3, date_3, 'A', 1, 'interview', 'Leadership', 'Easy', 'mentorship,conflict-resolution,culture',
         'Tell me about a time you mentored a junior engineer. What structured growth strategies did you apply?',
         5, date_3, 'Behavioral'),
        (3, date_3, 'B', 1, 'cv_skill', 'Dataset Quality', 'Easy', 'dataset-bias,segmenation,labeling',
         'How do you check for and mitigate labeling class imbalance in semantic segmentation annotations?',
         4, date_3, 'Dataset Bias'),

        # Session 4 (Date 4 - Mixed)
        (4, date_4, 'A', 1, 'interview', 'Data Structures', 'Medium', 'binary-tree,traversal,recursion',
         'Implement a function to find the maximum depth of a binary tree iteratively without recursion.',
         None, None, 'DSA'),
        (4, date_4, 'B', 1, 'cv_skill', 'Deep Learning Vision', 'Hard', 'transformers,attention,vit',
         'Compare structural differences between vision transformers (ViT) and CNNs regarding inductive bias.',
         None, None, 'Attention Models')
    ]
    cursor.executemany(
        """
        INSERT INTO questions (
            session_id, question_date, section, number, category, sub_type,
            difficulty, topics, question_text, user_performance, last_reviewed, question_type
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        questions_data
    )
    print("Inserted mock questions.")

    # 3. Insert session progress (user answer responses)
    progress_data = [
        # Session 1
        (date_1, 1, 'Design and implement an LRU Cache with O(1) time complexity for get and put operations.',
         'I implemented this using a combination of a hash map (for O(1) lookups) and a doubly linked list (for O(1) eviction tracking). Head represents MRU and tail represents LRU.',
         'interview', 'Hard', 'DSA', 1),
        (date_1, 2, 'Design a globally distributed rate-limiting service capable of handling 500k QPS.',
         'I proposed a sliding window counter algorithm backed by Redis Cluster with hash sharding on User IDs to distribute load.',
         'interview', 'Hard', 'System Design', 1),
        (date_1, 3, 'Derive the fundamental matrix mathematically in stereo vision. How is it related to the essential matrix?',
         'I formulated the epipolar constraint equation using camera projection and rotation matrices. F = K_right^-T * E * K_left^-1.',
         'cv_skill', 'Hard', 'Stereo Geometry', 1),

        # Session 2
        (date_2, 5, 'Design a database schema and API endpoints for a collaborative real-time document editor.',
         'Used a PostgreSQL database with a document table, operational transformations (OT) log, and WebSockets to push operations to users.',
         'interview', 'Medium', 'System Design', 1),
        (date_2, 6, 'Implement Dijkstra\'s algorithm for sparse graphs. Analyze its big-O space complexity.',
         'Used an adjacency list and min-priority queue (heap). Time complexity O((V+E)log V). Space complexity is O(V+E) for graph storage.',
         'interview', 'Medium', 'DSA', 1),

        # Session 3
        (date_3, 9, 'Tell me about a time you mentored a junior engineer. What structured growth strategies did you apply?',
         'Established regular 1-on-1 calls, set clear boundaries on core modules, and designed micro-projects that built architectural confidence.',
         'interview', 'Easy', 'Behavioral', 1)
    ]
    cursor.executemany(
        """
        INSERT INTO session_progress (
            session_date, question_id, question_text, answer_text,
            category, difficulty, question_type, is_completed
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """,
        progress_data
    )
    print("Inserted mock session progress.")

    # 4. Insert user settings
    cursor.execute(
        """
        INSERT INTO user_settings (question_model, answer_model, openai_key, gemini_key, anthropic_key)
        VALUES (?, ?, ?, ?, ?)
        """,
        ('gemini-2.5-flash', 'gemini-2.5-pro', 'sk-proj-xxxxxx', 'AIzaSyxxxxxx', 'sk-ant-xxxxxx')
    )
    print("Inserted mock user settings.")

    conn.commit()
    conn.close()
    print("Seeding completed successfully.")

if __name__ == "__main__":
    seed_db()

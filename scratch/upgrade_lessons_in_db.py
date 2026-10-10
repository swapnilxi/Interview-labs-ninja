#!/usr/bin/env python3
"""
scratch/upgrade_lessons_in_db.py
Upgrades all empty/stub lessons in backend/data/lab_ninja.sqlite3
"""
import sys
import os
import sqlite3
import html

sys.path.insert(0, os.path.abspath('backend'))
from scratch.generate_upgrades import get_topic_profile
from modules.ai_lms.visual_engine import generate_native_visual

def build_full_html(title: str, class_name: str, subject_name: str, content: str) -> str:
    profile = get_topic_profile(title, class_name, subject_name, content)
    visual = generate_native_visual(
        {"title": title, "class_name": class_name, "subject_name": subject_name},
        content
    )

    # Render Objectives List
    objs_html = "\n".join([f"      <li>{obj}</li>" for obj in profile["objectives"]])

    # Render Tradeoffs Table
    tradeoff_rows = "\n".join([
        f"""          <tr>
            <td><strong>{dim}</strong></td>
            <td>{app_a}</td>
            <td>{app_b}</td>
            <td>{tradeoff}</td>
          </tr>"""
        for dim, app_a, app_b, tradeoff in profile["tradeoffs"]
    ])

    # Render Quiz Cards
    quiz_cards = []
    for q_idx, q in enumerate(profile["quiz"]):
        opt_buttons = []
        for o_idx, (opt_text, is_correct, explanation) in enumerate(q["options"]):
            is_corr_str = "true" if is_correct else "false"
            clean_exp = explanation.replace("'", "\\'").replace('"', '&quot;')
            opt_buttons.append(
                f"""        <button class="quiz-option-btn" onclick="handleQuiz({q_idx}, {o_idx}, {is_corr_str}, '{clean_exp}')">
          {chr(65 + o_idx)}) {opt_text}
        </button>"""
            )
        opt_html = "\n".join(opt_buttons)
        quiz_cards.append(
            f"""    <div class="quiz-card" id="qcard-{q_idx}">
      <div class="quiz-question">{q_idx + 1}. {q["question"]}</div>
      <div class="quiz-options">
{opt_html}
      </div>
      <div class="quiz-feedback" id="feedback-{q_idx}"></div>
    </div>"""
        )
    quiz_cards_html = "\n\n".join(quiz_cards)

    # Render Takeaways List
    takeaways_html = "\n".join([f"      <li>{item}</li>" for item in profile["takeaways"]])

    return f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{title} | AI LMS</title>
  <style>
    :root {{
      --bg: #0f172a;
      --card: #1e293b;
      --card-hover: #334155;
      --text: #f8fafc;
      --muted: #94a3b8;
      --accent: #38bdf8;
      --primary: #818cf8;
      --success: #34d399;
      --warning: #fbbf24;
      --danger: #f87171;
      --border: #334155;
    }}
    * {{ box-sizing: border-box; margin: 0; padding: 0; }}
    body {{
      background: var(--bg);
      color: var(--text);
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      line-height: 1.65;
      padding: 3rem 1.5rem;
      max-width: 900px;
      margin: 0 auto;
    }}
    header {{
      margin-bottom: 2.5rem;
      border-bottom: 1px solid var(--border);
      padding-bottom: 1.75rem;
    }}
    .badges {{
      display: flex;
      gap: 0.5rem;
      align-items: center;
      margin-bottom: 1rem;
      flex-wrap: wrap;
    }}
    .badge {{
      font-size: 0.75rem;
      font-weight: 700;
      padding: 0.25rem 0.65rem;
      border-radius: 9999px;
      letter-spacing: 0.03em;
      text-transform: uppercase;
    }}
    .badge-class {{
      background: rgba(129, 140, 248, 0.15);
      color: var(--primary);
      border: 1px solid rgba(129, 140, 248, 0.3);
    }}
    .badge-subject {{
      background: rgba(56, 189, 248, 0.15);
      color: var(--accent);
      border: 1px solid rgba(56, 189, 248, 0.3);
    }}
    .badge-time {{
      background: rgba(251, 191, 36, 0.15);
      color: var(--warning);
      border: 1px solid rgba(251, 191, 36, 0.3);
    }}
    .badge-interactive {{
      background: rgba(52, 211, 153, 0.15);
      color: var(--success);
      border: 1px solid rgba(52, 211, 153, 0.3);
    }}
    h1 {{
      font-size: 2.4rem;
      font-weight: 800;
      color: #ffffff;
      letter-spacing: -0.025em;
      margin-bottom: 0.6rem;
      line-height: 1.25;
    }}
    .subtitle {{
      font-size: 1.15rem;
      color: var(--muted);
      line-height: 1.5;
    }}
    .objectives-card {{
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: 0.75rem;
      padding: 1.5rem;
      margin: 2rem 0;
      box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
    }}
    .objectives-title {{
      font-size: 0.95rem;
      font-weight: 700;
      color: var(--accent);
      text-transform: uppercase;
      letter-spacing: 0.05em;
      margin-bottom: 0.75rem;
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }}
    .objectives-list {{
      padding-left: 1.25rem;
      color: #cbd5e1;
    }}
    .objectives-list li {{
      margin-bottom: 0.4rem;
    }}
    section {{
      margin-bottom: 3rem;
    }}
    h2 {{
      font-size: 1.5rem;
      font-weight: 700;
      color: #ffffff;
      margin-bottom: 1rem;
      display: flex;
      align-items: center;
      gap: 0.6rem;
    }}
    h2::before {{
      content: '';
      display: inline-block;
      width: 4px;
      height: 1.2em;
      background: var(--accent);
      border-radius: 2px;
    }}
    p {{
      margin-bottom: 1.2rem;
      color: #cbd5e1;
      font-size: 1.05rem;
      line-height: 1.7;
    }}
    .callout {{
      background: rgba(30, 41, 59, 0.7);
      border-left: 4px solid var(--accent);
      border-radius: 0 0.5rem 0.5rem 0;
      padding: 1.25rem;
      margin: 1.5rem 0;
      color: #e2e8f0;
    }}
    .callout strong {{
      color: var(--accent);
    }}
    pre {{
      background: #020617;
      border: 1px solid var(--border);
      border-radius: 0.5rem;
      padding: 1.25rem;
      overflow-x: auto;
      font-family: 'JetBrains Mono', 'Fira Code', monospace;
      font-size: 0.9rem;
      margin: 1.5rem 0;
      color: #e2e8f0;
      position: relative;
    }}
    .copy-btn {{
      position: absolute;
      top: 0.6rem;
      right: 0.6rem;
      background: #1e293b;
      border: 1px solid var(--border);
      color: var(--muted);
      border-radius: 0.375rem;
      padding: 0.25rem 0.6rem;
      font-size: 0.75rem;
      cursor: pointer;
      font-family: inherit;
      transition: all 0.2s;
    }}
    .copy-btn:hover {{
      background: #334155;
      color: #ffffff;
    }}
    .table-container {{
      overflow-x: auto;
      margin: 1.5rem 0;
      border-radius: 0.5rem;
      border: 1px solid var(--border);
    }}
    table {{
      width: 100%;
      border-collapse: collapse;
      text-align: left;
      font-size: 0.95rem;
    }}
    th {{
      background: #1e293b;
      color: #ffffff;
      padding: 0.75rem 1rem;
      font-weight: 700;
      border-bottom: 1px solid var(--border);
    }}
    td {{
      padding: 0.75rem 1rem;
      border-bottom: 1px solid rgba(51, 65, 85, 0.5);
      color: #cbd5e1;
    }}
    tr:last-child td {{ border-bottom: none; }}
    tr:hover td {{ background: rgba(30, 41, 59, 0.5); }}
    .quiz-section {{
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: 0.75rem;
      padding: 1.75rem;
      margin-top: 3rem;
    }}
    .quiz-header {{
      font-size: 1.25rem;
      font-weight: 700;
      color: var(--accent);
      margin-bottom: 1.25rem;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 0.5rem;
      flex-wrap: wrap;
    }}
    .quiz-score-badge {{
      font-size: 0.8rem;
      font-weight: 700;
      padding: 0.2rem 0.6rem;
      border-radius: 9999px;
      background: rgba(56, 189, 248, 0.15);
      color: var(--accent);
      border: 1px solid rgba(56, 189, 248, 0.3);
    }}
    .quiz-card {{
      background: #0f172a;
      border: 1px solid var(--border);
      border-radius: 0.5rem;
      padding: 1.25rem;
      margin-bottom: 1.25rem;
    }}
    .quiz-question {{
      font-weight: 600;
      margin-bottom: 1rem;
      color: #ffffff;
      font-size: 1rem;
    }}
    .quiz-options {{
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
    }}
    .quiz-option-btn {{
      background: #1e293b;
      border: 1px solid var(--border);
      color: #cbd5e1;
      padding: 0.75rem 1rem;
      border-radius: 0.375rem;
      text-align: left;
      cursor: pointer;
      font-size: 0.95rem;
      transition: all 0.2s;
    }}
    .quiz-option-btn:hover {{
      border-color: var(--accent);
      color: #ffffff;
      background: #273549;
    }}
    .quiz-feedback {{
      margin-top: 0.75rem;
      padding: 0.75rem 1rem;
      border-radius: 0.375rem;
      font-size: 0.9rem;
      display: none;
    }}
    .takeaways-card {{
      background: rgba(30, 41, 59, 0.5);
      border: 1px solid var(--border);
      border-radius: 0.75rem;
      padding: 1.5rem;
      margin-top: 2rem;
    }}
    .takeaways-title {{
      font-size: 1rem;
      font-weight: 700;
      color: var(--success);
      margin-bottom: 0.75rem;
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }}
    .takeaways-list {{
      padding-left: 1.25rem;
      color: #cbd5e1;
    }}
    .takeaways-list li {{
      margin-bottom: 0.4rem;
    }}
  </style>
</head>
<body>
  <header>
    <div class="badges">
      <span class="badge badge-class">{class_name}</span>
      <span class="badge badge-subject">{subject_name}</span>
      <span class="badge badge-time">⏱️ 8 min read</span>
      <span class="badge badge-interactive">⚡ Interactive Simulation</span>
    </div>
    <h1>{title}</h1>
    <div class="subtitle">{profile["subtitle"]}</div>
  </header>

  <div class="objectives-card">
    <div class="objectives-title">🎯 Core Learning Objectives</div>
    <ul class="objectives-list">
{objs_html}
    </ul>
  </div>

  <section>
    <h2>Core Concepts & Fundamentals</h2>
    {profile["concepts_html"]}
    <div class="callout">
      <strong>{profile["callout_title"]}:</strong> {profile["callout_text"]}
    </div>
  </section>

  <!-- Interactive Visual Reinforcement -->
  <section>
    <h2>Visual & Interactive Reinforcement</h2>
    <p>Engage directly with this interactive simulation widget to build an intuitive mental model:</p>
    {visual["visual_html"]}
  </section>

  <section>
    <h2>Deep Dive & System Mechanics</h2>
    <p>In production engineering, selecting the right pattern requires analyzing critical operational trade-offs across dimensions:</p>
    <div class="table-container">
      <table>
        <thead>
          <tr>
            <th>Dimension</th>
            <th>Primary Pattern</th>
            <th>Alternative Pattern</th>
            <th>Critical Trade-Off</th>
          </tr>
        </thead>
        <tbody>
{tradeoff_rows}
        </tbody>
      </table>
    </div>
  </section>

  <section>
    <h2>Production Implementation Pattern</h2>
    <p>Below is a production-grade TypeScript implementation illustrating the core architectural mechanics:</p>
    <pre><code><button class="copy-btn" onclick="navigator.clipboard.writeText(this.parentElement.innerText); this.innerText='Copied!'; setTimeout(() => this.innerText='Copy', 2000)">Copy</button>{html.escape(profile["code"])}</code></pre>
  </section>

  <!-- Interactive Knowledge Check Quiz -->
  <div class="quiz-section">
    <div class="quiz-header">
      <span>🧠 Interactive Knowledge Check</span>
      <span class="quiz-score-badge" id="quizScoreBadge">Score: 0 / {len(profile["quiz"])}</span>
    </div>
    
{quiz_cards_html}
  </div>

  <div class="takeaways-card">
    <div class="takeaways-title">🏁 Key Takeaways & Checklist</div>
    <ul class="takeaways-list">
{takeaways_html}
    </ul>
  </div>

  <script>
    let answered = 0;
    let correctCount = 0;
    const totalQ = {len(profile["quiz"])};

    function handleQuiz(qIdx, optIdx, isCorrect, explanation) {{
      const card = document.getElementById('qcard-' + qIdx);
      const fb = document.getElementById('feedback-' + qIdx);
      const btns = card.querySelectorAll('.quiz-option-btn');
      btns.forEach((btn, idx) => {{
        btn.disabled = true;
        btn.style.cursor = 'default';
        if (idx === optIdx) {{
          btn.style.borderColor = isCorrect ? '#22c55e' : '#ef4444';
          btn.style.background = isCorrect ? 'rgba(34, 197, 94, 0.2)' : 'rgba(239, 68, 68, 0.2)';
          btn.style.color = '#ffffff';
        }}
      }});
      fb.style.display = 'block';
      fb.style.background = isCorrect ? 'rgba(34, 197, 94, 0.15)' : 'rgba(239, 68, 68, 0.15)';
      fb.style.color = isCorrect ? '#4ade80' : '#f87171';
      fb.style.border = '1px solid ' + (isCorrect ? '#22c55e' : '#ef4444');
      fb.innerHTML = (isCorrect ? '<strong>Correct!</strong> ' : '<strong>Incorrect.</strong> ') + explanation;

      answered++;
      if (isCorrect) correctCount++;
      const scoreBadge = document.getElementById('quizScoreBadge');
      if (scoreBadge) {{
        scoreBadge.innerText = 'Score: ' + correctCount + ' / ' + totalQ + ' (' + Math.round((correctCount / totalQ) * 100) + '%)';
        if (correctCount === totalQ) {{
          scoreBadge.style.background = 'rgba(34, 197, 94, 0.2)';
          scoreBadge.style.color = '#4ade80';
          scoreBadge.style.borderColor = 'rgba(34, 197, 94, 0.4)';
        }}
      }}
    }}
  </script>
</body>
</html>"""

def upgrade_database_lessons():
    conn = sqlite3.connect('backend/data/lab_ninja.sqlite3')
    cur = conn.cursor()

    rows = cur.execute("""
        SELECT l.id, l.title, l.source_content, c.name, COALESCE(s.name, 'General')
        FROM lms_lessons l
        LEFT JOIN lms_classes c ON l.class_id = c.id
        LEFT JOIN lms_subjects s ON l.subject_id = s.id
        WHERE length(l.generated_html) < 800
    """).fetchall()

    print(f"Found {len(rows)} lessons needing HTML structure upgrade.")
    for lid, title, content, cname, sname in rows:
        c_name = cname or "Engineering"
        s_name = sname or "General"
        new_html = build_full_html(title, c_name, s_name, content or title)
        cur.execute("UPDATE lms_lessons SET generated_html = ?, updated_at = datetime('now') WHERE id = ?", (new_html, lid))
        print(f"✔ Upgraded {lid}: '{title}' ({len(new_html)} bytes)")

    conn.commit()
    conn.close()
    print("Database upgrade complete!")

if __name__ == '__main__':
    upgrade_database_lessons()

/**
 * fe-apis/lms/seed.ts
 *
 * Seeds initial classes, subjects, and rich interactive lessons into the SQLite database.
 * Matches ByteByteGo / NeetCode modern technical design aesthetics.
 */

export function seedInitialLmsContent(db: any): void {
  const lessonCountRow = db.prepare('SELECT count(*) as count FROM lms_lessons').get() as { count: number };
  if (lessonCountRow && lessonCountRow.count > 0) {
    return; // Already seeded
  }

  const nowIso = new Date().toISOString();

  // 1. Ensure subjects exist
  const insertSubj = db.prepare(`
    INSERT OR IGNORE INTO lms_subjects (id, class_id, name, slug, description, order_index, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  insertSubj.run(
    'subj-distributed-systems',
    'class-system-design',
    'Distributed Systems',
    'distributed-systems',
    'Core patterns, fault tolerance, replication, consensus, and load distribution.',
    0,
    nowIso,
    nowIso
  );

  insertSubj.run(
    'subj-databases-caching',
    'class-system-design',
    'Databases & Caching',
    'databases-caching',
    'Relational vs NoSQL, indexing strategies, Redis caching patterns, and partitioning.',
    1,
    nowIso,
    nowIso
  );

  insertSubj.run(
    'subj-binary-search',
    'class-dsa-preparation',
    'Binary Search & Pointers',
    'binary-search-pointers',
    'Pointer patterns, logarithmic space elimination, and search boundary invariants.',
    0,
    nowIso,
    nowIso
  );

  insertSubj.run(
    'subj-optimization-dl',
    'class-ai',
    'Optimization & Deep Learning',
    'optimization-deep-learning',
    'Gradient descent dynamics, loss functions, learning rate schedules, and backpropagation.',
    0,
    nowIso,
    nowIso
  );

  // 2. Prepare lesson insert
  const insertLesson = db.prepare(`
    INSERT OR REPLACE INTO lms_lessons (
      id, class_id, subject_id, title, slug, source_type, source_content,
      generated_html, summary, read_time_minutes, order_index, created_at, updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  // HTML Template builder helper
  const createLessonHtml = (opts: {
    title: string;
    classBadge: string;
    subjectBadge: string;
    readTime: string;
    objectives: string[];
    contentHtml: string;
    quizQuestions: {
      question: string;
      options: { text: string; correct: boolean; explanation: string }[];
    }[];
  }) => {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${opts.title}</title>
  <style>
    :root {
      --bg: #0f172a;
      --card: #1e293b;
      --text: #f8fafc;
      --muted: #94a3b8;
      --accent: #38bdf8;
      --primary: #818cf8;
      --success: #34d399;
      --danger: #f87171;
      --border: #334155;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background: var(--bg);
      color: var(--text);
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      line-height: 1.6;
      padding: 2.5rem 1.5rem;
      max-width: 900px;
      margin: 0 auto;
    }
    header { margin-bottom: 2.5rem; border-bottom: 1px solid var(--border); padding-bottom: 1.5rem; }
    .badges { display: flex; gap: 0.5rem; align-items: center; margin-bottom: 0.75rem; flex-wrap: wrap; }
    .badge { font-size: 0.75rem; font-weight: 700; padding: 0.2rem 0.6rem; border-radius: 9999px; text-transform: uppercase; }
    .badge-class { background: rgba(129, 140, 248, 0.15); color: var(--primary); border: 1px solid rgba(129, 140, 248, 0.3); }
    .badge-time { background: rgba(56, 189, 248, 0.15); color: var(--accent); border: 1px solid rgba(56, 189, 248, 0.3); }
    h1 { font-size: 2.25rem; font-weight: 800; color: #ffffff; letter-spacing: -0.025em; margin-bottom: 0.5rem; }
    .objectives { background: var(--card); border: 1px solid var(--border); border-radius: 0.75rem; padding: 1.25rem 1.5rem; margin-bottom: 2.5rem; }
    .objectives h3 { font-size: 1rem; color: var(--accent); margin-bottom: 0.5rem; }
    .objectives ul { padding-left: 1.25rem; color: var(--muted); }
    .objectives li { margin-bottom: 0.25rem; }
    section { margin-bottom: 2.5rem; }
    h2 { font-size: 1.4rem; font-weight: 700; color: #ffffff; margin-bottom: 1rem; border-left: 3px solid var(--accent); padding-left: 0.75rem; }
    p { margin-bottom: 1rem; color: #cbd5e1; font-size: 1.05rem; }
    pre { background: #020617; border: 1px solid var(--border); border-radius: 0.5rem; padding: 1.25rem; overflow-x: auto; font-family: monospace; font-size: 0.9rem; margin: 1.5rem 0; color: #e2e8f0; position: relative; }
    .copy-btn { position: absolute; top: 0.5rem; right: 0.5rem; background: #1e293b; border: 1px solid var(--border); color: var(--muted); border-radius: 0.25rem; padding: 0.2rem 0.5rem; font-size: 0.75rem; cursor: pointer; }
    .copy-btn:hover { color: #ffffff; }
    .quiz-container { background: var(--card); border: 1px solid var(--border); border-radius: 0.75rem; padding: 1.5rem; margin-top: 2.5rem; }
    .quiz-title { font-size: 1.2rem; font-weight: 700; color: var(--accent); margin-bottom: 1rem; }
    .quiz-card { background: #0f172a; border: 1px solid var(--border); border-radius: 0.5rem; padding: 1.25rem; margin-bottom: 1rem; }
    .quiz-q { font-weight: 600; margin-bottom: 0.75rem; color: #ffffff; }
    .quiz-opts { display: flex; flex-direction: column; gap: 0.5rem; }
    .quiz-btn { background: #1e293b; border: 1px solid var(--border); color: #cbd5e1; padding: 0.6rem 1rem; border-radius: 0.375rem; text-align: left; cursor: pointer; font-size: 0.9rem; transition: all 0.2s; }
    .quiz-btn:hover { border-color: var(--accent); color: #ffffff; }
    .quiz-feedback { margin-top: 0.75rem; padding: 0.5rem 0.75rem; border-radius: 0.375rem; font-size: 0.85rem; display: none; }
  </style>
</head>
<body>
  <header>
    <div class="badges">
      <span class="badge badge-class">${opts.classBadge}</span>
      <span class="badge badge-class">${opts.subjectBadge}</span>
      <span class="badge badge-time">⏱️ ${opts.readTime}</span>
    </div>
    <h1>${opts.title}</h1>
  </header>

  <div class="objectives">
    <h3>🎯 Learning Objectives</h3>
    <ul>
      ${opts.objectives.map((o) => `<li>${o}</li>`).join('')}
    </ul>
  </div>

  ${opts.contentHtml}

  <div class="quiz-container">
    <div class="quiz-title">🧠 Interactive Knowledge Check</div>
    ${opts.quizQuestions
      .map(
        (q, qIdx) => `
      <div class="quiz-card" id="qcard-${qIdx}">
        <div class="quiz-q">${qIdx + 1}. ${q.question}</div>
        <div class="quiz-opts">
          ${q.options
            .map(
              (opt, optIdx) => `
            <button class="quiz-btn" onclick="checkAnswer(${qIdx}, ${optIdx}, ${opt.correct}, '${encodeURIComponent(opt.explanation)}')">
              ${opt.text}
            </button>
          `
            )
            .join('')}
        </div>
        <div class="quiz-feedback" id="feedback-${qIdx}"></div>
      </div>
    `
      )
      .join('')}
  </div>

  <script>
    function checkAnswer(qIdx, optIdx, isCorrect, encExp) {
      const card = document.getElementById('qcard-' + qIdx);
      const fb = document.getElementById('feedback-' + qIdx);
      const exp = decodeURIComponent(encExp);
      const btns = card.querySelectorAll('.quiz-btn');
      btns.forEach((btn, idx) => {
        btn.disabled = true;
        btn.style.cursor = 'default';
        if (idx === optIdx) {
          btn.style.borderColor = isCorrect ? '#22c55e' : '#ef4444';
          btn.style.background = isCorrect ? 'rgba(34, 197, 94, 0.2)' : 'rgba(239, 68, 68, 0.2)';
        }
      });
      fb.style.display = 'block';
      fb.style.background = isCorrect ? 'rgba(34, 197, 94, 0.15)' : 'rgba(239, 68, 68, 0.15)';
      fb.style.color = isCorrect ? '#4ade80' : '#f87171';
      fb.style.border = '1px solid ' + (isCorrect ? '#22c55e' : '#ef4444');
      fb.innerHTML = (isCorrect ? '<strong>Correct!</strong> ' : '<strong>Incorrect.</strong> ') + exp;
    }
  </script>
</body>
</html>`;
  };

  // ───────────────────────────────────────────────────────────────────────────
  // Lesson 1: Load Balancer
  // ───────────────────────────────────────────────────────────────────────────
  insertLesson.run(
    'lesson-load-balancer-traffic',
    'class-system-design',
    'subj-distributed-systems',
    'How a Load Balancer Distributes Traffic',
    'how-a-load-balancer-distributes-traffic',
    'topic',
    'Load balancing algorithms, Layer 4 vs Layer 7, and high-availability cluster topology.',
    createLessonHtml({
      title: 'How a Load Balancer Distributes Traffic',
      classBadge: 'System Design',
      subjectBadge: 'Distributed Systems',
      readTime: '6 min read',
      objectives: [
        'Understand the role of reverse proxies and load balancers in horizontal scaling',
        'Compare Layer 4 (Transport) vs Layer 7 (Application) routing algorithms',
        'Analyze health checks, session persistence, and failover mechanics',
      ],
      contentHtml: `
        <section>
          <h2>The Fundamental Problem: Horizontal Scaling</h2>
          <p>When a web service scales beyond the capacity of a single machine, we scale horizontally by provisioning multiple server replicas. However, clients must not need to know individual server IP addresses. A <strong>Load Balancer</strong> serves as the single public entry point (reverse proxy), distributing incoming request traffic evenly across the healthy server pool.</p>
        </section>

        <section>
          <h2>Interactive Architectural Simulation</h2>
          <p>Interact with the live topology below. Click <strong>Send Request</strong> to observe round-robin dispatching, or toggle server health to see automatic bypass:</p>
          <div style="background: #1e293b; border-radius: 0.75rem; padding: 1.25rem; border: 1px solid #334155; margin: 1.5rem 0;">
            <svg id="archSvg" viewBox="0 0 720 240" style="width: 100%; height: auto; display: block;">
              <defs>
                <linearGradient id="blueG" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#0284c7"/><stop offset="100%" stop-color="#0369a1"/></linearGradient>
                <linearGradient id="purpleG" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#7c3aed"/><stop offset="100%" stop-color="#5b21b6"/></linearGradient>
              </defs>
              <path d="M 120 120 L 260 120" stroke="#475569" stroke-width="2" stroke-dasharray="4" fill="none"/>
              <path d="M 370 120 C 420 120, 430 50, 490 50" stroke="#475569" stroke-width="2" fill="none"/>
              <path d="M 370 120 L 490 120" stroke="#475569" stroke-width="2" fill="none"/>
              <path d="M 370 120 C 420 120, 430 190, 490 190" stroke="#475569" stroke-width="2" fill="none"/>
              <circle id="pkt" cx="120" cy="120" r="5" fill="#38bdf8" style="opacity: 0;"/>
              <g transform="translate(20, 80)"><rect width="100" height="80" rx="8" fill="url(#blueG)"/><text x="50" y="45" text-anchor="middle" fill="#fff" font-size="12" font-weight="700">Clients</text></g>
              <g transform="translate(260, 80)"><rect width="110" height="80" rx="8" fill="url(#purpleG)"/><text x="55" y="45" text-anchor="middle" fill="#fff" font-size="12" font-weight="700">Load Balancer</text></g>
              <g id="s1" transform="translate(490, 20)"><rect width="120" height="60" rx="6" fill="#334155"/><circle cx="16" cy="16" r="4" fill="#22c55e"/><text x="28" y="20" fill="#fff" font-size="11">App Server 1</text></g>
              <g id="s2" transform="translate(490, 90)"><rect width="120" height="60" rx="6" fill="#334155"/><circle id="s2Dot" cx="16" cy="16" r="4" fill="#22c55e"/><text id="s2Txt" x="28" y="20" fill="#fff" font-size="11">App Server 2</text></g>
              <g id="s3" transform="translate(490, 160)"><rect width="120" height="60" rx="6" fill="#334155"/><circle cx="16" cy="16" r="4" fill="#22c55e"/><text x="28" y="20" fill="#fff" font-size="11">App Server 3</text></g>
            </svg>
            <div style="display: flex; gap: 0.5rem; justify-content: center; margin-top: 1rem;">
              <button onclick="sendReq()" style="background: #0284c7; color: white; border: none; padding: 0.4rem 1rem; border-radius: 0.375rem; cursor: pointer; font-weight: 600;">🚀 Send Request</button>
              <button onclick="toggleS2()" id="btnS2" style="background: #334155; color: white; border: 1px solid #475569; padding: 0.4rem 1rem; border-radius: 0.375rem; cursor: pointer;">⚠️ Toggle Server 2</button>
            </div>
            <div id="statusTxt" style="text-align: center; font-size: 0.85rem; color: #94a3b8; margin-top: 0.75rem;">Cluster Healthy (Round Robin)</div>
          </div>
          <script>
            let idx = 0; let s2Ok = true;
            function sendReq() {
              const targets = [50, s2Ok ? 120 : 190, 190];
              const tgt = targets[idx % targets.length];
              idx++;
              const p = document.getElementById('pkt');
              p.style.opacity = '1';
              let step = 0;
              const t = setInterval(() => {
                step += 0.05;
                if (step <= 0.5) {
                  p.setAttribute('cx', 120 + (step * 280));
                  p.setAttribute('cy', 120);
                } else if (step <= 1) {
                  const pr = (step - 0.5) * 2;
                  p.setAttribute('cx', 260 + (pr * 230));
                  p.setAttribute('cy', 120 + (pr * (tgt - 120)));
                } else {
                  clearInterval(t);
                  p.style.opacity = '0';
                }
              }, 20);
            }
            function toggleS2() {
              s2Ok = !s2Ok;
              document.getElementById('s2Dot').setAttribute('fill', s2Ok ? '#22c55e' : '#ef4444');
              document.getElementById('s2Txt').innerText = s2Ok ? 'App Server 2' : 'Server 2 (DOWN)';
              document.getElementById('statusTxt').innerText = s2Ok ? 'Cluster Healthy (Round Robin)' : 'Server 2 Bypassed (Traffic rerouted)';
            }
          </script>
        </section>

        <section>
          <h2>Layer 4 vs Layer 7 Load Balancing</h2>
          <p><strong>Layer 4 (Transport Layer):</strong> Operates strictly at TCP/UDP levels without inspecting HTTP headers or message bodies. Decisions are made using source IP, destination IP, and ports. Extremely high throughput and minimal CPU overhead.</p>
          <p><strong>Layer 7 (Application Layer):</strong> Operates at the HTTP level. Can inspect URL paths (e.g. <code>/api</code> vs <code>/static</code>), cookies, authorization headers, and HTTP methods to make smart routing decisions.</p>
        </section>
      `,
      quizQuestions: [
        {
          question: 'What is the primary operational distinction between Layer 4 and Layer 7 load balancing?',
          options: [
            { text: 'Layer 4 can inspect HTTP cookies and URL paths; Layer 7 cannot.', correct: false, explanation: 'Layer 7 inspects application layer data (HTTP headers, paths), while Layer 4 is limited to IP and TCP/UDP ports.' },
            { text: 'Layer 7 inspects HTTP application content; Layer 4 routes purely based on IP/TCP transport packets.', correct: true, explanation: 'Layer 7 understands HTTP protocols, enabling path-based routing, header rewriting, and SSL termination.' },
            { text: 'Layer 4 only works with IPv4, whereas Layer 7 requires IPv6.', correct: false, explanation: 'IP version is orthogonal to OSI layer routing.' },
          ],
        },
      ],
    }),
    'An introduction to horizontal scaling, Layer 4 vs Layer 7 load balancing, and health check failover mechanics.',
    6,
    0,
    nowIso,
    nowIso
  );

  // ───────────────────────────────────────────────────────────────────────────
  // Lesson 2: Binary Search
  // ───────────────────────────────────────────────────────────────────────────
  insertLesson.run(
    'lesson-binary-search-pointers',
    'class-dsa-preparation',
    'subj-binary-search',
    'Binary Search: Pointer Mechanics & Space Elimination',
    'binary-search-pointer-mechanics',
    'topic',
    'Binary search invariants, pointer convergence, and logarithmic time complexity.',
    createLessonHtml({
      title: 'Binary Search: Pointer Mechanics & Space Elimination',
      classBadge: 'DSA Preparation',
      subjectBadge: 'Binary Search & Pointers',
      readTime: '5 min read',
      objectives: [
        'Master the search space reduction invariant in sorted arrays',
        'Avoid off-by-one errors and integer overflow in midpoint calculation',
        'Visualize step-by-step low, mid, and high pointer movement',
      ],
      contentHtml: `
        <section>
          <h2>The Mental Model: Halving the Universe</h2>
          <p>Binary search solves the lookup problem in sorted sequences by discarding half of the remaining elements in each step. While linear search runs in <strong>O(n)</strong>, binary search runs in <strong>O(log n)</strong> — reducing a search space of 1,000,000 items to at most 20 comparisons.</p>
        </section>

        <section>
          <h2>Clean Implementation Pattern</h2>
          <pre><code>function binarySearch(arr: number[], target: number): number {
  let low = 0;
  let high = arr.length - 1;

  while (low <= high) {
    // Avoid integer overflow: low + Math.floor((high - low) / 2)
    const mid = low + Math.floor((high - low) / 2);

    if (arr[mid] === target) {
      return mid; // Target found
    } else if (arr[mid] < target) {
      low = mid + 1; // Discard left half
    } else {
      high = mid - 1; // Discard right half
    }
  }

  return -1; // Target not found
}</code></pre>
        </section>
      `,
      quizQuestions: [
        {
          question: 'Why is `low + Math.floor((high - low) / 2)` preferred over `Math.floor((low + high) / 2)` in languages with fixed-width integers?',
          options: [
            { text: 'It runs faster on modern CPU registers.', correct: false, explanation: 'The instruction count is roughly identical.' },
            { text: 'It prevents integer overflow when `low + high` exceeds the maximum integer limit.', correct: true, explanation: 'In languages like Java or C++, `low + high` can overflow INT_MAX (2^31 - 1) into negative numbers.' },
            { text: 'It automatically handles floating point round-off.', correct: false, explanation: 'Indices are integers; floating point arithmetic is not involved.' },
          ],
        },
      ],
    }),
    'Master the search space reduction invariant in sorted arrays and eliminate off-by-one errors.',
    5,
    0,
    nowIso,
    nowIso
  );

  // ───────────────────────────────────────────────────────────────────────────
  // Lesson 3: Gradient Descent
  // ───────────────────────────────────────────────────────────────────────────
  insertLesson.run(
    'lesson-gradient-descent-loss',
    'class-ai',
    'subj-optimization-dl',
    'Gradient Descent: Loss Landscapes & Learning Rates',
    'gradient-descent-loss-landscapes',
    'topic',
    'Loss minimization, learning rate hyperparameter tuning, and convergence dynamics.',
    createLessonHtml({
      title: 'Gradient Descent: Loss Landscapes & Learning Rates',
      classBadge: 'AI',
      subjectBadge: 'Optimization & Deep Learning',
      readTime: '7 min read',
      objectives: [
        'Understand the mathematical intuition behind gradient vectors',
        'Analyze the impact of learning rate (overshooting vs slow convergence)',
        'Compare Batch Gradient Descent, Mini-batch, and Stochastic Gradient Descent (SGD)',
      ],
      contentHtml: `
        <section>
          <h2>The Objective: Minimizing Empirical Loss</h2>
          <p>Machine learning models learn by optimizing parameter weights to minimize an empirical loss function <code>J(w)</code>. The <strong>gradient</strong> &nabla;J represents the direction of steepest increase in loss. To reach the minimum, we step in the exact opposite direction: <code>w &larr; w - &alpha;&nabla;J(w)</code>, where <code>&alpha;</code> is the learning rate.</p>
        </section>
      `,
      quizQuestions: [
        {
          question: 'What happens when the learning rate (alpha) is set excessively high?',
          options: [
            { text: 'The model converges instantly to the global optimum.', correct: false, explanation: 'A high learning rate overshoots the minimum.' },
            { text: 'The optimization diverges and loss oscillates or becomes NaN/infinity.', correct: true, explanation: 'Large steps catapult the parameters past the valley floor, causing divergence.' },
            { text: 'The gradient vector becomes zero automatically.', correct: false, explanation: 'The gradient magnitude actually increases as you climb higher up the loss walls.' },
          ],
        },
      ],
    }),
    'Loss minimization, learning rate hyperparameter tuning, and convergence dynamics in neural models.',
    7,
    0,
    nowIso,
    nowIso
  );

  // 3. Seed user progress on the first lesson for Continue Learning
  const insertProg = db.prepare(`
    INSERT OR REPLACE INTO lms_user_progress (id, user_id, lesson_id, completed, last_viewed_at)
    VALUES (?, ?, ?, 1, ?)
  `);
  insertProg.run('prog-seed-1', null, 'lesson-load-balancer-traffic', nowIso);
}

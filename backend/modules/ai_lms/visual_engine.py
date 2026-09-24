"""Native Web Visualization Engine for AI LMS.

Produces zero-dependency, self-contained interactive visual widgets using inline SVG,
HTML5 Canvas, and responsive CSS/JS for technical concepts when external AI calls are
unavailable, rate-limited, or when instant interactive simulations are desired.
"""

import html
from typing import Dict, Any, List, Optional


def generate_native_visual(lesson: Dict[str, Any], focus_concept: str = "") -> Dict[str, Any]:
    """Generate a high-quality interactive visualization tailored to the lesson topic."""
    title = lesson.get("title", "")
    cls_name = lesson.get("class_name", "")
    subj_name = lesson.get("subject_name", "") or ""
    combined = f"{title} {cls_name} {subj_name} {focus_concept}".lower()

    # 1. Algorithm / Search / Pointers Simulation
    if any(k in combined for k in ["search", "binary", "pointer", "array", "sort", "dsa", "leetcode", "tree"]):
        return {
            "visual_type": "Interactive Simulation",
            "title": f"Interactive Pointer Simulation: {title}",
            "explanation": "Step through this interactive array simulation to see how pointers eliminate search space logarithmically in O(log n) time.",
            "visual_html": """<div class="lms-visualizer" style="font-family: system-ui, sans-serif; background: #0f172a; color: #f8fafc; padding: 1.5rem; border-radius: 0.75rem; border: 1px solid #334155;">
  <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem; flex-wrap: wrap; gap: 0.5rem;">
    <div>
      <span style="display: inline-block; padding: 0.2rem 0.6rem; font-size: 0.75rem; font-weight: 700; border-radius: 9999px; background: rgba(56, 189, 248, 0.15); color: #38bdf8; border: 1px solid rgba(56, 189, 248, 0.3);">INTERACTIVE SIMULATOR</span>
      <h3 style="margin: 0.4rem 0 0.1rem 0; font-size: 1.15rem; font-weight: 700; color: #f8fafc;">Binary Search Step Visualizer</h3>
    </div>
    <div style="display: flex; gap: 0.5rem; align-items: center;">
      <label style="font-size: 0.8rem; color: #94a3b8;">Target:</label>
      <select id="simTargetSelect" onchange="resetSearch()" style="background: #1e293b; color: #f8fafc; border: 1px solid #475569; padding: 0.3rem 0.6rem; border-radius: 0.375rem; font-size: 0.85rem;">
        <option value="45" selected>45 (In array)</option>
        <option value="12">12 (Left side)</option>
        <option value="91">91 (Right side)</option>
        <option value="50">50 (Not found)</option>
      </select>
    </div>
  </div>

  <div id="simArrayContainer" style="display: flex; justify-content: center; gap: 0.5rem; margin: 2rem 0 1rem 0; flex-wrap: wrap;">
    <!-- Array elements dynamically rendered -->
  </div>

  <div id="simPointerLabels" style="display: flex; justify-content: center; gap: 0.5rem; margin-bottom: 1.5rem; flex-wrap: wrap;">
    <!-- Pointers dynamically rendered -->
  </div>

  <div id="simStatusBox" style="background: #1e293b; border: 1px solid #334155; padding: 0.85rem 1rem; border-radius: 0.5rem; margin-bottom: 1.25rem; font-size: 0.9rem; line-height: 1.4; color: #cbd5e1;">
    Click <strong>Next Step</strong> to begin the binary search pointer movement.
  </div>

  <div style="display: flex; gap: 0.5rem; justify-content: center; flex-wrap: wrap;">
    <button onclick="stepPrev()" id="simPrevBtn" disabled style="background: #334155; color: #94a3b8; border: none; padding: 0.45rem 1rem; border-radius: 0.375rem; font-weight: 600; cursor: not-allowed; font-size: 0.85rem;">&larr; Prev Step</button>
    <button onclick="stepNext()" id="simNextBtn" style="background: #0284c7; color: white; border: none; padding: 0.45rem 1.25rem; border-radius: 0.375rem; font-weight: 600; cursor: pointer; font-size: 0.85rem; box-shadow: 0 4px 6px -1px rgba(2, 132, 199, 0.3);">&rarr; Next Step</button>
    <button onclick="resetSearch()" style="background: transparent; color: #94a3b8; border: 1px solid #475569; padding: 0.45rem 0.9rem; border-radius: 0.375rem; font-weight: 600; cursor: pointer; font-size: 0.85rem;">&#8634; Reset</button>
  </div>

  <script>
  (function() {
    const arr = [12, 24, 32, 45, 57, 68, 79, 91, 105];
    let low = 0, high = arr.length - 1, mid = -1;
    let history = [];
    let state = 'init';

    function render() {
      const target = parseInt(document.getElementById('simTargetSelect').value, 10);
      const container = document.getElementById('simArrayContainer');
      const pointers = document.getElementById('simPointerLabels');
      if (!container || !pointers) return;

      container.innerHTML = '';
      pointers.innerHTML = '';

      arr.forEach((val, idx) => {
        const isEliminated = (idx < low || idx > high) && state !== 'init';
        const isMid = idx === mid;
        const isMatch = state === 'found' && idx === mid;

        let bg = '#1e293b';
        let border = '#334155';
        let text = '#f8fafc';

        if (isEliminated) {
          bg = '#0f172a';
          border = '#1e293b';
          text = '#475569';
        } else if (isMatch) {
          bg = 'rgba(34, 197, 94, 0.25)';
          border = '#22c55e';
          text = '#4ade80';
        } else if (isMid) {
          bg = 'rgba(56, 189, 248, 0.25)';
          border = '#38bdf8';
          text = '#38bdf8';
        }

        const el = document.createElement('div');
        el.style.cssText = `width: 48px; height: 48px; display: flex; flex-direction: column; align-items: center; justify-content: center; background: ${bg}; border: 2px solid ${border}; border-radius: 0.5rem; font-weight: 700; color: ${text}; transition: all 0.2s ease;`;
        el.innerHTML = `<span>${val}</span><span style="font-size: 0.6rem; color: #64748b; font-weight: 400;">[${idx}]</span>`;
        container.appendChild(el);

        const ptr = document.createElement('div');
        ptr.style.cssText = 'width: 48px; text-align: center; font-size: 0.7rem; font-weight: 700; height: 22px;';
        let ptrTags = [];
        if (idx === low && !isEliminated) ptrTags.push('<span style="color:#60a5fa">L</span>');
        if (idx === mid && !isEliminated) ptrTags.push('<span style="color:#38bdf8">M</span>');
        if (idx === high && !isEliminated) ptrTags.push('<span style="color:#f43f5e">H</span>');
        ptr.innerHTML = ptrTags.join(' ');
        pointers.appendChild(ptr);
      });

      const nextBtn = document.getElementById('simNextBtn');
      const prevBtn = document.getElementById('simPrevBtn');
      if (prevBtn) {
        prevBtn.disabled = history.length === 0;
        prevBtn.style.cursor = history.length === 0 ? 'not-allowed' : 'pointer';
        prevBtn.style.color = history.length === 0 ? '#64748b' : '#f8fafc';
      }
      if (nextBtn) {
        nextBtn.disabled = (state === 'found' || state === 'not_found');
        nextBtn.style.cursor = (state === 'found' || state === 'not_found') ? 'not-allowed' : 'pointer';
      }
    }

    window.resetSearch = function() {
      low = 0; high = arr.length - 1; mid = -1;
      history = [];
      state = 'init';
      document.getElementById('simStatusBox').innerHTML = 'Target chosen. Click <strong>Next Step</strong> to calculate mid point: <code>Math.floor((low + high) / 2)</code>';
      render();
    };

    window.stepNext = function() {
      const target = parseInt(document.getElementById('simTargetSelect').value, 10);
      if (state === 'found' || state === 'not_found') return;

      history.push({ low, high, mid, state });

      if (low > high) {
        state = 'not_found';
        document.getElementById('simStatusBox').innerHTML = `<strong>Search Finished:</strong> <code>low > high</code>. Target <code>${target}</code> does not exist in this array. (Time: O(log n))`;
        render();
        return;
      }

      mid = Math.floor((low + high) / 2);
      const midVal = arr[mid];

      if (midVal === target) {
        state = 'found';
        document.getElementById('simStatusBox').innerHTML = `<strong style="color: #4ade80;">Found Target!</strong> <code>arr[mid] (${midVal}) === ${target}</code> at index <code>[${mid}]</code>.`;
      } else if (midVal < target) {
        document.getElementById('simStatusBox').innerHTML = `<code>arr[mid] (${midVal}) < ${target}</code> &rarr; Target is in the right half. Eliminating left side: <code>low = mid + 1 (${mid + 1})</code>.`;
        low = mid + 1;
      } else {
        document.getElementById('simStatusBox').innerHTML = `<code>arr[mid] (${midVal}) > ${target}</code> &rarr; Target is in the left half. Eliminating right side: <code>high = mid - 1 (${mid - 1})</code>.`;
        high = mid - 1;
      }
      render();
    };

    window.stepPrev = function() {
      if (history.length === 0) return;
      const prev = history.pop();
      low = prev.low;
      high = prev.high;
      mid = prev.mid;
      state = prev.state;
      document.getElementById('simStatusBox').innerHTML = 'Stepped back to previous iteration.';
      render();
    };

    render();
  })();
  </script>
</div>"""
        }

    # 2. Machine Learning / Gradient Descent Simulation
    elif any(k in combined for k in ["gradient", "loss", "machine learning", "neural", "vision", "model", "ai", "optimization"]):
        return {
            "visual_type": "Interactive Simulation",
            "title": f"Gradient Descent Optimization Landscape: {title}",
            "explanation": "Interactive simulation of gradient descent minimizing a convex loss surface. Adjust learning rate and take steps to watch convergence.",
            "visual_html": """<div class="lms-visualizer" style="font-family: system-ui, sans-serif; background: #0f172a; color: #f8fafc; padding: 1.5rem; border-radius: 0.75rem; border: 1px solid #334155;">
  <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem; flex-wrap: wrap; gap: 0.5rem;">
    <div>
      <span style="display: inline-block; padding: 0.2rem 0.6rem; font-size: 0.75rem; font-weight: 700; border-radius: 9999px; background: rgba(168, 85, 247, 0.15); color: #c084fc; border: 1px solid rgba(168, 85, 247, 0.3);">CANVAS SIMULATOR</span>
      <h3 style="margin: 0.4rem 0 0.1rem 0; font-size: 1.15rem; font-weight: 700; color: #f8fafc;">Gradient Descent Loss Curve</h3>
    </div>
    <div style="display: flex; align-items: center; gap: 0.75rem;">
      <span style="font-size: 0.8rem; color: #94a3b8;">Learning Rate (&alpha;):</span>
      <input type="range" id="simLrSlider" min="0.05" max="0.9" step="0.05" value="0.25" oninput="updateLrDisplay(this.value)" style="cursor: pointer; width: 100px;">
      <span id="simLrVal" style="font-size: 0.85rem; font-weight: 700; color: #c084fc; min-width: 32px;">0.25</span>
    </div>
  </div>

  <div style="display: flex; justify-content: center; margin: 1rem 0;">
    <canvas id="mlCanvas" width="560" height="240" style="background: #1e293b; border-radius: 0.5rem; border: 1px solid #334155; width: 100%; max-width: 560px; height: auto;"></canvas>
  </div>

  <div style="display: flex; justify-content: space-between; align-items: center; background: #1e293b; padding: 0.75rem 1rem; border-radius: 0.5rem; margin-bottom: 1.25rem; font-size: 0.85rem; border: 1px solid #334155; flex-wrap: wrap; gap: 0.5rem;">
    <div>Weight (w): <strong id="simWeightReadout" style="color: #38bdf8;">-3.80</strong></div>
    <div>Loss J(w): <strong id="simLossReadout" style="color: #f43f5e;">14.44</strong></div>
    <div>Gradient &part;J/&part;w: <strong id="simGradReadout" style="color: #fbbf24;">-7.60</strong></div>
    <div>Step: <strong id="simStepCount" style="color: #4ade80;">0</strong></div>
  </div>

  <div style="display: flex; gap: 0.5rem; justify-content: center; flex-wrap: wrap;">
    <button onclick="takeStep()" style="background: #7c3aed; color: white; border: none; padding: 0.45rem 1.25rem; border-radius: 0.375rem; font-weight: 600; cursor: pointer; font-size: 0.85rem; box-shadow: 0 4px 6px -1px rgba(124, 58, 237, 0.3);">&darr; Take Step (&Delta;w = -&alpha;&nabla;J)</button>
    <button onclick="autoDescend()" id="simAutoBtn" style="background: #0284c7; color: white; border: none; padding: 0.45rem 1rem; border-radius: 0.375rem; font-weight: 600; cursor: pointer; font-size: 0.85rem;">&#9654; Auto Descend</button>
    <button onclick="resetML()" style="background: transparent; color: #94a3b8; border: 1px solid #475569; padding: 0.45rem 0.9rem; border-radius: 0.375rem; font-weight: 600; cursor: pointer; font-size: 0.85rem;">&#8634; Reset</button>
  </div>

  <script>
  (function() {
    const canvas = document.getElementById('mlCanvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let w = -3.8;
    let stepCount = 0;
    let autoInterval = null;

    function loss(weight) { return weight * weight; }
    function grad(weight) { return 2 * weight; }

    function toCanvasX(weight) { return canvas.width / 2 + (weight * 45); }
    function toCanvasY(lossVal) { return canvas.height - 35 - (lossVal * 9.5); }

    function draw() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      ctx.strokeStyle = '#334155';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(30, canvas.height - 35);
      ctx.lineTo(canvas.width - 30, canvas.height - 35);
      ctx.stroke();

      ctx.fillStyle = '#64748b';
      ctx.font = '10px monospace';
      ctx.fillText('Minimum (w = 0)', canvas.width / 2 - 40, canvas.height - 18);

      ctx.strokeStyle = '#818cf8';
      ctx.lineWidth = 3;
      ctx.beginPath();
      for (let px = -5.0; px <= 5.0; px += 0.1) {
        const cx = toCanvasX(px);
        const cy = toCanvasY(loss(px));
        if (px === -5.0) ctx.moveTo(cx, cy);
        else ctx.lineTo(cx, cy);
      }
      ctx.stroke();

      const curX = toCanvasX(w);
      const curY = toCanvasY(loss(w));

      const slope = grad(w);
      ctx.strokeStyle = 'rgba(251, 191, 36, 0.7)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(curX - 35, curY - (slope * -35 * -0.2));
      ctx.lineTo(curX + 35, curY + (slope * 35 * -0.2));
      ctx.stroke();

      ctx.fillStyle = '#f43f5e';
      ctx.beginPath();
      ctx.arc(curX, curY, 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.stroke();

      document.getElementById('simWeightReadout').innerText = w.toFixed(2);
      document.getElementById('simLossReadout').innerText = loss(w).toFixed(2);
      document.getElementById('simGradReadout').innerText = grad(w).toFixed(2);
      document.getElementById('simStepCount').innerText = stepCount;
    }

    window.updateLrDisplay = function(val) {
      document.getElementById('simLrVal').innerText = val;
    };

    window.takeStep = function() {
      const lr = parseFloat(document.getElementById('simLrSlider').value);
      const g = grad(w);
      w = w - (lr * g);
      stepCount++;
      draw();
    };

    window.autoDescend = function() {
      const btn = document.getElementById('simAutoBtn');
      if (autoInterval) {
        clearInterval(autoInterval);
        autoInterval = null;
        btn.innerText = '▶ Auto Descend';
      } else {
        btn.innerText = '⏸ Pause';
        autoInterval = setInterval(() => {
          if (Math.abs(grad(w)) < 0.05) {
            clearInterval(autoInterval);
            autoInterval = null;
            btn.innerText = '✔ Converged';
            return;
          }
          takeStep();
        }, 300);
      }
    };

    window.resetML = function() {
      if (autoInterval) { clearInterval(autoInterval); autoInterval = null; }
      document.getElementById('simAutoBtn').innerText = '▶ Auto Descend';
      w = -3.8;
      stepCount = 0;
      draw();
    };

    draw();
  })();
  </script>
</div>"""
        }

    # 3. System Design / Architecture / Load Balancer / Distributed Systems
    elif any(k in combined for k in ["load balancer", "reverse proxy", "nginx", "haproxy", "server", "distributed", "microservice", "architecture", "system design", "scalab"]):
        return {
            "visual_type": "Architecture Diagram",
            "title": f"Dynamic Request Flow Architecture: {title}",
            "explanation": "ByteByteGo-style interactive architecture diagram showing client requests routed dynamically across server nodes and persistent data stores.",
            "visual_html": """<div class="lms-visualizer" style="font-family: system-ui, sans-serif; background: #0f172a; color: #f8fafc; padding: 1.5rem; border-radius: 0.75rem; border: 1px solid #334155;">
  <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem; flex-wrap: wrap; gap: 0.5rem;">
    <div>
      <span style="display: inline-block; padding: 0.2rem 0.6rem; font-size: 0.75rem; font-weight: 700; border-radius: 9999px; background: rgba(56, 189, 248, 0.15); color: #38bdf8; border: 1px solid rgba(56, 189, 248, 0.3);">INTERACTIVE TOPOLOGY</span>
      <h3 style="margin: 0.4rem 0 0.1rem 0; font-size: 1.15rem; font-weight: 700; color: #f8fafc;">Dynamic Request-Flow & Load Balancing</h3>
    </div>
    <div style="display: flex; align-items: center; gap: 0.5rem;">
      <span style="display: inline-block; width: 8px; height: 8px; border-radius: 50%; background: #22c55e;"></span>
      <span id="lbStatusBadge" style="font-size: 0.8rem; color: #94a3b8; font-weight: 600;">Cluster: Healthy</span>
    </div>
  </div>

  <!-- SVG Architecture Flow -->
  <div style="background: #1e293b; border-radius: 0.75rem; padding: 1.25rem; border: 1px solid #334155; margin: 1rem 0; position: relative; overflow: hidden;">
    <svg id="archSvg" viewBox="0 0 720 280" style="width: 100%; height: auto; display: block;">
      <defs>
        <linearGradient id="blueGrad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="#0284c7"/>
          <stop offset="100%" stop-color="#0369a1"/>
        </linearGradient>
        <linearGradient id="purpleGrad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="#7c3aed"/>
          <stop offset="100%" stop-color="#5b21b6"/>
        </linearGradient>
        <linearGradient id="nodeGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#334155"/>
          <stop offset="100%" stop-color="#1e293b"/>
        </linearGradient>
        <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="3" result="blur"/>
          <feComposite in="SourceGraphic" in2="blur" operator="over"/>
        </filter>
      </defs>

      <!-- Connections Client -> LB -->
      <path id="pathClientToLb" d="M 120 140 L 260 140" stroke="#475569" stroke-width="2" stroke-dasharray="4" fill="none"/>

      <!-- Connections LB -> Servers -->
      <path id="pathLbToServer1" d="M 370 140 C 420 140, 430 65, 490 65" stroke="#475569" stroke-width="2" fill="none"/>
      <path id="pathLbToServer2" d="M 370 140 L 490 140" stroke="#475569" stroke-width="2" fill="none"/>
      <path id="pathLbToServer3" d="M 370 140 C 420 140, 430 215, 490 215" stroke="#475569" stroke-width="2" fill="none"/>

      <!-- Connections Servers -> DB -->
      <path d="M 610 65 C 650 65, 650 140, 670 140" stroke="#334155" stroke-width="2" fill="none"/>
      <path d="M 610 140 L 670 140" stroke="#334155" stroke-width="2" fill="none"/>
      <path d="M 610 215 C 650 215, 650 140, 670 140" stroke="#334155" stroke-width="2" fill="none"/>

      <!-- Moving Packet Indicator -->
      <circle id="movingPacket" cx="-20" cy="-20" r="6" fill="#38bdf8" filter="url(#glow)" style="transition: opacity 0.2s; opacity: 0;"/>

      <!-- Node: Clients -->
      <g transform="translate(20, 95)">
        <rect width="100" height="90" rx="8" fill="url(#blueGrad)" stroke="#38bdf8" stroke-width="1.5"/>
        <text x="50" y="38" text-anchor="middle" fill="#ffffff" font-size="12" font-weight="700">Clients</text>
        <text x="50" y="56" text-anchor="middle" fill="#bae6fd" font-size="10">Web / Mobile</text>
        <text x="50" y="72" text-anchor="middle" fill="#e0f2fe" font-size="9">10k req/sec</text>
      </g>

      <!-- Node: Load Balancer -->
      <g transform="translate(260, 95)">
        <rect width="110" height="90" rx="8" fill="url(#purpleGrad)" stroke="#c084fc" stroke-width="1.5"/>
        <text x="55" y="36" text-anchor="middle" fill="#ffffff" font-size="12" font-weight="700">Load Balancer</text>
        <text x="55" y="54" text-anchor="middle" fill="#e9d5ff" font-size="10">HAProxy / Nginx</text>
        <text x="55" y="72" text-anchor="middle" fill="#a78bfa" font-size="9">Round Robin</text>
      </g>

      <!-- Server 1 -->
      <g id="serverNode1" transform="translate(490, 30)">
        <rect width="120" height="70" rx="6" fill="url(#nodeGrad)" stroke="#475569" stroke-width="1.5"/>
        <circle cx="20" cy="20" r="4" fill="#22c55e"/>
        <text x="32" y="24" fill="#f8fafc" font-size="11" font-weight="700">App Server 1</text>
        <text x="32" y="44" fill="#94a3b8" font-size="9">CPU: 32% | 12ms</text>
      </g>

      <!-- Server 2 -->
      <g id="serverNode2" transform="translate(490, 105)">
        <rect id="serverRect2" width="120" height="70" rx="6" fill="url(#nodeGrad)" stroke="#475569" stroke-width="1.5"/>
        <circle id="serverStatusDot2" cx="20" cy="20" r="4" fill="#22c55e"/>
        <text x="32" y="24" fill="#f8fafc" font-size="11" font-weight="700">App Server 2</text>
        <text id="serverText2" x="32" y="44" fill="#94a3b8" font-size="9">CPU: 41% | 15ms</text>
      </g>

      <!-- Server 3 -->
      <g id="serverNode3" transform="translate(490, 180)">
        <rect width="120" height="70" rx="6" fill="url(#nodeGrad)" stroke="#475569" stroke-width="1.5"/>
        <circle cx="20" cy="20" r="4" fill="#22c55e"/>
        <text x="32" y="24" fill="#f8fafc" font-size="11" font-weight="700">App Server 3</text>
        <text x="32" y="44" fill="#94a3b8" font-size="9">CPU: 28% | 10ms</text>
      </g>

      <!-- DB / Cache Column -->
      <g transform="translate(670, 95)">
        <rect width="40" height="90" rx="6" fill="#1e293b" stroke="#0284c7" stroke-width="1.5"/>
        <text x="20" y="45" text-anchor="middle" fill="#38bdf8" font-size="10" font-weight="700" transform="rotate(90, 20, 45)">DB / Cache</text>
      </g>
    </svg>
  </div>

  <!-- Metric Readouts -->
  <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 0.75rem; margin-bottom: 1.25rem;">
    <div style="background: #1e293b; padding: 0.75rem; border-radius: 0.5rem; border: 1px solid #334155; text-align: center;">
      <div style="font-size: 0.75rem; color: #94a3b8;">Active Route</div>
      <div id="metricRoute" style="font-size: 0.95rem; font-weight: 700; color: #38bdf8; margin-top: 0.2rem;">Server 1</div>
    </div>
    <div style="background: #1e293b; padding: 0.75rem; border-radius: 0.5rem; border: 1px solid #334155; text-align: center;">
      <div style="font-size: 0.75rem; color: #94a3b8;">Total Requests</div>
      <div id="metricRequests" style="font-size: 0.95rem; font-weight: 700; color: #4ade80; margin-top: 0.2rem;">0</div>
    </div>
    <div style="background: #1e293b; padding: 0.75rem; border-radius: 0.5rem; border: 1px solid #334155; text-align: center;">
      <div style="font-size: 0.75rem; color: #94a3b8;">Distribution</div>
      <div style="font-size: 0.95rem; font-weight: 700; color: #c084fc; margin-top: 0.2rem;">Round Robin</div>
    </div>
  </div>

  <!-- Interactive Controls -->
  <div style="display: flex; gap: 0.5rem; justify-content: center; flex-wrap: wrap;">
    <button onclick="dispatchRequest()" style="background: #0284c7; color: white; border: none; padding: 0.5rem 1.25rem; border-radius: 0.375rem; font-weight: 600; cursor: pointer; font-size: 0.85rem; box-shadow: 0 4px 6px -1px rgba(2, 132, 199, 0.3);">&#128640; Send Request</button>
    <button onclick="toggleServerHealth()" id="btnToggleHealth" style="background: #334155; color: #f8fafc; border: 1px solid #475569; padding: 0.5rem 1rem; border-radius: 0.375rem; font-weight: 600; cursor: pointer; font-size: 0.85rem;">&#9888; Fail Server 2</button>
    <button onclick="toggleAutoTraffic()" id="btnAutoTraffic" style="background: transparent; color: #94a3b8; border: 1px solid #475569; padding: 0.5rem 1rem; border-radius: 0.375rem; font-weight: 600; cursor: pointer; font-size: 0.85rem;">&#9654; Auto Traffic</button>
  </div>

  <script>
  (function() {
    let reqCount = 0;
    let nextServerIdx = 0;
    let server2Healthy = true;
    let autoTimer = null;
    const packet = document.getElementById('movingPacket');

    const serverTargets = [
      { id: 1, name: 'Server 1', y: 65 },
      { id: 2, name: 'Server 2', y: 140 },
      { id: 3, name: 'Server 3', y: 215 },
    ];

    window.dispatchRequest = function() {
      reqCount++;
      document.getElementById('metricRequests').innerText = reqCount;

      let target = serverTargets[nextServerIdx % serverTargets.length];
      if (target.id === 2 && !server2Healthy) {
        nextServerIdx++;
        target = serverTargets[nextServerIdx % serverTargets.length];
      }
      nextServerIdx++;

      document.getElementById('metricRoute').innerText = target.name;

      if (!packet) return;
      packet.style.opacity = '1';
      packet.setAttribute('cx', 120);
      packet.setAttribute('cy', 140);

      let step = 0;
      const anim = setInterval(() => {
        step += 0.05;
        if (step <= 0.45) {
          const cx = 120 + ((step / 0.45) * 140);
          packet.setAttribute('cx', cx);
          packet.setAttribute('cy', 140);
        } else if (step <= 1.0) {
          const progress = (step - 0.45) / 0.55;
          const cx = 260 + (progress * 230);
          const cy = 140 + (progress * (target.y - 140));
          packet.setAttribute('cx', cx);
          packet.setAttribute('cy', cy);
        } else {
          clearInterval(anim);
          packet.style.opacity = '0';
        }
      }, 20);
    };

    window.toggleServerHealth = function() {
      server2Healthy = !server2Healthy;
      const dot = document.getElementById('serverStatusDot2');
      const text = document.getElementById('serverText2');
      const btn = document.getElementById('btnToggleHealth');
      const badge = document.getElementById('lbStatusBadge');

      if (server2Healthy) {
        dot.setAttribute('fill', '#22c55e');
        text.innerText = 'CPU: 41% | 15ms';
        text.setAttribute('fill', '#94a3b8');
        btn.innerText = '⚠ Fail Server 2';
        btn.style.color = '#f8fafc';
        badge.innerText = 'Cluster: Healthy';
        badge.style.color = '#94a3b8';
      } else {
        dot.setAttribute('fill', '#ef4444');
        text.innerText = 'DOWN (Healthcheck 503)';
        text.setAttribute('fill', '#ef4444');
        btn.innerText = '✔ Restore Server 2';
        btn.style.color = '#4ade80';
        badge.innerText = 'Cluster: Degraded (Server 2 Bypassed)';
        badge.style.color = '#fbbf24';
      }
    };

    window.toggleAutoTraffic = function() {
      const btn = document.getElementById('btnAutoTraffic');
      if (autoTimer) {
        clearInterval(autoTimer);
        autoTimer = null;
        btn.innerText = '▶ Auto Traffic';
      } else {
        btn.innerText = '⏸ Pause Traffic';
        autoTimer = setInterval(dispatchRequest, 600);
      }
    };
  })();
  </script>
</div>"""
        }

    # 4. Dynamic Concept Explorer — adapts to ANY topic
    else:
        # Extract first 3-5 meaningful lines from the content as key concepts
        content_lines = [l.strip() for l in (focus_concept or title or "").split("\n") if l.strip()]
        safe_title = html.escape(title or "Core Concept")
        # Generate 4-6 concept items from the title words
        words = [w.capitalize() for w in (title + " " + (focus_concept or "")).replace(",", " ").replace(".", " ").split() if len(w) > 3]
        concept_items = list(dict.fromkeys(words))[:6] or [safe_title]
        concept_items_js = str([html.escape(c) for c in concept_items]).replace('"', "'")

        visual_html = f"""<div class="lms-visualizer" style="font-family: system-ui, sans-serif; background: #0f172a; color: #f8fafc; padding: 1.5rem; border-radius: 0.75rem; border: 1px solid #334155;">
  <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem; flex-wrap: wrap; gap: 0.5rem;">
    <div>
      <span style="display: inline-block; padding: 0.2rem 0.6rem; font-size: 0.75rem; font-weight: 700; border-radius: 9999px; background: rgba(129,140,248,0.15); color: #818cf8; border: 1px solid rgba(129,140,248,0.3);">CONCEPT EXPLORER</span>
      <h3 style="margin: 0.4rem 0 0.1rem 0; font-size: 1.15rem; font-weight: 700; color: #f8fafc;">{html.escape(title)}: Key Concept Map</h3>
    </div>
    <div id="conceptProgress" style="font-size: 0.8rem; color: #94a3b8; font-weight: 600;">Concept 0 / {len(concept_items)}</div>
  </div>

  <canvas id="conceptCanvas" width="700" height="260" style="background: #1e293b; border-radius: 0.75rem; border: 1px solid #334155; width: 100%; max-width: 700px; display: block; margin: 0 auto 1rem;"></canvas>

  <div id="conceptDetail" style="background: #1e293b; border: 1px solid #334155; border-left: 4px solid #818cf8; padding: 0.85rem 1rem; border-radius: 0.5rem; margin-bottom: 1.25rem; font-size: 0.9rem; line-height: 1.5; color: #cbd5e1; min-height: 3.5rem;">
    Click a concept node above or use the buttons below to explore key ideas in <strong style="color:#818cf8;">{html.escape(title)}</strong>.
  </div>

  <div style="display: flex; gap: 0.5rem; justify-content: center; flex-wrap: wrap;">
    <button onclick="prevConcept()" id="btnPrevConcept" style="background: #334155; color: #94a3b8; border: none; padding: 0.45rem 1rem; border-radius: 0.375rem; font-weight: 600; cursor: pointer; font-size: 0.85rem;">&larr; Previous</button>
    <button onclick="nextConcept()" id="btnNextConcept" style="background: #6366f1; color: white; border: none; padding: 0.45rem 1.25rem; border-radius: 0.375rem; font-weight: 600; cursor: pointer; font-size: 0.85rem; box-shadow: 0 4px 6px -1px rgba(99,102,241,0.3);">Next Concept &rarr;</button>
    <button onclick="resetConcepts()" style="background: transparent; color: #94a3b8; border: 1px solid #475569; padding: 0.45rem 0.9rem; border-radius: 0.375rem; font-weight: 600; cursor: pointer; font-size: 0.85rem;">&#8634; Reset</button>
  </div>

  <script>
  (function() {{
    const concepts = {concept_items_js};
    let active = -1;
    const canvas = document.getElementById('conceptCanvas');
    const ctx = canvas.getContext('2d');
    const nodes = [];
    const W = canvas.width, H = canvas.height;
    const cx = W / 2, cy = H / 2;
    const r = Math.min(W, H) * 0.36;

    const descriptions = concepts.map((c, i) => `Key concept [${{i+1}}/${{concepts.length}}]: "${{c}}" is a foundational element of {html.escape(title)}. Understanding this concept builds intuition for the broader subject and connects to real-world applications.`);

    function buildNodes() {{
      nodes.length = 0;
      const count = concepts.length;
      for (let i = 0; i < count; i++) {{
        const angle = (i / count) * Math.PI * 2 - Math.PI / 2;
        nodes.push({{
          x: cx + r * Math.cos(angle),
          y: cy + r * Math.sin(angle),
          label: concepts[i],
          angle
        }});
      }}
    }}

    function draw() {{
      ctx.clearRect(0, 0, W, H);

      // Draw connecting lines
      ctx.strokeStyle = 'rgba(99,102,241,0.2)';
      ctx.lineWidth = 1.5;
      nodes.forEach((n, i) => {{
        nodes.forEach((m, j) => {{
          if (i < j) {{
            ctx.beginPath();
            ctx.moveTo(n.x, n.y);
            ctx.lineTo(m.x, m.y);
            ctx.stroke();
          }}
        }});
      }});

      // Center hub
      const hubGrad = ctx.createRadialGradient(cx, cy, 2, cx, cy, 34);
      hubGrad.addColorStop(0, '#6366f1');
      hubGrad.addColorStop(1, '#4338ca');
      ctx.fillStyle = hubGrad;
      ctx.beginPath();
      ctx.arc(cx, cy, 34, 0, Math.PI*2);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 9px system-ui';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const hubWords = concepts.length > 0 ? ['{html.escape(title[:12])}'] : ['Concepts'];
      hubWords.forEach((w, i) => ctx.fillText(w, cx, cy + (i * 12) - (hubWords.length-1)*6));

      // Draw concept nodes
      nodes.forEach((n, i) => {{
        const isActive = i === active;
        const grad = ctx.createRadialGradient(n.x, n.y, 2, n.x, n.y, 28);
        if (isActive) {{
          grad.addColorStop(0, '#818cf8');
          grad.addColorStop(1, '#6366f1');
        }} else {{
          grad.addColorStop(0, '#334155');
          grad.addColorStop(1, '#1e293b');
        }}
        ctx.fillStyle = grad;
        ctx.strokeStyle = isActive ? '#818cf8' : '#475569';
        ctx.lineWidth = isActive ? 2.5 : 1.5;
        ctx.beginPath();
        ctx.arc(n.x, n.y, 28, 0, Math.PI*2);
        ctx.fill();
        ctx.stroke();

        // Label
        ctx.fillStyle = isActive ? '#fff' : '#cbd5e1';
        ctx.font = isActive ? 'bold 8.5px system-ui' : '8px system-ui';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const words = n.label.split(' ');
        if (words.length > 1) {{
          ctx.fillText(words[0], n.x, n.y - 5);
          ctx.fillText(words.slice(1).join(' '), n.x, n.y + 7);
        }} else {{
          ctx.fillText(n.label, n.x, n.y);
        }}
      }});

      document.getElementById('conceptProgress').innerText = active >= 0 ? `Concept ${{active+1}} / ${{concepts.length}}` : `Concept 0 / ${{concepts.length}}`;
    }}

    canvas.addEventListener('click', function(e) {{
      const rect = canvas.getBoundingClientRect();
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;
      const mx = (e.clientX - rect.left) * scaleX;
      const my = (e.clientY - rect.top) * scaleY;
      let hit = -1;
      nodes.forEach((n, i) => {{
        const dx = mx - n.x, dy = my - n.y;
        if (Math.sqrt(dx*dx + dy*dy) < 30) hit = i;
      }});
      if (hit >= 0) {{
        active = hit;
        document.getElementById('conceptDetail').innerHTML = descriptions[active];
        draw();
      }}
    }});

    window.nextConcept = function() {{
      active = (active + 1) % concepts.length;
      document.getElementById('conceptDetail').innerHTML = descriptions[active];
      draw();
    }};
    window.prevConcept = function() {{
      active = (active - 1 + concepts.length) % concepts.length;
      document.getElementById('conceptDetail').innerHTML = descriptions[active];
      draw();
    }};
    window.resetConcepts = function() {{
      active = -1;
      document.getElementById('conceptDetail').innerHTML = 'Click a concept node above or use the buttons below to explore key ideas in <strong style="color:#818cf8;">{html.escape(title)}</strong>.';
      draw();
    }};

    buildNodes();
    draw();
  }})();
  </script>
</div>"""

        return {
            "visual_type": "Concept Map",
            "title": f"Concept Explorer: {title}",
            "explanation": f"Interactive radial concept map for '{title}'. Click any node or use the navigation buttons to explore each key idea and its relation to the central topic.",
            "visual_html": visual_html,
        }


def _get_topic_profile(title: str, class_name: str, subject_name: str, content: str) -> dict:
    combined = f"{title} {class_name} {subject_name} {content}".lower()

    # 1. Load Balancing & Reverse Proxies
    if any(k in combined for k in ["load balancer", "reverse proxy", "traffic", "nginx", "haproxy", "l4", "l7", "distribution"]):
        return {
            "category": "Load Balancing & Traffic",
            "subtitle": "Architectural principles, routing topologies, and zero-downtime horizontal traffic distribution.",
            "objectives": [
                "Master Layer 4 (Transport / TCP) vs Layer 7 (Application / HTTP) reverse proxy mechanics.",
                "Implement active vs passive health checks, connection draining, and failover pools.",
                "Explore real-time request packet distribution and server failure rerouting via interactive simulation.",
                "Evaluate operational trade-offs across Round Robin, Least Connections, and Consistent Hashing."
            ],
            "concepts_html": """<p>In modern high-scale architectures, single server bottlenecks represent a fatal single point of failure (SPOF). A <strong>Load Balancer</strong> acts as the central traffic controller, sitting between clients and backend worker pools to optimize resource utilization, maximize throughput, and prevent server saturation.</p>
<p>Modern reverse proxies operate at two distinct network layers: <strong>Layer 4 (L4)</strong> which routes raw packets based solely on IP addresses and TCP/UDP ports without inspecting packet payloads, and <strong>Layer 7 (L7)</strong> which terminates TLS handshakes, parses HTTP headers, reads cookies, and executes intelligent path-based routing (e.g. <code>/api</code> vs <code>/static</code>).</p>""",
            "callout_title": "Reverse Proxy Invariant",
            "callout_text": "An effective load balancer must decouple external clients from internal server topologies while guaranteeing sub-millisecond route decisions, proactive node isolation, and zero-downtime rolling deployments.",
            "code_lang": "typescript",
            "code_title": "LoadBalancer.ts",
            "code": """// Production Round-Robin Load Balancer with Health Checks & Circuit Breaking
export interface BackendNode {
  id: string;
  url: string;
  isHealthy: boolean;
  activeRequests: number;
}

export class LoadBalancer {
  private currentIndex = 0;

  constructor(private servers: BackendNode[]) {}

  public getNextServer(): BackendNode {
    const healthyServers = this.servers.filter(s => s.isHealthy);
    if (healthyServers.length === 0) {
      throw new Error("HTTP 503 Service Unavailable: No healthy backend nodes in pool");
    }
    // Round-robin selection across active healthy instances
    const selected = healthyServers[this.currentIndex % healthyServers.length];
    this.currentIndex = (this.currentIndex + 1) % healthyServers.length;
    selected.activeRequests++;
    return selected;
  }

  public reportStatus(id: string, isHealthy: boolean): void {
    const server = this.servers.find(s => s.id === id);
    if (server) {
      server.isHealthy = isHealthy;
    }
  }
}""",
            "tradeoffs": [
                ("Routing Layer", "L4 (Transport / TCP/UDP)", "L7 (Application / HTTP/gRPC)", "Raw packet throughput vs deep header inspection & cookie routing"),
                ("Algorithm", "Round Robin / Random", "Least Connections / Latency", "Zero state overhead vs optimal balancing during uneven task durations"),
                ("Session Affinity", "Sticky Sessions (Cookie-based)", "Stateless Token Architecture", "Cache locality benefits vs server hotspots and uneven node load"),
                ("Health Checking", "Passive (Traffic observation)", "Active (Periodic synthetic ping)", "Zero synthetic bandwidth vs delayed failure detection")
            ],
            "quiz": [
                {
                    "question": "What happens when an upstream server in a load balancer pool fails consecutive health checks?",
                    "options": [
                        ("The load balancer immediately marks it unhealthy and routes incoming requests only to surviving nodes.", True, "Active health checks prevent blackholing client traffic by immediately rerouting to healthy nodes."),
                        ("The load balancer halts all incoming traffic to prevent cluster inconsistencies.", False, "Halting all traffic causes a complete outage, which violates high availability."),
                        ("The load balancer retries the failed node infinitely without timeout.", False, "Infinite retries exhaust client connections and trigger cascading request timeouts.")
                    ]
                },
                {
                    "question": "Why is Layer 7 (L7) load balancing computationally more resource-intensive than Layer 4 (L4)?",
                    "options": [
                        ("L7 must fully parse HTTP headers, TLS handshakes, cookies, and URI paths before routing.", True, "L7 operates at the application layer, requiring TCP termination and full payload/header inspection."),
                        ("L7 operates purely on MAC addresses in kernel memory space.", False, "Layer 2 operates on MAC addresses; L7 operates on application protocols like HTTP and gRPC."),
                        ("L7 cannot use hardware acceleration under any circumstances.", False, "L7 can utilize TLS offloading chips, but payload parsing still requires substantial CPU cycles.")
                    ]
                }
            ],
            "takeaways": [
                "Always run load balancers in an Active-Passive or Anycast Active-Active pair to avoid single points of failure (SPOF).",
                "Prefer stateless application servers so any replica can handle any user request seamlessly.",
                "Tune connection timeouts and circuit breakers so slow upstreams are isolated before thread pools exhaust.",
                "Use L7 when microservices require path-based routing (/api vs /static) or JWT header inspection."
            ]
        }

    # 2. CAP Theorem & Distributed Systems
    if any(k in combined for k in ["cap theorem", "cap", "consistency", "partition", "consensus", "paxos", "raft", "brewer"]):
        return {
            "category": "Distributed Consensus & Trade-Offs",
            "subtitle": "Brewer's theorem, PACELC model, quorum mechanics, and partition resilience.",
            "objectives": [
                "Understand why Network Partition tolerance (P) is mandatory across asynchronous networks.",
                "Explore the PACELC extension: If Partition (A vs C), Else (Latency vs Consistency).",
                "Analyze quorum read/write equations (R + W > N) guaranteeing strong consistency.",
                "Compare CP architectures (Raft, ZooKeeper, etcd) with AP systems (Cassandra, DynamoDB)."
            ],
            "concepts_html": """<p>Formulated by Eric Brewer, the <strong>CAP Theorem</strong> proves that a distributed data store can simultaneously guarantee at most two out of three guarantees: <strong>Consistency (C)</strong>, <strong>Availability (A)</strong>, and <strong>Partition Tolerance (P)</strong>.</p>
<p>Because physical network switches, undersea cables, and cloud instances inevitably drop packets or experience latency spikes, <strong>Partition Tolerance is non-negotiable</strong>. Therefore, when a network partition strikes, architects face a binary trade-off: fail the request to preserve strict linearizability (CP), or accept the write and return potentially stale data to keep the system online (AP).</p>""",
            "callout_title": "PACELC Rule of Thumb",
            "callout_text": "Even during normal operating conditions without network partitions, distributed systems must trade off Latency (L) against Consistency (C). Fast responses require local caching or asynchronous replication.",
            "code_lang": "typescript",
            "code_title": "QuorumConsensus.ts",
            "code": """// Quorum Consensus Validator: R + W > N guarantees Strong Consistency
export class QuorumCluster {
  constructor(public readonly totalNodes: number) {}

  public isStronglyConsistent(readQuorum: number, writeQuorum: number): boolean {
    // If the read and write quorums overlap by at least 1 node,
    // the read set is guaranteed to observe the latest write.
    return (readQuorum + writeQuorum) > this.totalNodes;
  }

  public getRecommendedQuorums(): { R: number; W: number } {
    const majority = Math.floor(this.totalNodes / 2) + 1;
    return { R: majority, W: majority };
  }
}""",
            "tradeoffs": [
                ("Guarantees", "CP (Consistency + Partition Tolerance)", "AP (Availability + Partition Tolerance)", "Strict linearizability vs 100% operational uptime"),
                ("Typical Engines", "etcd, ZooKeeper, CockroachDB, Raft", "Amazon DynamoDB, Apache Cassandra, Couchbase", "Consensus round-trips vs eventual convergence (vector clocks)"),
                ("Normal State (Else)", "Low Latency (Eventual)", "Strong Consistency", "PACELC: trade read latency for guaranteed fresh data"),
                ("Failure Behavior", "Returns Error / Waits for Consensus", "Returns Stale / Degraded Data", "Fail-stop semantics vs graceful degradation under load")
            ],
            "quiz": [
                {
                    "question": "Why is 'CA' (Consistency + Availability without Partition Tolerance) impossible in distributed networks?",
                    "options": [
                        ("Network partitions (cable cuts, latency spikes, switch failures) are an inevitable physical reality.", True, "Because hardware/network partitions cannot be prevented, systems must choose between C and A during a split."),
                        ("Distributed algorithms are mathematically limited to two letters.", False, "The limitation is fundamental to asynchronous network physics, not nomenclature."),
                        ("Relational databases forbid replication across data centers.", False, "RDBMS can replicate, but they sacrifice availability during cross-DC partitions.")
                    ]
                },
                {
                    "question": "In a cluster with N = 5 nodes, which quorum configuration guarantees strong read-your-writes consistency?",
                    "options": [
                        ("Write Quorum W = 3, Read Quorum R = 3 (since 3 + 3 = 6 > 5)", True, "Since R + W > N, at least one node in the read quorum is guaranteed to participate in the write quorum."),
                        ("Write Quorum W = 2, Read Quorum R = 2 (since 2 + 2 = 4 < 5)", False, "With R + W <= N, read and write quorums may not intersect, risking stale reads."),
                        ("Write Quorum W = 1, Read Quorum R = 1", False, "Single node writes and reads provide only eventual consistency.")
                    ]
                }
            ],
            "takeaways": [
                "Assume network partitions will happen; design idempotency and timeout recovery from day one.",
                "Choose CP for financial transactions, authentication tokens, and distributed locking (etcd/ZooKeeper).",
                "Choose AP for social feeds, metrics ingestion, shopping cart items, and high-volume clickstreams.",
                "Leverage the PACELC framework to reason about latency overhead during healthy steady-state operations."
            ]
        }

    # 3. Binary Search & Pointer Elimination
    if any(k in combined for k in ["binary search", "pointer", "logarithmic", "dsa", "search"]):
        return {
            "category": "Algorithmic Complexity & Pointers",
            "subtitle": "Invariants, search space reduction, overflow prevention, and boundary conditions.",
            "objectives": [
                "Master pointer invariants: maintaining the search space boundary low <= high.",
                "Prevent integer overflow bugs using mid = low + ((high - low) >> 1).",
                "Analyze logarithmic time complexity O(log n) through recursive space halving.",
                "Step through interactive array pointer elimination to build intuitive visual memory."
            ],
            "concepts_html": """<p><strong>Binary Search</strong> is the quintessential divide-and-conquer algorithm. Operating on monotonically ordered data, it eliminates half of the remaining candidate elements with a single comparison, achieving optimal <strong>O(log n)</strong> runtime.</p>
<p>The key to mastering binary search and its variations (e.g. search in rotated array, finding boundary elements) lies in rigorously establishing the <strong>Loop Invariant</strong>. At every iteration, the algorithm maintains that if the target exists in the array, it must reside within the closed interval <code>[low, high]</code>.</p>""",
            "callout_title": "The Historic Overflow Bug",
            "callout_text": "In many languages, computing mid as (low + high) / 2 overflows the 32-bit signed integer limit for large arrays (>= 2^30). Always use mid = low + ((high - low) >> 1).",
            "code_lang": "typescript",
            "code_title": "BinarySearch.ts",
            "code": """// Production-Grade Robust Binary Search
export function binarySearch(arr: number[], target: number): number {
  let low = 0;
  let high = arr.length - 1;

  while (low <= high) {
    // Prevent integer overflow and bitwise shift for speed
    const mid = low + ((high - low) >> 1);

    if (arr[mid] === target) {
      return mid; // Target identified
    } else if (arr[mid] < target) {
      low = mid + 1; // Discard left half
    } else {
      high = mid - 1; // Discard right half
    }
  }

  return -1; // Target not present
}""",
            "tradeoffs": [
                ("Algorithm", "Linear Search O(n)", "Binary Search O(log n)", "Unsorted arrays vs required upfront sort overhead O(n log n)"),
                ("Data Structure", "Flat Array", "Binary Search Tree (BST)", "Cache-friendly contiguous memory vs dynamic insertion/deletion overhead"),
                ("Loop Boundary", "while (low <= high)", "while (low < high)", "Exact target match vs left/right insertion boundary search"),
                ("Space Complexity", "Iterative O(1) auxiliary", "Recursive O(log n) call stack", "Minimum memory overhead vs recursive elegance")
            ],
            "quiz": [
                {
                    "question": "How many comparisons does Binary Search require at most for an array of 1,000,000 sorted elements?",
                    "options": [
                        ("At most 20 comparisons (since 2^20 = 1,048,576 > 1,000,000).", True, "Log2(1,000,000) is approximately 19.93, requiring at most 20 comparisons in the worst case."),
                        ("Approximately 500,000 comparisons.", False, "500,000 would be the average for naive O(n) linear search, not logarithmic binary search."),
                        ("1,000 comparisons.", False, "Square root search takes 1,000 steps, but binary search is exponentially faster at ~20 steps.")
                    ]
                },
                {
                    "question": "When searching for the first insertion position where arr[i] >= target, which condition updates the high pointer?",
                    "options": [
                        ("high = mid; when arr[mid] >= target", True, "Keeping mid preserves the candidate position while discarding elements strictly greater on the right."),
                        ("high = mid - 1; when arr[mid] < target", False, "If arr[mid] is strictly less than target, the target must be to the right (low = mid + 1)."),
                        ("high = 0;", False, "Resetting high to 0 destroys the binary search space.")
                    ]
                }
            ],
            "takeaways": [
                "Always verify that data is strictly or monotonically sorted before applying binary search.",
                "Formulate boundary conditions carefully: choose between [low, high] closed vs [low, high) half-open intervals.",
                "Use bitwise mid calculations (low + ((high - low) >> 1)) to protect against 32-bit integer overflow.",
                "Binary search generalizes beyond arrays: binary search on answer spaces (e.g. capacity, minimum time) is an elite LeetCode pattern."
            ]
        }

    # 4. Dynamic Programming: Memoization vs Tabulation
    if any(k in combined for k in ["memoization", "tabulation", "dynamic programming", "dp", "fibonacci", "knapsack"]):
        return {
            "category": "Dynamic Programming Paradigms",
            "subtitle": "Top-down recursive memoization vs bottom-up iterative tabulation.",
            "objectives": [
                "Identify overlapping subproblems and optimal substructure in complex algorithms.",
                "Compare Top-Down (Memoization) with Bottom-Up (Tabulation) execution profiles.",
                "Analyze call stack depth, recursion overhead, and stack overflow vulnerabilities.",
                "Optimize memory footprint from O(N) tables to O(1) rolling variables."
            ],
            "concepts_html": """<p><strong>Dynamic Programming (DP)</strong> solves complex optimization problems by breaking them down into simpler subproblems, solving each subproblem once, and storing their solutions to eliminate redundant computations.</p>
<p>Two distinct paradigms exist: <strong>Top-Down Memoization</strong>, which maintains natural recursive call hierarchies while caching returned subproblem outputs in a hash table, and <strong>Bottom-Up Tabulation</strong>, which iteratively builds solutions starting from base cases in an explicit array or matrix, eliminating call stack overhead completely.</p>""",
            "callout_title": "Call Stack vs CPU Cache",
            "callout_text": "While Top-Down Memoization only computes reachable states, Bottom-Up Tabulation benefits from continuous memory locality, CPU cache prefetching, and zero call stack memory overhead.",
            "code_lang": "typescript",
            "code_title": "MemoVsTabulation.ts",
            "code": """// Comparison: Top-Down Memoization vs Bottom-Up Tabulation
export class DPComparison {
  // 1. Top-Down Memoization (Recursive + Hash Cache)
  public static fibMemo(n: number, memo = new Map<number, number>()): number {
    if (n <= 1) return n;
    if (memo.has(n)) return memo.get(n)!;
    const res = this.fibMemo(n - 1, memo) + this.fibMemo(n - 2, memo);
    memo.set(n, res);
    return res;
  }

  // 2. Bottom-Up Tabulation (Iterative + O(1) Memory Space)
  public static fibTabulation(n: number): number {
    if (n <= 1) return n;
    let prev2 = 0;
    let prev1 = 1;
    for (let i = 2; i <= n; i++) {
      const current = prev1 + prev2;
      prev2 = prev1;
      prev1 = current;
    }
    return prev1;
  }
}""",
            "tradeoffs": [
                ("Paradigm", "Top-Down (Memoization)", "Bottom-Up (Tabulation)", "Intuitive recursive structure vs iterative cache locality"),
                ("Subproblem Evaluation", "On-demand (only needed states)", "Exhaustive (all table states)", "Skips unneeded state permutations vs predictable execution loop"),
                ("Call Stack Risk", "Vulnerable to Stack Overflow (O(n))", "Zero Call Stack Risk (O(1) stack)", "Max recursion limit exceeded on deep trees vs iterative safety"),
                ("Space Optimization", "O(N) cache table required", "Can compress to O(1) rolling state", "Fixed map overhead vs rolling pointer optimizations")
            ],
            "quiz": [
                {
                    "question": "What is the primary operational advantage of Bottom-Up Tabulation over Top-Down Memoization?",
                    "options": [
                        ("Tabulation completely avoids recursion call stack overhead and prevents stack overflow crashes.", True, "Tabulation is strictly iterative, running in a flat loop without pushing stack frames."),
                        ("Tabulation solves problems in O(1) time complexity.", False, "Time complexity is generally identical O(N); tabulation saves stack space and call overhead."),
                        ("Tabulation requires no memory allocation.", False, "Tabulation still uses state memory, although it can often be compressed.")
                    ]
                },
                {
                    "question": "In what scenario is Top-Down Memoization preferred over Bottom-Up Tabulation?",
                    "options": [
                        ("When only a small sparse fraction of all possible subproblem states need to be evaluated.", True, "Memoization computes states lazily on demand, skipping vast portions of unreachable state space."),
                        ("When running in memory-constrained microcontrollers with tiny call stacks.", False, "Microcontrollers benefit from iterative loops without recursion."),
                        ("When debugging multi-threaded locking race conditions.", False, "Recursion adds complexity to multi-threaded debugging.")
                    ]
                }
            ],
            "takeaways": [
                "Verify optimal substructure before writing dynamic programming code.",
                "Start by drafting the top-down recursive formula to verify correctness, then convert to bottom-up tabulation.",
                "Look for rolling state optimizations: if state depends only on i-1 and i-2, discard the full O(N) array.",
                "Watch out for deep recursion in languages like Python where default recursion depth is capped at 1000."
            ]
        }

    # 5. Machine Learning / Gradient Descent Optimization
    if any(k in combined for k in ["gradient descent", "loss function", "backpropagation", "neural network", "machine learning", "deep learning", "gradient"]):
        return {
            "category": "Mathematical Optimization & Deep Learning",
            "subtitle": "Convex loss landscapes, learning rate schedules, and backpropagation mechanics.",
            "objectives": [
                "Understand the mathematical derivation of gradient descent: weight updates proportional to negative gradient.",
                "Analyze the impact of learning rate (alpha): underfitting vs oscillation and divergence.",
                "Compare Batch Gradient Descent, Mini-Batch SGD, and adaptive optimizers (Adam, RMSprop).",
                "Explore interactive loss surface navigation via HTML5 canvas simulation."
            ],
            "concepts_html": """<p><strong>Gradient Descent</strong> is the foundational optimization engine powering modern deep neural networks. By calculating the partial derivative of the loss objective function with respect to model parameters, it iteratively adjusts weights along the steepest descent path to reach local or global minima.</p>
<p>The parameter update rule is expressed as <code>w := w - alpha * (dJ/dw)</code>, where <code>alpha</code> denotes the <strong>learning rate</strong>. Choosing <code>alpha</code> is critical: if too small, convergence requires millions of compute cycles; if too large, the updates oscillate wildly and diverge across steep loss walls.</p>""",
            "callout_title": "Momentum & Adaptive Rates",
            "callout_text": "Modern optimizers like Adam combine momentum (exponentially decaying moving average of past gradients) with adaptive learning rates per parameter, preventing stagnation in saddle points and ravines.",
            "code_lang": "typescript",
            "code_title": "GradientDescent.ts",
            "code": """// Stochastic Gradient Descent with Momentum Optimizer
export class SGDOptimizer {
  private velocity = 0;

  constructor(
    private learningRate: number = 0.05,
    private momentum: number = 0.9
  ) {}

  public updateWeight(currentWeight: number, gradient: number): number {
    // Update velocity vector with momentum
    this.velocity = (this.momentum * this.velocity) + (this.learningRate * gradient);
    // Step weight in the direction of negative gradient
    return currentWeight - this.velocity;
  }
}""",
            "tradeoffs": [
                ("Optimizer", "Vanilla Batch Gradient Descent", "Adam / RMSprop (Adaptive)", "Precise true gradient vs per-parameter adaptive momentum"),
                ("Batch Size", "Full Batch (N)", "Mini-Batch (32 - 512)", "Exact gradient computation vs GPU parallel throughput and stochastic regularization"),
                ("Learning Rate", "Constant Alpha", "Cosine Annealing with Warmup", "Simple hyperparameter vs escape from sharp local minima"),
                ("Loss Surface", "Convex (Single Global Minima)", "Non-Convex (Deep Neural Nets)", "Guaranteed convergence vs saddle points, plateaus, and ravines")
            ],
            "quiz": [
                {
                    "question": "What occurs when the learning rate (alpha) in gradient descent is set too high?",
                    "options": [
                        ("The optimization steps overshoot the minimum, potentially oscillating and diverging to infinity.", True, "Overshooting the valley floor causes successively larger gradient calculations and numerical explosion."),
                        ("The model immediately gets stuck in a local minimum on the first step.", False, "High learning rates leap over local minima rather than getting trapped."),
                        ("The gradient automatically vanishes to zero.", False, "Vanishing gradients occur from deep sigmoid activations or tiny learning rates, not excessive alpha.")
                    ]
                },
                {
                    "question": "Why is Mini-Batch SGD preferred over Full-Batch Gradient Descent for training deep learning models?",
                    "options": [
                        ("It maximizes GPU SIMD parallelism while introducing stochastic noise that helps escape local minima.", True, "Mini-batches fit in VRAM, utilize tensor cores efficiently, and the gradient noise aids generalization."),
                        ("It guarantees finding the absolute global minimum in non-convex landscapes.", False, "No gradient-based method guarantees the global minimum in non-convex neural net landscapes."),
                        ("It requires zero hyperparameter tuning.", False, "Mini-batch training still requires tuning learning rate, batch size, and weight decay.")
                    ]
                }
            ],
            "takeaways": [
                "Always normalize or standardize input features (mean=0, std=1) to prevent elongated elliptical loss contours.",
                "Implement learning rate schedules (e.g. linear warmup followed by cosine decay) for stable training.",
                "Monitor gradient norms during training to detect exploding or vanishing gradients early.",
                "Default to AdamW (Adam with decoupled weight decay) for transformers and modern deep learning models."
            ]
        }

    # 6. LangGraph & Generative Agent Workflows
    if any(k in combined for k in ["langgraph", "stategraph", "agentic", "autonomous agent", "tool-calling", "mcp server", "claude api", "openai agent"]):
        return {
            "category": "Autonomous Agents & Graph Workflows",
            "subtitle": "StateGraph cycles, tool-calling loops, checkpoints, and human-in-the-loop control.",
            "objectives": [
                "Understand why cyclical graphs overcome the fundamental limitations of linear DAG chains.",
                "Master StateGraph fundamentals: Shared State, Node executors, and Conditional Router edges.",
                "Implement persistent checkpointing for fault-tolerant agent execution and human-in-the-loop validation.",
                "Analyze reflection, self-correction, and tool invocation loop convergence."
            ],
            "concepts_html": """<p>Traditional LLM orchestration pipelines rely on <strong>Directed Acyclic Graphs (DAGs)</strong> that process prompt chains linearly. However, autonomous agents, code-generation loops, and iterative research require <strong>cyclical execution</strong>: drafting, invoking tools, observing feedback, and looping until completion conditions are satisfied.</p>
<p><strong>LangGraph</strong> models agentic systems as state machines. Nodes represent compute steps (e.g., an LLM prompt or tool execution), edges define routing logic, and conditional edges evaluate runtime state to decide whether to loop back for another tool call or terminate with a final answer.</p>""",
            "callout_title": "Cycle Termination Guardrails",
            "callout_text": "Autonomous agent graphs must strictly enforce a maximum recursion limit (e.g. max_steps = 15) to prevent infinite billing and runaway hallucination loops when external tools fail.",
            "code_lang": "typescript",
            "code_title": "AgentStateGraph.ts",
            "code": """// Cyclical Agent State Machine Architecture
export interface AgentState {
  messages: Array<{ role: string; content: string }>;
  iterationCount: number;
  isComplete: boolean;
}

export class AgentStateGraph {
  constructor(private maxIterations: number = 8) {}

  public async runLoop(initialState: AgentState): Promise<AgentState> {
    let state = { ...initialState };

    while (!state.isComplete && state.iterationCount < this.maxIterations) {
      state.iterationCount++;
      // 1. Execute LLM Reasoning Node
      state = await this.reasoningNode(state);

      // 2. Conditional Routing Edge
      if (this.shouldCallTool(state)) {
        state = await this.toolExecutionNode(state);
      } else {
        state.isComplete = true; // Termination signal
      }
    }

    return state;
  }

  private async reasoningNode(state: AgentState): Promise<AgentState> {
    return state;
  }

  private async toolExecutionNode(state: AgentState): Promise<AgentState> {
    return state;
  }

  private shouldCallTool(state: AgentState): boolean {
    const lastMsg = state.messages[state.messages.length - 1];
    return lastMsg?.content.includes("TOOL_CALL") || false;
  }
}""",
            "tradeoffs": [
                ("Architecture", "Linear Chains (LangChain DAG)", "Cyclic Graphs (LangGraph StateGraph)", "Predictable step sequence vs autonomous multi-step problem solving"),
                ("Memory", "Stateless Context Window", "Persistent State Checkpointer", "Ephemeral single-session vs resumable, fault-tolerant long workflows"),
                ("Control Flow", "Fixed Orchestration", "Dynamic Conditional Edges", "Hardcoded control flow vs runtime model decision making"),
                ("Safety Guardrail", "Timeout Timer", "Human-in-the-Loop Interrupt", "Unchecked automated execution vs critical review before destructive actions")
            ],
            "quiz": [
                {
                    "question": "What is the primary architectural differentiator of LangGraph compared to standard LangChain chains?",
                    "options": [
                        ("LangGraph natively supports cyclical graphs with conditional routing and checkpointed state.", True, "LangGraph allows loops and cycles, which are essential for agent reflection and iterative tool use."),
                        ("LangGraph only works with open-source local LLMs.", False, "LangGraph works with any model provider including OpenAI, Anthropic, Gemini, and Ollama."),
                        ("LangGraph replaces Python with C++ for high performance.", False, "LangGraph is implemented in Python and TypeScript.")
                    ]
                },
                {
                    "question": "Why is persistent checkpointing critical for production agent workflows?",
                    "options": [
                        ("It allows long-running agent workflows to pause for human approval and resume from exact state after crashes.", True, "Checkpoints persist state across node transitions, enabling fault tolerance and human-in-the-loop review."),
                        ("It eliminates the need for LLM API keys.", False, "Checkpoints store workflow memory; they have no relation to API authorization."),
                        ("It reduces token costs to zero.", False, "Tokens are still consumed; checkpoints ensure progress is not lost upon failure.")
                    ]
                }
            ],
            "takeaways": [
                "Structure agent state as append-only or reducer-based immutability to facilitate clean rollback and replay.",
                "Add explicit Human-in-the-Loop interrupt nodes before executing non-idempotent operations (DB writes, emails, payments).",
                "Implement tight token budgets and recursion limiters on every StateGraph instance.",
                "Separate the Planner Agent from the Executor Agent to improve reasoning precision and reduce hallucinations."
            ]
        }

    # 7. Dynamic fallback — infer from title/content/class/subject
    # Extract meaningful keywords from all available context
    all_text = f"{title} {class_name} {subject_name} {content}"
    words = [w.strip('.,;:()[]"').capitalize() for w in all_text.split() if len(w.strip('.,;:()[]"')) > 4]
    key_terms = list(dict.fromkeys(words))[:8]  # deduplicate, keep first 8
    term_a = key_terms[0] if len(key_terms) > 0 else title
    term_b = key_terms[1] if len(key_terms) > 1 else "Core Concepts"
    term_c = key_terms[2] if len(key_terms) > 2 else "Implementation"
    term_d = key_terms[3] if len(key_terms) > 3 else "Best Practices"

    # Build content from actual input text
    content_preview = content.strip()[:600] if content.strip() else ""
    concepts_para = (
        f"<p>{html.escape(content_preview[:300])}</p>" if len(content_preview) > 50
        else f"<p><strong>{html.escape(title)}</strong> is a topic within the <em>{html.escape(class_name)}</em> domain under the subject <em>{html.escape(subject_name or 'General')}</em>. Understanding this topic requires grasping its core mechanisms, practical implementations, and the trade-offs that guide real-world decisions.</p>"
    )
    concepts_para2 = (
        f"<p>{html.escape(content_preview[300:600])}</p>" if len(content_preview) > 300
        else f"<p>Mastery of <strong>{html.escape(title)}</strong> enables practitioners to design robust, maintainable, and efficient systems aligned with industry best practices and scalable architectural patterns.</p>"
    )

    clean_title = title.replace(' ', '').replace('/', '').replace('-', '')

    return {
        "category": f"{class_name or 'Core'} — {subject_name or 'General Module'}",
        "subtitle": f"Foundational concepts, practical patterns, and real-world trade-offs for {title}.",
        "objectives": [
            f"Build a deep mental model for {title} and understand its core mechanics.",
            f"Identify the primary design patterns and implementation strategies for {term_a} and {term_b}.",
            f"Explore practical code examples demonstrating {term_c} within real systems.",
            f"Analyze critical trade-offs and industry best practices for {term_d}."
        ],
        "concepts_html": concepts_para + concepts_para2,
        "callout_title": f"Key Principle: {term_a}",
        "callout_text": f"When working with {title}, always prioritize clarity of intent, correctness of core invariants, and measurable performance over premature optimizations. Ground every implementation decision in the specific context and constraints of {subject_name or class_name or 'the domain'}.",
        "code_lang": "typescript",
        "code_title": f"{clean_title or 'Module'}.ts",
        "code": f"""// Core Implementation: {title}
// Domain: {class_name} | Subject: {subject_name or 'General'}
export class {clean_title or 'CoreModule'} {{
  private readonly config: Record<string, unknown>;

  constructor(config: Record<string, unknown> = {{}}) {{
    this.config = config;
  }}

  /**
   * Execute the primary operation for {title}.
   * @param input — the subject domain input
   * @returns processed result adhering to domain constraints
   */
  async execute<T>(input: T): Promise<T> {{
    // 1. Validate input invariants
    if (!input) throw new Error(`Invalid input for {title}`);

    // 2. Apply core logic (domain-specific implementation goes here)
    const result = await this.process(input);

    // 3. Return normalized output
    return result;
  }}

  private async process<T>(input: T): Promise<T> {{
    // Core processing logic for {title}
    return input;
  }}
}}""",
        "tradeoffs": [
            (f"{term_a}", "Explicit / Direct Approach", "Implicit / Convention-Based", "Maximum control and clarity vs rapid development with less boilerplate"),
            (f"{term_b}", "Eager Initialization", "Lazy Initialization", "Predictable startup cost vs on-demand efficiency for sparse usage"),
            (f"{term_c}", "Strict Typing / Validation", "Duck Typing / Permissive", "Early error detection vs faster iteration and prototyping"),
            (f"{term_d}", "Synchronous Execution", "Asynchronous / Event-Driven", "Simpler mental model vs non-blocking throughput at scale")
        ],
        "quiz": [
            {
                "question": f"What is the most important first step when implementing {title} in a production system?",
                "options": [
                    (f"Understand the core invariants, constraints, and intended behavior of {title} before writing a single line of code.", True, "Deeply understanding requirements and invariants prevents architectural mistakes that are expensive to reverse."),
                    ("Start with the most complex edge case and work backwards.", False, "Starting with edge cases leads to over-engineering and loss of clarity on the primary success path."),
                    ("Copy an existing implementation without adaptation.", False, "Copying without understanding leads to brittle code with hidden assumptions.")
                ]
            },
            {
                "question": f"What is the best strategy for testing an implementation of {title}?",
                "options": [
                    ("Write unit tests for core logic, integration tests for system behavior, and end-to-end tests for critical paths.", True, "A layered testing pyramid ensures correctness at every level while keeping tests maintainable and fast."),
                    ("Only write manual tests during development.", False, "Manual testing is slow, inconsistent, and does not scale for continuous deployment."),
                    ("Skip testing entirely to ship faster.", False, "Untested code in production leads to undiscovered regressions and reliability failures.")
                ]
            }
        ],
        "takeaways": [
            f"Always ground your understanding of {title} in concrete examples before abstracting to patterns.",
            f"Write clean, readable code for {term_a} first; optimize only when profiling confirms a bottleneck.",
            f"Apply {term_b} patterns incrementally, validating correctness at each stage.",
            f"Stay current with evolving best practices in {class_name or 'the field'} to avoid stale patterns."
        ]
    }


def build_structured_lesson_html(
    title: str,
    class_name: str,
    subject_name: str = "General",
    content: str = "",
    raw_ai_output: str = "",
    class_context: str = "",
    subject_context: str = "",
    class_description: str = "",
    subject_description: str = "",
) -> str:
    """Build a complete, structured ByteByteGo-style lesson document.
    Guarantees no lesson is ever blank, unstyled, or incomplete.
    """
    raw = (raw_ai_output or "").strip()
    if (
        "<html" in raw.lower()
        and "</html>" in raw.lower()
        and ("<style" in raw.lower() or "class=" in raw.lower())
        and len(raw) > 1000
        and ("quiz" in raw.lower() or "objective" in raw.lower() or "visual" in raw.lower())
    ):
        return raw

    final_title = title or "Technical Architecture & Fundamentals"
    cls_name = class_name or "Engineering"
    subj_name = subject_name or "General"

    profile = _get_topic_profile(final_title, cls_name, subj_name, content)
    visual = generate_native_visual(
        {"title": final_title, "class_name": cls_name, "subject_name": subj_name},
        content
    )

    objs_html = "\n".join([f"      <li>{obj}</li>" for obj in profile["objectives"]])

    tradeoff_rows = "\n".join([
        f"""          <tr>
            <td><strong>{dim}</strong></td>
            <td>{app_a}</td>
            <td>{app_b}</td>
            <td>{tradeoff}</td>
          </tr>"""
        for dim, app_a, app_b, tradeoff in profile["tradeoffs"]
    ])

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

    takeaways_html = "\n".join([f"      <li>{item}</li>" for item in profile["takeaways"]])

    context_banner_items = []
    if class_description:
        context_banner_items.append(f'<div class="context-item"><span class="context-label">Domain Scope:</span> {html.escape(class_description)}</div>')
    if class_context:
        context_banner_items.append(f'<div class="context-item"><span class="context-label">🤖 AI Guidance:</span> {html.escape(class_context)}</div>')
    if subject_context:
        context_banner_items.append(f'<div class="context-item"><span class="context-label">🎯 Subject Focus:</span> {html.escape(subject_context)}</div>')
    if subject_description:
        context_banner_items.append(f'<div class="context-item"><span class="context-label">Subject Scope:</span> {html.escape(subject_description)}</div>')

    context_banner_html = ""
    if context_banner_items:
        items_joined = "\n    ".join(context_banner_items)
        context_banner_html = f"""  <div class="context-banner">
    <div class="context-badge">📘 Class: <strong>{html.escape(cls_name)}</strong> &bull; Subject: <strong>{html.escape(subj_name)}</strong></div>
    {items_joined}
  </div>"""

    return f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{final_title} | AI LMS</title>
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
      margin-bottom: 1.5rem;
      border-bottom: 1px solid var(--border);
      padding-bottom: 1.5rem;
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
    .context-banner {{
      background: rgba(30, 41, 59, 0.5);
      border: 1px solid var(--border);
      border-left: 3px solid var(--primary);
      border-radius: 0.5rem;
      padding: 0.85rem 1.25rem;
      margin: 1.5rem 0 2rem 0;
      font-size: 0.85rem;
      color: #94a3b8;
      display: flex;
      flex-direction: column;
      gap: 0.4rem;
    }}
    .context-badge {{
      color: #f8fafc;
      font-size: 0.88rem;
    }}
    .context-item {{
      line-height: 1.45;
    }}
    .context-label {{
      color: var(--accent);
      font-weight: 600;
      margin-right: 0.35rem;
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
      <span class="badge badge-class">{cls_name}</span>
      <span class="badge badge-subject">{subj_name}</span>
      <span class="badge badge-time">⏱️ 8 min read</span>
      <span class="badge badge-interactive">⚡ Interactive Simulation</span>
    </div>
    <h1>{final_title}</h1>
    <div class="subtitle">{profile["subtitle"]}</div>
  </header>

{context_banner_html}

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


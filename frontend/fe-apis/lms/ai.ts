/**
 * fe-apis/lms/ai.ts
 *
 * Multi-provider AI generation client & visualizer engine in TypeScript for Next.js API routes.
 * Supports Gemini, DeepSeek, OpenAI, Groq, OpenRouter, and Ollama.
 * Falls back to server env vars (e.g. GEMINI_API_KEY, DEEPSEEK_API_KEY) if client doesn't send keys.
 */

export interface AISettingsPayload {
  model?: string;
  geminiKey?: string;
  openaiKey?: string;
  anthropicKey?: string;
  deepseekKey?: string;
  groqKey?: string;
  openrouterKey?: string;
  openrouterUrl?: string;
  ollamaUrl?: string;
  ollamaModel?: string;
}

export function cleanHtmlOutput(text: string): string {
  let cleaned = text.trim();
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```[a-zA-Z0-9_-]*\n?/, '');
    if (cleaned.endsWith('```')) {
      cleaned = cleaned.slice(0, -3);
    }
    cleaned = cleaned.trim();
  }
  return cleaned;
}

export function extractJsonObject(text: string): Record<string, any> {
  const cleaned = text.replace(/```[a-z]*\n?/g, '').replace(/`/g, '').trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start === -1 || end === -1) {
    throw new Error('No JSON object found in response');
  }
  return JSON.parse(cleaned.slice(start, end + 1));
}

export async function callAIText(prompt: string, settings: AISettingsPayload = {}): Promise<string> {
  const geminiKey = settings.geminiKey || process.env.GEMINI_API_KEY || '';
  const deepseekKey = settings.deepseekKey || process.env.DEEPSEEK_API_KEY || '';
  const openaiKey = settings.openaiKey || process.env.OPENAI_API_KEY || '';
  const groqKey = settings.groqKey || process.env.GROQ_API_KEY || '';
  const openrouterKey = settings.openrouterKey || process.env.OPENROUTER_API_KEY || '';
  const model = settings.model || 'gemini-flash-latest';

  // 1. Try DeepSeek if key is present or model requests it
  if (deepseekKey && (model.startsWith('deepseek') || (!geminiKey && !openaiKey))) {
    try {
      const res = await fetch('https://api.deepseek.com/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${deepseekKey}`,
        },
        body: JSON.stringify({
          model: model.startsWith('deepseek') ? model : 'deepseek-chat',
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.7,
        }),
        signal: AbortSignal.timeout(5000),
      });
      if (res.ok) {
        const data = await res.json();
        return data.choices?.[0]?.message?.content || '';
      }
    } catch {
      // Fall through to other providers
    }
  }

  // 2. Try Gemini
  if (geminiKey) {
    try {
      const geminiModel = model.startsWith('gemini') ? model : 'gemini-2.5-flash';
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent?key=${geminiKey}`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 8192,
          },
        }),
        signal: AbortSignal.timeout(5000),
      });

      if (res.ok) {
        const data = await res.json();
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
        if (text) return text;
      }
    } catch {
      // Fall through
    }
  }

  // 3. Try OpenAI
  if (openaiKey) {
    try {
      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${openaiKey}`,
        },
        body: JSON.stringify({
          model: model.startsWith('gpt') ? model : 'gpt-4o-mini',
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.7,
        }),
        signal: AbortSignal.timeout(5000),
      });
      if (res.ok) {
        const data = await res.json();
        return data.choices?.[0]?.message?.content || '';
      }
    } catch {
      // Fall through
    }
  }

  // 4. Try Groq
  if (groqKey) {
    try {
      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${groqKey}`,
        },
        body: JSON.stringify({
          model: 'llama-3.3-70b-versatile',
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.7,
        }),
        signal: AbortSignal.timeout(5000),
      });
      if (res.ok) {
        const data = await res.json();
        return data.choices?.[0]?.message?.content || '';
      }
    } catch {
      // Fall through
    }
  }

  // 5. Try OpenRouter
  if (openrouterKey) {
    try {
      const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${openrouterKey}`,
        },
        body: JSON.stringify({
          model: model.includes('/') ? model : 'google/gemini-2.5-flash',
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.7,
        }),
        signal: AbortSignal.timeout(5000),
      });
      if (res.ok) {
        const data = await res.json();
        return data.choices?.[0]?.message?.content || '';
      }
    } catch {
      // Fall through
    }
  }

  throw new Error('No AI provider succeeded. Please check your API keys in Config.');
}

// ─────────────────────────────────────────────────────────────────────────────
// Native Visual Engine
// ─────────────────────────────────────────────────────────────────────────────

export function generateNativeVisual(lesson: Record<string, any>, focusConcept: string = ''): Record<string, any> {
  const title = (lesson.title as string) || '';
  const clsName = (lesson.class_name as string) || '';
  const subjName = (lesson.subject_name as string) || '';
  const combined = `${title} ${clsName} ${subjName} ${focusConcept}`.toLowerCase();

  // 1. Algorithm / Search / Pointers Simulation
  if (['search', 'binary', 'pointer', 'array', 'sort', 'dsa', 'leetcode', 'tree'].some((k) => combined.includes(k))) {
    return {
      visual_type: 'Interactive Simulation',
      title: `Interactive Pointer Simulation: ${title}`,
      explanation: 'Step through this interactive array simulation to see how pointers eliminate search space logarithmically in O(log n) time.',
      visual_html: `<div class="lms-visualizer" style="font-family: system-ui, sans-serif; background: #0f172a; color: #f8fafc; padding: 1.5rem; border-radius: 0.75rem; border: 1px solid #334155;">
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

  <div id="simArrayContainer" style="display: flex; justify-content: center; gap: 0.5rem; margin: 2rem 0 1rem 0; flex-wrap: wrap;"></div>
  <div id="simPointerLabels" style="display: flex; justify-content: center; gap: 0.5rem; margin-bottom: 1.5rem; flex-wrap: wrap;"></div>

  <div id="simStatusBox" style="background: #1e293b; border: 1px solid #334155; padding: 0.85rem 1rem; border-radius: 0.5rem; margin-bottom: 1.25rem; font-size: 0.9rem; line-height: 1.4; color: #cbd5e1;">
    Click <strong>Next Step</strong> to begin binary search.
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
        el.style.cssText = 'width: 48px; height: 48px; display: flex; flex-direction: column; align-items: center; justify-content: center; background: ' + bg + '; border: 2px solid ' + border + '; border-radius: 0.5rem; font-weight: 700; color: ' + text + '; transition: all 0.2s ease;';
        el.innerHTML = '<span>' + val + '</span><span style="font-size: 0.6rem; color: #64748b; font-weight: 400;">[' + idx + ']</span>';
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
      document.getElementById('simStatusBox').innerHTML = 'Target chosen. Click <strong>Next Step</strong> to calculate mid point.';
      render();
    };

    window.stepNext = function() {
      const target = parseInt(document.getElementById('simTargetSelect').value, 10);
      if (state === 'found' || state === 'not_found') return;

      history.push({ low, high, mid, state });

      if (low > high) {
        state = 'not_found';
        document.getElementById('simStatusBox').innerHTML = '<strong>Search Finished:</strong> <code>low > high</code>. Target <code>' + target + '</code> does not exist in array.';
        render();
        return;
      }

      mid = Math.floor((low + high) / 2);
      const midVal = arr[mid];

      if (midVal === target) {
        state = 'found';
        document.getElementById('simStatusBox').innerHTML = '<strong style="color: #4ade80;">Found Target!</strong> <code>arr[' + mid + '] === ' + target + '</code>.';
      } else if (midVal < target) {
        document.getElementById('simStatusBox').innerHTML = '<code>arr[' + mid + '] (' + midVal + ') < ' + target + '</code> &rarr; Eliminating left side: <code>low = ' + (mid + 1) + '</code>.';
        low = mid + 1;
      } else {
        document.getElementById('simStatusBox').innerHTML = '<code>arr[' + mid + '] (' + midVal + ') > ' + target + '</code> &rarr; Eliminating right side: <code>high = ' + (mid - 1) + '</code>.';
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
</div>`,
    };
  }

  // 2. Machine Learning / Gradient Descent Simulation
  if (['gradient', 'loss', 'machine learning', 'neural', 'vision', 'model', 'ai', 'optimization'].some((k) => combined.includes(k))) {
    return {
      visual_type: 'Interactive Simulation',
      title: `Gradient Descent Optimization Landscape: ${title}`,
      explanation: 'Interactive simulation of gradient descent minimizing a convex loss surface. Adjust learning rate and step to watch convergence.',
      visual_html: `<div class="lms-visualizer" style="font-family: system-ui, sans-serif; background: #0f172a; color: #f8fafc; padding: 1.5rem; border-radius: 0.75rem; border: 1px solid #334155;">
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
    <button onclick="takeStep()" style="background: #7c3aed; color: white; border: none; padding: 0.45rem 1.25rem; border-radius: 0.375rem; font-weight: 600; cursor: pointer; font-size: 0.85rem; box-shadow: 0 4px 6px -1px rgba(124, 58, 237, 0.3);">&darr; Take Step</button>
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
</div>`,
    };
  }

  // 3. System Design / Architecture / Load Balancer / Distributed Systems
  return {
    visual_type: 'Architecture Diagram',
    title: `Dynamic Request Flow Architecture: ${title}`,
    explanation: 'ByteByteGo-style interactive architecture diagram showing client requests routed dynamically across server nodes and persistent data stores.',
    visual_html: `<div class="lms-visualizer" style="font-family: system-ui, sans-serif; background: #0f172a; color: #f8fafc; padding: 1.5rem; border-radius: 0.75rem; border: 1px solid #334155;">
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

      <path id="pathClientToLb" d="M 120 140 L 260 140" stroke="#475569" stroke-width="2" stroke-dasharray="4" fill="none"/>
      <path id="pathLbToServer1" d="M 370 140 C 420 140, 430 65, 490 65" stroke="#475569" stroke-width="2" fill="none"/>
      <path id="pathLbToServer2" d="M 370 140 L 490 140" stroke="#475569" stroke-width="2" fill="none"/>
      <path id="pathLbToServer3" d="M 370 140 C 420 140, 430 215, 490 215" stroke="#475569" stroke-width="2" fill="none"/>
      <path d="M 610 65 C 650 65, 650 140, 670 140" stroke="#334155" stroke-width="2" fill="none"/>
      <path d="M 610 140 L 670 140" stroke="#334155" stroke-width="2" fill="none"/>
      <path d="M 610 215 C 650 215, 650 140, 670 140" stroke="#334155" stroke-width="2" fill="none"/>

      <circle id="movingPacket" cx="-20" cy="-20" r="6" fill="#38bdf8" filter="url(#glow)" style="transition: opacity 0.2s; opacity: 0;"/>

      <g transform="translate(20, 95)">
        <rect width="100" height="90" rx="8" fill="url(#blueGrad)" stroke="#38bdf8" stroke-width="1.5"/>
        <text x="50" y="38" text-anchor="middle" fill="#ffffff" font-size="12" font-weight="700">Clients</text>
        <text x="50" y="56" text-anchor="middle" fill="#bae6fd" font-size="10">Web / Mobile</text>
        <text x="50" y="72" text-anchor="middle" fill="#e0f2fe" font-size="9">10k req/sec</text>
      </g>

      <g transform="translate(260, 95)">
        <rect width="110" height="90" rx="8" fill="url(#purpleGrad)" stroke="#c084fc" stroke-width="1.5"/>
        <text x="55" y="36" text-anchor="middle" fill="#ffffff" font-size="12" font-weight="700">Load Balancer</text>
        <text x="55" y="54" text-anchor="middle" fill="#e9d5ff" font-size="10">HAProxy / Nginx</text>
        <text x="55" y="72" text-anchor="middle" fill="#a78bfa" font-size="9">Round Robin</text>
      </g>

      <g id="serverNode1" transform="translate(490, 30)">
        <rect width="120" height="70" rx="6" fill="url(#nodeGrad)" stroke="#475569" stroke-width="1.5"/>
        <circle cx="20" cy="20" r="4" fill="#22c55e"/>
        <text x="32" y="24" fill="#f8fafc" font-size="11" font-weight="700">App Server 1</text>
        <text x="32" y="44" fill="#94a3b8" font-size="9">CPU: 32% | 12ms</text>
      </g>

      <g id="serverNode2" transform="translate(490, 105)">
        <rect id="serverRect2" width="120" height="70" rx="6" fill="url(#nodeGrad)" stroke="#475569" stroke-width="1.5"/>
        <circle id="serverStatusDot2" cx="20" cy="20" r="4" fill="#22c55e"/>
        <text x="32" y="24" fill="#f8fafc" font-size="11" font-weight="700">App Server 2</text>
        <text id="serverText2" x="32" y="44" fill="#94a3b8" font-size="9">CPU: 41% | 15ms</text>
      </g>

      <g id="serverNode3" transform="translate(490, 180)">
        <rect width="120" height="70" rx="6" fill="url(#nodeGrad)" stroke="#475569" stroke-width="1.5"/>
        <circle cx="20" cy="20" r="4" fill="#22c55e"/>
        <text x="32" y="24" fill="#f8fafc" font-size="11" font-weight="700">App Server 3</text>
        <text x="32" y="44" fill="#94a3b8" font-size="9">CPU: 28% | 10ms</text>
      </g>

      <g transform="translate(670, 95)">
        <rect width="40" height="90" rx="6" fill="#1e293b" stroke="#0284c7" stroke-width="1.5"/>
        <text x="20" y="45" text-anchor="middle" fill="#38bdf8" font-size="10" font-weight="700" transform="rotate(90, 20, 45)">DB / Cache</text>
      </g>
    </svg>
  </div>

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
</div>`,
  };
}

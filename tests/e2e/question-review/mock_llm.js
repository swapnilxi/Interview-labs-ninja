// OpenAI-compatible mock for the Question Review e2e suite: POST /v1/chat/completions.
// Each prompt is recognised by a phrase from its builder (fe-apis/dailySession/{coach,questionQuiz,questionStudy}.ts,
// src/modules/swipe-learn/services/cardPrompt.ts; the FastAPI twins send the same text) and answered with valid,
// deterministic JSON. Every reply carries a counter, so a regenerated item differs from the one before.
// Debug/test hooks: GET /__calls lists {kind, at} for every call; POST /__reset clears that list.
// Standalone: `node mock_llm.js` (port MOCK_PORT, default 4596). The suite also starts it in-process when the port is free.
const http = require('http');

const RUN = Date.now().toString(36);
let n = 0;
const next = () => ++n;

/** Which builder wrote this prompt. Order matters: the most specific phrases first. */
function kindOf(p) {
  if (p.includes('You write cards for SwipeLearn')) return 'swipe-cards';
  if (p.includes('writing a multiple-choice quiz for an interview prep app')) return 'quiz';
  if (p.includes('extending a deep dive')) return 'deep-expand';
  if (p.includes('Write a QUICK REVIEW')) return 'study-quick';
  if (p.includes('into 3-8 small lessons')) return 'study-breakdown';
  if (p.includes('Write a DEEP DIVE')) return 'study-deep';
  if (p.includes('Score each rubric criterion')) return 'evaluate';
  if (p.includes('turn a rough draft into a complete, interview-ready answer'))
    return p.includes('OUTPUT STYLE - STAR') ? 'expand-star' : 'expand';
  if (p.includes('learn a topic in depth through conversation')) return 'learn-chat';
  return 'unmatched';
}

function reply(kind, p) {
  const k = next();
  switch (kind) {
    case 'quiz': {
      const count = Number((/Write (\d+) questions that test/.exec(p) || [])[1] || 5);
      return JSON.stringify(
        Array.from({ length: count }, (_, i) => {
          const id = `${RUN}-${k}-${i + 1}`;
          return {
            q: `Mock quiz ${id}: which statement about token buckets holds?`,
            options: [`Right answer ${id}`, `Wrong option ${id} a`, `Wrong option ${id} b`, `Wrong option ${id} c`],
            answer: 0,
            explanation: `Mock explanation ${id}.`,
          };
        })
      );
    }
    case 'study-quick':
      return JSON.stringify({
        title: `Mock quick review ${k}`,
        summary: 'MOCK-QUICK summary: a rate limiter caps how many requests a client may send in a window.',
        key_points: ['Token buckets allow short bursts.', 'Sliding windows smooth the edges.', 'Store counters close to the gateway.'],
        remember: 'Pick the algorithm by the burst behaviour you want.',
        pitfalls: ['Forgetting clock skew between nodes.', 'Counting per server instead of per client.'],
      });
    case 'study-breakdown':
      return JSON.stringify({
        chunks: [1, 2, 3].map((i) => ({
          title: `Mock lesson ${i} (${k})`,
          body: `Body of mock lesson ${i}. **Key term ${i}** explained in plain words.\n\n- one point\n- another point`,
          check: `Can you explain key term ${i}?`,
        })),
      });
    case 'study-deep':
      return JSON.stringify({
        sections: [1, 2, 3].map((i) => ({
          heading: `Mock deep section ${i}`,
          body: `Depth one body of mock section ${i}. It explains the mechanism underneath.`,
        })),
        further: ['Mock further: leaky buckets', 'Mock further: distributed counters'],
      });
    case 'deep-expand': {
      const level = (/\(level (\d) of 3\)/.exec(p) || [])[1] || '?';
      return `MOCK-DEEPER layer at level ${level} (${k}). A worked example with small numbers.`;
    }
    case 'evaluate': {
      const keys = ((/"key": one of \[([^\]]*)\]/.exec(p) || [])[1] || '')
        .split(',')
        .map((s) => s.trim().replace(/^"|"$/g, ''))
        .filter(Boolean);
      return JSON.stringify({
        scratch: 'mock working',
        criteria: keys.map((key) => ({ key, score: 4, comment: `Mock comment for ${key}.`, improve: `Mock improve ${key}.` })),
        strengths: ['MOCK-STRENGTH: clear structure'],
        factual_issues: [],
        missing: ['MOCK-MISSING: say how counters are shared'],
        improvements: ['MOCK-IMPROVE: add numbers'],
        better_answer: 'MOCK-BETTER answer text.',
        follow_ups: ['MOCK-FOLLOWUP: what about bursts?'],
        confidence_notes: '',
      });
    }
    case 'expand-star':
      return JSON.stringify({
        scratch: 'mock',
        summary: 'MOCK-STAR summary.',
        expanded_answer: `**Situation** MOCK-STAR-${k} our API was overloaded.\n\n**Task** I owned the fix.\n\n**Action** I added a token bucket.\n\n**Result** Errors fell by 90%.`,
        added_points: ['A measurable result'],
        corrections: [],
        confidence_notes: '',
      });
    case 'expand':
      return JSON.stringify({
        scratch: 'mock',
        summary: 'MOCK-EXPAND summary.',
        expanded_answer: `MOCK-EXPANDED-${k} answer.`,
        added_points: [],
        corrections: [],
        confidence_notes: '',
      });
    case 'learn-chat': {
      const convo = (/Conversation so far:\n([\s\S]*?)\n\nYOUR TASK:/.exec(p) || [])[1] || '';
      const learner = convo.split('\n').filter((l) => l.startsWith('Learner: ')).pop();
      const message = learner
        ? `MOCK-TUTOR heard: ${learner.slice('Learner: '.length).trim()}. What would you try next?`
        : 'MOCK-TUTOR hello. What do you already know about rate limiting?';
      return JSON.stringify({ message, depth: learner ? 2 : 1, focus: 'rate limiting', wrap_up: false });
    }
    case 'swipe-cards': {
      const count = Number((/Number of cards: exactly (\d+)/.exec(p) || [])[1] || 5);
      const focus = ((/^Focus: (.*)$/m.exec(p) || [])[1] || '').slice(0, 40);
      return JSON.stringify({
        cards: Array.from({ length: count }, (_, i) => ({
          title: `Mock card ${RUN}-${k}-${i + 1}`,
          hook: `Mock hook ${i + 1}`,
          content: `MOCK-CARD ${i + 1} about: ${focus}`,
          type: 'concept',
          topic: '',
          subCategory: '',
          code: null,
          quiz: null,
          depth: { howItWorks: 'Mock how.', architecture: null, example: 'Mock example.', commonMistakes: 'Mock mistake.', interviewQuestion: 'Mock question?' },
          difficulty: 'beginner',
          estimatedReadTime: 20,
          tags: ['mock'],
        })),
      });
    }
    default:
      return 'ok';
  }
}

function start(port = Number(process.env.MOCK_PORT || 4596), { quiet = false } = {}) {
  const calls = [];
  const server = http.createServer((req, res) => {
    if (req.method === 'GET' && req.url === '/__calls') {
      res.setHeader('content-type', 'application/json');
      return res.end(JSON.stringify(calls));
    }
    if (req.method === 'POST' && req.url === '/__reset') {
      calls.length = 0;
      return res.end('{}');
    }
    let b = '';
    req.on('data', (c) => (b += c));
    req.on('end', () => {
      let prompt = '';
      try {
        prompt = (JSON.parse(b || '{}').messages || []).map((x) => x.content).join('\n');
      } catch {
        /* not JSON: unmatched */
      }
      const kind = kindOf(prompt);
      calls.push({ kind, at: Date.now() });
      if (kind === 'unmatched' && !quiet) console.log('[mock] UNMATCHED:', prompt.slice(0, 200).replace(/\n/g, ' '));
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ choices: [{ message: { role: 'assistant', content: reply(kind, prompt) } }] }));
    });
  });
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, () => resolve({ server, calls, port }));
  });
}

module.exports = { start, kindOf };

if (require.main === module) {
  start().then(({ port }) => console.log(`mock llm on ${port}`));
}

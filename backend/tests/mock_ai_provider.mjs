#!/usr/bin/env node
/**
 * A tiny OpenAI-compatible provider for key-less end-to-end tests (POST /v1/chat/completions).
 * Answers by sniffing the prompt: the question-topic preview, the question-topic lesson, a project module plan.
 * Test switches:  GET /__count (lesson calls so far)  GET /__delay?ms=3000  GET /__fail?n=1  GET /__reset
 * Usage: node backend/tests/mock_ai_provider.mjs [port]   (default 4099)
 */
import http from 'node:http';

const port = Number(process.argv[2] || 4099);
let lessonCalls = 0;
let previewCalls = 0;
let delayMs = 0;
let failNext = 0;

const LESSON = {
  direct_answer: 'Instance-based learning, commonly exemplified by k-nearest neighbors (k-NN).',
  guiding_question: '',
  concept:
    'Instance-based learners keep the training examples and compare each new case with them using a similarity (distance) measure.\n\nk-NN finds the k most similar past customers and predicts from what they did.',
  real_world: {
    who: 'E-commerce growth and CRM teams',
    data: 'Purchase history per customer: order dates, quantities, product categories',
    decision: 'Which customers to remind before they are likely to reorder',
    limitation: 'Prediction slows down as the customer base grows, and features must be scaled',
  },
  project_connection: {
    feature: 'Navyakosh repeat-purchase reminders for LCB Fertilizers in LCB GrowthAI',
    why: 'Customers with similar purchase rhythms tend to reorder on similar schedules',
    fit: 'strong',
    example_is_illustrative: false,
  },
  implementation: {
    language: 'python',
    prerequisites: ['Python 3.11', 'pandas', 'scikit-learn'],
    first_task: 'Load 8 sample purchase-history rows into a pandas DataFrame and print them.',
    sample_data_note: 'Uses an inline sample of purchase history because real LCB data is not available here.',
    steps: [
      {
        title: 'Build features from purchase history',
        explanation: 'Days since last order and orders per quarter describe each customer.',
        file_path: 'backend/ml/repeat_purchase.py (proposed)',
        input_example: 'customer_id,days_since_last,orders_per_quarter,reordered\n1,20,3,1',
        code: "import pandas as pd\ndf = pd.DataFrame({'days_since_last': [20, 95], 'orders_per_quarter': [3, 1], 'reordered': [1, 0]})\nprint(df.shape)",
        expected_output: '(2, 3)',
        verify: 'The printed shape matches the sample size.',
      },
      {
        title: 'Fit k-NN and predict a reorder',
        explanation: 'Scale the features, fit k-NN with k=3, predict for a new customer.',
        file_path: '',
        input_example: 'days_since_last=25, orders_per_quarter=3',
        code: 'from sklearn.neighbors import KNeighborsClassifier\nmodel = KNeighborsClassifier(n_neighbors=3).fit(X, y)\nprint(model.predict([[25, 3]]))',
        expected_output: '[1]',
        verify: 'A frequent recent buyer is predicted to reorder.',
      },
    ],
  },
  impact: {
    kpi: 'Navyakosh 90-day repeat purchase rate',
    baseline: 'Assumed 18% (measure the real one first)',
    measurement: 'A/B test reminders for predicted reorderers against a holdout group',
    target: '+3 percentage points',
  },
  star: {
    situation: 'LCB Fertilizers wanted more Navyakosh customers to reorder.',
    task: 'I needed to decide whom to remind before they ran out.',
    action: 'I would build a k-NN model on purchase history and trigger reminders for likely reorderers.',
    result: 'I expect a higher repeat rate and would measure it with an A/B test before claiming it.',
    result_is_verified: false,
  },
  summary: 'Answers which algorithm family uses similarity and builds a k-NN reorder predictor for Navyakosh.',
};

function reply(res, content) {
  res.writeHead(200, { 'content-type': 'application/json' });
  res.end(JSON.stringify({ id: 'mock', object: 'chat.completion', choices: [{ index: 0, message: { role: 'assistant', content }, finish_reason: 'stop' }] }));
}

http
  .createServer(async (req, res) => {
    const url = new URL(req.url, 'http://x');
    if (url.pathname === '/__count') return void res.end(JSON.stringify({ lessonCalls, previewCalls }));
    if (url.pathname === '/__delay') return (delayMs = Number(url.searchParams.get('ms') || 0)), void res.end('ok');
    if (url.pathname === '/__fail') return (failNext = Number(url.searchParams.get('n') || 1)), void res.end('ok');
    if (url.pathname === '/__reset') return ((lessonCalls = previewCalls = delayMs = failNext = 0), void res.end('ok'));
    let body = '';
    for await (const chunk of req) body += chunk;
    const prompt = (JSON.parse(body || '{}').messages || []).map((m) => m.content).join('\n');

    if (prompt.includes("You organize a learner's question or topic")) {
      previewCalls++;
      const input = prompt.split('<<<LEARNER_INPUT\n')[1].split('\nLEARNER_INPUT>>>')[0];
      const ci = prompt.match(/^- (\S+): Customer Intelligence$/m);
      const topic = !input.trim().endsWith('?');
      return reply(res, JSON.stringify({
        input_type: topic ? 'topic' : 'question',
        title: topic ? 'K-nearest neighbors for repeat purchases' : 'Using k-NN to predict Navyakosh repeat purchases',
        section_id: !topic && ci ? ci[1] : 'new',
        reason: ci && !topic ? 'Repeat-purchase prediction belongs to customer intelligence.' : 'No section fits; it goes to User Questions Topics.',
        guiding_question: topic ? 'How does k-NN predict from similar examples?' : '',
      }));
    }
    if (prompt.includes('writing one practical lesson')) {
      lessonCalls++;
      if (delayMs) await new Promise((r) => setTimeout(r, delayMs));
      if (failNext > 0) {
        failNext--;
        res.writeHead(500, { 'content-type': 'application/json' });
        return void res.end(JSON.stringify({ error: { message: 'mock failure' } }));
      }
      const topic = prompt.includes('Input type: topic');
      return reply(res, '```json\n' + JSON.stringify(topic ? { ...LESSON, guiding_question: 'How does k-NN predict from similar examples?' } : LESSON) + '\n```');
    }
    if (prompt.includes('Decompose it into an ordered')) {
      return reply(res, JSON.stringify({ modules: [{ title: 'Setup', focus: 'Repo and tooling' }, { title: 'Customer Intelligence', focus: 'Segments' }] }));
    }
    return reply(res, '{}');
  })
  .listen(port, '127.0.0.1', () => console.log(`mock AI provider on ${port}`));

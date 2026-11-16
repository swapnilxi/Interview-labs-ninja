// Shared setup for the Question Review e2e scripts (*.e2e.js). See README.md.
// Plain Playwright (no test runner), in the shape of tests/e2e/ai-lms: each script registers named tests, every test
// gets fresh browser contexts and creates its own questions, and the script exits 1 when any test failed.
const { chromium } = require('playwright');
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const mock = require('./mock_llm');

const NEXT = process.env.MODE === 'next';
const BASE = (process.env.BASE_URL || 'http://localhost:4028').replace(/\/$/, '');
// FastAPI mode: the API is the Python server. nextjs-api mode: the same origin, under /api (fe-apis).
const API = NEXT ? BASE : (process.env.API_URL || 'http://localhost:8082').replace(/\/$/, '');
const API_PREFIX = NEXT ? '/api' : '';
const MOCK_PORT = Number(process.env.MOCK_PORT || 4596);
const MOCK_URL = process.env.MOCK_URL || `http://localhost:${MOCK_PORT}/v1`;
const PASSWORD = process.env.E2E_PASSWORD || 'Passw0rd!x';
const EMAILS = {
  a: process.env.E2E_USER_A || 'qr-e2e-a@test.com',
  b: process.env.E2E_USER_B || 'qr-e2e-b@test.com',
};
const SHOTS = process.env.SHOTS_DIR || path.join(__dirname, 'shots');
const TEST_TIMEOUT_MS = Number(process.env.TEST_TIMEOUT_MS || 240000);

/** The per-browser AI settings (settingsService.ts): every AI call goes to the mock through the "custom" provider. */
const AI_SETTINGS = {
  textGenerationModel: 'custom',
  answerModel: 'custom',
  customKey: 'mock-key',
  customBaseUrl: MOCK_URL,
  customModel: 'mock-model',
};
const TOKEN_KEY = 'labninja.auth.token.v1';
const SETTINGS_KEY = 'labninja.ai-settings.v1';

const uid = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function api(method, p, token, body) {
  const r = await fetch(API + API_PREFIX + p, {
    method,
    headers: { 'content-type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await r.text();
  let data = text;
  try {
    data = JSON.parse(text);
  } catch {
    /* not JSON */
  }
  return { status: r.status, data };
}

// ── Accounts ─────────────────────────────────────────────────────────────────────────────────────────────────────

/**
 * New FastAPI accounts start as `pending` (403 on every login-only route until approved); nextjs-api accounts start
 * approved. Approve the way the LMS suite sets roles: directly in the scratch DB copy ($DB, with sqlite3) when given,
 * else through the admin API with a superadmin (ADMIN_EMAIL / ADMIN_PASSWORD, e.g. one named in
 * LABNINJA_SUPERADMIN_EMAILS).
 */
async function approve(email, userId) {
  if (process.env.DB) {
    execFileSync('sqlite3', [process.env.DB, `update users set status='approved' where email='${email.replace(/'/g, "''")}'`]);
    return;
  }
  const adminEmail = process.env.ADMIN_EMAIL;
  if (!adminEmail) {
    throw new Error(
      `${email} is pending approval. Set DB=<scratch lab_ninja.sqlite3> or ADMIN_EMAIL/ADMIN_PASSWORD (a superadmin) so the suite can approve it.`
    );
  }
  const admin = await api('POST', '/auth/login', null, { email: adminEmail, password: process.env.ADMIN_PASSWORD || PASSWORD });
  if (admin.status !== 200) throw new Error(`admin login failed (${admin.status})`);
  const r = await api('POST', `/admin/users/${userId}/approve`, admin.data.access_token);
  if (r.status !== 200) throw new Error(`approving ${email} failed (${r.status}): ${JSON.stringify(r.data)}`);
}

/** Log in, or sign up the first time (idempotent), approve when pending, and point the profile's model at the mock. */
async function ensureAccount(email) {
  let r = await api('POST', '/auth/login', null, { email, password: PASSWORD });
  if (r.status !== 200) {
    r = await api('POST', '/auth/signup', null, { email, password: PASSWORD, display_name: email.split('@')[0] });
    if (r.status !== 200) throw new Error(`signup ${email} failed (${r.status}): ${JSON.stringify(r.data)}`);
  }
  let { access_token: token, user } = r.data;
  if (user && user.status === 'pending') {
    await approve(email, user.id);
    r = await api('POST', '/auth/login', null, { email, password: PASSWORD });
    ({ access_token: token, user } = r.data);
  }
  // The account's saved model wins over this browser's after a profile pull (settingsService.ts), so save "custom".
  await api('PUT', '/auth/profile', token, { text_generation_model: 'custom', answer_model: 'custom' });
  const probe = await api('GET', '/questions/review-list', token);
  if (probe.status !== 200) throw new Error(`${email} cannot use /questions (${probe.status}): ${JSON.stringify(probe.data)}`);
  return { email, token, user };
}

// ── Test data ────────────────────────────────────────────────────────────────────────────────────────────────────

/**
 * Fresh questions owned by `account` (a new session each call, so tests never share state). Topics carry a unique
 * tag, so a batch is "related" only to itself.
 */
async function createQuestions(account, count = 1, opts = {}) {
  const s = await api('POST', '/sessions', account.token, {});
  if (s.status !== 200 && s.status !== 201) throw new Error(`POST /sessions ${s.status}: ${JSON.stringify(s.data)}`);
  const tag = uid();
  const questions = Array.from({ length: count }, (_, i) => ({
    section: 'A',
    number: i + 1,
    category: 'interview',
    sub_type: opts.subType || 'System Design',
    difficulty: opts.difficulty || 'medium',
    topics: opts.topics || ['Rate limiting', `e2e-${tag}`],
    question_text:
      (opts.texts && opts.texts[i]) || `E2E ${tag} Q${i + 1}: How would you design a rate limiter for a public API?`,
  }));
  const r = await api('POST', '/sessions/questions', account.token, { session_id: s.data.session_id, questions });
  if (r.status !== 200 && r.status !== 201) throw new Error(`POST /sessions/questions ${r.status}: ${JSON.stringify(r.data)}`);
  return r.data.inserted_ids.map((id, i) => ({ id, text: questions[i].question_text, topics: questions[i].topics, subType: questions[i].sub_type }));
}

/** Empty this account's review list (other tests leave theirs as they like). */
async function clearReviewList(account) {
  const list = await api('GET', '/questions/review-list', account.token);
  for (const item of list.data.items || []) await api('DELETE', `/questions/${item.question_id}/review`, account.token);
}

// ── Browser ──────────────────────────────────────────────────────────────────────────────────────────────────────

/**
 * Silences "Listen": the server voice (POST /api/voice/tts) is answered 503 by a route, so playback falls back to
 * speechSynthesis, which this stub replaces. Utterances are recorded in window.__spoken and never end on their own.
 */
function listenStub() {
  window.__spoken = [];
  try {
    HTMLMediaElement.prototype.play = function play() {
      return Promise.resolve();
    };
    HTMLMediaElement.prototype.pause = function pause() {};
  } catch {
    /* no media elements */
  }
  if ('speechSynthesis' in window) {
    const s = window.speechSynthesis;
    s.speak = (u) => {
      if (u && u.text) window.__spoken.push(u.text);
    };
    s.cancel = () => {};
    s.pause = () => {};
    s.resume = () => {};
  }
}

class TestFailure extends Error {}

function suite(file) {
  const tests = [];
  const consoleErrors = [];
  const results = [];

  async function newPage(browser, t, { account, viewport = { width: 1400, height: 900 }, mobile = false, listen = false } = {}) {
    const ctx = await browser.newContext({
      viewport,
      ...(mobile ? { isMobile: true, hasTouch: true, deviceScaleFactor: 3 } : {}),
    });
    t.contexts.push(ctx);
    ctx.setDefaultTimeout(30000);
    ctx.setDefaultNavigationTimeout(120000);
    if (account) {
      await ctx.addInitScript(
        ({ token, settings, tokenKey, settingsKey }) => {
          try {
            localStorage.setItem(tokenKey, token);
            const cur = JSON.parse(localStorage.getItem(settingsKey) || '{}');
            localStorage.setItem(settingsKey, JSON.stringify({ ...cur, ...settings }));
          } catch {
            /* about:blank */
          }
        },
        { token: account.token, settings: AI_SETTINGS, tokenKey: TOKEN_KEY, settingsKey: SETTINGS_KEY }
      );
    }
    if (listen) {
      await ctx.addInitScript(listenStub);
      await ctx.route(
        (url) => url.pathname.endsWith('/api/voice/tts'),
        (route) => route.fulfill({ status: 503, contentType: 'application/json', body: '{"detail":"voice off in e2e"}' })
      );
    }
    const page = await ctx.newPage();
    page.on('pageerror', (e) => consoleErrors.push(`[${t.name}] pageerror: ${e.message}`));
    page.on('console', (m) => {
      if (m.type() === 'error' && !/favicon|Failed to load resource|status of (4|5)\d\d/.test(m.text()))
        consoleErrors.push(`[${t.name}] ${m.text().slice(0, 300)}`);
    });
    t.pages.push(page);
    return page;
  }

  /** Opens the review page and waits until the question and the saved workspace have loaded. */
  async function openReview(page, id, { from, mode, ready = true } = {}) {
    const qs = `id=${id}${from === 'review' ? '&from=review' : ''}${mode ? `&mode=${mode}` : ''}`;
    await page.goto(`${BASE}/question-review?${qs}`, { waitUntil: 'domcontentloaded' });
    if (!ready) return;
    await page.locator('#qr-title').waitFor({ timeout: 120000 });
    await waitReady(page);
  }

  /** The bookmark button is disabled until the saved workspace has loaded (useWorkspace's status 'ready'). */
  async function waitReady(page) {
    const nav = page.getByRole('navigation', { name: 'Question' });
    await until(
      async () => {
        const b = nav.getByRole('button', { name: /review list/i });
        return (await b.count()) === 1 && (await b.isEnabled());
      },
      { label: 'workspace loaded (review button enabled)', timeout: 60000 }
    );
  }

  /** Reload (without waiting for every asset) and wait for the question and its workspace again. */
  async function reload(page) {
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.locator('#qr-title').waitFor({ timeout: 120000 });
    await waitReady(page);
  }

  async function until(fn, { timeout = 30000, label = 'condition', interval = 150 } = {}) {
    const end = Date.now() + timeout;
    let last;
    while (Date.now() < end) {
      try {
        last = await fn();
        if (last) return last;
      } catch (e) {
        last = e;
      }
      await sleep(interval);
    }
    throw new TestFailure(`timed out waiting for: ${label}${last instanceof Error ? ` (${last.message.split('\n')[0]})` : ''}`);
  }

  /** The next request (and its response) whose path ends with `suffix` and method matches. */
  function nextCall(page, method, suffix, timeout = 60000) {
    const match = (r) => r.request().method() === method && new URL(r.url()).pathname.endsWith(suffix);
    return page.waitForResponse(match, { timeout });
  }

  return {
    test(name, fn) {
      tests.push({ name, fn });
    },
    helpers: { openReview, reload, waitReady, until, nextCall },

    async run() {
      fs.mkdirSync(SHOTS, { recursive: true });
      let mockHandle = null;
      try {
        mockHandle = await mock.start(MOCK_PORT, { quiet: true });
      } catch (e) {
        if (e.code !== 'EADDRINUSE') throw e;
        const probe = await fetch(`http://localhost:${MOCK_PORT}/__calls`).catch(() => null);
        if (!probe || !probe.ok) throw new Error(`port ${MOCK_PORT} is taken by something that is not mock_llm.js`);
      }
      const mockCalls = async () => {
        const r = await fetch(`http://localhost:${MOCK_PORT}/__calls`);
        return r.json();
      };

      console.log(`# ${file}  (${NEXT ? 'nextjs-api' : 'FastAPI'} mode, app ${BASE}, api ${API + API_PREFIX}, mock ${MOCK_URL})`);
      const accounts = { a: await ensureAccount(EMAILS.a), b: await ensureAccount(EMAILS.b) };
      const browser = await chromium.launch({ channel: process.env.PW_CHANNEL || 'chromium', headless: !process.env.HEADED });
      const grep = process.env.GREP ? new RegExp(process.env.GREP, 'i') : null;

      for (const { name, fn } of tests) {
        if (grep && !grep.test(name)) continue;
        const t = {
          name,
          contexts: [],
          pages: [],
          checks: [],
          a: accounts.a,
          b: accounts.b,
          check(label, ok, extra = '') {
            t.checks.push({ label, ok: !!ok, extra });
            if (!ok) console.log(`    FAIL  ${label}${extra ? '  — ' + extra : ''}`);
          },
          page: (opts = {}) => newPage(browser, t, { account: accounts.a, ...opts }),
          guestPage: (opts = {}) => newPage(browser, t, { ...opts, account: null }),
          shot: (page, n) => page.screenshot({ path: path.join(SHOTS, `${file.replace(/\.e2e\.js$/, '')}-${n}.png`) }),
          mockCalls,
        };
        const started = Date.now();
        let error = null;
        let timer;
        try {
          await Promise.race([
            fn(t),
            new Promise((_, rej) => {
              timer = setTimeout(() => rej(new TestFailure(`test timed out after ${TEST_TIMEOUT_MS / 1000}s`)), TEST_TIMEOUT_MS);
            }),
          ]);
        } catch (e) {
          error = e;
        } finally {
          clearTimeout(timer);
        }
        const failedChecks = t.checks.filter((c) => !c.ok);
        const ok = !error && failedChecks.length === 0;
        if (!ok && t.pages.length) {
          const p = t.pages[t.pages.length - 1];
          await p
            .screenshot({ path: path.join(SHOTS, `FAIL-${name.replace(/[^a-z0-9]+/gi, '_')}.png`) })
            .catch(() => {});
        }
        for (const c of t.contexts) await c.close().catch(() => {});
        const secs = ((Date.now() - started) / 1000).toFixed(1);
        console.log(
          `${ok ? 'PASS' : 'FAIL'}  ${name}  (${t.checks.length} checks, ${secs}s)${error ? `\n    ERROR ${String(error.message || error).split('\n')[0]}` : ''}`
        );
        results.push({ name, ok, checks: t.checks.length, failed: failedChecks.map((c) => c.label), error: error ? String(error.message || error) : null, secs: Number(secs) });
      }

      await browser.close();
      if (mockHandle) mockHandle.server.close();
      const failed = results.filter((r) => !r.ok);
      console.log(`\n${results.length - failed.length}/${results.length} tests passed in ${file}`);
      if (consoleErrors.length) console.log('Browser console/page errors:\n  ' + [...new Set(consoleErrors)].slice(0, 30).join('\n  '));
      fs.writeFileSync(path.join(SHOTS, `results-${file.replace(/\.e2e\.js$/, '')}.json`), JSON.stringify({ file, results, consoleErrors: [...new Set(consoleErrors)] }, null, 2));
      process.exit(failed.length ? 1 : 0);
    },
  };
}

module.exports = {
  NEXT,
  BASE,
  API,
  API_PREFIX,
  MOCK_URL,
  api,
  uid,
  sleep,
  createQuestions,
  clearReviewList,
  suite,
  TestFailure,
};

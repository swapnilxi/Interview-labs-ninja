// Question Review e2e: login guards (page + API), error states (not found, failed loads and their retry), phone width.
const { BASE, api, createQuestions, suite } = require('./lib');

const s = suite('guards.e2e.js');
const { openReview, reload, waitReady, until, nextCall } = s.helpers;

s.test('guard: a guest is sent to /login?next=… and comes back after logging in', async (t) => {
  const [q] = await createQuestions(t.a, 1);
  const page = await t.guestPage();
  await page.goto(`${BASE}/question-review?id=${q.id}`, { waitUntil: 'domcontentloaded' });
  await page.waitForURL((u) => u.pathname === '/login', { timeout: 120000 });
  const next = new URL(page.url()).searchParams.get('next');
  t.check('login URL carries next=/question-review?id=<n>', next === `/question-review?id=${q.id}`, String(next));
  t.check('no question content shown to the guest', (await page.locator('#qr-title').count()) === 0);

  await page.locator('#login-email').fill(t.a.email);
  await page.locator('#login-password').fill(process.env.E2E_PASSWORD || 'Passw0rd!x');
  await page.getByRole('button', { name: 'Sign In' }).click();
  await page.waitForURL((u) => u.pathname === '/question-review' && u.searchParams.get('id') === String(q.id), { timeout: 60000 });
  await page.locator('#qr-title').waitFor({ timeout: 60000 });
  t.check('after logging in, the question is shown', (await page.locator('#qr-title').innerText()).includes(q.text.slice(0, 30)));
});

s.test('guard: the review API answers 401 without a token', async (t) => {
  const [q] = await createQuestions(t.a, 1);
  const id = q.id;
  const calls = [
    ['GET', `/questions/${id}`],
    ['GET', `/questions/${id}/workspace`],
    ['PUT', `/questions/${id}/workspace`, { answer: 'x' }],
    ['GET', `/questions/${id}/quiz`],
    ['POST', `/questions/${id}/quiz/generate`, { count: 1 }],
    ['DELETE', `/questions/${id}/quiz`],
    ['GET', `/questions/${id}/study`],
    ['POST', `/questions/${id}/study/quick`, {}],
    ['POST', `/questions/${id}/study/deep/expand`, { section: 0 }],
    ['PUT', `/questions/${id}/study/breakdown/progress`, { done: [] }],
    ['GET', '/questions/review-list'],
    ['PUT', `/questions/${id}/review`],
    ['DELETE', `/questions/${id}/review`],
    ['PATCH', `/questions/${id}/performance`, { user_performance: 5 }],
  ];
  for (const [m, p, body] of calls) {
    const none = await api(m, p, null, body);
    t.check(`${m} ${p} without a token → 401`, none.status === 401, String(none.status));
  }
  const bad = await api('GET', `/questions/${id}/workspace`, 'not-a-real-token');
  t.check('a forged token → 401', bad.status === 401, String(bad.status));
  const ws = await api('GET', `/questions/${id}/workspace`, t.a.token);
  t.check('the same call with a token → 200 (control)', ws.status === 200, String(ws.status));
});

s.test('errors: an unknown id shows "Question not found"', async (t) => {
  const page = await t.page();
  for (const id of ['999999999', 'abc']) {
    await page.goto(`${BASE}/question-review?id=${id}`, { waitUntil: 'domcontentloaded' });
    await page.getByRole('heading', { name: 'Question not found' }).waitFor({ timeout: 120000 });
    t.check(`id=${id}: not-found card with a way back to the bank`, (await page.getByRole('link', { name: 'Browse the question bank' }).count()) === 1);
  }
  const r = await api('GET', '/questions/999999999', t.a.token);
  t.check('API: GET /questions/999999999 → 404', r.status === 404, String(r.status));
});

s.test('errors: a failed question load shows "Try again", which recovers', async (t) => {
  const [q] = await createQuestions(t.a, 1);
  const page = await t.page();
  let fail = true;
  let hits = 0;
  await page.route(
    (u) => u.pathname.endsWith(`/questions/${q.id}`),
    (route) => {
      if (route.request().method() === 'GET' && fail) {
        hits += 1;
        return route.fulfill({ status: 500, contentType: 'application/json', body: '{"detail":"Forced e2e failure"}' });
      }
      return route.continue();
    }
  );
  await openReview(page, q.id, { ready: false });
  await page.getByRole('heading', { name: "Couldn't load this question" }).waitFor({ timeout: 120000 });
  t.check('the forced 500 was served', hits >= 1, String(hits));
  t.check('the error card says what failed', (await page.getByText(/Forced e2e failure/).count()) > 0);
  fail = false;
  await page.getByRole('button', { name: 'Try again' }).click();
  await page.locator('#qr-title').waitFor();
  t.check('Try again loads the question', (await page.locator('#qr-title').innerText()).includes(q.text.slice(0, 30)));
});

s.test('errors: a failed workspace load blocks saving, and Retry recovers (typed text is kept and saved)', async (t) => {
  const [q] = await createQuestions(t.a, 1);
  const page = await t.page();
  let fail = true;
  const puts = [];
  await page.route(
    (u) => u.pathname.endsWith(`/questions/${q.id}/workspace`),
    (route) => {
      const m = route.request().method();
      if (m === 'PUT') puts.push(route.request().postDataJSON());
      if (m === 'GET' && fail) return route.fulfill({ status: 500, contentType: 'application/json', body: '{"detail":"Forced e2e failure"}' });
      return route.continue();
    }
  );
  await openReview(page, q.id, { ready: false });
  const panel = page.getByRole('tabpanel', { name: 'Answer' });
  const banner = panel.getByRole('alert').filter({ hasText: 'Your saved answer could not be loaded' });
  await banner.waitFor({ timeout: 120000 });
  const typed = 'Typed while the load had failed';
  await panel.getByLabel('Your answer', { exact: true }).fill(typed);
  await page.waitForTimeout(1800); // longer than the 800ms auto-save debounce
  t.check('nothing is saved while the saved copy is not loaded', puts.length === 0, JSON.stringify(puts));
  fail = false;
  const saved = nextCall(page, 'PUT', `/questions/${q.id}/workspace`);
  await banner.getByRole('button', { name: 'Retry' }).click();
  const res = await saved;
  t.check('after Retry, the typed text is saved', res.status() === 200 && (await res.json()).answer === typed);
  await until(async () => (await banner.count()) === 0, { label: 'error banner gone' });
  await reload(page);
  t.check('and survives a reload', (await panel.getByLabel('Your answer', { exact: true }).inputValue()) === typed);
});

s.test('phone (390px): no sideways scroll; the question and the switcher are in the first screen', async (t) => {
  const [q] = await createQuestions(t.a, 1);
  const page = await t.page({ viewport: { width: 390, height: 844 }, mobile: true });
  await openReview(page, q.id);
  const vh = 844;
  const overflow = () =>
    page.evaluate(() => ({
      doc: document.documentElement.scrollWidth,
      body: document.body.scrollWidth,
      vw: document.documentElement.clientWidth,
    }));
  const o = await overflow();
  t.check('no horizontal overflow on load', o.doc <= o.vw && o.body <= o.vw, JSON.stringify(o));
  const title = await page.locator('#qr-title').boundingBox();
  const tabs = await page.getByRole('tablist', { name: 'Work on this question' }).boundingBox();
  t.check('question title is in the first viewport', title && title.y >= 0 && title.y + Math.min(title.height, 40) <= vh, JSON.stringify(title));
  t.check('pane switcher is fully in the first viewport', tabs && tabs.y >= 0 && tabs.y + tabs.height <= vh, JSON.stringify(tabs));
  // …and not hidden under the fixed header or the phone tab bar: the topmost element at their centres is their own.
  const onTop = await page.evaluate(() => {
    const hit = (el) => {
      const r = el.getBoundingClientRect();
      const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return !!top && el.contains(top);
    };
    return { title: hit(document.getElementById('qr-title')), tabs: hit(document.querySelector('[role="tablist"]')) };
  });
  t.check('nothing covers the question or the switcher', onTop.title && onTop.tabs, JSON.stringify(onTop));
  t.check('the shortcuts button is hidden on a touch screen', (await page.getByRole('button', { name: 'Keyboard shortcuts' }).count()) === 0);
  t.check('Focus/Split is not offered below 1024px', (await page.getByRole('group', { name: 'Layout' }).count()) === 0);
  for (const tab of ['AI tutor', 'Quiz', 'Notes', 'Answer']) {
    await page.getByRole('tab', { name: tab }).click();
    const r = await overflow();
    t.check(`no horizontal overflow on the ${tab} pane`, r.doc <= r.vw && r.body <= r.vw, JSON.stringify(r));
  }
  await t.shot(page, 'phone-390');
});

s.run().catch((e) => {
  console.error('SCRIPT ERROR', e);
  process.exit(2);
});

// Question Review e2e: the Study row. Quick review (content, Listen, Regenerate behind its confirm), Breakdown
// (Mark as read persists, reopening resumes at the first unread lesson), Dive deep (Go deeper until depth 3) and
// Send to SwipeLearn (the link's params, then cards written by the mock on /swipe-learn?topic=<slug>).
const { api, createQuestions, suite } = require('./lib');

const s = suite('study.e2e.js');
const { openReview, reload, until, nextCall } = s.helpers;

const study = async (account, id) => (await api('GET', `/questions/${id}/study`, account.token)).data;

/** Opens a study sheet from the Study row and returns its dialog. */
async function openSheet(page, label) {
  await page.getByRole('region', { name: 'Study' }).getByRole('button', { name: label, exact: true }).click();
  const sheet = page.getByRole('dialog', { name: label });
  await sheet.waitFor();
  return sheet;
}

s.test('quick review: content, Listen (stubbed, silent), Regenerate behind its confirm', async (t) => {
  const [q] = await createQuestions(t.a, 1);
  const page = await t.page({ listen: true });
  await openReview(page, q.id);
  const gen = nextCall(page, 'POST', `/questions/${q.id}/study/quick`);
  const sheet = await openSheet(page, 'Quick review');
  t.check('first open writes it (POST study/quick)', (await gen).status() === 200);
  const heading = sheet.getByRole('heading', { name: /^Mock quick review \d+$/ });
  await heading.waitFor();
  const title1 = await heading.innerText();
  t.check('summary, key points, Remember and Watch out are shown',
    (await sheet.getByText(/^MOCK-QUICK summary/).count()) === 1 &&
      (await sheet.getByRole('heading', { name: 'Key points' }).count()) === 1 &&
      (await sheet.getByRole('complementary', { name: 'Remember' }).count()) === 1 &&
      (await sheet.getByRole('complementary', { name: 'Watch out' }).count()) === 1);
  t.check('read time is shown', (await sheet.getByText(/min read/).count()) === 1);

  // Listen: the server voice is stubbed off, so it reads with the (stubbed) device voice.
  await sheet.getByRole('button', { name: 'Listen: read this aloud' }).click();
  const pause = sheet.getByRole('button', { name: 'Pause' });
  await pause.waitFor();
  t.check('Listen starts playing (Pause shown, pressed)', (await pause.getAttribute('aria-pressed')) === 'true');
  const spoken = await page.evaluate(() => (window.__spoken || []).join(' '));
  t.check('the stubbed voice got the sheet text', spoken.includes(title1) && spoken.includes('Key points'), spoken.slice(0, 80));
  t.check('the device-voice note is shown', (await sheet.getByText('Reading with your device’s voice.').count()) === 1);
  await pause.click();
  await sheet.getByRole('button', { name: 'Resume' }).waitFor();
  t.check('Pause → Resume', true);
  const speed = sheet.getByRole('button', { name: /^Reading speed 1 times/ });
  await speed.click();
  t.check('the speed chip cycles to 1.25×', (await sheet.getByRole('button', { name: /^Reading speed 1.25 times/ }).count()) === 1);

  // Regenerate: Cancel keeps it; Regenerate replaces it.
  let posts = 0;
  page.on('request', (r) => {
    if (r.method() === 'POST' && new URL(r.url()).pathname.endsWith(`/questions/${q.id}/study/quick`)) posts += 1;
  });
  await sheet.getByRole('button', { name: 'Regenerate' }).click();
  const confirm = page.getByRole('alertdialog', { name: 'Write a new quick review?' });
  await confirm.waitFor();
  await confirm.getByRole('button', { name: 'Cancel' }).click();
  await confirm.waitFor({ state: 'hidden' });
  await page.waitForTimeout(500);
  t.check('Cancel writes nothing', posts === 0 && (await heading.innerText()) === title1);
  const regen = nextCall(page, 'POST', `/questions/${q.id}/study/quick`);
  await sheet.getByRole('button', { name: 'Regenerate' }).click();
  await confirm.getByRole('button', { name: 'Regenerate' }).click();
  const res = await regen;
  t.check('Regenerate sends refresh: true', res.request().postDataJSON().refresh === true);
  await until(async () => (await heading.innerText()) !== title1, { label: 'new quick review' });
  const title2 = await heading.innerText();
  t.check('API: the new version is stored', (await study(t.a, q.id)).quick.title === title2);
  await sheet.getByRole('button', { name: 'Done' }).click();
  await sheet.waitFor({ state: 'hidden' });
  t.check('closing the sheet stops reading', (await page.getByRole('button', { name: 'Pause' }).count()) === 0);
});

s.test('breakdown: Mark as read persists; reopening resumes at the first unread lesson', async (t) => {
  const [q] = await createQuestions(t.a, 1);
  const page = await t.page({ listen: true });
  await openReview(page, q.id);
  let sheet = await openSheet(page, 'Breakdown');
  await sheet.getByText('Lesson 1 of 3').waitFor();
  t.check('lesson 1 is shown first', (await sheet.getByRole('heading', { name: /^Mock lesson 1 / }).count()) === 1);
  await sheet.getByRole('button', { name: 'Check yourself' }).click();
  t.check('Check yourself reveals the question', (await sheet.getByText('Can you explain key term 1?').count()) === 1);
  const prog = nextCall(page, 'PUT', `/questions/${q.id}/study/breakdown/progress`);
  await sheet.getByRole('button', { name: 'Mark as read' }).click();
  t.check('Mark as read saves done=[0]', JSON.stringify((await prog).request().postDataJSON().done) === '[0]');
  await sheet.getByText('Lesson 2 of 3').waitFor();
  t.check('it moves on to lesson 2', true);
  await sheet.getByRole('button', { name: 'Done' }).click();
  await sheet.waitFor({ state: 'hidden' });

  let generated = 0;
  page.on('request', (r) => {
    if (r.method() === 'POST' && new URL(r.url()).pathname.endsWith(`/questions/${q.id}/study/breakdown`)) generated += 1;
  });
  await reload(page);
  sheet = await openSheet(page, 'Breakdown');
  await sheet.getByText('Lesson 2 of 3').waitFor();
  t.check('after a reload it resumes at lesson 2 (first unread), without writing a new one', generated === 0);
  await sheet.getByRole('button', { name: 'Previous lesson' }).click();
  await sheet.getByText('Lesson 1 of 3').waitFor();
  const read = sheet.getByRole('button', { name: 'Read', exact: true });
  t.check('lesson 1 is still marked as read', (await read.getAttribute('aria-pressed')) === 'true');
  t.check('API: breakdown.done is [0]', JSON.stringify((await study(t.a, q.id)).breakdown.done) === '[0]');
});

s.test('dive deep: Go deeper adds a layer, and is hidden at depth 3', async (t) => {
  const [q] = await createQuestions(t.a, 1);
  const page = await t.page();
  await openReview(page, q.id);
  const sheet = await openSheet(page, 'Dive deep');
  const sec = sheet.getByRole('region', { name: 'Mock deep section 1' });
  await sec.waitFor();
  t.check('three sections, each at depth 1 with Go deeper', (await sheet.getByRole('button', { name: 'Go deeper' }).count()) === 3 && (await sec.getByRole('img', { name: 'Depth 1 of 3' }).count()) === 1);
  t.check('Explore next lists the follow-ups', (await sheet.getByText('Mock further: leaky buckets').count()) === 1);
  for (const depth of [2, 3]) {
    const call = nextCall(page, 'POST', `/questions/${q.id}/study/deep/expand`);
    await sec.getByRole('button', { name: 'Go deeper' }).click();
    t.check(`expand ${depth - 1} asks for section 0`, (await call).request().postDataJSON().section === 0);
    await sec.getByRole('img', { name: `Depth ${depth} of 3` }).waitFor();
    t.check(`the level-${depth} layer is shown`, (await sec.getByText(new RegExp(`MOCK-DEEPER layer at level ${depth}`)).count()) === 1);
  }
  t.check('at depth 3 the section has no Go deeper', (await sec.getByRole('button', { name: 'Go deeper' }).count()) === 0);
  t.check('the other sections still do', (await sheet.getByRole('button', { name: 'Go deeper' }).count()) === 2);
  const deep = (await study(t.a, q.id)).deep;
  t.check('API: section 0 is at depth 3', deep.sections[0].depth === 3 && deep.sections[1].depth === 1);
  const refused = await api('POST', `/questions/${q.id}/study/deep/expand`, t.a.token, { section: 0, model: 'custom' });
  t.check('API: a 4th level is refused (400)', refused.status === 400, String(refused.status));
});

s.test('Send to SwipeLearn: the link carries from/qid/label/focus and lands on ?topic=<slug> with mock cards', async (t) => {
  const [q] = await createQuestions(t.a, 1, { topics: ['Token bucket', 'System Design'] });
  const page = await t.page();
  await openReview(page, q.id);
  const link = page.getByRole('link', { name: 'Send to SwipeLearn' });
  const href = new URL(await link.getAttribute('href'), 'http://x');
  const p = href.searchParams;
  t.check('link goes to /swipe-learn', href.pathname === '/swipe-learn');
  t.check('from=question & qid', p.get('from') === 'question' && p.get('qid') === String(q.id));
  t.check('label is the first specific topic', p.get('label') === 'Token bucket', p.get('label'));
  t.check('focus is the question text', p.get('focus') === q.text);

  const gen = page.waitForRequest((r) => r.method() === 'POST' && new URL(r.url()).pathname.endsWith('/swipe-learn/generate'), { timeout: 180000 });
  await link.click();
  await page.waitForURL((u) => u.pathname === '/swipe-learn' && u.searchParams.get('topic') === 'token-bucket' && !u.searchParams.has('from'), { timeout: 180000 });
  t.check('lands on /swipe-learn?topic=token-bucket (intent params dropped)', true);
  const body = (await gen).postDataJSON();
  t.check('the generate request is about the question, through the mock provider', body.focus === q.text && body.topic.id === 'token-bucket' && body.model === 'custom', JSON.stringify({ focus: body.focus, topic: body.topic, model: body.model }));
  await page.getByText(/^MOCK-CARD \d+ about:/).first().waitFor({ timeout: 60000 });
  t.check('a mock card is on screen', true);
  t.check('the mock wrote the cards', (await t.mockCalls()).some((c) => c.kind === 'swipe-cards'));
  await t.shot(page, 'swipelearn');
});

s.run().catch((e) => {
  console.error('SCRIPT ERROR', e);
  process.exit(2);
});

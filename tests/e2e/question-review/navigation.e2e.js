// Question Review e2e: mastery (per user), the review list (bookmark, Question Bank filter, previous / next with
// from=review), keyboard shortcuts and the Focus / Split layout.
const { BASE, api, createQuestions, clearReviewList, suite } = require('./lib');

const s = suite('navigation.e2e.js');
const { openReview, reload, until, nextCall } = s.helpers;

const perf = async (account, id) => (await api('GET', `/questions/${id}`, account.token)).data.user_performance;
const reviewIds = async (account) => ((await api('GET', '/questions/review-list', account.token)).data.items || []).map((i) => i.question_id);
const urlId = (page) => new URL(page.url()).searchParams.get('id');

/** Waits for the header's "<list> · i of n" once previous / next has loaded. */
async function waitPosition(page, text) {
  await page.getByRole('navigation', { name: 'Question' }).getByText(text).waitFor({ timeout: 30000 });
}

s.test('mastered: toggles, persists, and is per user (A and B never see each other\'s rating)', async (t) => {
  const [q] = await createQuestions(t.a, 1);
  const pa = await t.page();
  await openReview(pa, q.id);
  const markA = pa.getByRole('button', { name: /^(Mark as mastered|Mastered)$/ });
  t.check('A starts unrated', (await markA.getAttribute('aria-pressed')) === 'false' && (await pa.getByText('Not rated yet').count()) === 1);
  const patch = nextCall(pa, 'PATCH', `/questions/${q.id}/performance`);
  await markA.click();
  t.check('marking sends user_performance 5', (await patch).request().postDataJSON().user_performance === 5);
  await until(async () => (await markA.getAttribute('aria-pressed')) === 'true', { label: 'A shows Mastered' });
  await reload(pa);
  t.check('A: Mastered survives a reload', (await markA.getAttribute('aria-pressed')) === 'true' && (await markA.innerText()).includes('Mastered'));
  t.check('API: A is 5, B is unrated', (await perf(t.a, q.id)) === 5 && (await perf(t.b, q.id)) === null);

  const pb = await t.page({ account: t.b });
  await openReview(pb, q.id);
  const markB = pb.getByRole('button', { name: /^(Mark as mastered|Mastered)$/ });
  t.check('B sees the same question unrated', (await markB.getAttribute('aria-pressed')) === 'false' && (await pb.getByText('Not rated yet').count()) === 1);
  const patchB = nextCall(pb, 'PATCH', `/questions/${q.id}/performance`);
  await markB.click();
  await patchB;
  await until(async () => (await markB.getAttribute('aria-pressed')) === 'true', { label: 'B shows Mastered' });

  // A un-marks: back to 3 (no earlier rating); B keeps 5.
  const unpatch = nextCall(pa, 'PATCH', `/questions/${q.id}/performance`);
  await markA.click();
  t.check('un-marking with no earlier rating sends 3', (await unpatch).request().postDataJSON().user_performance === 3);
  await until(async () => (await markA.getAttribute('aria-pressed')) === 'false', { label: 'A no longer mastered' });
  t.check('A shows "Rated 3 of 5"', (await pa.locator('#qr-title').locator('..').getByText('Rated 3 of 5', { exact: true }).count()) === 1);
  t.check('API: A is 3, B still 5', (await perf(t.a, q.id)) === 3 && (await perf(t.b, q.id)) === 5);
  await reload(pb);
  t.check('B still Mastered after A changed theirs', (await markB.getAttribute('aria-pressed')) === 'true');
});

s.test('review list: bookmark persists, the Question Bank "Review list" filter shows it, previous / next with from=review', async (t) => {
  await clearReviewList(t.a);
  const [q0, q1, q2] = await createQuestions(t.a, 3);
  const page = await t.page();
  await openReview(page, q0.id);
  const nav = page.getByRole('navigation', { name: 'Question' });
  const add = nav.getByRole('button', { name: 'Add to review list' });
  t.check('not on the review list at first', (await add.getAttribute('aria-pressed')) === 'false');
  const put = nextCall(page, 'PUT', `/questions/${q0.id}/review`);
  await add.click();
  t.check('bookmarking sends PUT review', (await put).status() === 200);
  const on = nav.getByRole('button', { name: 'On your review list' });
  await on.waitFor();
  t.check('the button shows it is on the list', (await on.getAttribute('aria-pressed')) === 'true');
  await reload(page);
  t.check('still bookmarked after a reload', (await nav.getByRole('button', { name: 'On your review list' }).getAttribute('aria-pressed')) === 'true');
  t.check('API: the review list holds it', JSON.stringify(await reviewIds(t.a)) === JSON.stringify([q0.id]));

  // Question Bank → Show: Review list.
  await page.goto(`${BASE}/daily-session?tab=question-bank`, { waitUntil: 'domcontentloaded' });
  // The filter <select> sits in a <label> whose name also holds the selected option ("Show All questions").
  const show = page.getByRole('combobox', { name: /^Show\b/ });
  await show.waitFor({ timeout: 120000 });
  await show.selectOption('Review List');
  const row = page.getByRole('button', { name: q0.text, exact: true });
  await row.waitFor();
  t.check('the Review list filter shows the bookmarked question only', (await page.getByRole('button', { name: q1.text, exact: true }).count()) === 0 && (await page.getByRole('button', { name: q2.text, exact: true }).count()) === 0);
  await row.click();
  await page.waitForURL((u) => u.pathname === '/question-review' && u.searchParams.get('id') === String(q0.id) && u.searchParams.get('from') === 'review');
  t.check('opening it from the filtered bank carries from=review', true);

  // A second bookmark (newest first): the list is [q1, q0].
  await api('PUT', `/questions/${q1.id}/review`, t.a.token);
  await reload(page);
  await waitPosition(page, 'Review list · 2 of 2');
  t.check('q0 has no next on the review list', await nav.getByRole('button', { name: 'Next question' }).isDisabled());
  await nav.getByRole('link', { name: 'Previous question' }).click();
  await page.waitForURL((u) => u.searchParams.get('id') === String(q1.id) && u.searchParams.get('from') === 'review');
  await waitPosition(page, 'Review list · 1 of 2');
  t.check('Previous goes to q1 (newest), first on the list', (await page.locator('#qr-title').innerText()) === q1.text);
  t.check('q1 has no previous', await nav.getByRole('button', { name: 'Previous question' }).isDisabled());
  await nav.getByRole('link', { name: 'Next question' }).click();
  await page.waitForURL((u) => u.searchParams.get('id') === String(q0.id) && u.searchParams.get('from') === 'review');
  t.check('Next goes back to q0', true);

  // Un-bookmark.
  const del = nextCall(page, 'DELETE', `/questions/${q0.id}/review`);
  await nav.getByRole('button', { name: 'On your review list' }).click();
  t.check('un-bookmarking sends DELETE review', (await del).status() === 200);
  await nav.getByRole('button', { name: 'Add to review list' }).waitFor();
  t.check('API: q0 left the review list', !(await reviewIds(t.a)).includes(q0.id));
  await clearReviewList(t.a);
});

s.test('keyboard: J/K and ←/→ step through the list, 1-4 switch panes, ? opens shortcuts, typing never navigates', async (t) => {
  await clearReviewList(t.a);
  const [q0, q1, q2] = await createQuestions(t.a, 3);
  // Newest first, so adding q2, q1, q0 gives the order [q0, q1, q2].
  for (const q of [q2, q1, q0]) await api('PUT', `/questions/${q.id}/review`, t.a.token);
  t.check('API: review list order is q0, q1, q2', JSON.stringify(await reviewIds(t.a)) === JSON.stringify([q0.id, q1.id, q2.id]));
  const page = await t.page();
  await openReview(page, q1.id, { from: 'review' });
  await waitPosition(page, '2 of 3');
  const title = page.locator('#qr-title');
  const go = async (key, q, pos) => {
    await page.keyboard.press(key);
    await page.waitForURL((u) => u.searchParams.get('id') === String(q.id) && u.searchParams.get('from') === 'review');
    await until(async () => (await title.innerText()) === q.text, { label: `title of ${key} target` });
    await waitPosition(page, pos);
  };
  await go('j', q2, '3 of 3');
  t.check('J → next question', true);
  await go('k', q1, '2 of 3');
  t.check('K → previous question', true);
  await go('ArrowLeft', q0, '1 of 3');
  t.check('← → previous question', true);
  await go('ArrowRight', q1, '2 of 3');
  t.check('→ → next question', true);

  // 1-4: panes, and the address follows.
  const tab = (name) => page.getByRole('tab', { name });
  const mode = () => new URL(page.url()).searchParams.get('mode');
  for (const [key, name, m] of [['2', 'AI tutor', 'tutor'], ['3', 'Quiz', 'quiz'], ['4', 'Notes', 'notes'], ['1', 'Answer', null]]) {
    await page.locator('body').click({ position: { x: 5, y: 300 } });
    await page.keyboard.press(key);
    await until(async () => (await tab(name).getAttribute('aria-selected')) === 'true' && mode() === m, { label: `key ${key} → ${name}` });
    t.check(`${key} → ${name} pane (mode=${m ?? 'none'})`, await page.getByRole('tabpanel', { name }).isVisible());
  }
  await page.keyboard.press('4');
  await until(async () => mode() === 'notes', { label: 'notes before J' });
  await page.keyboard.press('j');
  await page.waitForURL((u) => u.searchParams.get('id') === String(q2.id));
  await until(async () => (await title.innerText()) === q2.text, { label: 'q2 shown' });
  await waitPosition(page, '3 of 3');
  t.check('J keeps the pane (mode=notes)', mode() === 'notes' && (await tab('Notes').getAttribute('aria-selected')) === 'true');
  await page.keyboard.press('1');
  await until(async () => mode() === null, { label: 'back to answer' });

  // ? opens the shortcuts; Escape closes them.
  await page.keyboard.press('?');
  const dialog = page.getByRole('dialog', { name: 'Keyboard shortcuts' });
  await dialog.waitFor();
  t.check('? opens the shortcuts list', (await dialog.getByText('Next question').count()) === 1);
  await page.keyboard.press('Escape');
  await dialog.waitFor({ state: 'hidden' });

  // Typing in the answer box types; it never moves or switches.
  const box = page.getByLabel('Your answer', { exact: true });
  await box.click();
  await page.keyboard.type('jk12?');
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(600);
  t.check('typing j/k/1/2/? and arrows in the answer box does not navigate', urlId(page) === String(q2.id) && mode() === null);
  t.check('…the text went into the box', (await box.inputValue()).includes('jk12?'));
  t.check('…and no shortcuts popover opened', (await dialog.count()) === 0);
  await clearReviewList(t.a);
});

s.test('layout: Focus / Split toggle persists across reload (≥1024px) and falls back to Focus when narrow', async (t) => {
  const [q] = await createQuestions(t.a, 1);
  const page = await t.page({ viewport: { width: 1280, height: 900 } });
  await openReview(page, q.id);
  const wrap = page.locator('.qr-wrap');
  const layout = page.getByRole('group', { name: 'Layout' });
  t.check('starts in Focus', (await wrap.getAttribute('data-layout')) === 'focus' && (await layout.getByRole('button', { name: 'Focus' }).getAttribute('aria-pressed')) === 'true');
  t.check('Focus has 4 tabs', (await page.getByRole('tab').count()) === 4);
  await layout.getByRole('button', { name: 'Split' }).click();
  await until(async () => (await wrap.getAttribute('data-layout')) === 'split', { label: 'split on' });
  t.check('Split: the tutor gets its own column', await page.getByRole('heading', { name: 'AI tutor', level: 2 }).isVisible());
  t.check('Split: the switcher drops the AI tutor tab', (await page.getByRole('tab').count()) === 3 && (await page.getByRole('tab', { name: 'AI tutor' }).count()) === 0);
  t.check('Split: answer and tutor side by side', await page.getByRole('tabpanel', { name: 'Answer' }).isVisible());
  await reload(page);
  await until(async () => (await wrap.getAttribute('data-layout')) === 'split', { label: 'split after reload' });
  t.check('Split survives a reload', (await layout.getByRole('button', { name: 'Split' }).getAttribute('aria-pressed')) === 'true');
  await t.shot(page, 'split-1280');

  await page.setViewportSize({ width: 900, height: 900 });
  await until(async () => (await wrap.getAttribute('data-layout')) === 'focus', { label: 'focus when narrow' });
  t.check('below 1024px: Focus, no Layout toggle, 4 tabs', (await layout.count()) === 0 && (await page.getByRole('tab').count()) === 4);
  await page.setViewportSize({ width: 1280, height: 900 });
  await until(async () => (await wrap.getAttribute('data-layout')) === 'split', { label: 'split again when wide' });

  await layout.getByRole('button', { name: 'Focus' }).click();
  await until(async () => (await wrap.getAttribute('data-layout')) === 'focus', { label: 'focus on' });
  await reload(page);
  t.check('Focus survives a reload', (await wrap.getAttribute('data-layout')) === 'focus');
});

s.run().catch((e) => {
  console.error('SCRIPT ERROR', e);
  process.exit(2);
});

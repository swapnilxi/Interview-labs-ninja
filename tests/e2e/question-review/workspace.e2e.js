// Question Review e2e: the four panes. Answer (auto-save, Evaluate, STAR "Use as my answer", mic), AI tutor,
// Quiz (generate, a wrong answer, generate more with `missed`, reset behind its confirm) and Notes (auto-save,
// Add to To-Do).
const { MOCK_URL, api, uid, createQuestions, suite } = require('./lib');

const s = suite('workspace.e2e.js');
const { openReview, reload, waitReady, until, nextCall } = s.helpers;

const WORKSPACE = (id) => `/questions/${id}/workspace`;

s.test('answer: auto-saves, survives a reload, Evaluate shows results, STAR "Use as my answer" replaces it', async (t) => {
  const [q] = await createQuestions(t.a, 1);
  const page = await t.page();
  await openReview(page, q.id);
  const panel = page.getByRole('tabpanel', { name: 'Answer' });
  const box = panel.getByLabel('Your answer', { exact: true });
  t.check('the mic (dictation) button is there', await panel.getByRole('button', { name: 'Dictate with your voice' }).isVisible());

  const text = `My answer ${uid()}: a token bucket per client, refilled at a fixed rate.`;
  const saved = nextCall(page, 'PUT', WORKSPACE(q.id));
  await box.fill(text);
  const res = await saved;
  t.check('typing auto-saves the answer (PUT workspace)', res.status() === 200 && (await res.json()).answer === text);
  await reload(page);
  t.check('the answer is back after a reload', (await box.inputValue()) === text);
  t.check('API: the workspace holds it', (await api('GET', WORKSPACE(q.id), t.a.token)).data.answer === text);

  // Evaluate (the mock scores every criterion 4/5 → 80, "Strong").
  const evalCall = nextCall(page, 'POST', '/sessions/evaluate-answer');
  await panel.getByRole('button', { name: 'Evaluate', exact: true }).click();
  const evalRes = await evalCall;
  const evalReq = evalRes.request().postDataJSON();
  t.check('Evaluate sends the answer and the mock provider settings', evalReq.answer_text === text && evalReq.model === 'custom' && evalReq.customBaseUrl === MOCK_URL);
  await panel.getByText('MOCK-STRENGTH: clear structure').waitFor();
  t.check('evaluation shows the level', (await panel.getByText('Strong', { exact: true }).count()) > 0);
  t.check('evaluation shows the rubric and gaps', (await panel.getByRole('heading', { name: 'Rubric' }).count()) === 1 && (await panel.getByText('MOCK-MISSING: say how counters are shared').count()) === 1);

  // STAR: written by the mock, then "Use as my answer".
  const star = panel.getByRole('region', { name: 'Shape it as a STAR story' });
  await star.getByRole('button', { name: 'Open' }).click();
  const starCall = nextCall(page, 'POST', '/sessions/expand-answer');
  await star.getByRole('button', { name: 'Write the STAR version' }).click();
  const starReq = (await starCall).request().postDataJSON();
  t.check('the STAR request asks for style "star" and carries the draft', starReq.style === 'star' && starReq.answer_text === text);
  await star.getByText(/MOCK-STAR-\d+/).first().waitFor();
  const starSaved = nextCall(page, 'PUT', WORKSPACE(q.id));
  await star.getByRole('button', { name: 'Use as my answer' }).click();
  const used = await box.inputValue();
  t.check('"Use as my answer" replaces the answer with the STAR text', /^\*\*Situation\*\* MOCK-STAR-\d+/.test(used) && !used.includes(text), used.slice(0, 60));
  await starSaved;
  await reload(page);
  t.check('the STAR answer is saved', (await box.inputValue()) === used);
  const kinds = (await t.mockCalls()).map((c) => c.kind);
  t.check('the mock answered evaluate and expand-star', kinds.includes('evaluate') && kinds.includes('expand-star'));
});

s.test('AI tutor: start, send a message, get the mock reply', async (t) => {
  const [q] = await createQuestions(t.a, 1);
  const page = await t.page();
  await openReview(page, q.id);
  await page.getByRole('tab', { name: 'AI tutor' }).click();
  await page.waitForURL((u) => u.searchParams.get('mode') === 'tutor');
  const tutor = page.getByRole('tabpanel', { name: 'AI tutor' });
  await tutor.getByRole('button', { name: 'Start learning' }).click();
  await tutor.getByText('MOCK-TUTOR hello.', { exact: false }).waitFor();
  const msg = `A token bucket refills at a fixed rate ${uid()}`;
  await tutor.getByRole('textbox', { name: 'Your reply' }).fill(msg);
  const turn = nextCall(page, 'POST', '/sessions/learn-chat');
  await tutor.getByRole('button', { name: 'Send' }).click();
  const req = (await turn).request().postDataJSON();
  t.check('the chat request carries the conversation', Array.isArray(req.messages) && req.messages.at(-1).content === msg && req.messages.at(-1).role === 'learner');
  await tutor.getByText(`MOCK-TUTOR heard: ${msg}`).waitFor();
  t.check('the learner message and the reply are both shown', (await tutor.getByText(msg, { exact: true }).count()) === 1);
  t.check('the reply box is empty again', (await tutor.getByRole('textbox', { name: 'Your reply' }).inputValue()) === '');
});

s.test('quiz: generate, a wrong answer, generate more sends `missed`, reset behind its confirm', async (t) => {
  const [q] = await createQuestions(t.a, 1);
  const page = await t.page();
  await openReview(page, q.id, { mode: 'quiz' });
  const quiz = page.getByRole('tabpanel', { name: 'Quiz' });
  const first = nextCall(page, 'POST', `/questions/${q.id}/quiz/generate`);
  await quiz.getByRole('button', { name: 'Generate quiz' }).click();
  t.check('first generate asks for 5', (await first).request().postDataJSON().count === 5);
  await quiz.getByText('Question 1 / 5').waitFor();

  const stem = (await quiz.getByText(/^Mock quiz .*: which statement/).innerText()).trim();
  await quiz.getByRole('button', { name: /Wrong option/ }).first().click();
  await quiz.getByText("Not quite — here's why:").waitFor();
  t.check('a wrong answer is marked and explained', (await quiz.getByText(/Mock explanation /).count()) === 1);

  for (let i = 0; i < 4; i++) await quiz.getByRole('button', { name: 'Next', exact: true }).click();
  await quiz.getByText('Question 5 / 5').waitFor();
  const more = nextCall(page, 'POST', `/questions/${q.id}/quiz/generate`);
  await quiz.getByRole('button', { name: /Generate 4 More/ }).click();
  const moreReq = (await more).request().postDataJSON();
  t.check('"Generate more" sends the missed stem', Array.isArray(moreReq.missed) && moreReq.missed.length === 1 && moreReq.missed[0] === stem, JSON.stringify(moreReq.missed));
  t.check('"Generate more" asks for 4', moreReq.count === 4);
  await quiz.getByText('Question 6 / 9').waitFor();
  t.check('API: 9 quiz items stored', (await api('GET', `/questions/${q.id}/quiz`, t.a.token)).data.questions.length === 9);

  // Reset: Cancel keeps everything, "Clear quiz" removes it.
  await quiz.getByRole('button', { name: 'Reset quiz' }).click();
  const confirm = page.getByRole('alertdialog', { name: 'Clear this quiz?' });
  await confirm.waitFor();
  await confirm.getByRole('button', { name: 'Cancel' }).click();
  await confirm.waitFor({ state: 'hidden' });
  t.check('Cancel keeps the quiz', (await api('GET', `/questions/${q.id}/quiz`, t.a.token)).data.questions.length === 9 && (await quiz.getByText('Question 6 / 9').count()) === 1);
  await quiz.getByRole('button', { name: 'Reset quiz' }).click();
  const cleared = nextCall(page, 'DELETE', `/questions/${q.id}/quiz`);
  await confirm.getByRole('button', { name: 'Clear quiz' }).click();
  t.check('Clear quiz sends DELETE', (await cleared).status() === 200);
  await quiz.getByRole('button', { name: 'Generate quiz' }).waitFor();
  t.check('API: the quiz is empty', (await api('GET', `/questions/${q.id}/quiz`, t.a.token)).data.questions.length === 0);
});

s.test('notes: auto-save + reload, "Add to To-Do" creates a task', async (t) => {
  const [q] = await createQuestions(t.a, 1);
  const page = await t.page();
  await openReview(page, q.id);
  await page.getByRole('tab', { name: 'Notes' }).click();
  const notes = page.getByLabel('Your notes');
  const add = page.getByRole('button', { name: 'Add to To-Do', exact: true });
  t.check('"Add to To-Do" is disabled while the note is empty', await add.isDisabled());

  const title = `E2E note ${uid()}`;
  const text = `${title}\nRevisit sliding windows vs token buckets.`;
  const saved = nextCall(page, 'PUT', WORKSPACE(q.id));
  await notes.fill(text);
  const res = await saved;
  t.check('typing auto-saves the notes', res.status() === 200 && (await res.json()).notes === text);
  await reload(page);
  t.check('mode=notes stays in the address', new URL(page.url()).searchParams.get('mode') === 'notes');
  t.check('the notes are back after a reload', (await notes.inputValue()) === text);

  const created = nextCall(page, 'POST', '/todo/tasks');
  await add.click();
  const task = await (await created).json();
  await page.getByText('Added to To-Do').first().waitFor();
  t.check('the task is titled by the first line', task.title === title, task.title);
  const tree = await api('GET', '/todo/tasks/tree', t.a.token);
  const flat = [];
  const walk = (xs) => (xs || []).forEach((x) => (flat.push(x), walk(x.children)));
  walk(Array.isArray(tree.data) ? tree.data : tree.data.tasks || tree.data.items);
  const found = flat.find((x) => x.title === title);
  t.check('To-Do API lists the task', !!found, `tree status ${tree.status}`);
  t.check('the task links back to the question', !!found && String(found.context || '').includes(`/question-review?id=${q.id}`));
  if (found) await api('DELETE', `/todo/tasks/${found.id}`, t.a.token);
});

s.run().catch((e) => {
  console.error('SCRIPT ERROR', e);
  process.exit(2);
});

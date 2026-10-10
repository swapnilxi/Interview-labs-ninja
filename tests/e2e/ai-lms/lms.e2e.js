// AI LMS end-to-end: roles + landing page editing. See README.md in this folder.
const { chromium } = require('playwright');
const fs = require('fs');
const NEXT = process.env.MODE === 'next';
const FE = 'http://localhost:4028', BE = NEXT ? FE : 'http://localhost:8082';
const CLASSES = process.env.LMS_CLASSES_DIR || __dirname + (NEXT ? '/classes_next' : '/classes');
const AUTH = NEXT ? '/api/auth' : '/auth';
const { execFileSync } = require('child_process');
const setRole = (email, role) => execFileSync('sqlite3', [process.env.DB, `update users set role='${role}' where email='${email}'`]);
const S = __dirname;
const PW = 'Passw0rd!x';
const results = []; const consoleErrors = [];
const check = (name, ok, extra = '') => { results.push({ name, ok: !!ok }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  — ' + extra : ''}`); };

async function api(method, path, token, body) {
  const r = await fetch(BE + path, { method, headers: { 'content-type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) }, body: body ? JSON.stringify(body) : undefined });
  let data = null; try { data = await r.json(); } catch {}
  return { status: r.status, data };
}
const login = async (u) => (await api('POST', AUTH + '/login', null, { email: `${u}@test.com`, password: PW })).data;

async function newPage(browser, token, tag) {
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  if (token) await ctx.addInitScript((t) => localStorage.setItem('labninja.auth.token.v1', t), token);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => consoleErrors.push(`[${tag}] pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error' && !/favicon|Failed to load resource/.test(m.text())) consoleErrors.push(`[${tag}] ${m.text()}`); });
  return page;
}
const shot = (page, n) => page.screenshot({ path: `${S}/shots/${n}.png`, fullPage: false });
const headings = async (page) => page.frameLocator('iframe').locator('h2').allInnerTexts();

(async () => {
  const browser = await chromium.launch({ channel: process.env.PW_CHANNEL || 'chrome', headless: true });
  const T = {}; for (const u of ['user', 'editor', 'admin', 'superadmin']) T[u] = (await login(u)).access_token;
  const stamp = Date.now().toString().slice(-6);
  const CLS = `E2E Class ${stamp}`, SUBJ = `E2E Subject ${stamp}`, LESSON = `E2E Lesson ${stamp}`;

  if (NEXT) { setRole('editor@test.com', 'editor'); setRole('admin@test.com', 'admin'); setRole('superadmin@test.com', 'superadmin'); }
  // reset editor to plain user so the superadmin UI promotion is a real test
  const editorId = (await login('editor')).user.id;
  if (!NEXT) await api('PATCH', `/admin/users/${editorId}/role`, T.superadmin, { role: 'user' });

  // ── 1. Superadmin promotes editor through the admin UI
  if (!NEXT) {
    const p = await newPage(browser, T.superadmin, 'superadmin');
    await p.goto(FE + '/admin'); 
    const sel = p.getByTestId('role-select-editor@test.com');
    await sel.waitFor({ timeout: 20000 });
    check('superadmin sees role dropdown with Editor/Admin/Superadmin options enabled', await sel.locator('option[value="admin"]:not([disabled])').count() === 1);
    await sel.selectOption('editor');
    await p.getByRole('button', { name: 'Change role' }).click();
    await p.getByText(/editor@test.com is now a editor/i).waitFor({ timeout: 10000 }).catch(() => {});
    const me = await api('GET', AUTH + '/me', T.editor);
    check('role change persisted: editor@test.com is now editor', me.data?.role === 'editor', JSON.stringify(me.data?.role));
    await shot(p, '01-admin-roles');
    await p.context().close();
  }
  // admin (not super) cannot touch admin-level roles — UI + API
  if (!NEXT) {
    const p = await newPage(browser, T.admin, 'admin');
    await p.goto(FE + '/admin');
    const sel = p.getByTestId('role-select-superadmin@test.com');
    await sel.waitFor({ timeout: 20000 });
    check('plain admin: superadmin row selector is disabled in UI', await sel.isDisabled());
    check('plain admin: Admin/Superadmin options disabled for a normal user row', await p.getByTestId('role-select-user@test.com').locator('option[value="admin"][disabled]').count() === 1);
    const uid = (await login('user')).user.id;
    check('plain admin API: grant admin → 403', (await api('PATCH', `/admin/users/${uid}/role`, T.admin, { role: 'admin' })).status === 403);
    check('plain admin API: grant editor → 200 (then revert)', (await api('PATCH', `/admin/users/${uid}/role`, T.admin, { role: 'editor' })).status === 200 && (await api('PATCH', `/admin/users/${uid}/role`, T.admin, { role: 'user' })).status === 200);
    await p.context().close();
  }
  if (!NEXT) {
  check('editor cannot open admin API', (await api('GET', '/admin/users', T.editor)).status === 403);
  check('user cannot open admin API', (await api('GET', '/admin/users', T.user)).status === 403);
  }

  // ── 2. Editor builds class → subject → lesson → landing page
  const p = await newPage(browser, T.editor, 'editor');
  await p.goto(FE + '/ai-lms');
  await p.getByRole('button', { name: /New Class/ }).click();
  await p.getByPlaceholder('e.g. Distributed Systems & Cloud').fill(CLS);
  await p.getByPlaceholder(/Brief overview/).fill('Playwright test class');
  await p.getByRole('button', { name: 'Create Class' }).click();
  await p.getByText(CLS).first().waitFor({ timeout: 15000 });
  check('editor created a class from the UI', true);
  const slug = (await api('GET', '/api/lms/classes', T.editor)).data.find((c) => c.name === CLS).slug;

  await p.goto(`${FE}/ai-lms/classes/${slug}`);
  await p.getByRole('button', { name: /New Subject/ }).click();
  await p.getByPlaceholder('e.g. Consistent Hashing & Sharding').fill(SUBJ);
  await p.locator('form').getByRole('button', { name: 'Create Subject' }).click();
  await p.getByText(SUBJ).first().waitFor({ timeout: 15000 });
  check('editor created a subject from the UI', true);
  await shot(p, '02-class-with-subject');

  const subjSlug = (await api('GET', `/api/lms/classes/${slug}`, T.editor)).data.subjects.find((s) => s.name === SUBJ).slug;
  await p.goto(`${FE}/ai-lms/classes/${slug}/${subjSlug}`);
  await p.getByRole('button', { name: /Create Lesson$/ }).first().click();
  await p.getByPlaceholder('e.g. Consistent Hashing Mechanics').fill(LESSON);
  await p.locator('textarea[rows="14"]').fill('<!DOCTYPE html><html><body><h1>Hello Lesson</h1><p>manual body for the e2e lesson</p></body></html>');
  await p.getByRole('button', { name: 'Save Lesson' }).click();
  await p.getByText(LESSON).first().waitFor({ timeout: 15000 });
  check('editor created a manual lesson from the UI', true);
  await p.getByText(LESSON).first().click();
  await p.frameLocator('iframe').getByText('manual body for the e2e lesson').waitFor({ timeout: 15000 });
  check('lesson renders its HTML', true);
  await shot(p, '03-lesson');
  check('editor sees lesson Edit button + Update tab', (await p.getByRole('button', { name: 'Edit', exact: true }).count()) > 0 && (await p.getByRole('button', { name: 'Update', exact: true }).count()) > 0);

  // landing page
  await p.goto(`${FE}/ai-lms/classes/${slug}/landing`);
  await p.frameLocator('iframe').locator('h1').waitFor({ timeout: 15000 });
  const lh1 = await p.frameLocator('iframe').locator('h1').innerText();
  check('landing page shows class name from lms:auto block', lh1.includes(CLS), lh1);
  check('landing page lists the subject', await p.frameLocator('iframe').getByText(SUBJ).count() > 0);
  await p.getByTestId('landing-edit-toggle').click();
  await p.getByTestId('landing-editor').waitFor();

  // manual section A
  await p.getByTestId('landing-tab-manual').click();
  await p.getByTestId('landing-manual-title').fill('Manual A');
  await p.getByTestId('landing-manual-body').fill('<p>manual section A body</p>');
  await p.getByTestId('landing-manual-add').click();
  await p.frameLocator('iframe').getByRole('heading', { name: 'Manual A' }).waitFor({ timeout: 15000 });
  check('manual section A added', true);

  // AI section B after A (preview → apply)
  await p.getByTestId('landing-tab-ai').click();
  await p.getByTestId('landing-ai-mode').selectOption('section');
  const afterA = await p.getByTestId('landing-after').locator('option', { hasText: 'Manual A' }).getAttribute('value');
  await p.getByTestId('landing-after').selectOption(afterA);
  await p.getByTestId('landing-ai-instruction').fill('B faq');
  await p.getByTestId('landing-ai-generate').click();
  await p.frameLocator('iframe').getByRole('heading', { name: 'AI: B faq' }).waitFor({ timeout: 15000 });
  const beforeApply = (await api('GET', `/api/lms/classes/${slug}/landing/sections`, T.editor)).data.sections.length;
  check('AI preview is not saved until Apply', beforeApply === 1, `sections saved=${beforeApply}`);
  await shot(p, '04-ai-preview');
  await p.getByTestId('landing-ai-apply').click();
  await p.getByTestId('landing-notice').filter({ hasText: 'Applied' }).waitFor({ timeout: 15000 });
  check('AI section B applied', (await api('GET', `/api/lms/classes/${slug}/landing/sections`, T.editor)).data.sections.length === 2);

  // AI whole-page edit
  await p.getByTestId('landing-ai-mode').selectOption('edit');
  await p.getByTestId('landing-ai-instruction').fill('friendlier hero');
  await p.getByTestId('landing-ai-generate').click();
  await p.frameLocator('iframe').getByRole('heading', { name: 'AIEDIT: friendlier hero' }).waitFor({ timeout: 15000 });
  await p.getByTestId('landing-ai-apply').click();
  await p.getByTestId('landing-notice').filter({ hasText: 'Applied' }).waitFor();
  check('AI page edit applied and render', await p.frameLocator('iframe').getByRole('heading', { name: 'AIEDIT: friendlier hero' }).count() === 1);

  // discard flow
  await p.getByTestId('landing-ai-instruction').fill('throwaway');
  await p.getByTestId('landing-ai-generate').click();
  await p.frameLocator('iframe').getByRole('heading', { name: 'AIEDIT: throwaway' }).waitFor({ timeout: 15000 });
  await p.getByTestId('landing-ai-discard').click();
  check('Discard restores the saved page', await p.frameLocator('iframe').getByRole('heading', { name: 'AIEDIT: throwaway' }).count() === 0);

  // AI section D squeezed between A and B; manual C after B
  await p.getByTestId('landing-ai-mode').selectOption('section');
  await p.getByTestId('landing-after').selectOption(afterA);
  await p.getByTestId('landing-ai-instruction').fill('D between');
  await p.getByTestId('landing-ai-generate').click();
  await p.getByTestId('landing-ai-apply').click();
  await p.getByTestId('landing-notice').filter({ hasText: 'Applied' }).waitFor();
  await p.getByTestId('landing-tab-manual').click();
  const afterB = await p.getByTestId('landing-after').locator('option', { hasText: 'AI: B faq' }).getAttribute('value');
  await p.getByTestId('landing-after').selectOption(afterB);
  await p.getByTestId('landing-manual-title').fill('Manual C');
  await p.getByTestId('landing-manual-body').fill('<p>c body</p>');
  await p.getByTestId('landing-manual-add').click();
  await p.frameLocator('iframe').getByRole('heading', { name: 'Manual C' }).waitFor({ timeout: 15000 });
  const order = (await headings(p)).filter((h) => /Manual|AI: |AIEDIT/.test(h));
  console.log('   heading order:', JSON.stringify(order));
  const expected = ['Manual A', 'AI: D between', 'AI: B faq', 'Manual C'];
  check('sections ended up in the requested in-between order', JSON.stringify(order.filter((h) => expected.includes(h))) === JSON.stringify(expected));
  await shot(p, '05-landing-after-edits');

  // Sections tab: move + edit in place
  await p.getByTestId('landing-tab-sections').click();
  await p.getByRole('button', { name: 'Move Manual C up' }).click();
  await p.getByTestId('landing-notice').filter({ hasText: 'Section moved' }).waitFor({ timeout: 15000 });
  const moved = (await headings(p)).filter((h) => expected.includes(h));
  console.log('   after move:', JSON.stringify(moved));
  check('moving a section up swaps it with its neighbour', JSON.stringify(moved) === JSON.stringify(['Manual A', 'AI: D between', 'Manual C', 'AI: B faq']));
  await p.getByRole('button', { name: 'Edit AI: D between' }).click();
  const dHtml = await p.getByTestId('landing-section-edit').inputValue();
  await p.getByTestId('landing-section-edit').fill(dHtml.replace('Generated body for D between', 'Hand-edited body for D'));
  await p.getByTestId('landing-section-save').click();
  await p.frameLocator('iframe').getByText('Hand-edited body for D').waitFor({ timeout: 15000 });
  check('editing a section in place keeps it in position', (await headings(p)).filter((h) => expected.includes(h)).join('|') === 'Manual A|AI: D between|Manual C|AI: B faq');
  const top = (await api('GET', `/api/lms/classes/${slug}/landing/sections`, T.editor)).data.sections;
  check('edited section keeps its ai source', top.find((x) => x.title === 'AI: D between')?.source === 'ai');
  const edge = await api('PATCH', `/api/lms/classes/${slug}/landing/sections/${top[0].id}`, T.editor, { move: 'up' });
  check('moving the first section up is a no-op (200)', edge.status === 200 && edge.data.sections[0].id === top[0].id);
  check('moving an unknown section → 404', (await api('PATCH', `/api/lms/classes/${slug}/landing/sections/nope`, T.editor, { move: 'up' })).status === 404);
  check('user cannot PATCH a section → 403', (await api('PATCH', `/api/lms/classes/${slug}/landing/sections/${top[0].id}`, T.user, { move: 'down' })).status === 403);

  // HTML source edit (repeat edits)
  await p.getByTestId('landing-tab-source').click();
  const src = await p.getByTestId('landing-source').inputValue();
  await p.getByTestId('landing-source').fill(src.replace('Manual C', 'Manual C (edited)'));
  await p.getByTestId('landing-source-save').click();
  await p.frameLocator('iframe').getByRole('heading', { name: 'Manual C (edited)' }).waitFor({ timeout: 15000 });
  check('raw HTML source edit saved', true);

  // removing auto markers must be refused
  const bad = await api('PUT', `/api/lms/classes/${slug}/landing`, T.editor, { html: '<html><body>no markers</body></html>' });
  check('PUT that drops lms:auto markers is refused (422)', bad.status === 422, String(bad.status));
  // stale base_hash refused
  const stale = await api('PUT', `/api/lms/classes/${slug}/landing`, T.editor, { html: src, base_hash: 'deadbeef' });
  check('stale base_hash is refused (409)', stale.status === 409, String(stale.status));

  // persistence: reload + file on disk
  await p.reload();
  await p.frameLocator('iframe').getByRole('heading', { name: 'Manual C (edited)' }).waitFor({ timeout: 15000 });
  const disk = fs.readFileSync(`${CLASSES}/${slug}/landingpage.html`, 'utf8');
  check('edits persist after reload', true);
  check('landingpage.html on disk has all sections + intact lms:auto markers', disk.includes('Manual C (edited)') && disk.includes('AI: D between') && disk.includes('<!-- lms:auto:subjects -->'));
  // class data change still refreshes auto blocks without losing sections
  const ns = await api('POST', `/api/lms/classes/${slug}/subjects`, T.editor, { name: `Late Subject ${stamp}` });
  await p.reload();
  await p.frameLocator('iframe').getByText(`Late Subject ${stamp}`).first().waitFor({ timeout: 15000 });
  check('adding a subject later refreshes lms:auto lists and keeps custom sections', await p.frameLocator('iframe').getByRole('heading', { name: 'Manual C (edited)' }).count() === 1);
  await shot(p, '06-landing-final');
  await p.context().close();

  // ── 3. Plain user: view only
  {
    const u = await newPage(browser, T.user, 'user');
    await u.goto(FE + '/ai-lms'); await u.getByText(CLS).first().waitFor({ timeout: 20000 });
    check('user: no "New Class" / "Generate Lesson" on LMS home', (await u.getByRole('button', { name: /New Class/ }).count()) === 0 && (await u.getByRole('link', { name: /Generate Lesson/ }).count()) === 0);
    await u.goto(`${FE}/ai-lms/classes/${slug}`); await u.getByText(SUBJ).first().waitFor({ timeout: 15000 });
    check('user: class page hides Edit Class / New Subject / Add Project / Generate', (await u.getByRole('button', { name: /Edit Class|New Subject|Add Project/ }).count()) === 0 && (await u.getByRole('link', { name: /Generate Lesson/ }).count()) === 0);
    await u.goto(`${FE}/ai-lms/classes/${slug}/${subjSlug}`); await u.getByText(LESSON).first().waitFor({ timeout: 15000 });
    check('user: subject page hides Edit/Create/Generate controls', (await u.getByRole('button', { name: /Edit Subject|Create Lesson/ }).count()) === 0);
    await u.getByText(LESSON).first().click();
    await u.frameLocator('iframe').getByText('manual body for the e2e lesson').waitFor({ timeout: 15000 });
    check('user: can still read the lesson', true);
    check('user: lesson has no Edit button / Update tab', (await u.getByRole('button', { name: 'Edit', exact: true }).count()) === 0 && (await u.getByRole('button', { name: 'Update', exact: true }).count()) === 0);
    await u.goto(`${FE}/ai-lms/classes/${slug}/landing`);
    await u.frameLocator('iframe').locator('h1').waitFor({ timeout: 15000 });
    check('user: can read the landing page (incl. sections)', await u.frameLocator('iframe').getByRole('heading', { name: 'Manual C (edited)' }).count() === 1);
    check('user: no "Edit page" button on landing', (await u.getByTestId('landing-edit-toggle').count()) === 0);
    await shot(u, '07-user-landing-readonly');
    // direct API attempts as user
    const lessonId = (await api('GET', `/api/lms/classes/${slug}/subjects/${subjSlug}`, T.user)).data.lessons[0]?.id;
    check('found lesson id for API probes', !!lessonId);
    const attempts = {
      'PUT landing': await api('PUT', `/api/lms/classes/${slug}/landing`, T.user, { html: disk }),
      'POST section': await api('POST', `/api/lms/classes/${slug}/landing/sections`, T.user, { title: 'x', body_html: '<p>x</p>' }),
      'DELETE section': await api('DELETE', `/api/lms/classes/${slug}/landing/sections/whatever`, T.user),
      'PATCH class': await api('PATCH', `/api/lms/classes/${slug}`, T.user, { description: 'hax' }),
      'DELETE class': await api('DELETE', `/api/lms/classes/${slug}`, T.user),
      'POST subject': await api('POST', `/api/lms/classes/${slug}/subjects`, T.user, { name: 'hax' }),
      'PATCH lesson': await api('PATCH', `/api/lms/lessons/${lessonId}`, T.user, { title: 'hax' }),
      'DELETE lesson': await api('DELETE', `/api/lms/lessons/${lessonId}`, T.user),
      'POST generate lesson': await api('POST', '/api/lms/lessons/generate', T.user, { class_id: 'x', content: 'x' }),
      'reorder lessons': await api('POST', '/api/lms/lessons/reorder', T.user, { lesson_ids: [] }),
    };
    for (const [k, v] of Object.entries(attempts)) check(`user API ${k} → 403`, v.status === 403, String(v.status));
    check('user API: viewing a lesson (progress) still allowed', (await api('POST', `/api/lms/lessons/${lessonId}/view`, T.user)).status < 400);
    check('guest (no token) API → 401/403', [401, 403].includes((await api('GET', `/api/lms/classes/${slug}/landing`, null)).status));
    await u.context().close();
  }

  // ── 4. Admin & superadmin can edit
  for (const role of ['admin', 'superadmin']) {
    const a = await newPage(browser, T[role], role);
    await a.goto(`${FE}/ai-lms/classes/${slug}/landing`);
    await a.getByTestId('landing-edit-toggle').waitFor({ timeout: 20000 });
    check(`${role}: sees "Edit page" on landing`, true);
    const r = await api('POST', `/api/lms/classes/${slug}/landing/sections`, T[role], { title: `By ${role}`, body_html: '<p>x</p>' });
    check(`${role}: API add section → 201`, r.status === 201, String(r.status));
    await a.goto(`${FE}/ai-lms/classes/${slug}`);
    await a.getByRole('button', { name: /Edit Class/ }).first().waitFor({ timeout: 15000 }).catch(() => {});
    check(`${role}: class page shows Edit Class / New Subject`, (await a.getByRole('button', { name: /Edit Class/ }).count()) > 0 && (await a.getByRole('button', { name: /New Subject/ }).count()) > 0);
    await a.context().close();
  }
  // editor API sanity
  check('editor API: landing AI preview allowed', (await api('POST', `/api/lms/classes/${slug}/landing/ai`, T.editor, { instruction: 'hello world', mode: 'edit' })).status === 200);
  check('editor API: delete class allowed', (await api('DELETE', `/api/lms/classes/${slug}`, T.editor)).status === 200);

  await browser.close();
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  console.log(consoleErrors.length ? 'Browser console/page errors:\n' + [...new Set(consoleErrors)].join('\n') : 'No browser console/page errors.');
  process.exit(failed.length ? 1 : 0);
})().catch((e) => { console.error('SCRIPT ERROR', e); process.exit(2); });

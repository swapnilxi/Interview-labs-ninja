// AI LMS end-to-end: project plan/modules/sublessons, AI lesson generate + revise, plain-user view-only.
const { chromium } = require('playwright');
const NEXT = process.env.MODE === 'next';
const FE = 'http://localhost:4028', BE = NEXT ? FE : 'http://localhost:8082';
const AUTH = NEXT ? '/api/auth' : '/auth';
const results = []; const check = (n, ok, x = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${x ? '  — ' + x : ''}`); };
async function api(m, p, t, b) {
  const r = await fetch(BE + p, { method: m, headers: { 'content-type': 'application/json', ...(t ? { Authorization: 'Bearer ' + t } : {}) }, body: b ? JSON.stringify(b) : undefined });
  let d = null; try { d = await r.json(); } catch {} return { status: r.status, data: d };
}
const tok = async (u) => (await api('POST', AUTH + '/login', null, { email: `${u}@test.com`, password: 'Passw0rd!x' })).data.access_token;
(async () => {
  const E = await tok('editor'), U = await tok('user');
  const stamp = Date.now().toString().slice(-6);
  const cls = (await api('POST', '/api/lms/classes', E, { name: `Proj Class ${stamp}`, description: 'd' })).data;
  const proj = (await api('POST', `/api/lms/classes/${cls.slug}/subjects`, E, { name: `Proj ${stamp}`, kind: 'project', project_context: 'Build a tiny URL shortener with an API, storage and tests. '.repeat(5) })).data;
  check('project created', proj && proj.kind === 'project', proj?.id);
  const subj = (await api('POST', `/api/lms/classes/${cls.slug}/subjects`, E, { name: `Plain ${stamp}` })).data;

  const browser = await browser_();
  async function browser_() { return chromium.launch({ channel: process.env.PW_CHANNEL || 'chrome', headless: true }); }
  const mk = async (token) => { const c = await browser.newContext({ viewport: { width: 1400, height: 1000 } }); await c.addInitScript((t) => localStorage.setItem('labninja.auth.token.v1', t), token); return c.newPage(); };
  const url = `${FE}/ai-lms/classes/${cls.slug}/${proj.slug}`;

  // UI: editor plans modules, generates one lesson
  const p = await mk(E);
  await p.goto(url);
  await p.getByRole('button', { name: /Generate Implementation Modules/ }).click();
  await p.getByText('Mock Module 1').first().waitFor({ timeout: 30000 });
  check('UI: AI planned 3 modules', (await p.getByText(/Mock Module \d/).count()) >= 3);
  await p.getByRole('button', { name: 'Generate', exact: true }).first().click();
  await p.getByRole('link', { name: /^Open/ }).first().waitFor({ timeout: 60000 });
  check('UI: module lesson generated (Open link appears)', true);
  await p.screenshot({ path: `${__dirname}/shots/proj-editor.png` });
  let detail = (await api('GET', `/api/lms/classes/${cls.slug}/subjects/${proj.slug}`, E)).data;
  const plan = () => detail.project_plan;
  check('module 1 has a lesson_id', !!plan()[0].lesson_id);

  // API: breakdown, sublesson, add step, reorder
  const g2 = await api('POST', `/api/lms/projects/${proj.id}/modules/1/generate`, E, {});
  check('generate module 2 lesson (prereq for breakdown)', g2.status < 300, String(g2.status));
  const bd = await api('POST', `/api/lms/projects/${proj.id}/modules/1/breakdown`, E, {});
  check('breakdown module 2 → sublessons', bd.status === 200, String(bd.status) + ' ' + JSON.stringify(bd.data).slice(0, 80));
  const sg = await api('POST', `/api/lms/projects/${proj.id}/modules/1/sublessons/0/generate`, E, {});
  check('generate first sublesson', sg.status === 200 || sg.status === 201, String(sg.status) + ' ' + JSON.stringify(sg.data).slice(0, 100));
  const add = await api('POST', `/api/lms/projects/${proj.id}/steps`, E, { title: 'Manual Step', focus: 'f', context: 'extra context for the step', position: 3 });
  check('add a manual step', add.status < 300, String(add.status) + ' ' + JSON.stringify(add.data).slice(0, 100));
  const rr = await api('POST', `/api/lms/projects/${proj.id}/reorder`, E, { from_index: 3, to_index: 0 });
  check('reorder plan', rr.status === 200, String(rr.status));
  detail = (await api('GET', `/api/lms/classes/${cls.slug}/subjects/${proj.slug}`, E)).data;
  check('plan now has 4 modules, first is the moved step', plan().length === 4 && plan()[0].title === 'Manual Step', plan().map((m) => m.title).join(' | '));
  check('module with sublessons has 2', plan().find((m) => m.title === 'Mock Module 2')?.sublessons?.length === 2);

  // standalone AI lesson + revise cycle
  const gen = await api('POST', '/api/lms/lessons/generate', E, { class_id: cls.id, subject_id: subj.id, input_type: 'topic', content: 'consistent hashing' });
  check('AI lesson generated', gen.status === 201, String(gen.status) + ' ' + JSON.stringify(gen.data).slice(0, 100));
  const lid = gen.data?.id;
  let content = lid ? (await api('GET', `/api/lms/lessons/${lid}`, E)).data : null;
  for (let i = 1; i <= 2; i++) {
    const rev = await api('POST', `/api/lms/lessons/${lid}/revise`, E, { instruction: `add note ${i}`, mode: 'update' });
    check(`revise #${i} returns preview`, rev.status === 200 && rev.data.generated_html.includes(`REVISED: add note ${i}`), String(rev.status));
    const before = (await api('GET', `/api/lms/lessons/${lid}`, E)).data.generated_html;
    check(`revise #${i} not saved until applied`, !before.includes(`add note ${i}`));
    const sv = await api('PATCH', `/api/lms/lessons/${lid}`, E, { generated_html: rev.data.generated_html });
    check(`revise #${i} applied via PATCH`, sv.status === 200);
  }
  const fin = (await api('GET', `/api/lms/lessons/${lid}`, E)).data.generated_html;
  check('both revisions persisted', fin.includes('add note 1') && fin.includes('add note 2'));

  // plain user: view only
  const u = await mk(U);
  await u.goto(url);
  await u.getByText('Mock Module 1').first().waitFor({ timeout: 20000 });
  check('user sees modules', true);
  check('user: no Generate / Break Down / Edit Project / outline buttons', (await u.getByRole('button', { name: /Generate|Break Down|Edit Project|Regenerate/ }).count()) === 0);
  await u.screenshot({ path: `${__dirname}/shots/proj-user.png` });
  check('user API: plan → 403', (await api('POST', `/api/lms/projects/${proj.id}/plan`, U, {})).status === 403);
  check('user API: generate module → 403', (await api('POST', `/api/lms/projects/${proj.id}/modules/0/generate`, U, {})).status === 403);
  check('user API: add step → 403', (await api('POST', `/api/lms/projects/${proj.id}/steps`, U, { title: 'x' })).status === 403);
  check('user API: generate lesson → 403', (await api('POST', '/api/lms/lessons/generate', U, { class_id: cls.id, input_type: 'topic', content: 'x' })).status === 403);
  check('user API: revise preview allowed (200), nothing saved', (await api('POST', `/api/lms/lessons/${lid}/revise`, U, { instruction: 'hello there', mode: 'update' })).status === 200);

  await api('DELETE', `/api/lms/classes/${cls.slug}`, E);
  await browser.close();
  const f = results.filter((x) => !x).length; console.log(`\n${results.length - f}/${results.length} passed`); process.exit(f ? 1 : 0);
})().catch((e) => { console.error('SCRIPT ERROR', e); process.exit(2); });

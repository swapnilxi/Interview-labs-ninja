/**
 * Scenarios for lms_question_topics_e2e.sh (run that, not this file): project question topics through FastAPI and
 * two Next.js servers that sync through a folder standing in for Neon. Exits non-zero on any failure.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';

const { FASTAPI: F, NEXT_A: A, NEXT_B: B, MOCK, WORK, SECRET } = process.env;
const require = createRequire(path.join(process.cwd(), 'frontend', 'package.json'));
const jwt = require('jsonwebtoken');
const token = (id) => jwt.sign({ sub: String(id), email: `u${id}@x` }, SECRET, { expiresIn: '1h' });
const EDITOR = token(8); // superadmin
const OWNER = token(25); // plain user who owns the class of the LCB projects
const OUTSIDER = token(24); // plain user, owns nothing

const AI = { model: 'custom', customKey: 'x', customBaseUrl: `${MOCK}/v1`, customModel: 'mock' };
const Q = 'What type of algorithm relies on a similarity measure to make predictions?';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const SYNC_WAIT = 1700;

let pass = 0;
let fail = 0;
const ok = (cond, label, extra = '') => {
  cond ? pass++ : fail++;
  console.log(`${cond ? 'PASS' : 'FAIL'} ${label}${!cond && extra ? `  -> ${extra}` : ''}`);
};

async function call(base, method, url, body, tok = EDITOR) {
  const res = await fetch(base + url, {
    method,
    headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let json = null;
  try {
    json = await res.json();
  } catch {
    /* empty */
  }
  return { status: res.status, body: json };
}
const preview = (base, project, input, tok) => call(base, 'POST', `/api/lms/projects/${project}/question-topics/preview`, { ...AI, input }, tok);
const generate = (base, project, payload, tok) => call(base, 'POST', `/api/lms/projects/${project}/question-topics`, { ...AI, ...payload }, tok);
const patch = (base, project, id, payload, tok) => call(base, 'PATCH', `/api/lms/projects/${project}/question-topics/${id}`, payload, tok);
const del = (base, project, id, tok) => call(base, 'DELETE', `/api/lms/projects/${project}/question-topics/${id}`, undefined, tok);
async function subject(base, cls, slug) {
  await sleep(SYNC_WAIT); // reads re-check Neon at most every 1.5 s
  return (await call(base, 'GET', `/api/lms/classes/${cls}/subjects/${slug}`)).body;
}
const lessonCalls = async () => (await (await fetch(`${MOCK}/__count`)).json()).lessonCalls;
const mock = (p) => fetch(`${MOCK}${p}`);
const topicsIn = (proj) =>
  (proj?.project_plan || []).flatMap((m) => (m.sublessons || []).filter((s) => s.kind === 'question').map((s) => ({ ...s, section: m.title })));
const sql = (file, q) => execFileSync('sqlite3', [file, q]).toString().trim();
const remoteDb = `${WORK}/remote/lab_ninja.sqlite3`;
const remotePlan = (id) => JSON.parse(sql(remoteDb, `select project_plan from lms_subjects where id='${id}'`) || '[]');
const remoteTopics = (id) => remotePlan(id).flatMap((m) => (m.sublessons || []).filter((s) => s.kind === 'question'));
const syncState = (dir, suffix = '.sync.json') => JSON.parse(fs.readFileSync(`${WORK}/${dir}/lab_ninja.sqlite3${suffix}`, 'utf8'));

// ── 1. Acceptance scenario through FastAPI ────────────────────────────────────────
console.log('\n# 1. acceptance (FastAPI)');
const pv = await preview(F, 'prj-lcb', Q);
ok(pv.status === 200, 'preview answers', JSON.stringify(pv.body));
ok(pv.body?.input_type === 'question', 'input recognised as a question');
ok(pv.body?.title === 'Using k-NN to predict Navyakosh repeat purchases', 'suggested title');
ok(pv.body?.section?.title === 'Customer Intelligence' && !pv.body.section.is_new, 'suggests the existing Customer Intelligence section');
const op1 = 'op-accept-0001';
const g1 = await generate(F, 'prj-lcb', { operation_id: op1, input: Q, input_type: 'question', title: pv.body.title, section_id: pv.body.section.id });
ok(g1.status === 200 && g1.body.replayed === false, 'generate saves the topic', JSON.stringify(g1.body).slice(0, 300));
const t1 = g1.body?.topic;
ok(t1?.original_input === Q, 'original question kept verbatim');
ok(t1?.section_title === 'Customer Intelligence', 'saved in Customer Intelligence');
ok(/^\/ai-lms\/classes\/lcb-growth\/lcb-growthai\/[a-z0-9-]+$/.test(g1.body?.lesson_url || ''), 'lesson URL in the normal lesson route', g1.body?.lesson_url);
const lesson1 = (await call(F, 'GET', `/api/lms/lessons/${t1.lesson_id}`)).body;
const html1 = lesson1?.generated_html || '';
ok(html1.includes(Q), 'lesson shows the exact question');
ok(html1.includes('Instance-based learning, commonly exemplified by k-nearest neighbors'), 'lesson answers it directly');
ok(html1.indexOf('Short answer') < html1.indexOf('3. Connection to'), 'answer before the project example');
ok(html1.includes('purchase history') || html1.includes('Purchase history'), 'coding example uses purchase history');
ok(html1.includes('Navyakosh 90-day repeat purchase rate') && html1.includes('Baseline'), 'KPI and baseline');
ok(html1.includes('Result (projected, not yet measured)'), 'STAR result honestly labelled');
ok(!/<script|\son[a-z]+\s*=/i.test(html1), 'no script or event handler in the lesson');
ok((await lessonCalls()) === 1, 'one AI lesson call so far');

// ── 2. Duplicates: retries, the FastAPI -> Next.js fallback, simultaneous runs ───────
console.log('\n# 2. duplicates');
const again = await generate(F, 'prj-lcb', { operation_id: op1, input: Q, input_type: 'question', title: pv.body.title, section_id: pv.body.section.id });
ok(again.status === 200 && again.body.replayed && again.body.topic.id === t1.id, 'retry on FastAPI returns the same topic');
const fallback = await generate(A, 'prj-lcb', { operation_id: op1, input: Q, input_type: 'question', title: pv.body.title, section_id: pv.body.section.id });
ok(fallback.status === 200 && fallback.body.replayed && fallback.body.topic.id === t1.id, 'same request on Next.js (fallback) returns the same topic', JSON.stringify(fallback.body).slice(0, 200));
const reused = await generate(F, 'prj-lcb', { operation_id: op1, input: Q, input_type: 'question', title: 'Another title', section_id: '' });
ok(reused.status === 409 && /different request/.test(reused.body?.detail), 'an operation id reused for another request is refused');
ok((await lessonCalls()) === 1, 'retries made no AI call');
await mock('/__delay?ms=2500');
const dupPayload = { operation_id: 'op-dup-000002', input: 'What is a distance metric?', input_type: 'question', title: 'Distance metrics in segmentation', section_id: '' };
const both = await Promise.all([generate(F, 'prj-lcb', dupPayload), generate(A, 'prj-lcb', dupPayload)]);
ok(both.every((r) => r.status === 200 || r.status === 409), `simultaneous runs: ${both.map((r) => r.status)}`);
await mock('/__delay?ms=0');
let opDone = null;
for (let i = 0; i < 20 && !opDone; i++) {
  const r = await call(A, 'GET', `/api/lms/projects/prj-lcb/question-topics/operations/${dupPayload.operation_id}`);
  if (r.body?.topic) opDone = r.body;
  else await sleep(500);
}
ok(Boolean(opDone), 'operation status reports the finished topic');
ok((await lessonCalls()) === 2, 'simultaneous identical requests made ONE AI call', String(await lessonCalls()));
const projA = await subject(A, 'lcb-growth', 'lcb-growthai');
ok(topicsIn(projA).filter((t) => t.original_input === dupPayload.input).length === 1, 'exactly one topic for the duplicated request');

// ── 3. Move on the phone (Next.js B), refresh, reopen the same lesson URL ──────────
console.log('\n# 3. move on the phone, check the desktop');
const projB = await subject(B, 'lcb-growth', 'lcb-growthai');
ok(topicsIn(projB).some((t) => t.id === t1.id), 'the phone sees the topic made on the desktop');
const referral = projB.project_plan.find((m) => m.title === 'Referral Engine');
const mv = await patch(B, 'prj-lcb', t1.id, { section_id: referral.id, base_version: 1 });
ok(mv.status === 200 && mv.body.topic.section_title === 'Referral Engine' && mv.body.topic.version === 2, 'move to Referral Engine (version 2)', JSON.stringify(mv.body).slice(0, 200));
const projA2 = await subject(A, 'lcb-growth', 'lcb-growthai');
const movedA = topicsIn(projA2).find((t) => t.id === t1.id);
ok(movedA?.section === 'Referral Engine' && movedA.lesson_id === t1.lesson_id, 'desktop (Next.js) shows it moved, same id and lesson');
const lessonAfter = (await call(F, 'GET', `/api/lms/lessons/${t1.lesson_id}`)).body;
ok(lessonAfter?.generated_html === html1 && lessonAfter.slug === lesson1.slug, 'same lesson URL, same content after the move (FastAPI)');
const stale = await patch(F, 'prj-lcb', t1.id, { title: 'Stale rename', base_version: 1 });
ok(stale.status === 409 && stale.body?.topic?.section_title === 'Referral Engine', 'a stale edit (old version) is refused, newer move kept');
const rn = await patch(F, 'prj-lcb', t1.id, { title: 'k-NN for Navyakosh reorders', base_version: 2 });
ok(rn.status === 200 && rn.body.topic.version === 3, 'rename with the current version');
const projB2 = await subject(B, 'lcb-growth', 'lcb-growthai');
ok(topicsIn(projB2).find((t) => t.id === t1.id)?.title === 'k-NN for Navyakosh reorders', 'phone sees the rename');
ok(lessonCalls && (await lessonCalls()) === 2, 'moving and renaming made no AI call');

// ── 4. Access and project boundaries ─────────────────────────────────────────────
console.log('\n# 4. access and boundaries');
const other = await subject(A, 'other-class', 'other-project');
const otherSection = other.project_plan[0].id;
ok((await patch(A, 'prj-lcb', t1.id, { section_id: otherSection })).status === 422, 'cannot move into another project\'s section (Next.js)');
ok((await patch(F, 'prj-lcb', t1.id, { section_id: otherSection })).status === 422, 'cannot move into another project\'s section (FastAPI)');
ok((await generate(A, 'prj-lcb', { operation_id: 'op-foreign-0003', input: 'x?', input_type: 'question', title: 'X', section_id: otherSection })).status === 422, 'cannot generate into another project\'s section');
for (const [name, base] of [['FastAPI', F], ['Next.js', A]]) {
  ok((await preview(base, 'prj-lcb', Q, OUTSIDER)).status === 403, `${name}: outsider cannot preview`);
  ok((await generate(base, 'prj-lcb', { operation_id: 'op-outsider-04', input: Q, title: 'T' }, OUTSIDER)).status === 403, `${name}: outsider cannot generate`);
  ok((await patch(base, 'prj-lcb', t1.id, { title: 'hack' }, OUTSIDER)).status === 403, `${name}: outsider cannot rename/move`);
  ok((await del(base, 'prj-lcb', t1.id, OUTSIDER)).status === 403, `${name}: outsider cannot delete`);
  ok((await preview(base, 'prj-lcb', 'K-nearest neighbors', OWNER)).status === 200, `${name}: the class owner can add topics`);
}
ok((await preview(A, 'prj-missing', Q)).status === 404, 'unknown project is a 404');

// ── 5. Two first topics at once create ONE "User Questions Topics" section ─────────
console.log('\n# 5. concurrent first topics (desktop + phone)');
await mock('/__delay?ms=1500');
const [ka, kb] = await Promise.all([
  generate(A, 'prj-empty', { operation_id: 'op-first-a-005', input: 'K-nearest neighbors', input_type: 'topic', title: 'K-nearest neighbors for repeat purchases', section_id: '', guiding_question: 'How does k-NN predict from similar examples?' }, OWNER),
  generate(B, 'prj-empty', { operation_id: 'op-first-b-006', input: 'What is cosine similarity?', input_type: 'question', title: 'Cosine similarity for product matching', section_id: '' }),
]);
await mock('/__delay?ms=0');
ok(ka.status === 200 && kb.status === 200, `both saved (${ka.status}, ${kb.status})`, JSON.stringify([ka.body?.detail, kb.body?.detail]));
const topicHtml = (await call(A, 'GET', `/api/lms/lessons/${ka.body?.topic?.lesson_id}`)).body?.generated_html || '';
ok(topicHtml.includes('Guiding question') && topicHtml.includes('How does k-NN predict from similar examples?'), 'topic input gets a labelled guiding question');
const empty = await subject(A, 'lcb-growth', 'lcb-empty');
const uqt = empty.project_plan.filter((m) => m.title === 'User Questions Topics');
ok(uqt.length === 1 && uqt[0].sublessons.length === 2, `one User Questions Topics section holding both (${uqt.length} sections)`);
ok(remotePlan('prj-empty').filter((m) => m.title === 'User Questions Topics').length === 1, 'Neon copy has one section too');

// ── 6. Phone offline: saved locally, queued, delivered once ───────────────────────
console.log('\n# 6. phone offline');
// Settle first: the desktop's last read may push lesson-file metadata; the phone must hold Neon's newest copy.
await subject(A, 'lcb-growth', 'lcb-growthai');
await sleep(1000);
await subject(B, 'lcb-growth', 'lcb-growthai');
fs.writeFileSync(`${WORK}/remote/OFFLINE-B`, '');
const callsBefore = await lessonCalls();
const off = await generate(B, 'prj-lcb', { operation_id: 'op-offline-0007', input: 'What is feature scaling?', input_type: 'question', title: 'Feature scaling for k-NN', section_id: '' });
ok(off.status === 200, 'phone saves while offline', JSON.stringify(off.body).slice(0, 200));
ok(syncState('B').outbox.length === 1, `queued once (outbox ${syncState('B').outbox.length})`);
ok(!remoteTopics('prj-lcb').some((t) => t.original_input === 'What is feature scaling?'), 'not in Neon yet');
fs.rmSync(`${WORK}/remote/OFFLINE-B`);
await sleep(16000);
await subject(B, 'lcb-growth', 'lcb-growthai');
await sleep(2000);
ok(syncState('B').outbox.length === 0, 'queue sent after reconnecting');
ok(remoteTopics('prj-lcb').filter((t) => t.original_input === 'What is feature scaling?').length === 1, 'in Neon exactly once');
ok((await lessonCalls()) === callsBefore + 1, 'no second AI call (nobody else wrote meanwhile)');

fs.writeFileSync(`${WORK}/remote/OFFLINE-B`, '');
const off2 = await generate(B, 'prj-lcb', { operation_id: 'op-offline-0008', input: 'What is overfitting?', input_type: 'question', title: 'Overfitting in reorder models', section_id: '' });
ok(off2.status === 200, 'second offline save');
const rn2 = await patch(A, 'prj-lcb', t1.id, { title: 'k-NN for Navyakosh reorders (desktop edit)', base_version: 3 });
ok(rn2.status === 200, 'desktop edits while the phone is offline');
fs.rmSync(`${WORK}/remote/OFFLINE-B`);
await sleep(16000);
await subject(B, 'lcb-growth', 'lcb-growthai');
await sleep(4000);
const rt = remoteTopics('prj-lcb');
ok(rt.filter((t) => t.original_input === 'What is overfitting?').length === 1, 'phone\'s offline topic in Neon exactly once');
ok(rt.find((t) => t.id === t1.id)?.title === 'k-NN for Navyakosh reorders (desktop edit)', 'desktop edit made meanwhile is not lost');

// ── 7. Replanning the outline keeps question topics ──────────────────────────────
console.log('\n# 7. regenerate outline');
const before = topicsIn(await subject(F, 'lcb-growth', 'lcb-growthai'));
const replan = await call(F, 'POST', '/api/lms/projects/prj-lcb/plan', { ...AI });
ok(replan.status === 200, 'outline regenerated (FastAPI)', JSON.stringify(replan.body).slice(0, 200));
const after = topicsIn(await subject(B, 'lcb-growth', 'lcb-growthai'));
ok(before.length > 0 && before.every((b) => after.some((a) => a.id === b.id && a.lesson_id === b.lesson_id && a.section === 'User Questions Topics')), `all ${before.length} topics kept with their lessons`);
ok((await call(A, 'GET', `/api/lms/lessons/${t1.lesson_id}`)).status === 200, 'lessons of kept topics still open');

// ── 8. Delete + convergence ──────────────────────────────────────────────────────
console.log('\n# 8. delete and convergence');
const dl = await del(A, 'prj-lcb', t1.id);
ok(dl.status === 200, 'delete on the desktop');
ok(!topicsIn(await subject(B, 'lcb-growth', 'lcb-growthai')).some((t) => t.id === t1.id), 'gone on the phone');
ok((await call(F, 'GET', `/api/lms/lessons/${t1.lesson_id}`)).status === 404, 'its lesson is gone');
await subject(A, 'lcb-growth', 'lcb-growthai');
await subject(B, 'lcb-growth', 'lcb-growthai');
await sleep(2000);
const plans = ['A', 'B'].map((d) => JSON.parse(sql(`${WORK}/${d}/lab_ninja.sqlite3`, "select project_plan from lms_subjects where id='prj-lcb'")));
ok(JSON.stringify(plans[0]) === JSON.stringify(remotePlan('prj-lcb')) && JSON.stringify(plans[1]) === JSON.stringify(remotePlan('prj-lcb')), 'desktop, phone and Neon hold the same outline');
for (const [dir, suffix] of [['A', '.sync.json'], ['B', '.sync.json'], ['A', '.sync-py.json']]) {
  const st = syncState(dir, suffix);
  ok(st.outbox.length === 0 && st.failed.length === 0, `${dir}${suffix}: nothing pending or refused`);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

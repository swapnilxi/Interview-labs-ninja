/*
 * Guided Practice: its pure rules (labs/guided/{parse,tree,xp,constants,labs}.ts) checked without a browser or a server.
 * Those files import nothing but each other, so the repo's own TypeScript compiles them to CommonJS in a temp folder and Node
 * runs the assertions against that:
 *
 *     npm run test:guided          (from frontend/)
 *
 * Covers reading the AI's JSON (tolerant of fences, raw newlines, trailing commas), the path and its phase gating, completion
 * and the gate on a parent with a Breakdown, XP and its ledger (nothing pays twice), Dive Deeper and regenerate (worked-on
 * questions are kept), coding streaks, achievements, levels and the per-lab config. Exits non-zero if anything fails.
 */
import assert from 'node:assert';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const B = fs.mkdtempSync(path.join(os.tmpdir(), 'guided-logic-'));
process.on('exit', () => fs.rmSync(B, { recursive: true, force: true }));

const guidedDir = path.join(root, 'src', 'modules', 'labs', 'guided');
const modules = ['types', 'constants', 'labs', 'parse', 'tree', 'xp'];
execFileSync(
  process.execPath,
  [
    require.resolve('typescript/bin/tsc'),
    ...[
      '--outDir',
      B,
      '--module',
      'commonjs',
      '--target',
      'es2020',
      '--lib',
      'es2020',
      '--skipLibCheck',
    ],
    ...modules.map((m) => path.join(guidedDir, `${m}.ts`)),
  ],
  { stdio: 'inherit' }
);

const parse = require(path.join(B, 'parse.js'));
const tree = require(path.join(B, 'tree.js'));
const xp = require(path.join(B, 'xp.js'));
const { XP } = require(path.join(B, 'constants.js'));

let passed = 0;
let failed = 0;
function test(name, fn) {
  try {
    fn();
    passed++;
    console.log('ok   ', name);
  } catch (e) {
    failed++;
    console.log('FAIL ', name, '\n     ', e.message);
  }
}

// ── parse ───────────────────────────────────────────────────────────────────
test('extractJson tolerates fences, raw newlines, trailing commas and bad escapes', () => {
  const messy = '```json\n{"a": "line1\nline2", "b": [1,2,], "c": "it\\\'s",}\n```';
  const v = parse.extractJson(messy);
  assert.strictEqual(v.a, 'line1\nline2');
  assert.deepStrictEqual(v.b, [1, 2]);
  assert.strictEqual(v.c, "it's");
});
test('extractJson ignores chatter around the object', () => {
  assert.deepStrictEqual(parse.extractJson('Sure! Here you go: {"x":1} Hope it helps'), { x: 1 });
});
test('extractJson rejects text with no object', () => {
  assert.throws(() => parse.extractJson('nope'), /not valid JSON/);
});
test('extractJson skips a <think> block, even one with braces in it', () => {
  const v = parse.extractJson(
    '<think>The shape is {"phases": [...]}, so {x}</think>\n{"phases":[{"title":"A"}]}'
  );
  assert.deepStrictEqual(v, { phases: [{ title: 'A' }] });
});
test('extractJson finds a fenced block in the middle of prose', () => {
  const v = parse.extractJson(
    'Here is the plan:\n```json\n{"a": 1}\n```\nLet me know {if} you want more.'
  );
  assert.deepStrictEqual(v, { a: 1 });
});
test('extractJson skips braces in chatter before the JSON', () => {
  assert.deepStrictEqual(parse.extractJson('Use {curly} braces: {"a": {"b": 2}} done'), {
    a: { b: 2 },
  });
});
test('extractJson keeps code with braces and backslashes inside strings', () => {
  const v = parse.extractJson(
    '{"code": "def f(d):\n    return {k: v for k, v in d.items()}\\n", "re": "\\d+"}'
  );
  assert.strictEqual(v.code, 'def f(d):\n    return {k: v for k, v in d.items()}\n');
  assert.strictEqual(v.re, 'd+');
});
test('extractJson reads curly quotes when the answer has no straight ones', () => {
  assert.deepStrictEqual(parse.extractJson('{“a”: “b”}'), { a: 'b' });
});
test('extractJson returns a bare array of objects', () => {
  assert.deepStrictEqual(parse.extractJson('[{"title":"A"}]'), [{ title: 'A' }]);
});
test('extractJson says a cut-off answer was cut off, and salvage keeps the complete items', () => {
  const cut =
    '```json\n{"phases":[{"title":"Basics of it","goal":"g1"},{"title":"Second step","goal":"g2"},{"title":"Thi';
  assert.throws(() => parse.extractJson(cut), /cut off/);
  assert.throws(() => parse.extractJson('{"phases":[{"title":"Wha'), /cut off/);
  assert.deepStrictEqual(parse.extractJson(cut, { salvage: true }), {
    phases: [
      { title: 'Basics of it', goal: 'g1' },
      { title: 'Second step', goal: 'g2' },
    ],
  });
});
test('parseOutline and parsePhase read a cut-off answer and a bare array', () => {
  const o = parse.parseOutline(
    '{"phases":[{"title":"What it is","goal":"g"},{"title":"How it works","goal":"g"}],"boss":{"title":"Big fin'
  );
  assert.deepStrictEqual(
    o.phases.map((p) => p.title),
    ['What it is', 'How it works']
  );
  assert.strictEqual(o.boss, null);
  assert.strictEqual(parse.parseOutline('[{"title":"Only phase","goal":"g"}]').phases.length, 1);
  const p = parse.parsePhase(
    '{"title":"T","goal":"G","questions":[{"title":"What is a hash map?","kind":"concept"},{"title":"How does hashi',
    new Set()
  );
  assert.deepStrictEqual(
    p.questions.map((q) => q.title),
    ['What is a hash map?']
  );
});
test('parseLesson does not salvage a cut-off lesson', () => {
  assert.throws(
    () =>
      parse.parseLesson(
        '{"explanation":"Some text","exercise":{"prompt":"Write it","tests":[{"args":[1]}'
      ),
    /cut off/
  );
});

const outline = {
  phases: [
    {
      title: 'Understand it',
      goal: 'g',
      questions: [
        {
          title: 'What does the problem ask for?',
          objective: 'o',
          kind: 'concept',
          difficulty: 'easy',
          effort: '3 min',
          exercise: false,
        },
        {
          title: 'What does the problem ask for?!',
          objective: 'dup',
          kind: 'concept',
          difficulty: 'easy',
        },
        {
          title: 'Write the brute force version',
          kind: 'implementation',
          difficulty: 'medium',
          exercise: true,
        },
      ],
    },
    {
      title: 'Build it',
      goal: 'g2',
      questions: [
        {
          title: 'Track the running sum in a dict',
          kind: 'algorithm',
          difficulty: 'hard',
          exercise: true,
        },
        { title: 'x' }, // too short, dropped
      ],
    },
    { title: 'Empty phase', questions: [] },
  ],
  boss: { title: 'Solve the whole problem under interview conditions', story: 's', objective: 'o' },
};
test('parseCurriculum dedupes, drops short titles and empty phases', () => {
  const c = parse.parseCurriculum(JSON.stringify(outline));
  assert.strictEqual(c.phases.length, 2);
  assert.strictEqual(c.phases[0].questions.length, 2);
  assert.strictEqual(c.phases[1].questions.length, 1);
  assert.strictEqual(c.phases[0].questions[1].exercise, true);
  assert.strictEqual(c.phases[1].questions[0].difficulty, 'hard');
  assert.ok(c.boss && c.boss.difficulty === 'hard');
});
test('parseCurriculum with no phases throws', () => {
  assert.throws(() => parse.parseCurriculum('{"phases":[]}'), /did not write any phases/);
});

test('parseBranch drops titles the path already has and sorts deeper by level', () => {
  const known = new Set([parse.normTitle('Already here?')]);
  const text = JSON.stringify({
    prerequisites: ['pointers', 'nodes'],
    questions: [
      { title: 'Level three question here', level: 3 },
      { title: 'Already here?', level: 1 },
      { title: 'Level one question here', level: 1 },
      { title: 'No level given question' },
    ],
  });
  const b = parse.parseBranch(text, true, known);
  assert.deepStrictEqual(
    b.questions.map((q) => q.level),
    [1, 2, 3]
  );
  assert.strictEqual(b.questions.length, 3);
  assert.deepStrictEqual(b.prerequisites, ['pointers', 'nodes']);
});
test('parseBranch where everything repeats throws', () => {
  const known = new Set([parse.normTitle('Only question here')]);
  assert.throws(
    () =>
      parse.parseBranch(
        JSON.stringify({ questions: [{ title: 'Only question here' }] }),
        false,
        known
      ),
    /only repeated/
  );
});

test('parseLesson builds a gradable exercise and a fallback starter', () => {
  const lesson = parse.parseLesson(
    JSON.stringify({
      explanation: 'Because "\\n" … works.',
      example: ['a', 'b'],
      exercise: {
        prompt: 'Write two_sum(nums, target) returning indices.',
        function_name: 'two_sum',
        starter_code: 'def other(x):\n  pass',
        tests: [
          { args: [[2, 7], 9], expected: [0, 1], label: 'basic' },
          { args: [[3, 3], 6], expected: [0, 1] },
          { args: [[3, 3], 6], expected: [0, 1] }, // duplicate
          { args: 'bad', expected: 1 }, // bad args
          { args: [[1]] }, // no expected
        ],
        compare: 'unordered',
        solution: 'def two_sum(n,t):\n  return [0,1]',
      },
      hints: ['h1', 'h2', 'h3'],
      solution_explanation: 'because',
    })
  );
  const ex = lesson.exercise;
  assert.ok(ex);
  assert.strictEqual(ex.tests.length, 2);
  assert.strictEqual(ex.compare, 'unordered');
  assert.ok(/def two_sum\(arg1, arg2\)/.test(ex.starterCode), ex.starterCode);
  assert.strictEqual(ex.gradable, true);
  assert.strictEqual(ex.verified, false);
  assert.strictEqual(lesson.example, 'a\n\nb');
});
test('parseLesson: invalid function name means no exercise; empty explanation throws', () => {
  const l = parse.parseLesson(
    JSON.stringify({
      explanation: 'x',
      exercise: { prompt: 'long enough prompt', function_name: 'not valid', tests: [] },
    })
  );
  assert.strictEqual(l.exercise, null);
  assert.throws(() => parse.parseLesson('{"explanation":""}'), /came back empty/);
});

test('splitTutorReply strips the verdict tag wherever it sits', () => {
  const r = parse.splitTutorReply('Good answer.\n\n[[verdict: understood]]');
  assert.strictEqual(r.verdict, 'understood');
  assert.strictEqual(r.text, 'Good answer.');
  const p = parse.splitTutorReply('Almost [[Verdict: not yet]] there');
  assert.strictEqual(p.verdict, 'not_yet');
  assert.ok(!p.text.includes('[['));
  assert.strictEqual(parse.splitTutorReply('plain').verdict, null);
});

test('cleanMarkdown removes a wrapping fence only', () => {
  assert.strictEqual(parse.cleanMarkdown('```markdown\n## S\ntext\n```'), '## S\ntext');
  assert.strictEqual(parse.cleanMarkdown('## S\n```python\nx=1\n```'), '## S\n```python\nx=1\n```');
});

test('extractPython takes the python block, without its fences', () => {
  const code = 'def f(x):\n    return x + 1\n\nprint(f(1))';
  assert.strictEqual(parse.extractPython('```python\n' + code + '\n```'), code);
  assert.strictEqual(parse.extractPython('  ```py\n' + code + '\n```  \n'), code);
  assert.strictEqual(parse.extractPython('```python\r\nx = 1\r\n```\r\n'), 'x = 1');
});
test('extractPython: python blocks win over an output block, several are joined, a missing fence is fine', () => {
  const reply = '```python\nprint(1)\n```\n\nOutput:\n```\n1\n```';
  assert.strictEqual(parse.extractPython(reply), 'print(1)');
  assert.strictEqual(
    parse.extractPython('```python\na = 1\n```\ntext\n```python\nb = 2\n```'),
    'a = 1\n\nb = 2'
  );
  assert.strictEqual(parse.extractPython('```\nx = 1\n```'), 'x = 1');
  assert.strictEqual(parse.extractPython('x = 1\nprint(x)'), 'x = 1\nprint(x)');
});
test('extractPython keeps a reply cut off before its closing fence', () => {
  assert.strictEqual(
    parse.extractPython('```python\ndef f():\n    return 1'),
    'def f():\n    return 1'
  );
});
test('extractPython refuses another language and empty code (the feature is Python only)', () => {
  assert.throws(() => parse.extractPython('```java\nclass A {}\n```'), /other than Python/);
  assert.throws(
    () => parse.extractPython('```javascript\nlet x = 1;\n```\n```ts\nlet y = 2;\n```'),
    /other than Python/
  );
  assert.throws(() => parse.extractPython(''), /no code/);
  assert.throws(() => parse.extractPython('```python\n\n```'), /no code/);
  // a java block next to a python block: the python one is the answer
  assert.strictEqual(parse.extractPython('```java\nint x;\n```\n```python\nx = 1\n```'), 'x = 1');
});
test('fencedPython fences with more backticks than the code holds, and extractPython reads it back', () => {
  const plain = 'x = 1';
  assert.strictEqual(parse.fencedPython(plain), '```python\nx = 1\n```');
  const tricky = 'doc = """\n```python\nprint(1)\n```\n"""\nprint(doc)';
  const fenced = parse.fencedPython(tricky);
  assert.ok(fenced.startsWith('````python\n') && fenced.endsWith('\n````'), fenced);
  assert.strictEqual(parse.extractPython(fenced), tricky);
});

// ── tree + xp ───────────────────────────────────────────────────────────────
const topic = {
  id: 'dsa-1',
  subId: '',
  name: 'Two Sum',
  brief: 'LC #1',
  category: 'Hashmap',
  difficulty: 'Easy',
  subName: '',
  subBrief: '',
};
const curriculum = parse.parseCurriculum(JSON.stringify(outline));
let state = tree.createState(topic, curriculum, 'focus text');
const base = Object.values(state.questions).filter((q) => q.relation === 'base');
const [q1, q2, q3] = base.map((q) => q.id);

test('createState: phases, boss and ids', () => {
  assert.strictEqual(state.phases.length, 2);
  assert.strictEqual(base.length, 3);
  assert.ok(state.bossId);
  assert.strictEqual(state.questions[state.bossId].relation, 'boss');
  assert.strictEqual(state.questions[state.bossId].phaseId, 'boss');
  assert.deepStrictEqual(state.ui.open, {});
});

test('phase 2 and the boss are locked until phase 1 completes', () => {
  assert.strictEqual(tree.phaseStatus(state, state.phases[0]), 'active');
  assert.strictEqual(tree.phaseStatus(state, state.phases[1]), 'locked');
  assert.strictEqual(tree.bossStatus(state), 'locked');
  assert.strictEqual(tree.isUnlocked(state, q3), false);
  assert.strictEqual(tree.completionGate(state, q3).ok, false);
  assert.strictEqual(xp.completeQuestion(state, q3).state, state); // refused: unchanged
});

test('completing pays XP once; undo and redo does not pay again', () => {
  let r = xp.completeQuestion(state, q1);
  assert.strictEqual(r.state.player.xp, XP.complete.easy);
  assert.ok(r.events.some((e) => e.type === 'xp'));
  assert.ok(r.state.player.achievements['first-step']);
  const again = xp.completeQuestion(r.state, q1);
  assert.strictEqual(again.state, r.state);
  const undone = xp.uncompleteQuestion(r.state, q1);
  assert.strictEqual(tree.isDone(undone, q1), false);
  assert.strictEqual(undone.player.xp, XP.complete.easy);
  const redone = xp.completeQuestion(undone, q1);
  assert.strictEqual(redone.state.player.xp, XP.complete.easy, 'no second payment');
  state = r.state;
});

test('finishing a phase pays the phase reward, unlocks the next and the level moves', () => {
  const r = xp.completeQuestion(state, q2);
  assert.ok(r.events.some((e) => e.type === 'phase'));
  assert.strictEqual(r.state.player.ledger['phase:p1'], XP.phase);
  assert.strictEqual(tree.phaseStatus(r.state, r.state.phases[1]), 'active');
  assert.ok(r.state.player.achievements['phase-cleared']);
  assert.strictEqual(tree.activePhase(r.state).id, 'p2');
  state = r.state;
});

test('breakdown: nested children, never duplicates, recursion, depth', () => {
  const parsed = parse.parseBranch(
    JSON.stringify({
      prerequisites: ['a'],
      questions: [
        { title: 'Child one of three', why: 'w1' },
        { title: 'Child two of three', why: 'w2' },
        { title: 'Child three of three', why: 'w3' },
      ],
    }),
    false,
    tree.knownTitles(state)
  );
  let r = tree.applyBranch(state, q3, 'breakdown', parsed, false);
  assert.strictEqual(r.added, 3);
  const kids = tree.childrenOf(r.state, q3, 'breakdown');
  assert.deepStrictEqual(
    kids.map((k) => k.relation),
    ['breakdown', 'breakdown', 'breakdown']
  );
  assert.strictEqual(kids[0].parentId, q3);
  assert.strictEqual(kids[0].phaseId, 'p2');
  assert.strictEqual(r.state.ui.open['bd:' + q3], true);
  // recursion
  const grand = parse.parseBranch(
    JSON.stringify({
      questions: [{ title: 'Grandchild A of kid' }, { title: 'Grandchild B of kid' }],
    }),
    false,
    tree.knownTitles(r.state)
  );
  const r2 = tree.applyBranch(r.state, kids[0].id, 'breakdown', grand, false);
  assert.strictEqual(
    tree.depthOf(r2.state, tree.childrenOf(r2.state, kids[0].id, 'breakdown')[0].id),
    2
  );
  assert.deepStrictEqual(
    tree
      .ancestorsOf(r2.state, tree.childrenOf(r2.state, kids[0].id, 'breakdown')[0].id)
      .map((a) => a.id),
    [q3, kids[0].id]
  );
  state = r2.state;
});

test('a parent with breakdown children needs them (or proof) before it can complete', () => {
  assert.strictEqual(tree.completionGate(state, q3).ok, false);
  assert.ok(/remaining breakdown question/.test(tree.completionGate(state, q3).reason));
  // proof by passing the tests lifts the gate
  const proven = tree.patchProgress(state, q3, { codingDone: true });
  assert.strictEqual(tree.completionGate(proven, q3).ok, true);
  const viaTutor = tree.patchProgress(state, q3, {
    tutor: { messages: [], understood: true, hintLevel: 0 },
  });
  assert.strictEqual(tree.completionGate(viaTutor, q3).ok, true);
});

test('regenerate keeps worked-on children and replaces untouched ones; no XP farming', () => {
  const kids = tree.childrenOf(state, q3, 'breakdown');
  // complete kid 2 (it has progress), leave 1 (has its own grandchildren, untouched) and 3
  let r = xp.completeQuestion(state, kids[1].id);
  const xpAfter = r.state.player.xp;
  const parsed = parse.parseBranch(
    JSON.stringify({
      questions: [
        { title: 'Fresh approach one here' },
        { title: 'Fresh approach two here' },
        { title: 'Fresh approach three here' },
      ],
    }),
    false,
    new Set()
  );
  const res = tree.applyBranch(r.state, q3, 'breakdown', parsed, true);
  const ids = res.state.questions[q3].breakdown.ids;
  assert.ok(ids.includes(kids[1].id), 'completed kid stays');
  assert.ok(!ids.includes(kids[0].id), 'untouched kid with untouched grandchildren is replaced');
  assert.ok(
    !res.state.questions[tree.childrenOf(state, kids[0].id, 'breakdown')[0].id],
    'its grandchildren are gone too'
  );
  assert.strictEqual(res.removed, 2);
  assert.strictEqual(res.state.questions[q3].breakdown.generations, 2);
  assert.strictEqual(res.state.player.xp, xpAfter);
  state = res.state;
});

test('finishing all breakdown children lets the parent complete; Concept Decomposer counts finished breakdowns', () => {
  let s = state;
  for (const k of tree.childrenOf(s, q3, 'breakdown')) s = xp.completeQuestion(s, k.id).state;
  assert.strictEqual(tree.completionGate(s, q3).ok, true);
  const parent = xp.completeQuestion(s, q3);
  assert.strictEqual(tree.progressOf(parent.state, q3).via, 'children');
  const st = xp.achievementStatuses(parent.state).find((a) => a.def.id === 'concept-decomposer');
  assert.strictEqual(st.value, 1);
  assert.strictEqual(st.earnedAt, null);
  state = parent.state;
});

test('boss unlocks after every phase and rewards once', () => {
  assert.strictEqual(tree.bossStatus(state), 'active');
  assert.strictEqual(tree.isUnlocked(state, state.bossId), true);
  const r = xp.completeQuestion(state, state.bossId);
  assert.ok(r.events.some((e) => e.type === 'boss'));
  assert.strictEqual(r.state.player.ledger.boss, XP.boss);
  assert.ok(r.state.player.achievements['boss-slayer']);
  assert.ok(r.state.player.achievements['path-complete']);
  assert.strictEqual(tree.overall(r.state).percent, 100);
  state = r.state;
});

test('Curiosity Explorer after five completed Dive Deeper questions, with the exploration bonus', () => {
  const deeper = parse.parseBranch(
    JSON.stringify({
      questions: [1, 2, 3, 4, 5, 6].map((n) => ({
        title: `Deeper question number ${n}`,
        level: Math.min(5, n),
      })),
    }),
    true,
    tree.knownTitles(state)
  );
  assert.strictEqual(deeper.questions.length, 6);
  let s = tree.applyBranch(state, q1, 'deeper', deeper, false).state;
  const kids = tree.childrenOf(s, q1, 'deeper');
  assert.deepStrictEqual(
    kids.map((k) => k.level),
    [1, 2, 3, 4, 5, 5]
  );
  const before = s.player.xp;
  let last;
  for (const k of kids.slice(0, 4)) {
    last = xp.completeQuestion(s, k.id);
    s = last.state;
  }
  assert.strictEqual(s.player.achievements['curiosity-explorer'], undefined);
  last = xp.completeQuestion(s, kids[4].id);
  s = last.state;
  assert.ok(s.player.achievements['curiosity-explorer']);
  assert.ok(
    last.events.some((e) => e.type === 'achievement' && e.achievementId === 'curiosity-explorer')
  );
  // each deeper completion paid complete + explore
  const paid = s.player.xp - before;
  const expected = kids
    .slice(0, 5)
    .reduce((sum, k) => sum + XP.complete[k.difficulty] + XP.explore, 0);
  assert.strictEqual(paid, expected);
  state = s;
});

test('coding: first passing run pays code XP, completes the question, starts a streak; a failing run does not', () => {
  const fresh = tree.createState(topic, curriculum, '');
  const id = Object.values(fresh.questions).find((q) => q.relation === 'base').id;
  const fail = xp.recordRun(
    fresh,
    id,
    { passed: 1, total: 3, ok: false, at: 'x', report: 'r' },
    new Date(2026, 10, 18)
  );
  assert.strictEqual(tree.progressOf(fail.state, id).codingDone, false);
  assert.strictEqual(tree.isDone(fail.state, id), false);
  const pass = xp.recordRun(
    fail.state,
    id,
    { passed: 3, total: 3, ok: true, at: 'x', report: 'r' },
    new Date(2026, 10, 18)
  );
  assert.strictEqual(tree.progressOf(pass.state, id).codingDone, true);
  assert.strictEqual(tree.isDone(pass.state, id), true);
  assert.strictEqual(tree.progressOf(pass.state, id).independent, true);
  assert.strictEqual(pass.state.player.streak.current, 1);
  assert.strictEqual(pass.state.player.xp, XP.code + XP.complete.easy);
  assert.ok(pass.state.player.achievements['code-runner']);
  const dup = xp.recordRun(
    pass.state,
    id,
    { passed: 3, total: 3, ok: true, at: 'y', report: 'r' },
    new Date(2026, 10, 18)
  );
  assert.strictEqual(dup.state.player.xp, pass.state.player.xp, 'a second pass pays nothing');
});

test('streak: consecutive days continue it (with a bonus), a gap restarts it, display lapses', () => {
  const fresh = tree.createState(topic, curriculum, '');
  const ids = Object.values(fresh.questions)
    .filter((q) => q.relation === 'base' && q.phaseId === 'p1')
    .map((q) => q.id);
  let s = fresh;
  s = xp.recordRun(
    s,
    ids[0],
    { passed: 2, total: 2, ok: true, at: '', report: '' },
    new Date(2026, 10, 16)
  ).state;
  assert.strictEqual(s.player.streak.current, 1);
  const day2 = xp.recordRun(
    s,
    ids[1],
    { passed: 2, total: 2, ok: true, at: '', report: '' },
    new Date(2026, 10, 17)
  );
  assert.strictEqual(day2.state.player.streak.current, 2);
  assert.ok(day2.events.some((e) => e.type === 'streak' && e.days === 2));
  assert.strictEqual(day2.state.player.ledger['streak:2026-11-17'], XP.streak);
  assert.strictEqual(xp.streakNow(day2.state, '2026-11-18'), 2); // yesterday still counts
  assert.strictEqual(xp.streakNow(day2.state, '2026-11-19'), 0); // a missed day breaks it
  const s3 = tree.createState(topic, curriculum, '');
  let g = xp.recordRun(
    s3,
    ids[0],
    { passed: 1, total: 1, ok: true, at: '', report: '' },
    new Date(2026, 10, 10)
  ).state;
  g = xp.recordRun(
    g,
    ids[1],
    { passed: 1, total: 1, ok: true, at: '', report: '' },
    new Date(2026, 10, 14)
  ).state;
  assert.strictEqual(g.player.streak.current, 1);
  assert.strictEqual(g.player.streak.best, 1);
});

test('independence: hints, the solution or a STAR answer make a completion not independent', () => {
  const fresh = tree.createState(topic, curriculum, '');
  const [a, b, c] = Object.values(fresh.questions)
    .filter((q) => q.phaseId === 'p1')
    .map((q) => q.id);
  let s = tree.patchProgress(fresh, a, { codingDone: true, hintsUsed: 1 });
  assert.strictEqual(
    tree.progressOf(xp.completeQuestion(s, a, 'tests').state, a).independent,
    false
  );
  s = tree.patchProgress(fresh, b, { codingDone: true, starViewed: true });
  assert.strictEqual(
    tree.progressOf(xp.completeQuestion(s, b, 'tests').state, b).independent,
    false
  );
  s = tree.patchProgress(fresh, a, { tutor: { messages: [], understood: true, hintLevel: 0 } });
  assert.strictEqual(
    tree.progressOf(xp.completeQuestion(s, a, 'tutor').state, a).independent,
    true
  );
  // manual completion with no proof is never independent
  assert.strictEqual(tree.progressOf(xp.completeQuestion(fresh, a).state, a).independent, false);
  void c;
});

test('Curious Learner at 5 understood tutor sessions; Concept Master at exactly 10 independent answers', () => {
  const mk = (n, from) =>
    Array.from({ length: n }, (_, i) => ({
      title: `Independent question ${from + i}`,
      difficulty: 'easy',
    }));
  const twelve = parse.parseCurriculum(
    JSON.stringify({
      phases: [
        { title: 'A', goal: '', questions: mk(6, 1) },
        { title: 'B', goal: '', questions: mk(6, 7) },
      ],
    })
  );
  let s = tree.createState(topic, twelve, '');
  const ids = s.phases.flatMap((p) => p.questionIds);
  assert.strictEqual(ids.length, 12);
  // Curious Learner: four sessions are not enough, the fifth earns it
  for (const id of ids.slice(0, 4))
    s = tree.patchProgress(s, id, { tutor: { messages: [], understood: true, hintLevel: 0 } });
  s = xp.evaluateAchievements(s).state;
  assert.strictEqual(s.player.achievements['curious-learner'], undefined);
  s = tree.patchProgress(s, ids[4], { tutor: { messages: [], understood: true, hintLevel: 0 } });
  s = xp.evaluateAchievements(s).state;
  assert.ok(s.player.achievements['curious-learner']);
  // Concept Master: nine independent completions (tests passed, no help) do not earn it, the tenth does
  const pass = (id) => {
    s = tree.patchProgress(s, id, { codingDone: true });
    const r = xp.completeQuestion(s, id, 'tests');
    s = r.state;
    return r;
  };
  for (const id of ids.slice(0, 6)) pass(id); // phase A done, B unlocks
  for (const id of ids.slice(6, 9)) pass(id);
  assert.strictEqual(
    Object.values(s.progress).filter((p) => p.completed && p.independent).length,
    9
  );
  assert.strictEqual(s.player.achievements['concept-master'], undefined, 'nine is not ten');
  // a completion WITH a hint must not count
  s = tree.patchProgress(s, ids[10], { codingDone: true, hintsUsed: 2 });
  s = xp.completeQuestion(s, ids[10], 'tests').state;
  assert.strictEqual(
    s.player.achievements['concept-master'],
    undefined,
    'a hinted answer is not independent'
  );
  const last = pass(ids[9]);
  assert.ok(last.state.player.achievements['concept-master']);
  assert.ok(
    last.events.some((e) => e.type === 'achievement' && e.achievementId === 'concept-master')
  );
});

test('levels', () => {
  assert.strictEqual(xp.levelFor(0).level, 1);
  assert.strictEqual(xp.levelFor(60).title, 'Apprentice');
  assert.strictEqual(xp.levelFor(59).pct, Math.round((59 / 60) * 100));
  assert.strictEqual(xp.levelFor(99999).level, 10);
  assert.strictEqual(xp.levelFor(99999).pct, 100);
});

test('hydrateState fills gaps and refuses non-documents', () => {
  assert.strictEqual(tree.hydrateState(null), null);
  assert.strictEqual(tree.hydrateState({ schema: 2 }), null);
  const round = tree.hydrateState(JSON.parse(JSON.stringify(state)));
  assert.strictEqual(round.phases.length, 2);
  const stripped = JSON.parse(JSON.stringify(state));
  delete stripped.progress[q1].tutor;
  delete stripped.player.streak;
  const h = tree.hydrateState(stripped);
  assert.deepStrictEqual(h.progress[q1].tutor.messages, []);
  assert.strictEqual(h.player.streak.current, 0);
});

test('a new STAR answer version keeps the code implementation (it once dropped it)', () => {
  const code = { text: 'print(1)', at: 'x', hidden: false };
  const before = { versions: [], activeId: null, hidden: true, code };
  const version = { id: 's1', variant: 'generate', label: 'Answer', text: '## S', at: 'x' };
  const after = tree.starWithVersion(before, version);
  assert.deepStrictEqual(after.code, code);
  assert.deepStrictEqual(after.versions, [version]);
  assert.strictEqual(after.activeId, 's1');
  assert.strictEqual(after.hidden, false, 'a new answer is shown');
  assert.deepStrictEqual(before.versions, [], 'the old state is not changed');
  const second = tree.starWithVersion(after, { ...version, id: 's2', variant: 'example' });
  assert.deepStrictEqual(
    second.versions.map((v) => v.id),
    ['s1', 's2']
  );
  assert.deepStrictEqual(second.code, code);
});

test('hydrateState keeps a saved code implementation, and drops anything that is not one', () => {
  const saved = JSON.parse(JSON.stringify(state));
  saved.progress[q1].star = {
    versions: [],
    activeId: null,
    hidden: false,
    code: { text: 'print(1)', at: '2026-11-20T10:00:00.000Z', hidden: true },
  };
  const kept = tree.hydrateState(saved).progress[q1].star.code;
  assert.deepStrictEqual(kept, { text: 'print(1)', at: '2026-11-20T10:00:00.000Z', hidden: true });
  for (const junk of [undefined, null, 'x', 5, {}, { text: '' }, { text: '  \n' }, { text: 7 }]) {
    const s = JSON.parse(JSON.stringify(state));
    s.progress[q1].star = { versions: [], activeId: null, hidden: false, code: junk };
    assert.strictEqual(tree.hydrateState(s).progress[q1].star.code, null, JSON.stringify(junk));
  }
  const old = JSON.parse(JSON.stringify(state)); // saved before the feature: no `code` key at all
  delete old.progress[q1].star.code;
  assert.strictEqual(tree.hydrateState(old).progress[q1].star.code, null);
});

test('nextQuestionId skips locked phases and completed questions', () => {
  const fresh = tree.createState(topic, curriculum, '');
  const first = fresh.phases[0].questionIds[0];
  assert.strictEqual(tree.nextQuestionId(fresh, first), fresh.phases[0].questionIds[1]);
  const lastOfP1 = fresh.phases[0].questionIds[1];
  assert.strictEqual(
    tree.nextQuestionId(fresh, lastOfP1),
    first,
    'phase 2 is locked, so it wraps to the first unfinished one in an unlocked phase'
  );
});

test('every lab offers Show code implementation except the one that is all wording', () => {
  const labs = require(path.join(B, 'labs.js'));
  for (const lab of ['dsa', 'cv', 'system_design', 'finance', 'python', 'genai'])
    assert.strictEqual(labs.labConfig(lab).codeImplementation, true, lab);
  assert.strictEqual(labs.labConfig('communication').codeImplementation, false);
});

test('labConfig falls back to the DSA lab for an unknown or missing lab', () => {
  const labs = require(path.join(B, 'labs.js'));
  assert.strictEqual(labs.labConfig(undefined).lab, 'dsa');
  assert.strictEqual(labs.labConfig('nope').lab, 'dsa');
  for (const inherited of ['constructor', 'toString', '__proto__', 'hasOwnProperty'])
    assert.strictEqual(labs.labConfig(inherited).lab, 'dsa', inherited);
  assert.strictEqual(labs.labConfig('cv').pagePath, '/cv-lab/guided-practice');
  assert.strictEqual(labs.labConfig('dsa').topicsApi, '/dsa/topics');
});

const LAB_FOLDERS = {
  dsa: 'dsa-lab',
  cv: 'cv-lab',
  system_design: 'system-design-lab',
  communication: 'communication-lab',
  finance: 'finance-lab',
  python: 'python-lab',
  genai: 'genai-lab',
};

test('every lab has Guided Practice: a config, a page and the card on its topic pages', () => {
  const labs = require(path.join(B, 'labs.js'));
  assert.deepStrictEqual([...labs.GUIDED_LABS], Object.keys(LAB_FOLDERS));
  assert.strictEqual(new Set(labs.GUIDED_LABS).size, 7);
  for (const lab of labs.GUIDED_LABS) {
    const c = labs.labConfig(lab);
    assert.strictEqual(c.lab, lab, lab);
    assert.strictEqual(c.pagePath, `${c.labPath}/guided-practice`, lab);
    for (const key of [
      'labName',
      'labPath',
      'pagePath',
      'topicsApi',
      'noun',
      'intro',
      'cardLine',
      'bossLine',
      'exerciseLabel',
      'focusExample',
      'progressLine',
    ])
      assert.ok(typeof c[key] === 'string' && c[key].trim().length > 0, `${lab}.${key}`);
    const boss = c.boss('Sample topic');
    assert.ok(boss.title.includes('Sample topic'), `${lab} boss title names the topic`);
    assert.ok(boss.story.trim() && boss.objective.trim(), `${lab} boss story and objective`);
    // the page is a real route
    assert.ok(
      fs.existsSync(path.join(root, 'src', 'app', LAB_FOLDERS[lab], 'guided-practice', 'page.tsx')),
      `${lab}: its guided-practice route exists`
    );
    assert.strictEqual(c.labPath, `/${LAB_FOLDERS[lab]}`, lab);
  }
  // The card: TopicLab labs set the flag in their config (and the topics API is the config's own); DSA has its own page.
  for (const lab of labs.GUIDED_LABS.filter((l) => l !== 'dsa')) {
    const src = fs.readFileSync(
      path.join(root, 'src', 'modules', 'labs', LAB_FOLDERS[lab], 'labConfig.ts'),
      'utf8'
    );
    assert.ok(src.includes(`guidedPractice: '${lab}'`), `${lab}: labConfig sets guidedPractice`);
    const prefix = /apiPrefix: '([^']+)'/.exec(src)?.[1];
    assert.strictEqual(labs.labConfig(lab).topicsApi, `${prefix}/topics`, `${lab}: topics API`);
  }
  const dsaPage = fs.readFileSync(
    path.join(root, 'src', 'modules', 'labs', 'dsa-lab', 'DSALabModule.tsx'),
    'utf8'
  );
  assert.ok(dsaPage.includes('GuidedPracticeCard'), 'the DSA page shows the card itself');
});

test('a lab with no code says so: its words differ where the exercise is not code', () => {
  const labs = require(path.join(B, 'labs.js'));
  assert.strictEqual(labs.labConfig('dsa').exerciseLabel, 'coding exercise');
  assert.strictEqual(labs.labConfig('cv').exerciseLabel, 'coding exercise');
  assert.strictEqual(labs.labConfig('communication').exerciseLabel, 'practice task');
  assert.ok(!/coding streak/.test(labs.labConfig('communication').progressLine));
  assert.ok(/coding streak/.test(labs.labConfig('dsa').progressLine));
  // a kind note, when a lab has one, is for a real question kind
  for (const lab of labs.GUIDED_LABS)
    for (const kind of Object.keys(labs.labConfig(lab).kindNotes ?? {}))
      assert.ok(
        ['concept', 'implementation', 'algorithm', 'scenario'].includes(kind),
        `${lab}.${kind}`
      );
});

test("every lab's default boss names its topic when the AI wrote none", () => {
  const noBoss = parse.parseCurriculum(JSON.stringify({ phases: outline.phases }));
  const labs = require(path.join(B, 'labs.js'));
  for (const lab of labs.GUIDED_LABS) {
    const state = tree.createState(
      { ...topic, lab, name: 'Sample topic', subName: '' },
      noBoss,
      ''
    );
    assert.ok(
      state.questions[state.bossId].title.includes('Sample topic'),
      `${lab}: ${state.questions[state.bossId].title}`
    );
    assert.strictEqual(state.topic.lab, lab);
    // the boss asks for an exercise only where the lab is code (a scenario or a design has none to write)
    assert.strictEqual(
      state.questions[state.bossId].wantsExercise,
      labs.labConfig(lab).bossExercise,
      `${lab} boss exercise`
    );
  }
  assert.strictEqual(labs.labConfig('dsa').bossExercise, true);
  assert.strictEqual(labs.labConfig('cv').bossExercise, true);
  assert.strictEqual(labs.labConfig('communication').bossExercise, false);
  assert.strictEqual(labs.labConfig('system_design').bossExercise, false);
});

test("createState uses the lab's own default boss; an old document without a lab is DSA", () => {
  const cvTopic = { ...topic, lab: 'cv', name: 'Object Detection with YOLO', subName: '' };
  const noBoss = parse.parseCurriculum(JSON.stringify({ phases: outline.phases }));
  const cv = tree.createState(cvTopic, noBoss, '');
  assert.ok(/end to end/.test(cv.questions[cv.bossId].title), cv.questions[cv.bossId].title);
  const dsa = tree.createState({ ...topic, lab: 'dsa' }, noBoss, '');
  assert.ok(/from scratch/.test(dsa.questions[dsa.bossId].title));
  const old = JSON.parse(JSON.stringify(dsa));
  delete old.topic.lab;
  assert.strictEqual(tree.hydrateState(old).topic.lab, 'dsa');
  assert.strictEqual(tree.hydrateState(JSON.parse(JSON.stringify(cv))).topic.lab, 'cv');
});

// ── the path in pages: a plan, then one phase at a time ─────────────────────
const { PHASE_QUESTIONS } = require(path.join(B, 'constants.js'));
const plan = {
  phases: [
    { title: 'The basics', goal: 'Say what it is.' },
    { title: 'How it works', goal: 'Trace it by hand.' },
    { title: 'Limits', goal: 'Know when it fails.' },
  ],
  boss: { title: 'Build the whole thing from scratch', story: 's', objective: 'o' },
};
const pageQuestions = (n, tag = 'q') =>
  Array.from({ length: n }, (_, i) => ({
    title: `${tag} number ${i + 1} about the idea`,
    objective: 'o',
    kind: i === 0 ? 'concept' : 'implementation',
    difficulty: 'easy',
    effort: '5 min',
    exercise: i > 0,
  }));
const pageJson = (n, tag) =>
  JSON.stringify({ title: 'T', goal: 'G', questions: pageQuestions(n, tag) });
const planned = () =>
  tree.createPlannedState(
    topic,
    parse.parseOutline(JSON.stringify(plan)),
    parse.parsePhase(pageJson(5, 'first'), new Set()),
    'focus text'
  );
const finishPhase = (st, phaseId) =>
  st.phases
    .find((p) => p.id === phaseId)
    .questionIds.reduce((acc, id) => tree.patchProgress(acc, id, { completed: true }), st);

test('parseOutline reads phases with titles and goals, and the boss', () => {
  const o = parse.parseOutline(
    JSON.stringify({ ...plan, phases: [...plan.phases, { goal: 'no title' }] })
  );
  assert.strictEqual(o.phases.length, 4);
  assert.strictEqual(o.phases[3].title, 'Phase 4');
  assert.strictEqual(o.phases[0].goal, 'Say what it is.');
  assert.ok(o.boss && o.boss.title.startsWith('Build the whole'));
  assert.strictEqual(parse.parseOutline('{"phases":[{"title":"A phase"}]}').boss, null);
  assert.throws(() => parse.parseOutline('{"phases":[]}'), /did not plan any phases/);
});
test('parsePhase dedupes against the rest of the path and says why it failed', () => {
  const known = new Set([parse.normTitle('first number 1 about the idea')]);
  const p = parse.parsePhase(pageJson(5, 'first'), known);
  assert.strictEqual(p.questions.length, 4);
  assert.strictEqual(p.title, 'T');
  assert.throws(
    () => parse.parsePhase('{"questions":[]}', new Set()),
    /did not write any questions/
  );
  const all = new Set(pageQuestions(5, 'first').map((q) => parse.normTitle(q.title)));
  assert.throws(() => parse.parsePhase(pageJson(5, 'first'), all), /only repeated/);
});
test('createPlannedState writes the first phase and leaves the rest pending', () => {
  const st = planned();
  assert.strictEqual(st.phases.length, 3);
  assert.strictEqual(st.phases[0].questionIds.length, 5);
  assert.ok(!st.phases[0].pending);
  assert.deepStrictEqual(
    st.phases.slice(1).map((p) => [p.pending, p.questionIds.length]),
    [
      [true, 0],
      [true, 0],
    ]
  );
  assert.strictEqual(st.phases[0].title, 'The basics');
  assert.ok(st.bossId && st.questions[st.bossId].title.startsWith('Build the whole'));
  assert.strictEqual(st.focus, 'focus text');
});
test('a pending phase is never done: the boss stays locked and the bar does not reach 100%', () => {
  let st = finishPhase(planned(), 'p1');
  assert.strictEqual(tree.isPhaseDone(st, st.phases[1]), false);
  assert.strictEqual(tree.bossStatus(st), 'locked');
  assert.strictEqual(tree.phaseStatus(st, st.phases[0]), 'completed');
  assert.strictEqual(tree.phaseStatus(st, st.phases[1]), 'active');
  assert.strictEqual(tree.phaseStatus(st, st.phases[2]), 'locked');
  const o = tree.overall(st);
  assert.strictEqual(o.requiredTotal, 5 + 1 + 2 * PHASE_QUESTIONS);
  assert.ok(o.percent < 100 && o.percent > 0, String(o.percent));
  assert.strictEqual(o.phasesDone, 1);
  assert.strictEqual(o.phases, 3);
});
test('applyPhase fills a pending phase: questions appear, it stops waiting, the plan title stays', () => {
  const st = planned();
  const r = tree.applyPhase(st, 'p2', parse.parsePhase(pageJson(5, 'second'), new Set()));
  assert.strictEqual(r.added, 5);
  assert.strictEqual(r.removed, 0);
  const phase = r.state.phases[1];
  assert.ok(!phase.pending && phase.questionIds.length === 5);
  assert.strictEqual(phase.title, 'How it works');
  assert.strictEqual(phase.goal, 'Trace it by hand.');
  for (const id of phase.questionIds) assert.strictEqual(r.state.questions[id].phaseId, 'p2');
  assert.strictEqual(
    new Set(Object.keys(r.state.questions)).size,
    Object.keys(r.state.questions).length
  );
  assert.strictEqual(tree.overall(r.state).requiredTotal, 5 + 5 + 1 + PHASE_QUESTIONS);
});
test('regenerating a phase replaces what nobody worked on and keeps what was worked on', () => {
  let st = planned();
  const [a, b, c, d, e] = st.phases[0].questionIds;
  st = tree.patchProgress(st, a, { completed: true });
  st = tree.patchProgress(st, b, { hintsUsed: 2 }); // started, not finished
  const before = JSON.stringify(st.player);
  const r = tree.applyPhase(st, 'p1', parse.parsePhase(pageJson(3, 'fresh'), new Set()));
  assert.strictEqual(r.removed, 3);
  assert.strictEqual(r.added, 3);
  const ids = r.state.phases[0].questionIds;
  assert.deepStrictEqual(ids.slice(0, 2), [a, b]);
  assert.strictEqual(ids.length, 5);
  for (const gone of [c, d, e]) {
    assert.strictEqual(r.state.questions[gone], undefined);
    assert.strictEqual(r.state.progress[gone], undefined);
  }
  assert.strictEqual(r.state.progress[a].completed, true);
  assert.strictEqual(r.state.progress[b].hintsUsed, 2);
  assert.strictEqual(JSON.stringify(r.state.player), before); // no XP is paid or taken by a regenerate
  assert.strictEqual(r.state.phases[0].title, 'The basics');
  assert.ok(!ids.some((id) => [c, d, e].includes(id)), 'new questions get new ids');
});
test('regenerating a phase also removes the children (breakdown) of the replaced questions', () => {
  let st = planned();
  const [a] = st.phases[0].questionIds;
  const kid = tree.applyBranch(
    st,
    a,
    'breakdown',
    { prerequisites: [], questions: pageQuestions(2, 'kid').map((q) => ({ ...q, why: '' })) },
    false
  );
  st = kid.state;
  const kidIds = tree.descendantsOf(st, a).map((q) => q.id);
  assert.strictEqual(kidIds.length, 2);
  const r = tree.applyPhase(st, 'p1', parse.parsePhase(pageJson(5, 'again'), new Set()));
  for (const id of [a, ...kidIds]) assert.strictEqual(r.state.questions[id], undefined);
});
test('appendPhases adds the next phase after the last and before the boss, and relocks the boss', () => {
  let st = planned();
  for (const id of ['p2', 'p3'])
    st = tree.applyPhase(st, id, parse.parsePhase(pageJson(5, id), new Set())).state;
  for (const id of ['p1', 'p2', 'p3']) st = finishPhase(st, id);
  assert.strictEqual(tree.bossStatus(st), 'active');
  const r = tree.appendPhases(st, [
    {
      title: '',
      goal: 'g',
      questions: parse.parsePhase(pageJson(5, 'extra'), new Set()).questions,
    },
  ]);
  assert.strictEqual(r.added, 5);
  const last = r.state.phases[r.state.phases.length - 1];
  assert.deepStrictEqual([last.id, last.number, last.title], ['p4', 4, 'Phase 4']);
  assert.strictEqual(r.state.phases.length, 4);
  assert.strictEqual(tree.bossStatus(r.state), 'locked');
  assert.strictEqual(r.state.questions[r.state.bossId].relation, 'boss');
  assert.ok(
    tree.questionOrder(r.state).indexOf(r.state.bossId) === tree.questionOrder(r.state).length - 1
  );
});
test('a document saved before pages existed (no pending flag) behaves exactly as before', () => {
  const old = tree.createState(topic, parse.parseCurriculum(JSON.stringify(outline)), '');
  assert.ok(old.phases.every((p) => p.pending === undefined));
  assert.strictEqual(tree.overall(old).requiredTotal, 2 + 1 + 1);
  const done = finishPhase(finishPhase(old, 'p1'), 'p2');
  assert.strictEqual(tree.bossStatus(done), 'active');
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exitCode = failed ? 1 : 0;

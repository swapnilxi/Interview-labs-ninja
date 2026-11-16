// Runs every *.e2e.js script in this folder one after another (they share the mock's port) and prints one summary.
// Exit code 1 when any test failed, 2 when a script crashed. `node run_all.js workspace study` runs just those files.
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const SHOTS = process.env.SHOTS_DIR || path.join(__dirname, 'shots');
const ALL = ['guards', 'workspace', 'navigation', 'study'];
const picked = process.argv.slice(2).length ? process.argv.slice(2) : ALL;

let crashed = false;
const rows = [];
for (const name of picked) {
  const file = `${name.replace(/\.e2e\.js$/, '')}.e2e.js`;
  const resultFile = path.join(SHOTS, `results-${file.replace(/\.e2e\.js$/, '')}.json`);
  fs.rmSync(resultFile, { force: true });
  const r = spawnSync(process.execPath, [path.join(__dirname, file)], { stdio: 'inherit', env: process.env });
  if (r.status === 2 || !fs.existsSync(resultFile)) {
    crashed = true;
    rows.push({ file, name: '(script crashed)', ok: false });
    continue;
  }
  for (const t of JSON.parse(fs.readFileSync(resultFile, 'utf8')).results) rows.push({ file, ...t });
  console.log('');
}

const failed = rows.filter((r) => !r.ok);
console.log('════ Question Review e2e summary ════');
for (const r of rows) console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.file.padEnd(20)} ${r.name}`);
console.log(`\n${rows.length - failed.length}/${rows.length} tests passed`);
process.exit(crashed ? 2 : failed.length ? 1 : 0);

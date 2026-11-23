#!/usr/bin/env node
/**
 * What each server on THIS machine has synced with Neon, and what it still has queued.
 * Reads the state files neonSync.ts (`*.sqlite3.sync.json`) and neon_sync.py (`*.sqlite3.sync-py.json`)
 * keep next to each database. Usage (from frontend/):
 *   npm run sync:status                 # summary
 *   npm run sync:status -- --details    # every queued / refused request
 *   npm run sync:status -- --requeue-failed   # move refused requests back onto the queue (sent again on the next sync)
 * LABNINJA_DB_DIR=<dir> reads a test copy's state instead of backend/data.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const here = path.dirname(fileURLToPath(import.meta.url));
const dir = process.env.LABNINJA_DB_DIR || path.resolve(here, '../../backend/data');
const args = new Set(process.argv.slice(2));
let found = 0;

for (const db of ['lab_ninja', 'career_studio']) {
  for (const [who, suffix] of [['Next.js', '.sync.json'], ['FastAPI', '.sync-py.json']]) {
    const file = path.join(dir, `${db}.sqlite3${suffix}`);
    if (!fs.existsSync(file)) continue;
    found++;
    const st = JSON.parse(fs.readFileSync(file, 'utf8'));
    const outbox = st.outbox || [];
    const failed = st.failed || [];
    console.log(`\n${db} via ${who}  (${file})`);
    console.log(`  Neon version held: ${st.held === undefined ? '(never synced)' : st.held ?? '(Neon empty)'}`);
    console.log(`  last sync:         ${st.lastSyncAt || '-'}`);
    if (st.lastError) console.log(`  last error:        ${st.lastError}`);
    console.log(`  queued writes:     ${outbox.length}${outbox.length ? '  (sent automatically once Neon is reachable)' : ''}`);
    console.log(`  refused on replay: ${failed.length}`);
    if (args.has('--details')) {
      for (const e of outbox) console.log(`    queued  ${e.at} ${e.method} ${e.url}${e.error ? `  last error: ${e.error}` : ''}`);
      for (const e of failed) console.log(`    refused ${e.at} ${e.method} ${e.url}  -> ${e.status} ${String(e.error || '').slice(0, 160)}`);
    }
    if (args.has('--requeue-failed') && failed.length) {
      st.outbox = [...outbox, ...failed.map((e) => ({ ...e, status: undefined, error: undefined }))];
      st.failed = [];
      fs.writeFileSync(file, JSON.stringify(st, null, 1));
      console.log(`  moved ${failed.length} refused request(s) back onto the queue`);
    }
  }
}
if (!found) console.log(`No sync state in ${dir}: no server on this machine has synced yet (is DATABASE_URL set?).`);

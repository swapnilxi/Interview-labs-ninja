/**
 * Scenarios for neon_sync_e2e.sh (run that, not this file). The Python middleware (server C) and a Next.js server converging on one remote.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'child_process';
import { createRequire } from 'node:module';
const require = createRequire(path.join(process.cwd(), 'frontend', 'package.json'));
const jwt = require('jsonwebtoken');
const S = `${process.env.WORK}`;
const T = jwt.sign({ sub: '8', email: 'x' }, process.env.SECRET, { expiresIn: '1h' });
const H={Authorization:'Bearer '+T,'Content-Type':'application/json'}, A='http://localhost:4031', C='http://localhost:4033';
let pass=0, fail=0; const ok=(c,m)=>{(c?pass++:fail++); console.log((c?'PASS ':'FAIL ')+m);};
const sleep=ms=>new Promise(r=>setTimeout(r,ms)); const run='Y'+Date.now().toString(36);
const rc=t=>Number(execSync(`sqlite3 ${S}/remote/lab_ninja.sqlite3 "select count(*) from tasks where title like '${t}'"`).toString());
const cCount=async t=>{await sleep(1600); return (await (await fetch(C+'/todo/count?title='+encodeURIComponent(t))).json()).count;};
const aCount=async t=>{await sleep(1600); const x=await (await fetch(A+'/api/todo/tasks/tree',{headers:H})).text(); return x.split('"title":"'+t+'"').length-1;};
const pyState=()=>JSON.parse(fs.readFileSync(S+'/C/lab_ninja.sqlite3.sync-py.json','utf8'));
const post=(b,t)=>fetch(b+(b===C?'/todo/tasks':'/api/todo/tasks'),{method:'POST',headers:H,body:JSON.stringify({title:t})}).then(r=>r.status);

ok(await post(C,'C-'+run)===200,'Python server writes');
ok(rc('C-'+run)===1,'Python write reached the Neon stand-in');
ok(await aCount('C-'+run)===1,'Next.js server A sees the Python write');
await post(A,'A2-'+run); ok(await cCount('A2-'+run)===1,'Python server sees the Next.js write');

const st=await Promise.all([...Array(30)].map((_,i)=>post(i%2?C:A,run+'-p'+i)));
ok(st.every(s=>s===200),'30 parallel writes across Python and Next.js answered 200');
await sleep(17000); await cCount('x'); await aCount('x'); await sleep(2000);
ok(rc(run+'-p%')===30,'all 30 parallel writes in Neon ('+rc(run+'-p%')+'/30)');

fs.writeFileSync(S+'/remote/OFFLINE-C','');
ok(await post(C,'OFF-C-'+run)===200,'Python server saves while offline');
ok(pyState().outbox.length===1,'Python queued it (outbox=1)');
await post(A,'ON-A-'+run);
fs.rmSync(S+'/remote/OFFLINE-C');
await sleep(17000); await cCount('x');
ok(pyState().outbox.length===0,'Python sent its queue after reconnecting');
ok(rc('OFF-C-'+run)===1 && rc('ON-A-'+run)===1,'Neon: Python offline write once, A\'s write kept');
ok(await cCount('ON-A-'+run)===1 && await cCount('OFF-C-'+run)===1,'Python server has both exactly once');
ok(await aCount('OFF-C-'+run)===1,'A sees the Python offline write');
console.log(`\n${pass} passed, ${fail} failed`);

process.exit(typeof fail === 'number' && fail ? 1 : 0);

/**
 * Scenarios for neon_sync_e2e.sh (run that, not this file). Two Next.js servers: visibility both ways, 20 parallel writes, an edit, offline queue + replay, an external edit, an AI LMS subject.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'child_process';
import { createRequire } from 'node:module';
const require = createRequire(path.join(process.cwd(), 'frontend', 'package.json'));
const jwt = require('jsonwebtoken');
const S = `${process.env.WORK}`;
const T = jwt.sign({ sub: '8', email: 'x' }, process.env.SECRET, { expiresIn: '1h' });
const A='http://localhost:4031', B='http://localhost:4032';
const H={Authorization:'Bearer '+T,'Content-Type':'application/json'};
let pass=0, fail=0; const ok=(c,m)=>{ (c?pass++:fail++); console.log((c?'PASS ':'FAIL ')+m); };
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const run=Date.now().toString(36);
async function create(base,title){ const r=await fetch(base+'/api/todo/tasks',{method:'POST',headers:H,body:JSON.stringify({title})}); return [r.status, await r.json().catch(()=>null)]; }
async function count(base,title){ await sleep(1600); const t=await (await fetch(base+'/api/todo/tasks/tree',{headers:H})).text(); return t.split('"title":'+JSON.stringify(title)).length-1; }
const remoteCount=(title)=>Number(execSync(`sqlite3 ${S}/remote/lab_ninja.sqlite3 "select count(*) from tasks where title='${title}'"`).toString().trim());
const state=(t)=>JSON.parse(fs.readFileSync(`${S}/${t}/lab_ninja.sqlite3.sync.json`,'utf8'));

// 1-2. each side sees the other's write
let [s1,t1]=await create(A,'A-'+run); ok(s1===200||s1===201,'A creates a task ('+s1+')');
ok(await count(B,'A-'+run)===1,'B sees the task created on A');
let [s2]=await create(B,'B-'+run); ok(await count(A,'B-'+run)===1,'A sees the task created on B');
ok(remoteCount('A-'+run)===1&&remoteCount('B-'+run)===1,'Neon stand-in holds both');

// 3. simultaneous writes from both servers
const names=[...Array(20)].map((_,i)=>'P'+i+'-'+run);
const res=await Promise.all(names.map((n,i)=>create(i%2?B:A,n)));
ok(res.every(([s])=>s<300),'20 parallel writes answered OK');
let allA=0, allB=0; await sleep(1600);
const ta=await (await fetch(A+'/api/todo/tasks/tree',{headers:H})).text(); await sleep(1600);
const tb=await (await fetch(B+'/api/todo/tasks/tree',{headers:H})).text();
for(const n of names){ allA+=ta.split('"title":"'+n+'"').length-1; allB+=tb.split('"title":"'+n+'"').length-1; }
ok(allA===names.length&&allB===names.length,`parallel writes: A has ${allA}/${names.length}, B has ${allB}/${names.length}, none lost or doubled`);
ok(names.every(n=>remoteCount(n)===1),'Neon stand-in holds every parallel write exactly once');

// 4. edit on A shows on B
const id=t1?.id ?? t1?.task?.id;
const pr=await fetch(A+'/api/todo/tasks/'+id,{method:'PATCH',headers:H,body:JSON.stringify({title:'A-renamed-'+run})});
ok(pr.status<300 && await count(B,'A-renamed-'+run)===1,'rename on A visible on B ('+pr.status+')');

// 5. A offline: write queued, B writes meanwhile, A reconnects -> both everywhere, once
fs.writeFileSync(S+'/remote/OFFLINE-A','');
let [s3]=await create(A,'OFF-A-'+run); ok(s3<300,'A (offline) still saves the task ('+s3+')');
ok(state('A').outbox.length===1,'A queued the offline write (outbox=1)');
ok(await count(A,'OFF-A-'+run)===1,'A shows its offline task right away');
await create(B,'ON-B-'+run);
ok(await count(B,'OFF-A-'+run)===0,'B does not have it yet (A is offline)');
fs.rmSync(S+'/remote/OFFLINE-A');
await sleep(16000); // A's idle flush retries every 15 s
await count(A,'x');
ok(state('A').outbox.length===0,'A sent its queue after reconnecting (outbox=0)');
ok(remoteCount('OFF-A-'+run)===1 && remoteCount('ON-B-'+run)===1,'Neon stand-in: offline write once, B\'s write kept');
ok(await count(B,'OFF-A-'+run)===1,'B now sees the task A wrote offline');
ok(await count(A,'ON-B-'+run)===1 && await count(A,'OFF-A-'+run)===1,'A has B\'s task and its own exactly once');

// 6. file changed behind A's back (e.g. git checkout): backed up, Neon wins, nothing pushed over Neon
execSync(`sqlite3 ${S}/A/lab_ninja.sqlite3 "insert into tasks (user_id,title,status,priority,created_at,updated_at) values (8,'FOREIGN-${run}','todo','medium',datetime('now'),datetime('now'))"`);
ok(await count(A,'FOREIGN-'+run)===0,'A replaced the externally edited file with Neon\'s copy');
ok(remoteCount('FOREIGN-'+run)===0,'the external edit was not pushed over Neon');
ok(fs.readdirSync(S+'/A/backups').some(f=>f.includes('changed-outside-sync')),'A kept a backup of the edited file');

// 7. AI LMS: subject created on B opens on A (the "Subject not found" case)
const cls=await (await fetch(B+'/api/lms/classes',{method:'POST',headers:H,body:JSON.stringify({name:'Sync '+run})})).json();
const sub=await (await fetch(B+'/api/lms/classes/'+cls.slug+'/subjects',{method:'POST',headers:H,body:JSON.stringify({name:'Subj '+run})})).json();
await sleep(1600);
const g=await fetch(A+'/api/lms/classes/'+cls.slug+'/subjects/'+sub.slug,{headers:H});
ok(g.status===200,'subject created on B opens on A ('+g.status+')');
console.log(`\n${pass} passed, ${fail} failed`);

process.exit(typeof fail === 'number' && fail ? 1 : 0);

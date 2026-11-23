/**
 * Scenarios for neon_sync_e2e.sh (run that, not this file). 80 simultaneous writes on two Next.js servers: none lost or doubled.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'child_process';
import { createRequire } from 'node:module';
const require = createRequire(path.join(process.cwd(), 'frontend', 'package.json'));
const jwt = require('jsonwebtoken');
const S = `${process.env.WORK}`;
const T = jwt.sign({ sub: '8', email: 'x' }, process.env.SECRET, { expiresIn: '1h' });
const H={Authorization:'Bearer '+T,'Content-Type':'application/json'};
const run='S'+Date.now().toString(36), N=80;
const rc=()=>Number(execSync(`sqlite3 ${S}/remote/lab_ninja.sqlite3 "select count(*) from tasks where title like '${run}-%'"`).toString());
const res=await Promise.all([...Array(N)].map((_,i)=>fetch((i%2?'http://localhost:4032':'http://localhost:4031')+'/api/todo/tasks',{method:'POST',headers:H,body:JSON.stringify({title:run+'-'+i})}).then(r=>r.status)));
console.log('statuses', [...new Set(res)].join(','), ' in Neon right after:', rc(), '/', N);
await new Promise(r=>setTimeout(r,17000));
await fetch('http://localhost:4031/api/todo/tasks/tree',{headers:H}); await fetch('http://localhost:4032/api/todo/tasks/tree',{headers:H});
await new Promise(r=>setTimeout(r,3000));
const dup=execSync(`sqlite3 ${S}/remote/lab_ninja.sqlite3 "select count(*) from (select title from tasks where title like '${run}-%' group by title having count(*)>1)"`).toString().trim();
console.log('in Neon after flush:', rc(), '/', N, ' duplicated titles:', dup);

const okAll = rc() === N && dup === '0';
console.log(okAll ? 'PASS 80 simultaneous writes: none lost or doubled' : 'FAIL simultaneous writes lost or doubled');
process.exit(okAll ? 0 : 1);

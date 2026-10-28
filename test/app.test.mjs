import test from 'node:test';import assert from 'node:assert/strict';import {mkdtempSync,rmSync,readFileSync,readdirSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';import {createApp,DEFAULTS} from '../server.mjs';
const directory=mkdtempSync(join(tmpdir(),'squadriglie-test-'));const dbPath=join(directory,'db.sqlite');
let app,origin;
async function boot(options={}){app=createApp({dbPath,...options});await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));origin='http://127.0.0.1:'+app.server.address().port}
async function req(path,method='GET',body,session=''){return fetch(origin+path,{method,redirect:'manual',headers:{...(body?{'Content-Type':'application/json',Origin:origin}:{}),...(session?{Cookie:session}:{})},...(body?{body:JSON.stringify(body)}:{})})}
const getCookie=r=>r.headers.get('set-cookie')?.split(';')[0];
async function login(name,password,role='department'){return req('/api/login','POST',{name,password,role})}
await test('complete local workflow, isolated data, persistence and first-login password change',async()=>{
 try{
 await boot();
 let r=await req('/');assert.match(await r.text(),/Accesso amministratore →/);
 assert.equal((await req('/api/board')).status,401);
 r=await login(DEFAULTS.adminName,DEFAULTS.adminPassword,'admin');assert.equal(r.status,200);let admin=getCookie(r);assert.equal((await r.json()).mustChange,true);
 assert.equal((await req('/api/admin/departments','GET',null,admin)).status,403);
 r=await req('/admin','GET',null,admin);assert.equal(r.status,302);assert.equal(r.headers.get('location'),'/account/password');
 r=await req('/api/password','POST',{oldPassword:DEFAULTS.adminPassword,newPassword:'Custom-Admin-Password-123'},admin);assert.equal(r.status,200);const staleAdmin=admin;admin=getCookie(r);
 assert.equal((await req('/api/admin/departments','GET',null,staleAdmin)).status,401);
 r=await req('/api/admin/departments','GET',null,admin);const list=await r.json();assert.equal(list.departments[0].name,DEFAULTS.demoName);
 r=await login(DEFAULTS.demoName,'wrong');assert.equal(r.status,401);
 r=await login(DEFAULTS.demoName,DEFAULTS.demoPassword);assert.equal(r.status,200);let demo=getCookie(r);
 assert(r.headers.get('set-cookie').includes('HttpOnly'));assert(r.headers.get('set-cookie').includes('SameSite=Strict'));
 r=await req('/api/board','GET',null,demo);let board=await r.json();assert.equal(board.state.people.length,4);assert.equal(board.department.admin,false);
 const state=board.state;state.options[0].groups.push('Quinta','Sesta');state.options[0].assignments['demo-f1']=6;state.options[0].assignments['demo-m1']=5;
 r=await req('/api/board','PUT',{state,revision:board.revision},demo);assert.equal(r.status,200);
 assert.equal((await req('/api/board','PUT',{state,revision:board.revision},demo)).status,409);
 const mixed=structuredClone(state);mixed.options[0].assignments['demo-m1']=6;assert.equal((await req('/api/board','PUT',{state:mixed,revision:2},demo)).status,400);
 assert.equal((await req('/api/admin/departments','GET',null,demo)).status,403);
 r=await req('/api/admin/departments','POST',{name:'Secondo Reparto',password:'Another-Test-Password'},admin);assert.equal(r.status,201);const second=(await r.json()).id;
 r=await login('Secondo Reparto','Another-Test-Password');const secondSession=getCookie(r);
 r=await req('/api/board?reparto=demo','GET',null,secondSession);const isolated=await r.json();assert.equal(isolated.department.id,second);assert.equal(isolated.state.people.length,0);
 r=await req('/api/board?reparto='+second,'GET',null,admin);assert.equal((await r.json()).department.admin,true);
 r=await fetch(origin+'/api/logout',{method:'POST',headers:{Cookie:demo,Origin:'http://evil.invalid','Content-Type':'application/json'},body:'{}'});assert.equal(r.status,403);
 r=await req('/api/password','POST',{oldPassword:DEFAULTS.demoPassword,newPassword:'Changed-Demo-Password-123'},demo);assert.equal(r.status,200);const staleDemo=demo;demo=getCookie(r);
 assert.equal((await req('/api/board','GET',null,staleDemo)).status,401);
 r=await req('/api/admin/departments','DELETE',{id:second,confirmName:'wrong'},admin);assert.equal(r.status,400);
 r=await req('/api/admin/departments','DELETE',{id:second,confirmName:'Secondo Reparto'},admin);assert.equal(r.status,200);
 assert.equal((await req('/api/board','GET',null,secondSession)).status,401);
 await app.close();await boot();
 assert.equal((await login('admin',DEFAULTS.adminPassword,'admin')).status,401);
 r=await login('admin','Custom-Admin-Password-123','admin');admin=getCookie(r);assert.equal((await r.json()).mustChange,false);
 r=await login(DEFAULTS.demoName,'Changed-Demo-Password-123');demo=getCookie(r);
 r=await req('/api/board','GET',null,demo);board=await r.json();assert.equal(board.revision,2);assert.equal(board.state.options[0].groups.length,7);
 r=await req('/api/admin/departments','DELETE',{id:'demo',confirmName:DEFAULTS.demoName},admin);assert.equal(r.status,200);
 await app.close();await boot();assert.equal((await login(DEFAULTS.demoName,DEFAULTS.demoPassword)).status,401);
 for(let i=0;i<9;i++)r=await login('Unknown','bad');assert.equal(r.status,429);
 }finally{if(app?.server.listening)await app.close();rmSync(directory,{recursive:true,force:true})}
});
await test('demo disabled on fresh install; HTTPS cookies enabled',async()=>{const local=createApp({dbPath:':memory:',demoEnabled:false,secureCookies:true});try{assert.equal(local.db.prepare("SELECT count(*) AS n FROM users WHERE role='department'").get().n,0);await new Promise(resolve=>local.server.listen(0,'127.0.0.1',resolve));const url='http://127.0.0.1:'+local.server.address().port;const r=await fetch(url+'/api/login',{method:'POST',headers:{Origin:url,'Content-Type':'application/json'},body:JSON.stringify({role:'admin',name:'admin',password:DEFAULTS.adminPassword})});assert(r.headers.get('set-cookie').includes('__Host-squadriglie_session='));assert(r.headers.get('set-cookie').includes('Secure'))}finally{await local.close()}});
await test('distribution has no platform-specific authentication or personal seed data',()=>{for(const file of readdirSync('public')){const content=readFileSync(join('public',file),'utf8');assert(!/chatgpt|Monte Cornacchia|oai-authenticated/i.test(content),file)}});

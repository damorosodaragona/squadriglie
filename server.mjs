import http from 'node:http';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,mkdirSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomUUID} from 'node:crypto';
import {hashPassword,verifyPassword,token,digest} from './password.mjs';
import {validBoard} from './validation.mjs';
const root=dirname(fileURLToPath(import.meta.url));
export const DEFAULTS={adminName:'admin',adminPassword:'ChangeMe-Admin26!',demoName:'Reparto Demo',demoPassword:'Demo-Reparto26!'};
const normalize=s=>s.normalize('NFKC').trim().replace(/\s+/g,' ').toLocaleLowerCase('it');
export const emptyBoard=()=>({version:2,people:[],options:[{id:'initial',name:'Opzione 1',groups:['Da assegnare','Squadriglia 1','Squadriglia 2','Squadriglia 3','Squadriglia 4'],assignments:{},order:[]}],activeId:'initial'});
function demoBoard(){const b=emptyBoard();b.people=[['demo-f1','Esploratrice Demo 1','F'],['demo-f2','Esploratrice Demo 2','F'],['demo-m1','Esploratore Demo 1','M'],['demo-m2','Esploratore Demo 2','M']].map(([id,name,sex])=>({id,name,sex,age:'14',strength:'Dato dimostrativo: collaborazione',weakness:'Dato dimostrativo: parlare in pubblico'}));b.options[0].assignments=Object.fromEntries(b.people.map(p=>[p.id,0]));b.options[0].order=b.people.map(p=>p.id);return b}
export function createApp(options={}){
 const dataPath=options.dbPath||resolve(process.env.DATA_DIR||resolve(root,'data'),'squadriglie.sqlite');
 if(dataPath!==':memory:')mkdirSync(dirname(dataPath),{recursive:true,mode:0o700});
 const db=new DatabaseSync(dataPath,{timeout:5000});
 db.exec(`PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL;
 CREATE TABLE IF NOT EXISTS config(key TEXT PRIMARY KEY,value TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY,name TEXT NOT NULL,login TEXT NOT NULL,role TEXT NOT NULL CHECK(role IN ('admin','department')),password_hash TEXT NOT NULL,must_change INTEGER NOT NULL DEFAULT 0,created_at INTEGER NOT NULL,UNIQUE(role,login));
 CREATE TABLE IF NOT EXISTS boards(id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,payload TEXT NOT NULL,revision INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS sessions(token_hash TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,expires_at INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS login_limits(key TEXT PRIMARY KEY,window INTEGER NOT NULL,attempts INTEGER NOT NULL);`);
 const tx=fn=>{db.exec('BEGIN IMMEDIATE');try{const result=fn();db.exec('COMMIT');return result}catch(e){db.exec('ROLLBACK');throw e}};
 const demoEnabled=options.demoEnabled??process.env.DEMO_ENABLED!=='false';
 if(!db.prepare('SELECT value FROM config WHERE key=?').get('initialized'))tx(()=>{
  const name=process.env.ADMIN_USERNAME||DEFAULTS.adminName,password=process.env.ADMIN_PASSWORD||DEFAULTS.adminPassword;
  if(password.length<12||password.length>256)throw Error('ADMIN_PASSWORD deve contenere da 12 a 256 caratteri');
  db.prepare('INSERT INTO users(id,name,login,role,password_hash,must_change,created_at) VALUES(?,?,?,?,?,1,?)').run('admin',name,normalize(name),'admin',hashPassword(password),Date.now());
  if(demoEnabled){db.prepare('INSERT INTO users(id,name,login,role,password_hash,created_at) VALUES(?,?,?,?,?,?)').run('demo',DEFAULTS.demoName,normalize(DEFAULTS.demoName),'department',hashPassword(DEFAULTS.demoPassword),Date.now());db.prepare('INSERT INTO boards VALUES(?,?,1)').run('demo',JSON.stringify(demoBoard()))}
  db.prepare('INSERT INTO config VALUES(?,?)').run('initialized','1');
 });
 const secureCookies=options.secureCookies??process.env.COOKIE_SECURE==='true';
 const cookieName=secureCookies?'__Host-squadriglie_session':'squadriglie_session';
 const cookie=(value,age=43200)=>`${cookieName}=${value}; Path=/; Max-Age=${age}; HttpOnly; SameSite=Strict${secureCookies?'; Secure':''}`;
 const getToken=req=>{const t=req.headers.cookie?.split(';').map(x=>x.trim()).find(x=>x.startsWith(cookieName+'='))?.slice(cookieName.length+1);return /^[a-f0-9]{64}$/.test(t||'')?t:null};
 const userFor=req=>{const t=getToken(req);return t?db.prepare('SELECT u.* FROM users u JOIN sessions s ON s.user_id=u.id WHERE s.token_hash=? AND s.expires_at>?').get(digest(t),Date.now()):null};
 const htmlFiles=new Map(['board','login','admin-login','admin','password'].map(n=>[n,readFileSync(resolve(root,'public',n+'.html'),'utf8')]));
 const boardScript=readFileSync(resolve(root,'public/client.js'),'utf8');
 async function handler(req,res){
  const send=(status,body,type='application/json',extra={})=>{res.writeHead(status,{'Content-Type':type+'; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'same-origin','X-Frame-Options':'DENY','Content-Security-Policy':"default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",...extra});res.end(type==='application/json'?JSON.stringify(body):body)};
  const redirect=path=>send(302,'','text/plain',{Location:path});
  const html=name=>send(200,htmlFiles.get(name),'text/html');
  try{
   const url=new URL(req.url,'http://localhost');const route=url.pathname,method=req.method;
   const user=userFor(req);
   if(method==='GET'){
    if(route==='/health')return send(200,{ok:true});
    if(route==='/board.js')return send(200,boardScript,'text/javascript');
    if(route==='/admin-login')return user?.role==='admin'?redirect(user.must_change?'/account/password':'/admin'):html('admin-login');
    if(route==='/account/password')return user?html('password'):redirect('/');
    if(route==='/admin'){if(!user)return redirect('/admin-login');if(user.role!=='admin')return send(403,{error:'Accesso amministratore richiesto'});return user.must_change?redirect('/account/password'):html('admin')}
    if(route==='/'){if(!user)return html('login');if(user.must_change)return redirect('/account/password');return user.role==='admin'&&!url.searchParams.has('reparto')?redirect('/admin'):html('board')}
   }
   // Mutations require a same-origin JSON request; forwarded headers are never trusted.
   if(['POST','PUT','DELETE'].includes(method)){
    const origin=req.headers.origin;let sameOrigin=false;try{const parsed=new URL(origin);sameOrigin=['http:','https:'].includes(parsed.protocol)&&parsed.host===req.headers.host&&(!process.env.PUBLIC_ORIGIN||origin===process.env.PUBLIC_ORIGIN)}catch{}
    if(!sameOrigin||req.headers['content-type']?.split(';')[0]!=='application/json')return send(403,{error:'Origine non valida'});
   }
   const readBody=async(max=4096)=>{let size=0,chunks=[];for await(const c of req){size+=c.length;if(size>max){const e=Error('Richiesta troppo grande');e.status=413;throw e}chunks.push(c)}try{return JSON.parse(Buffer.concat(chunks).toString('utf8'))}catch{const e=Error('JSON non valido');e.status=400;throw e}};
   const limited=(category,max=8)=>{const window=Math.floor(Date.now()/900000),key=digest(category);const row=db.prepare('INSERT INTO login_limits VALUES(?,?,1) ON CONFLICT(key) DO UPDATE SET attempts=CASE WHEN window=excluded.window THEN attempts+1 ELSE 1 END,window=excluded.window RETURNING attempts').get(key,window);return row.attempts>max};
   const newSession=(uid)=>{const t=token();db.prepare('INSERT INTO sessions VALUES(?,?,?)').run(digest(t),uid,Date.now()+43200000);return t};
   if(route==='/api/login'&&method==='POST'){
    const b=await readBody();const role=b.role==='admin'?'admin':'department';
    if(typeof b.name!=='string'||!b.name.trim()||b.name.length>100||typeof b.password!=='string'||b.password.length>256)return send(400,{error:'Credenziali non valide'});
    const ip=req.socket.remoteAddress||'unknown';
    if(limited('ip:'+ip,40)||limited(`login:${ip}:${role}:${normalize(b.name)}`))return send(429,{error:'Troppi tentativi. Riprova tra 15 minuti.'},'application/json',{'Retry-After':'900'});
    const u=db.prepare('SELECT * FROM users WHERE role=? AND login=?').get(role,normalize(b.name));
    // Same password derivation cost for unknown usernames.
    const fake=db.prepare('SELECT password_hash FROM users WHERE role=? LIMIT 1').get('admin').password_hash;
    const correct=verifyPassword(b.password,u?.password_hash||fake);if(!u||!correct)return send(401,{error:'Nome utente o password non corretti'});
    const t=tx(()=>{const old=getToken(req);if(old)db.prepare('DELETE FROM sessions WHERE token_hash=?').run(digest(old));return newSession(u.id)});
    db.prepare('DELETE FROM sessions WHERE expires_at<?').run(Date.now());db.prepare('DELETE FROM login_limits WHERE window<?').run(Math.floor(Date.now()/900000)-1);
    return send(200,{ok:true,mustChange:!!u.must_change},'application/json',{'Set-Cookie':cookie(t)});
   }
   if(route==='/api/logout'&&method==='POST'){const t=getToken(req);if(t)db.prepare('DELETE FROM sessions WHERE token_hash=?').run(digest(t));return send(200,{ok:true},'application/json',{'Set-Cookie':cookie('',0)})}
   if(!user)return send(401,{error:'Accesso richiesto'});
   if(route==='/api/password'&&method==='POST'){
    if(limited('password:'+user.id))return send(429,{error:'Troppi tentativi. Riprova tra 15 minuti.'});
    const b=await readBody();if(typeof b.oldPassword!=='string'||b.oldPassword.length>256||typeof b.newPassword!=='string'||b.newPassword.length<12||b.newPassword.length>256)return send(400,{error:'La nuova password deve avere da 12 a 256 caratteri'});
    if(!verifyPassword(b.oldPassword,user.password_hash))return send(400,{error:'Password attuale non corretta'});
    if(b.oldPassword===b.newPassword||(user.role==='admin'&&b.newPassword===DEFAULTS.adminPassword))return send(400,{error:'Scegli una password diversa da quella iniziale o attuale'});
    const hash=hashPassword(b.newPassword);const t=tx(()=>{db.prepare('UPDATE users SET password_hash=?,must_change=0 WHERE id=?').run(hash,user.id);db.prepare('DELETE FROM sessions WHERE user_id=?').run(user.id);return newSession(user.id)});
    return send(200,{ok:true},'application/json',{'Set-Cookie':cookie(t)});
   }
   if(user.must_change)return send(403,{error:'Cambia prima la password iniziale',passwordChangeRequired:true});
   if(route==='/api/admin/departments'){
    if(user.role!=='admin')return send(403,{error:'Accesso amministratore richiesto'});
    if(method==='GET')return send(200,{departments:db.prepare("SELECT u.id,u.name,u.created_at,b.payload FROM users u LEFT JOIN boards b ON b.id=u.id WHERE u.role='department' ORDER BY u.created_at").all().map(({payload,...u})=>{const b=JSON.parse(payload);return {...u,people:b.people.length,options:b.options.length}})});
    if(method==='POST'){
     const b=await readBody(),name=typeof b.name==='string'?b.name.trim().replace(/\s+/g,' '):'';
     if(!name||name.length>100||typeof b.password!=='string'||b.password.length<10||b.password.length>256)return send(400,{error:'Indica nome reparto e password di almeno 10 caratteri'});
     const id=randomUUID(),hash=hashPassword(b.password);try{tx(()=>{db.prepare('INSERT INTO users(id,name,login,role,password_hash,created_at) VALUES(?,?,?,?,?,?)').run(id,name,normalize(name),'department',hash,Date.now());db.prepare('INSERT INTO boards VALUES(?,?,1)').run(id,JSON.stringify(emptyBoard()))})}catch(e){if(String(e).includes('UNIQUE'))return send(409,{error:'Nome reparto già utilizzato'});throw e}
     return send(201,{ok:true,id});
    }
    if(method==='DELETE'){
     const b=await readBody();if(typeof b.id!=='string'||typeof b.confirmName!=='string')return send(400,{error:'Conferma richiesta'});
     const d=db.prepare("SELECT name FROM users WHERE id=? AND role='department'").get(b.id);if(!d)return send(404,{error:'Reparto non trovato'});if(d.name!==b.confirmName)return send(400,{error:'Il nome di conferma non corrisponde'});
     db.prepare("DELETE FROM users WHERE id=? AND role='department'").run(b.id);return send(200,{ok:true});
    }
   }
   if(route==='/api/board'){
    const id=user.role==='admin'?url.searchParams.get('reparto'):user.id;
    const board=id?db.prepare("SELECT b.*,u.name FROM boards b JOIN users u ON u.id=b.id WHERE b.id=? AND u.role='department'").get(id):null;
    if(!board)return send(404,{error:'Bacheca non trovata'});
    if(method==='GET')return send(200,{state:JSON.parse(board.payload),revision:board.revision,department:{id,name:board.name,admin:user.role==='admin'}});
    if(method==='PUT'){
     const b=await readBody(2000000);let valid=false;try{valid=validBoard(b.state)&&Number.isInteger(b.revision)}catch{}
     if(!valid)return send(400,{error:'Dati non validi o squadriglie miste'});
     const result=db.prepare('UPDATE boards SET payload=?,revision=revision+1 WHERE id=? AND revision=?').run(JSON.stringify(b.state),id,b.revision);
     return result.changes?send(200,{revision:b.revision+1}):send(409,{error:'Dati modificati in un’altra finestra'});
    }
   }
   return send(404,{error:'Risorsa non trovata'});
  }catch(e){if(!res.headersSent)send(e.status||500,{error:e.status?e.message:'Errore interno del server'});else res.end();if(!e.status)console.error('Request failed:',e.name)}
 }
 const server=http.createServer(handler);server.requestTimeout=30000;server.headersTimeout=15000;
 return {server,db,close:()=>new Promise((yes,no)=>{server.close(e=>{db.close();e?no(e):yes()});server.closeIdleConnections()})};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const app=createApp();const port=Number(process.env.PORT||3000),host=process.env.HOST||'127.0.0.1';app.server.listen(port,host,()=>console.log(`Squadriglie: http://${host}:${port}`));
 for(const signal of ['SIGINT','SIGTERM'])process.once(signal,async()=>{await app.close();process.exit(0)});
}

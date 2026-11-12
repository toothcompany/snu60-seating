import assert from 'node:assert/strict';

// Served via Playwright's route.fulfill; the browser never contacts Firebase.
// One storage write commits both the plan and its history atomically. A second
// tab gets a real `storage` event; a reload still sees the last committed plan.
const key = 'qa-only-firebase-shared-plan-v1';
const mockApp = `let app;export const getApps=()=>app?[app]:[];
  export const initializeApp=()=>app={};export const getApp=()=>app;`;
// Per-tab OAuth identities, verified claims, and local member-role fixtures keep
// popup/signout/account-switch timing testable without Google or production data.
const mockAuth = `
  const auth={currentUser:JSON.parse(sessionStorage.getItem('qa:signed-in')||'null')},observers=new Set();
  const claims=u=>({claims:{email:u.email,email_verified:true,firebase:{sign_in_provider:'google.com'}}});
  export const getIdTokenResult=async u=>claims(u);
  function user(){if(auth.currentUser)auth.currentUser.getIdTokenResult=async()=>claims(auth.currentUser);return auth.currentUser;}
  function changed(){const u=user();for(const fn of observers)fn(u);}
  export const getAuth=()=>{user();return auth;};
  export function onAuthStateChanged(_,fn){observers.add(fn);queueMicrotask(()=>{if(observers.has(fn))fn(user());});return ()=>observers.delete(fn);}
  export const onIdTokenChanged=onAuthStateChanged;
  export class GoogleAuthProvider{setCustomParameters(){}}
  export async function signInWithPopup(){const slug=sessionStorage.getItem('qa:select')??'unknown';
    auth.currentUser={uid:'uid-'+slug,email:slug+'@example.test',emailVerified:true,isAnonymous:false,providerData:[{providerId:'google.com'}]};
    sessionStorage.setItem('qa:signed-in',JSON.stringify(auth.currentUser));changed();return {user:user()};}
  export const signInWithRedirect=signInWithPopup;
  export const getRedirectResult=async()=>null;
  export async function signOut(){sessionStorage.removeItem('qa:signed-in');auth.currentUser=null;changed();}
`;
const mockStore = `
  const key=${JSON.stringify(key)},db={path:''},listeners=new Set();
  const read=()=>({'members/admin@example.test':{role:'admin'},'members/editor@example.test':{role:'editor'},'members/viewer@example.test':{role:'viewer'},...JSON.parse(localStorage.getItem(key)||'{}')});
  function refRead(r){if(r.path.includes('/history')&&!['editor','admin'].includes(read()['members/'+JSON.parse(sessionStorage.getItem('qa:signed-in')||'{}')?.email]?.role))throw Error('Non-editor requested private history');}
  function ref(parent,segments){const path=[parent.path,...segments].filter(Boolean).join('/');return {path,id:path.split('/').pop()};}
  export const getFirestore=()=>db;
  export const collection=(parent,...segments)=>ref(parent,segments);
  export const doc=(parent,...segments)=>ref(parent,segments.length?segments:[crypto.randomUUID().replaceAll('-','').slice(0,20)]);
  export const serverTimestamp=()=>({milliseconds:Date.now()});
  function snap(r,all){refRead(r);if(r.path.startsWith('members/'))window.__qaRoleRead=r.id;const v=all[r.path];return {ref:r,id:r.id,exists:()=>v!==undefined,data:()=>structuredClone(v),metadata:{fromCache:false,hasPendingWrites:false}};}
  function deliver(pair){const [r,fn]=pair,all=read(),sig=JSON.stringify(all[r.path]??null);if(pair[2]!==sig){pair[2]=sig;fn(snap(r,all));}}
  function notify(){for(const pair of [...listeners])deliver(pair);}
  window.addEventListener('storage',event=>{if(event.key===key)notify();});
  export const getDoc=async r=>snap(r,read());
  export const getDocFromServer=getDoc;
  export function onSnapshot(r,options,fn){if(typeof options==='function')fn=options;const pair=[r,fn];listeners.add(pair);queueMicrotask(()=>{if(listeners.has(pair))deliver(pair);});return ()=>listeners.delete(pair);}
  export async function runTransaction(_,fn){
    const commit=async()=>{const base=read(),next=structuredClone(base);
      const u=JSON.parse(sessionStorage.getItem('qa:signed-in')||'null');
      if(!u||!['admin','editor'].includes(base['members/'+u.email]?.role))throw Error('Non-editor attempted a write');
      const result=await fn({get:async r=>snap(r,base),set:(r,d)=>{if(r.path.startsWith('sharedPlans/')&&(r.path.includes('/history/')?d.by:d.updatedBy)!==u.uid)throw Error('Unexpected actor for shared write');next[r.path]=structuredClone(d);}});
      localStorage.setItem(key,JSON.stringify(next));queueMicrotask(notify);return result;};
    return navigator.locks?.request?navigator.locks.request('qa-only-firestore',commit):commit();
  }`;

export async function checkSharedEditor(browser,origin='http://127.0.0.1:4173') {
  const ctx=await browser.newContext({viewport:{width:1440,height:1000},serviceWorkers:'block'});
  ctx.setDefaultTimeout(8000);
  const errors=[],unexpected=[],loaded=new Set();
  // Keep this test useful after the real event's short editing window expires.
  await ctx.addInitScript(()=>{const now=Date.now.bind(Date),start=now(),fixed=Date.parse('2026-11-11T12:00:00+09:00');Date.now=()=>fixed+now()-start;});
  await ctx.route('**/*',async route=>{
    const u=new URL(route.request().url());
    if(u.origin===origin)return route.continue();
    const file=u.pathname.split('/').pop(),src={'firebase-app.js':mockApp,'firebase-auth.js':mockAuth,'firebase-firestore.js':mockStore}[file];
    if(u.origin==='https://www.gstatic.com'&&u.pathname.startsWith('/firebasejs/')&&src){
      loaded.add(file);return route.fulfill({contentType:'text/javascript',headers:{'Access-Control-Allow-Origin':'*'},body:src});
    }
    unexpected.push(u.origin+u.pathname);return route.abort('blockedbyclient');
  });
  const open=async (pg,path)=>{pg.on('pageerror',e=>errors.push(e.message));await pg.goto(origin+path,{waitUntil:'networkidle'});await pg.waitForSelector('#tables .tableDisc');};
  const selectUser=async(pg,name)=>{await pg.evaluate(n=>sessionStorage.setItem('qa:select',n),name);await pg.locator('#login').click();};
  const readOnly=async (pg,seatCount=99)=>{
    for(const id of ['add','import','publish','history','undo']) {
      const button=pg.locator('#'+id);
      assert.ok(await button.isDisabled()||await button.isHidden(),id+' must be disabled or hidden');
    }
    assert.equal(await pg.locator('#tables .seat').count(),seatCount);
  };
  const unlocked=pg=>pg.waitForFunction(()=>document.querySelector('#add')?.disabled===false);
  const read=pg=>pg.evaluate(k=>JSON.parse(localStorage.getItem(k)||'{}')['sharedPlans/snu60'],key);
  const committed=(pg,rev)=>pg.waitForFunction(({k,n})=>JSON.parse(localStorage.getItem(k)||'{}')['sharedPlans/snu60']?.rev===n&&document.querySelector('#add')?.disabled===false,{k:key,n:rev});
  const undoEnabled=(pg,enabled)=>pg.waitForFunction(v=>document.querySelector('#undo').disabled===!v,enabled);
  const layout=pg=>pg.locator('#tables .tableGroup').evaluateAll(nodes=>nodes.map(g=>({
    id:g.dataset.tid,number:parseInt(g.querySelector('.tableDisc strong').textContent,10),x:parseInt(g.style.left,10),y:parseInt(g.style.top,10),
    members:[...g.querySelectorAll('.seat')].map(s=>s.dataset.aid)
  })).sort((a,b)=>a.y-b.y||a.x-b.x));
  const seat=(pg,t,name)=>pg.locator(`#tables .tableGroup[data-tid="${t}"] .seat`).filter({hasText:name});
  async function add(pg,name,tid){
    await pg.locator('#add').click();const dialog=pg.locator('#editor');
    await dialog.getByLabel('성명',{exact:true}).fill(name);await dialog.getByLabel('배정 테이블',{exact:true}).selectOption(tid);
    await dialog.locator('#save').click();await dialog.waitFor({state:'hidden'});await seat(pg,tid,name).waitFor();
  }
  async function move(pg,name,tid){
    await pg.locator('#people .personRow').filter({hasText:name}).click();const dialog=pg.locator('#editor');
    await dialog.getByLabel('배정 테이블',{exact:true}).selectOption(tid);await dialog.locator('#save').click();
    await dialog.waitFor({state:'hidden'});await seat(pg,tid,name).waitFor();
  }
  try {
    const a=await ctx.newPage();await open(a,'/index.html');await undoEnabled(a,false);
    assert.deepEqual([...loaded].sort(),['firebase-app.js','firebase-auth.js','firebase-firestore.js']);
    await readOnly(a);assert.equal(await read(a),undefined);
    // Use the real sign-in/out handlers; unlisted and viewer Google users get
    // the live seating plan without becoming editors or seeing private history.
    for(const name of ['unknown','viewer']){
      await selectUser(a,name);
      await a.waitForFunction(mail=>!document.querySelector('#logout').hidden&&window.__qaRoleRead===mail,name+'@example.test');
      await readOnly(a);
      assert.equal(await read(a),undefined);
      await a.locator('#logout').click();await a.waitForFunction(()=>!document.querySelector('#login').hidden);
    }
    await selectUser(a,'admin');await unlocked(a);
    console.log('PASS: signed-out, unlisted Google and viewer accounts can see 99 seats but cannot edit or open private history; approved admin can edit.');
    const before=await layout(a),[first,second]=before;
    assert.deepEqual(before.map(s=>s.number),Array.from({length:12},(_,i)=>i+1));
    assert.equal(new Set(before.map(s=>s.y)).size,4);assert.equal(new Set(before.map(s=>s.x)).size,3);
    assert.ok(first.members.length&&second.members.length);
    const boxes=await Promise.all([first,second].map(t=>a.locator(`[data-table-handle="${t.id}"]`).boundingBox()));
    assert.ok(boxes.every(Boolean));const [from,to]=boxes.map(b=>[b.x+b.width/2,b.y+b.height/2]);
    await a.mouse.move(...from);await a.mouse.down();await a.mouse.move(...to,{steps:12});await a.mouse.up();await committed(a,1);
    const swapped=await layout(a);assert.deepEqual(swapped.map(x=>x.number),before.map(x=>x.number));
    assert.deepEqual(swapped.slice(0,2).map(x=>[x.id,x.members]),[[second.id,second.members],[first.id,first.members]]);
    console.log('PASS: real center-to-center table drag swapped both groups; 12 room numbers stayed in row order.');

    const label='QA Smoke Participant',roster=await a.locator('#people .personRow').count();
    await add(a,label,first.id);await committed(a,2);
    const saved=await layout(a);await a.reload({waitUntil:'networkidle'});await committed(a,2);await undoEnabled(a,true);
    assert.deepEqual(await layout(a),saved);
    await a.locator('#undo').click();await committed(a,3);await undoEnabled(a,true);
    assert.deepEqual(await layout(a),swapped);assert.equal(await a.locator('#people .personRow').count(),roster);
    await a.locator('#undo').click();await committed(a,4);await undoEnabled(a,false);
    assert.deepEqual(await layout(a),before);
    console.log('PASS: reload retained the saved layout and undo trail; two button presses reversed the add, then the group drag.');

    await add(a,label,first.id);await committed(a,5);await a.locator('h1').click();await a.keyboard.press('Meta+z');
    await committed(a,6);await undoEnabled(a,false);assert.deepEqual(await layout(a),before);
    console.log('PASS: Command-Z reverted a saved change.');

    await add(a,label,first.id);await committed(a,7);await undoEnabled(a,true);const actorA=(await read(a)).updatedBy;
    // This tab signs in separately; its approved Google account has an editor
    // role instead of admin, sharing the same test-only live seating document.
    const v=await ctx.newPage();await open(v,'/index.html?qa=public-viewer');
    await seat(v,first.id,label).waitFor();await readOnly(v,100);
    const b=await ctx.newPage();await open(b,'/index.html?qa=editor-b');await undoEnabled(b,false);
    await selectUser(b,'editor');await unlocked(b);await undoEnabled(b,false);await move(b,label,second.id);await committed(b,8);
    assert.notEqual((await read(b)).updatedBy,actorA);await seat(a,second.id,label).waitFor();await undoEnabled(a,false);
    await seat(v,second.id,label).waitFor();await readOnly(v,100);
    await a.locator('h1').click();await a.keyboard.press('Meta+z');assert.equal((await read(a)).rev,8);
    console.log('PASS: authorized Google editor changed a seat; an unsigned live viewer saw the change without edit access; stale undo left the edit intact.');

    await b.goBack({waitUntil:'commit'});await b.locator('#backDialog').waitFor();assert.equal((await read(b)).rev,8);
    await b.locator('#backStay').click();await b.locator('#backDialog').waitFor({state:'hidden'});assert.equal((await read(b)).rev,8);
    await b.goBack({waitUntil:'commit'});await b.locator('#backDialog').waitFor();await b.locator('#backUndo').click();
    await committed(b,9);await seat(b,first.id,label).waitFor();await seat(a,first.id,label).waitFor();
    console.log('PASS: browser Back asked first; Stay preserved the layout and explicit Undo restored it on both clients.');
    await a.locator('#logout').click();await a.waitForFunction(()=>document.querySelector('#add').disabled);
    await a.waitForFunction(()=>document.querySelector('#logout').hidden);
    await undoEnabled(a,false);
    assert.ok(await a.locator('#history').isDisabled()||await a.locator('#history').isHidden());
    await seat(a,first.id,label).waitFor();
    assert.equal((await read(a)).rev,9);
    console.log('PASS: sign-out removed editing/history access while the latest shared plan stayed readable.');
    assert.deepEqual(errors,[]);assert.deepEqual(unexpected,[]);
  } finally {await ctx.close();}
}

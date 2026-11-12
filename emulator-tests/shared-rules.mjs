import {readFileSync} from 'node:fs';
import {before,after,beforeEach,test} from 'node:test';
import assert from 'node:assert/strict';
import {initializeTestEnvironment,assertSucceeds,assertFails} from '@firebase/rules-unit-testing';
import {doc,setDoc,getDocFromServer,getDocsFromServer,deleteDoc,collection,query,limit,orderBy,writeBatch,serverTimestamp} from 'firebase/firestore';

const source=readFileSync('firestore.rules','utf8');
const deadline="timestamp.date(2026, 11, 16) - duration.value(9, 'h')";
assert.ok(source.includes(deadline),'Production cutoff must remain midnight Nov 16, 2026 in Korea.');
const plan='sharedPlans/snu60', marker='policyChecks/snu60GoogleEditorsV1';
const oldActor='guest-00000000-0000-4000-8000-000000000001';
const uid=role=>'test-'+role;
const email=role=>role+'@example.invalid';
const seed=()=>({version:1,rev:0,tables:[{id:'t1',number:1,capacity:8,x:240,y:300}],attendees:[{id:'p1',name:'가상 참석자',affiliation:'테스트',tableId:'t1',order:0}]});
const emulatorConfig=(projectId,cutoff)=>({projectId,firestore:{rules:source.replace(deadline,cutoff),host:'127.0.0.1',port:8080}});
const staff=(env,role,options={})=>env.authenticatedContext(uid(role),{
  email:email(role),email_verified:options.verified ?? true,
  firebase:{sign_in_provider:options.provider ?? 'google.com',identities:{}}
}).firestore();
const visitor=env=>env.unauthenticatedContext().firestore();
const historyList=db=>getDocsFromServer(query(collection(db,plan+'/history'),orderBy('rev','desc'),limit(30)));
const read=(db,path)=>getDocFromServer(doc(db,path));
let env,closed;
before(async()=>{
  env=await initializeTestEnvironment(emulatorConfig('demo-snu60-roles','timestamp.date(2100, 1, 1)'));
  closed=await initializeTestEnvironment(emulatorConfig('demo-snu60-expired','timestamp.date(2000, 1, 1)'));
});
after(async()=>{await Promise.all([env?.cleanup(),closed?.cleanup()]);});
beforeEach(async()=>{
  for(const suite of [env,closed]){
    await suite.clearFirestore();
    await suite.withSecurityRulesDisabled(async ctx=>{
      const db=ctx.firestore(),batch=writeBatch(db);
      for(const role of ['viewer','editor','admin']) batch.set(doc(db,'members',email(role)),{role});
      await batch.commit();
    });
  }
});

function change(db,actor,before,opts={}){
  const history=doc(collection(db,plan+'/history')),batch=writeBatch(db);
  const next={...(opts.value ?? before),rev:before.rev+1};
  batch.set(doc(db,plan),{...next,updatedAt:serverTimestamp(),updatedBy:actor,lastAction:'테스트 변경',changeId:history.id});
  if(!opts.omitHistory)batch.set(history,{before:opts.before ?? before,rev:next.rev,action:'테스트 변경',by:opts.historyBy ?? actor,at:serverTimestamp()});
  return {commit:()=>batch.commit(),next,hpath:history.path};
}
// The authenticated reader/editor must work with the existing, unmodified
// public plan and its previously anonymous history, including restoration.
async function existingGuestPlan(suite){
  let result;
  await suite.withSecurityRulesDisabled(async ctx=>{
    const base=seed(),value={...base,attendees:[{...base.attendees[0],tableId:null}]};
    result=change(ctx.firestore(),oldActor,base,{value});
    await result.commit();
  });
  return result;
}
test('public sees only the current seating; approved editor can restore a pre-rollout entry',async()=>{
  const old=await existingGuestPlan(env),pub=visitor(env),ed=staff(env,'editor');
  assert.equal((await assertSucceeds(read(pub,plan))).data().attendees[0].tableId,null);
  await assertFails(read(pub,old.hpath)); await assertFails(historyList(pub));
  const h=(await assertSucceeds(read(ed,old.hpath))).data();
  assert.equal(h.by,oldActor);
  await assertSucceeds(change(ed,uid('editor'),old.next,{value:h.before}).commit());
  const restored=(await assertSucceeds(read(pub,plan))).data();
  assert.equal(restored.rev,2); assert.equal(restored.attendees[0].tableId,'t1');
  assert.equal(restored.updatedBy,uid('editor'));
  assert.equal((await assertSucceeds(read(ed,old.hpath))).data().by,oldActor);
});
test('only verified Google editors/admins can create and update the plan with their own uid',async()=>{
  const ed=staff(env,'editor'),ad=staff(env,'admin'),first=change(ed,uid('editor'),seed());
  await assertSucceeds(first.commit());
  await assertFails(change(ad,uid('editor'),first.next).commit());
  await assertFails(change(ed,uid('editor'),first.next,{historyBy:uid('admin')}).commit());
  await assertFails(change(ad,uid('admin'),seed()).commit());
  await assertSucceeds(change(ad,uid('admin'),first.next).commit());
  assert.equal((await assertSucceeds(read(visitor(env),plan))).data().rev,2);
  for(const db of [ed,ad]){
    await assertSucceeds(historyList(db)); await assertSucceeds(read(db,first.hpath));
    await assertFails(getDocsFromServer(collection(db,plan+'/history')));
    await assertFails(deleteDoc(doc(db,plan))); await assertFails(deleteDoc(doc(db,first.hpath)));
    await assertFails(setDoc(doc(db,first.hpath),{action:'rewrite'},{merge:true}));
  }
});
test('public, viewer, unlisted, unverified and non-Google sessions cannot edit or access historical data',async()=>{
  const blocked=[
    [visitor(env),oldActor], [staff(env,'viewer'),uid('viewer')],
    [staff(env,'unlisted'),uid('unlisted')], [staff(env,'editor',{verified:false}),uid('editor')],
    [staff(env,'editor',{provider:'password'}),uid('editor')],
    [env.authenticatedContext('anonymous-user',{firebase:{sign_in_provider:'anonymous',identities:{}}}).firestore(),'anonymous-user']
  ];
  for(const [db,actor] of blocked) await assertFails(change(db,actor,seed()).commit());
  const old=await existingGuestPlan(env);
  for(const [db,actor] of blocked){
    await assertSucceeds(read(db,plan)); await assertFails(change(db,actor,old.next).commit());
    await assertFails(read(db,old.hpath)); await assertFails(historyList(db));
  }
});
test('genuine preceding state and matching, append-only audit entry are still required',async()=>{
  const ed=staff(env,'editor'),first=change(ed,uid('editor'),seed());
  await assertSucceeds(first.commit());
  await assertFails(change(ed,uid('editor'),first.next,{omitHistory:true}).commit());
  await assertFails(change(ed,uid('editor'),first.next,{before:{...first.next,attendees:[]}}).commit());
  await assertFails(setDoc(doc(ed,plan),{privateEmail:'fixture@example.invalid'},{merge:true}));
  await assertSucceeds(change(ed,uid('editor'),first.next).commit());
});
test('removing the member grant takes effect without a new login',async()=>{
  const ed=staff(env,'editor'),first=change(ed,uid('editor'),seed());
  await assertSucceeds(first.commit());
  await env.withSecurityRulesDisabled(ctx=>deleteDoc(doc(ctx.firestore(),'members',email('editor'))));
  await assertSucceeds(read(ed,plan)); await assertFails(read(ed,first.hpath));
  await assertFails(change(ed,uid('editor'),first.next).commit());
});
test('public visitors cannot access private event, memberships or other plan IDs',async()=>{
  const db=visitor(env);
  await assertFails(read(db,'members/'+email('admin'))); await assertFails(read(db,'events/snu60'));
  await assertFails(read(db,'sharedPlans/other')); await assertFails(getDocsFromServer(collection(db,'sharedPlans')));
  await assertFails(setDoc(doc(db,'members',email('admin')),{role:'admin'}));
});
test('after the server deadline existing seating and staff audit remain readable, but even authorized writes stop',async()=>{
  const ed=staff(closed,'editor'),ad=staff(closed,'admin');
  await assertFails(change(ad,uid('admin'),seed()).commit());
  const old=await existingGuestPlan(closed);
  await assertSucceeds(read(visitor(closed),plan));
  await assertSucceeds(read(ed,old.hpath)); await assertSucceeds(historyList(ad));
  for(const role of ['editor','admin']) await assertFails(change(staff(closed,role),uid(role),old.next).commit());
});
test('rollout probe allows the exact missing document, never a stored record, listing, or client writes',async()=>{
  const db=visitor(env),ad=staff(env,'admin');
  assert.equal((await assertSucceeds(read(db,marker))).exists(),false);
  await assertFails(read(db,'policyChecks/other')); await assertFails(getDocsFromServer(collection(db,'policyChecks')));
  await assertFails(setDoc(doc(db,marker),{value:'test'})); await assertFails(setDoc(doc(ad,marker),{value:'test'}));
  await env.withSecurityRulesDisabled(ctx=>setDoc(doc(ctx.firestore(),marker),{privateExample:'test'}));
  await assertFails(read(db,marker)); await assertFails(read(ad,marker)); await assertFails(deleteDoc(doc(ad,marker)));
});

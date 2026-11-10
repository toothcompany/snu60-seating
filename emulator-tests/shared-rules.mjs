import {readFileSync} from 'node:fs';
import {before,after,beforeEach,test} from 'node:test';
import assert from 'node:assert/strict';
import {initializeTestEnvironment,assertSucceeds,assertFails} from '@firebase/rules-unit-testing';
import {doc,setDoc,getDoc,getDocs,deleteDoc,collection,query,limit,orderBy,writeBatch,serverTimestamp} from 'firebase/firestore';
const source=readFileSync('firestore.rules','utf8');
const deadline='timestamp.date(2026, 11, 16) - duration.value(9, \'h\')';
assert.ok(source.includes(deadline),'Production deadline must be midnight Nov 16, 2026 in Korea.');
// The open/closed fixtures change ONLY the cutoff, so CI stays deterministic after the event.
const openRules=source.replace(deadline,'timestamp.date(2100, 1, 1)');
const closedRules=source.replace(deadline,'timestamp.date(2000, 1, 1)');
const A='guest-00000000-0000-4000-8000-000000000001',B='guest-00000000-0000-4000-8000-000000000002';
let env,closed;
before(async()=>{
 env=await initializeTestEnvironment({projectId:'demo-snu60-guest',firestore:{rules:openRules,host:'127.0.0.1',port:8080}});
 closed=await initializeTestEnvironment({projectId:'demo-snu60-expired',firestore:{rules:closedRules,host:'127.0.0.1',port:8080}});
});
after(async()=>{await env.cleanup();await closed.cleanup();});
beforeEach(async()=>{await env.clearFirestore();await closed.clearFirestore();});
const seed=()=>({version:1,rev:0,tables:[{id:'t1',number:1,capacity:8,x:240,y:300}],attendees:[{id:'p1',name:'가상 참석자',affiliation:'테스트',tableId:'t1',order:0}]});
const visitor=()=>env.unauthenticatedContext().firestore();
function change(db,uid,before,options={}){
 const ref=doc(db,'sharedPlans/snu60'),h=doc(collection(ref,'history')),next={...before,rev:before.rev+1},batch=writeBatch(db);
 batch.set(ref,{...next,updatedAt:serverTimestamp(),updatedBy:uid,lastAction:'테스트 변경',changeId:h.id});
 if(!options.omitHistory)batch.set(h,{before:options.forge?{...before,attendees:[]}:before,rev:next.rev,action:'테스트 변경',by:options.mismatch?B:uid,at:serverTimestamp()});
 return {commit:()=>batch.commit(),next,history:h};
}
test('public read and unauthenticated paired writes are allowed during the window',async()=>{
 const db=visitor();await assertSucceeds(getDoc(doc(db,'sharedPlans/snu60')));await assertSucceeds(change(db,A,seed()).commit());
});
test('public writes retain immutable history and disallow document deletion',async()=>{
 const db=visitor(),first=change(db,A,seed());await assertSucceeds(first.commit());
 assert.equal((await getDoc(doc(db,'sharedPlans/snu60'))).data().rev,1);
 await assertFails(deleteDoc(doc(db,'sharedPlans/snu60')));await assertFails(deleteDoc(first.history));await assertFails(setDoc(first.history,{action:'rewrite'},{merge:true}));
 await assertSucceeds(getDocs(query(collection(db,'sharedPlans/snu60/history'),orderBy('rev','desc'),limit(30))));
 await assertFails(getDocs(collection(db,'sharedPlans/snu60/history')));
});
test('state requires genuine previous state and a matching audit record',async()=>{
 const db=visitor(),first=change(db,A,seed());await assertSucceeds(first.commit());
 await assertFails(change(db,A,first.next,{omitHistory:true}).commit());
 await assertFails(change(db,A,first.next,{forge:true}).commit());
 await assertFails(change(db,A,first.next,{mismatch:true}).commit());
 await assertSucceeds(change(db,A,first.next).commit());
});
test('another unauthenticated browser sees shared state and stale revision cannot overwrite it',async()=>{
 const a=visitor(),first=change(a,A,seed());await assertSucceeds(first.commit());const b=visitor();
 assert.equal((await assertSucceeds(getDoc(doc(b,'sharedPlans/snu60')))).data().rev,1);
 await assertFails(change(b,B,seed()).commit());await assertSucceeds(change(b,B,first.next).commit());
});
test('public visitors cannot access members, private event data or other plans',async()=>{
 const db=visitor();await assertFails(getDoc(doc(db,'members/admin@example.invalid')));await assertFails(getDoc(doc(db,'events/snu60')));await assertFails(getDoc(doc(db,'sharedPlans/other')));await assertFails(setDoc(doc(db,'members/admin@example.invalid'),{role:'admin'}));
});
test('malformed browser labels and extra fields are rejected',async()=>{
 const db=visitor();await assertFails(change(db,'fake',seed()).commit());
 const first=change(db,A,seed());await assertSucceeds(first.commit());
 await assertFails(setDoc(doc(db,'sharedPlans/snu60'),{privateEmail:'do-not-publish@example.invalid'},{merge:true}));
});
test('expired window blocks writes on the server even with a valid paired batch',async()=>{
 const db=closed.unauthenticatedContext().firestore();
 await assertSucceeds(getDoc(doc(db,'sharedPlans/snu60')));
 await assertFails(change(db,A,seed()).commit());
 // An existing anonymous auth session does not bypass the deadline either.
 const authenticated=closed.authenticatedContext(A,{firebase:{sign_in_provider:'anonymous'}}).firestore();
 await assertFails(change(authenticated,A,seed()).commit());
});

import {readFileSync} from 'node:fs';
import {before,after,beforeEach,test} from 'node:test';
import assert from 'node:assert/strict';
import {initializeTestEnvironment,assertSucceeds,assertFails} from '@firebase/rules-unit-testing';
import {doc,setDoc,getDoc,getDocs,deleteDoc,collection,query,limit,orderBy,writeBatch,serverTimestamp} from 'firebase/firestore';
let env;
before(async()=>{env=await initializeTestEnvironment({projectId:'demo-snu60-guest',firestore:{rules:readFileSync('firestore.rules','utf8'),host:'127.0.0.1',port:8080}});});
after(async()=>{await env.cleanup();});
beforeEach(async()=>{await env.clearFirestore();});
const seed=()=>({version:1,rev:0,tables:[{id:'t1',number:1,capacity:8,x:240,y:300}],attendees:[{id:'p1',name:'가상 참석자',affiliation:'테스트',tableId:'t1',order:0}]});
const guest=uid=>env.authenticatedContext(uid,{firebase:{sign_in_provider:'anonymous'}}).firestore();
function change(db,uid,before,options={}){
 const ref=doc(db,'sharedPlans/snu60'),h=doc(collection(ref,'history')),next={...before,rev:before.rev+1},batch=writeBatch(db);
 batch.set(ref,{...next,updatedAt:serverTimestamp(),updatedBy:uid,lastAction:'테스트 변경',changeId:h.id});
 if(!options.omitHistory)batch.set(h,{before:options.forge?{...before,attendees:[]}:before,rev:next.rev,action:'테스트 변경',by:uid,at:serverTimestamp()});
 return {commit:()=>batch.commit(),next,history:h};
}
test('public read is allowed but unauthenticated writes are denied',async()=>{
 const db=env.unauthenticatedContext().firestore();await assertSucceeds(getDoc(doc(db,'sharedPlans/snu60')));await assertFails(change(db,'fake',seed()).commit());
});
test('anonymous browser can save with an immutable paired history record',async()=>{
 const db=guest('guest-a'),first=change(db,'guest-a',seed());await assertSucceeds(first.commit());
 const saved=await getDoc(doc(db,'sharedPlans/snu60'));assert.equal(saved.data().rev,1);
 await assertFails(deleteDoc(doc(db,'sharedPlans/snu60')));await assertFails(deleteDoc(first.history));await assertFails(setDoc(first.history,{action:'rewrite'},{merge:true}));
 await assertSucceeds(getDocs(query(collection(db,'sharedPlans/snu60/history'),orderBy('rev','desc'),limit(30))));
});
test('state cannot be overwritten without an audit record or with a fake preimage',async()=>{
 const db=guest('guest-a'),first=change(db,'guest-a',seed());await assertSucceeds(first.commit());
 await assertFails(change(db,'guest-a',first.next,{omitHistory:true}).commit());
 await assertFails(change(db,'guest-a',first.next,{forge:true}).commit());
 await assertSucceeds(change(db,'guest-a',first.next).commit());
});
test('second guest sees shared saved state; stale revision does not overwrite it',async()=>{
 const a=guest('guest-a'),first=change(a,'guest-a',seed());await assertSucceeds(first.commit());const b=guest('guest-b');
 assert.equal((await assertSucceeds(getDoc(doc(b,'sharedPlans/snu60')))).data().rev,1);
 await assertFails(change(b,'guest-b',seed()).commit());await assertSucceeds(change(b,'guest-b',first.next).commit());
});
test('anonymous visitors cannot read members, private events or other shared plans',async()=>{
 const db=guest('guest-a');await assertFails(getDoc(doc(db,'members/admin@example.invalid')));await assertFails(getDoc(doc(db,'events/snu60')));await assertFails(getDoc(doc(db,'sharedPlans/other')));await assertFails(setDoc(doc(db,'members/admin@example.invalid'),{role:'admin'}));
});

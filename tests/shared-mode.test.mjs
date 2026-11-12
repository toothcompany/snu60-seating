import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {publishedPlan} from '../public-plan.mjs';
import {googleMemberEmail,mayEdit,startingState,prepareChange,connectionError} from '../guest-policy.mjs';
import {personSignature} from '../core.mjs';

test('editing requires an approved role, a user, server confirmation, connectivity and no pending write',()=>{
 const ready={user:{uid:'uid-staff',email:'staff@example.test',emailVerified:true},role:'editor',connected:true,pending:false,online:true};
 assert.equal(mayEdit(ready),true);
 assert.equal(mayEdit({...ready,role:'admin'}),true);
 for(const changes of [{user:null},{user:{uid:'guest',isAnonymous:true}},{role:'viewer'},{role:null},{role:undefined},{role:'owner'},{connected:false},{pending:true},{online:false}])assert.equal(mayEdit({...ready,...changes}),false);
});
test('only a verified Google-token email that matches the active account is a member document key',()=>{
 const email='staff@example.test',u={uid:'staff',email,emailVerified:true,isAnonymous:false};
 const claims={email,email_verified:true,firebase:{sign_in_provider:'google.com'}};
 assert.equal(googleMemberEmail(u,claims),email);
 for(const identity of [null,{...u,uid:''},{...u,isAnonymous:true},{...u,emailVerified:false},{...u,email:'other@example.test'}]){
   assert.equal(googleMemberEmail(identity,claims),null);
 }
 for(const token of [null,{}, {...claims,email_verified:false}, {...claims,firebase:{sign_in_provider:'password'}}, {...claims,firebase:{sign_in_provider:'anonymous'}}, {...claims,email:'other@example.test'}]){
   assert.equal(googleMemberEmail(u,token),null);
 }
 assert.equal(googleMemberEmail({...u,email:'bad/path@example.test'},{...claims,email:'bad/path@example.test'}),null);
});
test('initial roster is an unsaved seed; existing server data is authoritative',()=>{
 const seed=publishedPlan();seed.rev=90;const start=startingState(null,seed);assert.equal(start.rev,0);
 const server=structuredClone(start);server.rev=5;server.attendees[0].name='변경된 이름';assert.equal(startingState(server,seed).attendees[0].name,'변경된 이름');assert.equal(seed.rev,90);
});
test('a seating change preserves every participant and increments revision',()=>{
 const before=startingState(null,publishedPlan()),a=before.attendees[0];
 const change=prepareChange(before,{type:'move',id:a.id,expected:personSignature(a),tableId:'t6'});
 assert.equal(change.next.rev,1);assert.equal(change.next.attendees.length,before.attendees.length);assert.equal(change.before.attendees[0].tableId,before.attendees[0].tableId);assert.equal(change.next.attendees.find(p=>p.id===a.id).tableId,'t6');
});
test('stale restore cannot overwrite another visitor change',()=>{
 const s=startingState(null,publishedPlan());s.rev=3;assert.throws(()=>prepareChange(s,{type:'replace',expectedRev:2,value:s}),/다른/);
});
test('permission errors distinguish authorization and connectivity',()=>{
 assert.match(connectionError({code:'permission-denied'}),/권한|승인|규칙/);
 assert.match(connectionError({code:'unavailable'}),/연결|오프라인|저장/);
});
test('public shared editor has explicit Google sign-in; no anonymous identity grants write access',()=>{
 const html=readFileSync(new URL('../index.html',import.meta.url),'utf8'),js=readFileSync(new URL('../shared-editor.js',import.meta.url),'utf8');
 assert.match(html,/shared-editor\.js/);assert.match(html,/id="login"/);assert.match(html,/id="logout"/);
 assert.doesNotMatch(js,/signInAnonymously|browserVisitor/);
 assert.match(js,/signInWithPopup/);assert.match(js,/firebase-auth\.js/);assert.match(js,/members/);
 assert.match(js,/SHARED_DOCUMENT/);assert.match(js,/F\.runTransaction/);assert.match(js,/serverTimestamp/);
});

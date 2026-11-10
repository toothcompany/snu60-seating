import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {publishedPlan} from '../public-plan.mjs';
import {mayEdit,startingState,prepareChange,connectionError} from '../guest-policy.mjs';
import {personSignature} from '../core.mjs';

test('visitors edit only with a server-confirmed session and connectivity',()=>{
 const ready={user:{uid:'guest-a'},connected:true,pending:false,online:true};
 assert.equal(mayEdit(ready),true);
 for(const changes of [{user:null},{connected:false},{pending:true},{online:false}])assert.equal(mayEdit({...ready,...changes}),false);
});
test('initial roster is an unsaved seed; existing server data is authoritative',()=>{
 const seed=publishedPlan();seed.rev=90;const start=startingState(null,seed);assert.equal(start.rev,0);
 const server=structuredClone(start);server.rev=5;server.attendees[0].name='변경된 이름';assert.equal(startingState(server,seed).attendees[0].name,'변경된 이름');assert.equal(seed.rev,90);
});
test('a no-account move preserves every participant and increments revision',()=>{
 const before=startingState(null,publishedPlan()),a=before.attendees[0];
 const change=prepareChange(before,{type:'move',id:a.id,expected:personSignature(a),tableId:'t6'});
 assert.equal(change.next.rev,1);assert.equal(change.next.attendees.length,before.attendees.length);assert.equal(change.before.attendees[0].tableId,before.attendees[0].tableId);assert.equal(change.next.attendees.find(p=>p.id===a.id).tableId,'t6');
});
test('stale restore cannot overwrite another visitor change',()=>{
 const s=startingState(null,publishedPlan());s.rev=3;assert.throws(()=>prepareChange(s,{type:'replace',expectedRev:2,value:s}),/다른/);
});
test('anonymous connection errors provide an actionable setup message',()=>{
 assert.match(connectionError({code:'auth/admin-restricted-operation'}),/익명/);assert.match(connectionError({code:'permission-denied'}),/규칙/);
});
test('public page has no interactive sign-in and uses automatic anonymous auth',()=>{
 const html=readFileSync(new URL('../index.html',import.meta.url),'utf8'),js=readFileSync(new URL('../shared-editor.js',import.meta.url),'utf8');
 assert.match(html,/shared-editor\.js/);assert.doesNotMatch(html,/id="login"|Google 로그인/);assert.match(js,/signInAnonymously/);assert.doesNotMatch(js,/signInWithPopup/);assert.match(js,/sharedPlans|SHARED_DOCUMENT/);assert.match(js,/getDocs\(q\)/);assert.match(js,/serverTimestamp/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {advanceTrail,trailAt} from '../undo-trail.mjs';
const edit=(rev,uid='a',lastAction='자리 이동')=>({rev,updatedBy:uid,lastAction,changeId:String(rev).padStart(20,'0')});
const ids=j=>j.items.map(x=>x.rev);
test('multi-step undo runs against a newly saved head after each reversal and survives a reload',()=>{
 const a=edit(1),b=edit(2),u=edit(3,'a','한 단계 되돌리기 · 변경 #2'),v=edit(4,'a','한 단계 되돌리기 · 변경 #1');
 let j=advanceTrail(null,null,a,'a','edit');
 j=advanceTrail(j,a,b,'a','edit');assert.deepEqual(ids(j),[1,2]);
 j=advanceTrail(JSON.parse(JSON.stringify(j)),b,u,'a','undo');assert.deepEqual(trailAt(j,u,'a').map(p=>p.rev),[1]);
 j=advanceTrail(j,u,v,'a','undo');assert.deepEqual(trailAt(j,v,'a'),[]);
});
test('a foreign intervening edit cannot be undone as part of a former run',()=>{
 const a=edit(1),b=edit(2,'b'),c=edit(3),d=edit(4,'a','한 단계 되돌리기 · 변경 #3');
 let j=advanceTrail(null,null,a,'a','edit');assert.deepEqual(trailAt(j,b,'a'),[]);
 j=advanceTrail(j,b,c,'a','edit');assert.deepEqual(ids(j),[3]);
 j=advanceTrail(j,c,d,'a','undo');assert.deepEqual(trailAt(j,d,'a'),[]);
});
test('initial seed publication is not a seating change; latest prior-version own edit is recoverable',()=>{
 const a=edit(1,'a','초기 배치 공동 저장');assert.deepEqual(trailAt(null,a,'a'),[]);
 const b=edit(2);assert.equal(trailAt(null,b,'a')[0].id,b.changeId);
 assert.deepEqual(trailAt(null,edit(3,'a','내 마지막 변경 취소'),'a'),[]);
});

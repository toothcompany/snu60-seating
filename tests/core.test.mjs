import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyState,demoState,normalize,membersAt,occupancy,personSignature,applyOperation,rowsToState,parseCsv,toCsv} from '../core.mjs';

test('default layout contains 12 tables and 99 seats',()=>{
 const s=emptyState();assert.equal(s.tables.length,12);assert.equal(s.tables.reduce((n,t)=>n+t.capacity,0),99);
 assert.ok(s.tables[0].x<s.tables[2].x&&s.tables[2].x<s.tables[1].x);
});
test('demo names are synthetic and exactly 99 unique attendees',()=>{
 const s=demoState();assert.equal(s.attendees.length,99);assert.equal(new Set(s.attendees.map(a=>a.id)).size,99);assert.ok(s.attendees.every(a=>a.name.startsWith('참석자 ')));
});
test('move keeps all attendees and signals over / under capacity',()=>{
 const s=demoState(),a=s.attendees[0],next=applyOperation(s,{type:'move',id:a.id,expected:personSignature(a),tableId:'t2'});
 assert.equal(next.attendees.length,99);assert.equal(membersAt(next,'t1').length,7);assert.equal(membersAt(next,'t2').length,9);
 assert.equal(occupancy(next,next.tables[0]).kind,'under');assert.equal(occupancy(next,next.tables[1]).kind,'over');assert.equal(membersAt(s,'t1').length,8);
});
test('stale attendee edits are rejected instead of overwriting changes',()=>{
 const s=demoState(),a=s.attendees[0],expected=personSignature(a),next=applyOperation(s,{type:'move',id:a.id,expected,tableId:'t2'});
 assert.throws(()=>applyOperation(next,{type:'move',id:a.id,expected,tableId:'t3'}),/먼저 변경/);
});
test('swapping seats exchanges exact table and order',()=>{
 const s=demoState(),a=membersAt(s,'t1')[1],b=membersAt(s,'t2')[3];
 const n=applyOperation(s,{type:'swapPeople',id:a.id,expected:personSignature(a),otherId:b.id,otherExpected:personSignature(b)});
 assert.equal(membersAt(n,'t2')[3].id,a.id);assert.equal(membersAt(n,'t1')[1].id,b.id);
});
test('table movement preserves all associated names and seats',()=>{
 const s=demoState(),t=s.tables[0],n=applyOperation(s,{type:'tablePosition',id:t.id,fromX:t.x,fromY:t.y,x:600,y:600});
 assert.equal(n.tables[0].x,600);assert.deepEqual(n.attendees,s.attendees);
});
test('position swap does not exchange table memberships',()=>{
 const s=demoState(),n=applyOperation(s,{type:'swapTables',id:'t4',otherId:'t5',expectedRev:0});
 assert.equal(n.tables[3].x,s.tables[4].x);assert.equal(n.tables[3].y,s.tables[4].y);assert.deepEqual(n.attendees,s.attendees);
});
test('unassigned move does not delete the person',()=>{
 const s=demoState(),a=s.attendees[0],n=applyOperation(s,{type:'move',id:a.id,tableId:null,expected:personSignature(a)});
 assert.equal(n.attendees.length,99);assert.equal(membersAt(n,null).length,1);
});
test('changing capacity uses validated range',()=>{
 const s=demoState();assert.throws(()=>applyOperation(s,{type:'capacity',id:'t1',expectedCapacity:8,capacity:0}));
 const n=applyOperation(s,{type:'capacity',id:'t1',expectedCapacity:8,capacity:9});assert.equal(occupancy(n,n.tables[0]).kind,'under');
});
test('file replacement requires unchanged revision',()=>{
 const s=demoState();s.rev=4;assert.throws(()=>applyOperation(s,{type:'replace',expectedRev:3,value:emptyState()}),/다른 운영진/);
});
test('xlsx-like rows import only requested roster fields',()=>{
 const n=rowsToState([['테이블','좌석','성명·표기','소속','이메일'],[1,2,'예시 B','연구기관 B','private@example.test'],[1,1,'예시 A','연구기관 A','private2@example.test']]);
 assert.equal(n.attendees.length,2);assert.equal(membersAt(n,'t1')[0].name,'예시 A');assert.ok(!JSON.stringify(n).includes('@'));
});
test('duplicate seats and invalid table references are rejected',()=>{
 assert.throws(()=>rowsToState([['테이블','좌석','성명'],[1,1,'예시 A'],[1,1,'예시 B']]),/중복/);
 assert.throws(()=>rowsToState([['테이블','좌석','성명'],[99,1,'예시 A']]),/테이블 번호/);
});
test('CSV supports quotes, commas, newlines and BOM',()=>{
 const rows=parseCsv('\uFEFF테이블,좌석,성명,소속\r\n1,1,"예시 A","학과, 연구소"\r\n');
 assert.equal(rows[1][3],'학과, 연구소');assert.equal(rowsToState(rows).attendees[0].name,'예시 A');
 assert.throws(()=>parseCsv('"unfinished'),/닫히지/);
});
test('CSV export protects spreadsheet formula injection',()=>{
 const s=emptyState();s.attendees=[{id:'a',name:'=EXAMPLE()',affiliation:'+x',tableId:'t1',order:0}];
 const text=toCsv(s);assert.ok(text.includes("'=EXAMPLE()"));assert.ok(text.includes("'+x"));
});
test('duplicate IDs cannot enter shared state',()=>{
 const s=demoState();s.attendees[1].id=s.attendees[0].id;assert.throws(()=>normalize(s),/ID/);
});

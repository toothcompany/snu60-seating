import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { membersAt, occupancy, normalize } from '../core.mjs';
import { publishedPlan, NO_DINNER_SEAT } from '../public-plan.mjs';
const plan=publishedPlan();
const sourceAttending=[12,41,48,54,56,59,61,63,64,66,70,73,75,77,78,79,80,81,84,85,86,87,91,92,95,96,100,101,104,105,108,112,113,114,115,118,119,123,124,131,136,139,140,141,142,146,149,157,158,160,166,169,170,172,175,176,178,179,180,184,185,186,187,189,193,194,197,198,199,201,202,203,204,205,206,207,208,209,210,211,212,213,214,215,216,217,218,219,220,221,222,223,224,225,226,227,228,229,230];
const person=n=>plan.attendees.find(a=>a.name===n);
const seat=a=>membersAt(plan,a.tableId).findIndex(b=>b.id===a.id)+1;
const tableNumber = a=>plan.tables.find(t=>t.id===a.tableId)?.number;
test('Nov 9 attendees all retained, plus two additional RSVPs and Shin Hye-sun',()=>{
 assert.equal(sourceAttending.length,99);assert.equal(plan.attendees.length,102);
 assert.deepEqual(plan.attendees.map(a=>Number(a.id.split('-')[1])).sort((a,b)=>a-b),[...sourceAttending,127,132,188].sort((a,b)=>a-b));
 assert.equal(new Set(plan.attendees.map(a=>a.id)).size,102);
});
test('100 separate dinner assignments, 2 crew without dinner seats, and 2 spare chairs',()=>{
 assert.equal(plan.attendees.filter(a=>a.tableId!==null).length,100);
 assert.deepEqual(plan.attendees.filter(a=>a.tableId===null).map(a=>a.id),NO_DINNER_SEAT);
 assert.equal(plan.tables.reduce((sum,t)=>sum+t.capacity,0),102);
 assert.equal(plan.tables.filter(t=>occupancy(plan,t).delta<0).length,2);
 assert.ok(plan.tables.every(t=>occupancy(plan,t).delta<=0));
 assert.equal(person('신종학').tableId,person('백인채').tableId);assert.equal(seat(person('신종학')),seat(person('백인채'))+1);
});
test('requested front-table moves and adjacent seats',()=>{
 const p=person('Prathip Phantumvanit'),b=person('백대일');assert.equal(p.tableId,b.tableId);assert.equal(Math.abs(seat(p)-seat(b)),1);
 for(const n of ['장덕수','이원재'])assert.ok(['t1','t2','t3'].includes(person(n).tableId));
 assert.equal(person('김남희').tableId,'t8');
 assert.equal(person('조현재').tableId,'t6');assert.equal(person('이병진').tableId,'t6');
 assert.equal(person('김희찬').tableId,person('허준석').tableId);assert.equal(Math.abs(seat(person('김희찬'))-seat(person('허준석'))),1);
});
test('renumbering preserves the previously chosen group locations and seat order',()=>{
 const rows=[['t1','t3','t2'],['t5','t4','t6'],['t8','t7','t9'],['t10','t11','t12']];
 for (const [r,ids] of rows.entries()) for(const [col,id] of ids.entries()) {
  const t=plan.tables.find(t=>t.id===id);
  assert.equal(t.number,3*r+col+1);assert.equal(t.x,240+col*480);assert.equal(t.y,300+430*r);
 }
 for(const [name,number,seatNo] of [['송영하',4,8],['이봉호',5,1]]) {
  const a=person(name);assert.equal(tableNumber(a),number);assert.equal(seat(a),seatNo);
 }
 assert.equal(tableNumber(person('이원재')),3);assert.equal(tableNumber(person('김남희')),7);
 assert.equal(tableNumber(person('김희찬')),8);assert.equal(tableNumber(person('허준석')),8);
});
test('corrections and family identities',()=>{
 assert.ok(person('신명섭'));assert.ok(!person('신영섭'));assert.ok(person('신혜선'));
 assert.equal(plan.attendees.filter(a=>a.affiliation.includes('유한양행')).length,1);assert.equal(person('김문섭').tableId,'t6');
 for(const n of ['유한양행 1','유한양행 2','LG 담당자','아이센랩 2','촬영기사 2'])assert.ok(!person(n));
 for(const n of ['오경희','박훈','이정후','정진희','최은재'])assert.ok(person(n));
 assert.equal(person('Dilip Prajapati 가족 1').tableId,person('딜립').tableId);
 assert.equal(person('Dilip Prajapati 가족 2').tableId,person('딜립').tableId);
});
test('public payload contains only seating information, never contact or auth fields',()=>{
 const n=normalize(plan);assert.deepEqual(Object.keys(n).sort(),['attendees','rev','tables','version']);
 for(const a of n.attendees)assert.deepEqual(Object.keys(a).sort(),['affiliation','id','name','order','tableId']);
 assert.ok(!JSON.stringify(n).includes('@'));assert.ok(!/010-\d{4}-\d{4}/.test(JSON.stringify(n)));
});
test('public collaboration is independent of the legacy authenticated editor',()=>{
 const index=readFileSync(new URL('../index.html',import.meta.url),'utf8');
 assert.ok(index.includes('./shared-editor.js'));assert.ok(!index.includes('src="./app.js"'));
 assert.ok(index.includes('noindex,nofollow'));
 const legacy=readFileSync(new URL('../editor.html',import.meta.url),'utf8');
 assert.ok(legacy.includes('./app.js'));
});

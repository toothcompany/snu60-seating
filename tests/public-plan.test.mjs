import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { emptyState, membersAt, occupancy, normalize } from '../core.mjs';
import { publishedPlan, ACADEMIC_ONLY } from '../public-plan.mjs';
const plan=publishedPlan();
const sourceAttending=[12,41,48,54,56,59,61,63,64,66,70,73,75,77,78,79,80,81,84,85,86,87,91,92,95,96,100,101,104,105,108,112,113,114,115,118,119,123,124,131,136,139,140,141,142,146,149,157,158,160,166,169,170,172,175,176,178,179,180,184,185,186,187,189,193,194,197,198,199,201,202,203,204,205,206,207,208,209,210,211,212,213,214,215,216,217,218,219,220,221,222,223,224,225,226,227,228,229,230];
const person=n=>plan.attendees.find(a=>a.name===n);
const seat=a=>membersAt(plan,a.tableId).findIndex(b=>b.id===a.id)+1;
function location(s,a){const t=s.tables.find(t=>t.id===a.tableId),n=membersAt(s,t.id).findIndex(b=>b.id===a.id),angle=(-90+n*360/t.capacity)*Math.PI/180;return [t.x+151*Math.cos(angle),t.y+151*Math.sin(angle)];}
test('all 99 attending rows preserved, plus explicitly requested Shin Hye-sun',()=>{
 assert.equal(sourceAttending.length,99);assert.equal(plan.attendees.length,100);
 assert.deepEqual(plan.attendees.map(a=>Number(a.id.split('-')[1])).sort((a,b)=>a-b),[...sourceAttending,127].sort((a,b)=>a-b));
 assert.equal(new Set(plan.attendees.map(a=>a.id)).size,100);
});
test('99 banquet seats exact, with one academic-only attendee',()=>{
 assert.equal(plan.attendees.filter(a=>a.tableId!==null).length,99);
 assert.deepEqual(plan.attendees.filter(a=>a.tableId===null).map(a=>a.id),ACADEMIC_ONLY);
 for(const t of plan.tables)assert.equal(occupancy(plan,t).delta,0);
 assert.equal(person('신종학').tableId,null);
});
test('requested front-table moves and adjacent seats',()=>{
 const p=person('Prathip Phantumvanit'),b=person('백대일');assert.equal(p.tableId,b.tableId);assert.equal(Math.abs(seat(p)-seat(b)),1);
 for(const n of ['장덕수','이원재'])assert.ok(['t1','t2','t3'].includes(person(n).tableId));
 assert.equal(person('김남희').tableId,'t8');
 assert.equal(person('조현재').tableId,'t6');assert.equal(person('이병진').tableId,'t6');
 assert.equal(person('김희찬').tableId,person('허준석').tableId);assert.equal(Math.abs(seat(person('김희찬'))-seat(person('허준석'))),1);
});
test('table position swaps retain Song and Lee at their physical seats',()=>{
 const old=emptyState();
 for(const [a,b] of [[4,5],[7,8]])assert.deepEqual([plan.tables[a-1].x,plan.tables[a-1].y],[old.tables[b-1].x,old.tables[b-1].y]);
 for(const [name,table,order] of [['송영하',4,7],['이봉호',5,0]]){
  const oldPerson={id:name,name,tableId:`t${table}`,affiliation:'',order};
  const before=emptyState();before.attendees=Array.from({length:8},(_,i)=>({id:`${name}-${i}`,name:'x',affiliation:'',tableId:`t${table}`,order:i}));before.attendees[order]=oldPerson;
  assert.deepEqual(location(plan,person(name)),location(before,oldPerson));
 }
});
test('corrections and family identities',()=>{
 assert.ok(person('신명섭'));assert.ok(!person('신영섭'));assert.ok(person('신혜선'));
 assert.equal(plan.attendees.filter(a=>a.affiliation.includes('유한양행')).length,1);assert.equal(person('김문섭').tableId,'t6');
 for(const n of ['유한양행 1','유한양행 2','LG 담당자','아이센랩 2','촬영기사 2'])assert.ok(!person(n));
 for(const n of ['오경희','박훈','이정후','유부강'])assert.ok(person(n));
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
 assert.ok(index.includes('./setup-shared.html'));assert.ok(index.includes('noindex,nofollow'));
 const legacy=readFileSync(new URL('../editor.html',import.meta.url),'utf8');
 assert.ok(legacy.includes('./app.js'));
});

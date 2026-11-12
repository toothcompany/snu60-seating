import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareRosterRevision} from '../roster-update.mjs';
import {publishedPlan} from '../public-plan.mjs';
import {membersAt} from '../core.mjs';

const pairs=[
  ['정연호','r261109-228','정진희','r261109-132'],
  ['유부강','r261109-229','최은재','r261109-188'],
];
function oldPlan(){
  const p=publishedPlan(); p.rev=13;
  for(const [name,id,newName] of pairs)Object.assign(p.attendees.find(a=>a.name===newName),{name,id,affiliation:'제이크 이미지 연구소'});
  return p;
}
test('seed uses original registrant identities, and no photographer affiliation is carried over',()=>{
  const p=publishedPlan(); const t=p.tables.find(t=>t.number===12); const seats=membersAt(p,t.id);
  assert.deepEqual(seats.slice(7).map(a=>[a.id,a.name,a.affiliation]),pairs.map(([,,name,id])=>[id,name,'교실원']));
  assert.deepEqual(p.attendees.filter(a=>a.name==='정연호'||a.name==='유부강'),[]);
});
test('uses actual current positions without reformatting tables, the audit snapshot or any other participant',()=>{
  const raw=oldPlan(); raw.tables[0].x=245; const old=raw.attendees.find(a=>a.id==='r261109-228');
  old.tableId='t5';old.order=14; const input=structuredClone(raw); const r=prepareRosterRevision({...raw,lastAction:'other',updatedBy:'uid'});
  assert.equal(r.status,'applied');assert.equal(r.next.rev,14);assert.deepEqual(r.before,input);assert.deepEqual(raw,input);
  assert.deepEqual(r.next.tables,input.tables);assert.equal(r.next.attendees.length,input.attendees.length);
  r.next.attendees.forEach((a,i)=>{const orig=input.attendees[i];if(pairs.some(x=>x[1]===orig.id)){assert.equal(a.tableId,orig.tableId);assert.equal(a.order,orig.order);}else assert.deepEqual(a,orig);});
  assert.equal(prepareRosterRevision(r.next).status,'unchanged');
});
test('aborts both changes on ambiguous imports, drift, conflicts or unassigned photographers',()=>{
  for(const alter of [p=>{p.attendees.push({...p.attendees.find(a=>a.name==='정연호'),id:'copy'});},
   p=>{p.attendees.find(a=>a.name==='유부강').name='다른 사람';},
   p=>{p.attendees.find(a=>a.name==='정연호').tableId=null;},
   p=>{p.attendees.find(a=>a.name==='유부강').id='custom';p.attendees.find(a=>a.name==='유부강').affiliation='다른 소속';},
   p=>{p.attendees.push({id:'added',name:'최은재',affiliation:'',order:3,tableId:'t9'});}]) {
    const p=oldPlan();alter(p); const orig=structuredClone(p);assert.throws(()=>prepareRosterRevision(p));assert.deepEqual(p,orig);
  }
});
test('safe manual partial correction retained; renamed photographer IDs repaired, unknown existing attendee IDs preserved',()=>{
  let p=oldPlan();let rec=p.attendees.find(a=>a.name==='정연호');Object.assign(rec,{name:'정진희',affiliation:'제이크 이미지 연구소'});
  const n=prepareRosterRevision(p).next;const a=n.attendees.find(a=>a.name==='정진희');assert.equal(a.id,'r261109-132');assert.equal(a.affiliation,'교실원');
  p=oldPlan();rec=p.attendees.find(a=>a.name==='정연호');Object.assign(rec,{name:'정진희',id:'operator-added-id',affiliation:'입력한 소속',tableId:'t10',order:1});
  const n2=prepareRosterRevision(p).next;assert.deepEqual(n2.attendees.find(a=>a.name==='정진희'),rec);
});
test('can use precise name & affiliation following an import that replaced all row IDs',()=>{
 const p=oldPlan();p.attendees=p.attendees.map((a,i)=>({...a,id:'import-'+i}));const n=prepareRosterRevision(p).next;
 for(const [,,name,id] of pairs)assert.equal(n.attendees.find(a=>a.name===name).id,id);
});

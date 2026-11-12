import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareRosterRevision} from '../roster-update.mjs';
import {publishedPlan} from '../public-plan.mjs';
import {membersAt} from '../core.mjs';
const pairs=[['정연호','r261109-228','정진희','r261109-132'],['유부강','r261109-229','최은재','r261109-188']];
const find=(p,n)=>p.attendees.find(a=>a.name===n);
const seated=p=>p.attendees.filter(a=>a.tableId!=null).length;
const sum=p=>p.tables.reduce((s,t)=>s+t.capacity,0);
function legacy(previousFix=false){
 const p=publishedPlan();p.rev=229;
 for(const t of p.tables)t.capacity=t.number<=9?8:9;
 const s=find(p,'신종학');s.tableId=null;s.order=0;
 p.attendees=p.attendees.filter(a=>!pairs.some(x=>x[1]===a.id));
 if(!previousFix)for(const [name,id,newName] of pairs)Object.assign(find(p,newName),{name,id,affiliation:'제이크 이미지 연구소'});
 return p;
}
for(const previousFix of [true,false])test('both previous event versions reconcile to 102 people, 100 placed, 2 reserved: '+previousFix,()=>{
 const p=legacy(previousFix);const a=p.attendees.at(0);a.order=0.25; p.tables[0].x+=31;const copy=structuredClone(p);
 const {status,before,next}=prepareRosterRevision({...p,updatedBy:'admin',lastAction:'unrelated'});assert.equal(status,'applied');assert.equal(next.rev,230);assert.deepEqual(before,copy);assert.deepEqual(p,copy);assert.deepEqual(a,find(next,a.name));
 assert.equal(next.attendees.length,102);assert.equal(new Set(next.attendees.map(a=>a.id)).size,102);assert.equal(seated(next),100);assert.equal(sum(next),102);
 let touchedIDs= new Set(['r261109-227',...pairs.flatMap(x=>[x[1],x[3]])]);
 for(const old of p.attendees.filter(a=>!touchedIDs.has(a.id)))assert.deepEqual(find(next,old.name),old);
 for(const [oldName,oldId,newName,newId] of pairs){const incoming=find(next,newName),old=find(next,oldName);assert.equal(incoming.id,newId);assert.equal(old.id,oldId);assert.equal(old.tableId,null);assert.equal(incoming.affiliation,'교실원');const ref=find(p,previousFix?newName:oldName);assert.equal(incoming.tableId,ref.tableId);assert.equal(incoming.order,ref.order);}
 const b=find(next,'백인채'),s=find(next,'신종학');const list=membersAt(next,b.tableId);assert.equal(list.indexOf(s),list.indexOf(b)+1);assert.deepEqual(b,find(p,'백인채'));assert.equal(prepareRosterRevision(next).status,'unchanged');
});
test('uses most recent live seating and existing reserve room without moving or shrinking other seats',()=>{
 const p=legacy();const b=find(p,'백인채'),c=find(p,'정연호');b.tableId='t5';b.order=14;c.tableId='t3';c.order=22;
 p.tables.find(t=>t.id==='t10').capacity=15;
 const {next}=prepareRosterRevision(p);
 assert.equal(find(next,'신종학').tableId,'t5');assert.equal(find(next,'정진희').tableId,'t3');assert.equal(find(next,'정진희').order,22);
 assert.equal(next.tables.find(t=>t.id==='t10').capacity,15);assert.equal(next.tables.find(t=>t.id==='t12').capacity,9);assert.equal(next.tables.find(t=>t.id==='t11').capacity,9);
});
test('if the old shared-seat scheme was entered, give Baek an independent seat next to Shin; if both already seated keep assignments',()=>{
 const p=legacy(true),b=find(p,'백인채'),s=find(p,'신종학');s.tableId=b.tableId;s.order=b.order;b.tableId=null;
 const n=prepareRosterRevision(p).next;const list=membersAt(n,s.tableId);assert.equal(list.indexOf(find(n,'백인채')),list.indexOf(find(n,'신종학'))+1);
 b.tableId='t1';b.order=3;const q=prepareRosterRevision(p).next;assert.equal(find(q,'백인채').tableId,'t1');assert.equal(find(q,'신종학').tableId,s.tableId);
});
test('already-added guest or import ID is not duplicated; retain current affiliation and position when already seated',()=>{
 const p=legacy();const old=find(p,'정연호');old.id='photographer-2';
 const custom={name:'정진희',id:'added',affiliation:'사용자 편집',tableId:'t4',order:15};p.attendees.push(custom);
 const n=prepareRosterRevision(p).next;assert.deepEqual(find(n,'정진희'),custom);assert.equal(find(n,'정연호').id,'photographer-2');assert.equal(find(n,'정연호').tableId,null);
 const p2=legacy();Object.assign(find(p2,'정연호'),{name:'정진희'});const n2=prepareRosterRevision(p2).next;assert.equal(find(n2,'정연호').id,'r261109-228');assert.equal(find(n2,'정진희').id,'r261109-132');assert.equal(find(n2,'정진희').affiliation,'교실원');
});
test('cancel atomically on identity conflict or when there is no trustworthy seat to inherit',()=>{
 for(const change of [p=>p.attendees.push({...find(p,'정연호'),id:'other'}),p=>{find(p,'유부강').id='import2';find(p,'유부강').affiliation='다른 회사';},p=>{find(p,'유부강').tableId=null;},p=>{find(p,'백인채').tableId=null;},p=>{find(p,'최상관').id='r261109-132';},p=>{find(p,'신종학').name='동명이인 아님';}]){
  const p=legacy();change(p);const old=structuredClone(p);assert.throws(()=>prepareRosterRevision(p));assert.deepEqual(p,old);
 }
});

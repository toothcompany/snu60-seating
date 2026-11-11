import test from 'node:test';
import assert from 'node:assert/strict';
import {demoState,membersAt,toCsv} from '../core.mjs';
import {publishedPlan} from '../public-plan.mjs';
import {numberedLayout,dropTableAt} from '../table-grid.mjs';
import {startingState,prepareChange} from '../guest-policy.mjs';

test('legacy server and backup positions migrate identically without writing or losing manual table swaps',()=>{
 const old=demoState();old.rev=19;
 const a=old.tables[0],b=old.tables[8];
 [a.x,a.y,b.x,b.y]=[b.x,b.y,a.x,a.y];
 const incoming=structuredClone(old),view=startingState(incoming,publishedPlan());
 assert.deepEqual(incoming,old);assert.deepEqual(view.attendees,old.attendees);
 assert.equal(view.tables.find(t=>t.id===a.id).number,9);assert.equal(view.tables.find(t=>t.id===b.id).number,1);
 const changed=prepareChange(view,{type:'capacity',id:a.id,expectedCapacity:a.capacity,capacity:a.capacity+1},{...incoming,updatedBy:'visitor-old',changeId:'abc'});
 assert.deepEqual(changed.before,old);assert.equal(changed.next.rev,20);assert.deepEqual(numberedLayout(changed.next),changed.next);
 const restored=prepareChange(changed.next,{type:'replace',expectedRev:20,value:changed.before});
 assert.deepEqual(restored.next.tables,view.tables);assert.deepEqual(restored.next.attendees,view.attendees);
});
test('moving a whole table swaps the groups and their capacities while labels remain row-major everywhere',()=>{
 const old=publishedPlan(),first=old.tables.find(t=>t.number===1),last=old.tables.find(t=>t.number===12);
 assert.equal(dropTableAt(old,last.x,last.y),last.id);assert.equal(dropTableAt(old,(last.x+old.tables.find(t=>t.number===11).x)/2,last.y),null);
 const changed=prepareChange(old,{type:'swapTables',id:first.id,otherId:last.id,expectedRev:old.rev}).next;
 const newFirst=changed.tables.find(t=>t.number===1),newLast=changed.tables.find(t=>t.number===12);
 assert.equal(newLast.capacity,first.capacity);assert.equal(newFirst.capacity,last.capacity);
 assert.deepEqual(membersAt(changed,newFirst.id),membersAt(old,last.id));assert.deepEqual(membersAt(changed,newLast.id),membersAt(old,first.id));
 assert.deepEqual([newLast.x,newLast.y],[last.x,last.y]);
 assert.ok(toCsv(changed).includes('"12","1","'+membersAt(old,first.id)[0].name+'"'));
 assert.throws(()=>prepareChange(changed,{type:'swapTables',id:first.id,otherId:last.id,expectedRev:old.rev}),/다른 변경/);
});

import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {EDITING_END,editingWindowOpen} from '../temporary-access.mjs';

test('Korean midnight cutoff is enforced at the exact boundary',()=>{
 const cutoff=Date.parse(EDITING_END);
 assert.equal(new Date(cutoff).toISOString(),'2026-11-15T15:00:00.000Z');
 assert.equal(editingWindowOpen(cutoff-1),true);
 assert.equal(editingWindowOpen(cutoff),false);
 assert.equal(editingWindowOpen(cutoff+1),false);
});
test('shared editor retains the cutoff alongside Google membership checks',()=>{
 const code=readFileSync(new URL('../shared-editor.js',import.meta.url),'utf8');
 assert.doesNotMatch(code,/signInAnonymously|browserVisitor/);
 assert.match(code,/editingWindowOpen\(/);
 assert.match(code,/mayEdit\(/);
 assert.match(code,/F\.runTransaction/);
});

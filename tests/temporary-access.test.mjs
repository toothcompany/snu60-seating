import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {EDITING_END,editingWindowOpen,browserVisitor} from '../temporary-access.mjs';

test('Korean midnight cutoff is enforced at the exact boundary',()=>{
 const cutoff=Date.parse(EDITING_END);
 assert.equal(new Date(cutoff).toISOString(),'2026-11-15T15:00:00.000Z');
 assert.equal(editingWindowOpen(cutoff-1),true);
 assert.equal(editingWindowOpen(cutoff),false);
 assert.equal(editingWindowOpen(cutoff+1),false);
});
test('browser label persists without a login or credential',()=>{
 const data=new Map(),storage={getItem:k=>data.get(k),setItem:(k,v)=>data.set(k,v)};
 const id='00000000-0000-4000-8000-000000000001';
 const first=browserVisitor(storage,()=>id);
 assert.equal(first.uid,'guest-'+id);
 assert.deepEqual(browserVisitor(storage,()=>{throw Error('must reuse');}),first);
});
test('storage restrictions do not prevent a per-page visitor label',()=>{
 const storage={getItem(){throw Error('blocked');},setItem(){throw Error('blocked');}};
 assert.ok(browserVisitor(storage,()=> '00000000-0000-4000-8000-000000000001').uid.startsWith('guest-'));
});
test('shared editor neither loads Firebase Auth nor signs visitors in',()=>{
 const code=readFileSync(new URL('../shared-editor.js',import.meta.url),'utf8');
 assert.equal(code.includes('signInAnonymously'),false);
 assert.equal(code.includes('firebase-auth.js'),false);
 assert.ok(code.includes('editingWindowOpen()&&mayEdit'));
 assert.ok(code.includes('F.runTransaction'));
});

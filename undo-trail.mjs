// Keep history pointers only; the immutable before-images live in Firestore.
const LIMIT=30;
const valid=p=>p&&Number.isSafeInteger(p.rev)&&p.rev>0&&typeof p.id==='string'&&/^[A-Za-z0-9]{20}$/.test(p.id);
export const sameHead=(p,q)=>Boolean(valid(p)&&valid(q)&&p.rev===q.rev&&p.id===q.id);
export const pointer=d=>d?{id:d.changeId,rev:d.rev}:null;
const undoable=label=>Boolean(label&&!/^(?:초기 배치 공동 저장|내 마지막 변경 취소|한 단계 되돌리기)/.test(label));
export function trailAt(journal,remote,uid){
 const head=pointer(remote);
 if(!valid(head)||remote.updatedBy!==uid)return [];
 if(sameHead(journal?.head,head)&&Array.isArray(journal.items)&&journal.items.length<=LIMIT&&journal.items.every(valid))return journal.items.slice();
 // Supports the latest edit made from this browser before this version was deployed.
 return undoable(remote.lastAction)?[head]:[];
}
export function advanceTrail(journal,previous,next,uid,kind){
 const items=trailAt(journal,previous,uid);
 if(kind==='undo')items.pop();
 else if(kind==='edit')items.push(pointer(next));
 else items.length=0;
 return {head:pointer(next),items:items.slice(-LIMIT)};
}

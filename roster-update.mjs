// One-time Nov 12 roster correction. Preview only: the caller must supply an
// authorized transaction and must capture a history record alongside any write.
export const ROSTER_ACTION = '사진기사 2석을 추가 참석자 2석으로 변경';
const replacements = [
  {oldId:'r261109-228', oldName:'정연호', newId:'r261109-132', newName:'정진희'},
  {oldId:'r261109-229', oldName:'유부강', newId:'r261109-188', newName:'최은재'}
];
const compact = value => String(value ?? '').normalize('NFC').replace(/\s+/g,'');
const studio = '제이크이미지연구소';
const clone = value => structuredClone(value);
function conflict(name) {
  throw Error(name+' 님의 기존 배정 또는 동명이인을 확인해야 합니다. 좌석은 변경하지 않았습니다.');
}
export function prepareRosterRevision(raw) {
  if(!raw || raw.version!==1 || !Number.isSafeInteger(raw.rev) || raw.rev<0 ||
      !Array.isArray(raw.tables) || !Array.isArray(raw.attendees)) {
    throw Error('기존 공동 좌석표를 확인할 수 없습니다. 먼저 현재 배치를 확인해 주세요.');
  }
  const before=clone({version:raw.version,rev:raw.rev,tables:raw.tables,attendees:raw.attendees});
  const next=clone(before);
  const people=next.attendees;
  const ids=new Set(people.map(p=>p.id)), tableIds=new Set(next.tables.map(t=>t.id));
  if(ids.size!==people.length)throw Error('중복된 참석자 ID가 있습니다. 현재 배치를 확인해 주세요.');
  const hasSeat = p => p.tableId != null && tableIds.has(p.tableId) && Number.isFinite(p.order);
  let changes=0;
  for(const {oldId,oldName,newId,newName} of replacements) {
    const originalId=people.find(p=>p.id===oldId), newCanonical=people.find(p=>p.id===newId);
    const namedOriginal=people.filter(p=>compact(p.name)===oldName);
    const incoming=people.filter(p=>compact(p.name)===newName);
    if(namedOriginal.length>1 || incoming.length>1 || (newCanonical && compact(newCanonical.name)!==newName) ||
       (originalId && ![oldName,newName].includes(compact(originalId.name)))) conflict(newName);
    const old=namedOriginal[0], added=incoming[0];
    // For imports with regenerated IDs, require the source name AND studio.
    if(old && (old.id!==oldId && compact(old.affiliation)!==studio || !hasSeat(old)))conflict(oldName);
    if(added) {
      if(!hasSeat(added) || (old && old!==added) || (originalId && originalId!==added))conflict(newName);
      // Already correctly assigned: preserve subsequent seat/affiliation edits.
      // If manually renamed on the photographer's record, separate the identities.
      if(added.id===oldId) {
        added.id=newId;
        if(!compact(added.affiliation) || compact(added.affiliation)===studio)added.affiliation='교실원';
        changes++;
      }
      continue;
    }
    if(!old)conflict(oldName);
    Object.assign(old,{id:newId,name:newName,affiliation:'교실원'}); // keep latest tableId and order
    changes++;
  }
  if(changes)next.rev++;
  return {status:changes?'applied':'unchanged',before,next};
}

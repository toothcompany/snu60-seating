// Preview only. The caller checks an immutable audit marker in its authenticated
// transaction, then commits the precise before image, next plan, and marker atomically.
import {membersAt} from './core.mjs';
import {numberedLayout} from './table-grid.mjs';
export const ROSTER_ACTION='추가 참석자·촬영 인원 구분, 신종학·백인채 별도 좌석 및 예비석 반영';
export const SPARE_CHAIRS=2;
const pairs=[
 ['r261109-228','정연호','r261109-132','정진희'],
 ['r261109-229','유부강','r261109-188','최은재'],
];
const affStudio='제이크 이미지 연구소', compact=s=>String(s??'').normalize('NFC').replace(/\s+/g,'');
const fail=s=>{throw Error(s+' 공동 좌석표를 확인해 주세요. 다른 변경은 저장하지 않았습니다.');};
const clone=v=>structuredClone(v);
export function prepareRosterRevision(raw) {
 if(!raw||raw.version!==1||!Number.isSafeInteger(raw.rev)||raw.rev<0||!Array.isArray(raw.tables)||!Array.isArray(raw.attendees))fail('현재 배치를 읽을 수 없습니다.');
 const {version,rev,tables,attendees}=raw;
 const before=clone({version,rev,tables,attendees}),next=clone(before),people=next.attendees;
 if(new Set(people.map(x=>x.id)).size!==people.length)fail('참석자 ID가 중복됩니다.');
 // This validates the model and maps movable table IDs to displayed numbers.
 // Never write this normalized representation back over unrelated customizations.
 const physical=numberedLayout(next), tableById=new Map(next.tables.map(t=>[t.id,t]));
 const findN=name=>{const rows=people.filter(x=>compact(x.name)===compact(name));if(rows.length>1)fail(name+' 동명이인이 있습니다.');return rows[0];};
 const findId=id=>people.find(x=>x.id===id);
 const checkId=(id,names)=>{const p=findId(id);if(p&&!names.includes(compact(p.name)))fail(p.name+' 님과 출석부 ID가 충돌합니다.');};
 const isSeated=p=>Boolean(p&&tableById.has(p.tableId)&&Number.isFinite(p.order));
 const offOrder=()=>Math.max(-1,...people.filter(p=>p.tableId==null).map(p=>Number.isFinite(p.order)?p.order:-1))+1;
 for(const [oldId,oldName,newId,newName] of pairs){
  checkId(oldId,[oldName,newName]);checkId(newId,[newName]);
  let old=findN(oldName),incoming=findN(newName);
  if(old && old.id!==oldId && compact(old.affiliation)!==compact(affStudio))fail(oldName+' 님의 촬영 인원 여부가 불분명합니다.');
  if(incoming?.id===oldId){if(findId(newId))fail(newName+' 님의 ID가 중복됩니다.');incoming.id=newId;
   if(!compact(incoming.affiliation)||compact(incoming.affiliation)===compact(affStudio))incoming.affiliation='교실원';}
  if(!old&&!incoming)fail(oldName+' 님의 자리와 '+newName+' 님의 배정을 찾을 수 없습니다.');
  // v1 removed photographers from the roster entirely. Restore only when the
  // corresponding new guest already exists, never guess an unknown seat.
  if(!old){old={id:oldId,name:oldName,affiliation:affStudio,tableId:null,order:offOrder()};people.push(old);}
  if(!incoming){if(!isSeated(old))fail(newName+' 님이 이어받을 촬영석이 없습니다.');
   incoming={id:newId,name:newName,affiliation:'교실원',tableId:null,order:0};people.push(incoming);}
  if(!isSeated(incoming)){
   if(!isSeated(old))fail(newName+' 님의 만찬 좌석을 찾을 수 없습니다.');
   incoming.tableId=old.tableId;incoming.order=old.order;
  }
  if(old.tableId!=null){const ord=offOrder();old.tableId=null;old.order=ord;}
 }
 checkId('r261109-194',['백인채']);checkId('r261109-227',['신종학']);
 const baek=findN('백인채'),shin=findN('신종학');
 if(!baek||!shin)fail('신종학 또는 백인채 님의 기존 명단 행이 없습니다.');
 if(!isSeated(baek)&&!isSeated(shin))fail('신종학·백인채 님을 배정할 기준 자리를 찾을 수 없습니다.');
 const adjacent=(p,anchor)=>{
  const list=membersAt(next,anchor.tableId),i=list.findIndex(x=>x.id===anchor.id),after=list[i+1];
  p.tableId=anchor.tableId;p.order=after?(anchor.order+after.order)/2:anchor.order+1;
  // Degenerate imported order values: resolve ties in this table only.
  if(!Number.isFinite(p.order)||p.order<=anchor.order||after&&p.order>=after.order){list.splice(i+1,0,p);list.forEach((a,k)=>a.order=k);}
 };
 if(!isSeated(shin))adjacent(shin,baek);
 else if(!isSeated(baek))adjacent(baek,shin);
 const fitting=new Set([shin.tableId,baek.tableId]);
 for(const tid of fitting){const t=tableById.get(tid),count=membersAt(next,tid).length;if(count>30)fail('해당 테이블 정원이 30석을 초과합니다.');t.capacity=Math.max(t.capacity,count);}
 // Spare chairs are *additional* physical places, not a target headcount.
 // Existing vacancies anywhere count; never shrink or refill human-managed seats.
 let room=next.tables.reduce((s,t)=>s+Math.max(0,t.capacity-membersAt(next,t.id).length),0);
 const candidates=physical.tables.slice().sort((a,b)=>b.number-a.number).map(t=>tableById.get(t.id));
 const preferred=[...candidates.filter(t=>!fitting.has(t.id)),...candidates.filter(t=>fitting.has(t.id))];
 for(let pass=0;pass<SPARE_CHAIRS&&room<SPARE_CHAIRS;pass++){
  for(const t of preferred){if(room>=SPARE_CHAIRS)break;const count=membersAt(next,t.id).length;
   // First use tables without a spare, then allow a second extra at a sole table.
   if(t.capacity<count||t.capacity>=30||pass===0&&t.capacity>count)continue;t.capacity++;room++;
  }
 }
 if(room<SPARE_CHAIRS)fail('예비석을 확보할 수 없습니다.');
 const changed=JSON.stringify(before)!==JSON.stringify(next);
 if(changed)next.rev++;
 return {status:changed?'applied':'unchanged',before,next};
}

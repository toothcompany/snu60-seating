import {WIDTH,HEIGHT,copy,normalize,membersAt,occupancy,personSignature,rowsToState,parseCsv,toCsv} from './core.mjs';
import {fixedHall,dropTableAt} from './table-grid.mjs';
import {firebaseConfig} from './firebase-config.js';
import {publishedPlan,DISPLAY_NOTES} from './public-plan.mjs?v=1112-seating102';
import {SHARED_DOCUMENT,editorRole,googleMemberEmail,mayEdit,startingState,prepareChange,connectionError} from './guest-policy.mjs?v=google-roles1';
import {editingWindowOpen} from './temporary-access.mjs';

import {pointer,sameHead,trailAt,advanceTrail} from './undo-trail.mjs';

const $=id=>document.getElementById(id);
const make=(tag,cls,text)=>{const e=document.createElement(tag);if(cls)e.className=cls;if(text!=null)e.textContent=text;return e;};
const seed=publishedPlan();
let state=startingState(null,seed),db=null,F=null,unsubscribe=null;
let connected=false,pending=false,existsOnServer=false,zoom=.55,drag=null,serverHead=null,epoch=0,connecting=false;
let app=null,A=null,auth=null,user=null,role=null,roleState='signed-out',stopMember=null,authEpoch=0,signing=false,authLoading=false,redirectOffered=false;
let toastTimer,waitTimer,formAction=null;
const hasStaff=()=>Boolean(user&&editorRole(role));
const editable=()=>editingWindowOpen()&&mayEdit({user,role,connected,pending,online:navigator.onLine});
const canSeeHistory=()=>hasStaff()&&connected&&navigator.onLine;
const journalKey=()=>user?'snu60-undo-v1:'+SHARED_DOCUMENT+':'+user.uid:null;
let journal=null;
function loadJournal(){journal=null;try{const k=journalKey();if(k)journal=JSON.parse(sessionStorage.getItem(k));}catch{}}
const undoItems=()=>hasStaff()?trailAt(journal,serverHead,user.uid):[];
function keepJournal(next){journal=next;try{const k=journalKey();if(k)sessionStorage.setItem(k,JSON.stringify(next));}catch{}}
function status(text,kind=''){ $('status').textContent=text;$('status').className='status '+kind; }
function toast(text){$('toast').textContent=text;$('toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').hidden=true,8000);}
function syncButtons(){
 const staff=hasStaff(),edit=editable();document.body.classList.toggle('canEdit',edit);
 $('editTools').hidden=!staff||!editingWindowOpen();$('editHelp').hidden=!edit;$('unassigned').hidden=!edit;
 document.querySelectorAll('[data-edit]').forEach(b=>b.disabled=!edit);
 const steps=undoItems().length; $('undo').disabled=!editable()||!steps;
 $('undo').title=steps?`내 변경을 한 단계 되돌립니다 (남은 ${steps}단계 · ⌘Z / Ctrl+Z)`:'이 브라우저에서 연속으로 저장한 변경이 있을 때 사용할 수 있습니다.';$('publish').disabled=!editable()||existsOnServer;
 $('reconnect').hidden=connected&&Boolean(auth)&&roleState!=='error';$('reconnect').disabled=pending||connecting||authLoading;
 $('history').hidden=!staff;$('history').disabled=!canSeeHistory()||pending;
 $('login').hidden=Boolean(user);$('login').disabled=!auth||signing||authLoading;
 $('loginRedirect').hidden=Boolean(user)||!redirectOffered;$('loginRedirect').disabled=!auth||signing;
 $('manageAccess').hidden=role!=='admin';$('logout').hidden=!user;$('logout').disabled=signing||pending;
 const accountRole=roleState==='checking'?'권한 확인 중':staff?(role==='admin'?'관리자':'편집자'):'보기 전용';
 $('accountLabel').textContent=user?`${user.email||'로그인 계정'} · ${accountRole}`:'로그인 없이 보기';
}
function connectionStatus(){
 if(!editingWindowOpen()){status('공동 편집 기간이 끝났습니다. 좌석표를 보거나 저장할 수 있습니다.','wait');return;}
 const display=existsOnServer?`공동 좌석표 · 변경 ${state.rev}`:'기본 좌석 배치';
 status(hasStaff()?`${display} · 편집할 수 있습니다.`:`${display} · 보기 전용`,'ok');
}
function setZoom(v){zoom=Math.max(.2,Math.min(1.5,v));$('world').style.transform=`scale(${zoom})`;$('sizer').style.width=WIDTH*zoom+'px';$('sizer').style.height=HEIGHT*zoom+'px';$('zoomLabel').textContent=Math.round(zoom*100)+'%';}
function fit(){setZoom(($('viewport').clientWidth-16)/WIDTH);}
function render(){
 syncButtons();$('tables').replaceChildren();
 const assigned=state.attendees.filter(a=>a.tableId!==null).length,capacity=state.tables.reduce((n,t)=>n+t.capacity,0);
 const empty=state.tables.reduce((n,t)=>n+Math.max(0,-occupancy(state,t).delta),0);
 const excess=state.tables.reduce((n,t)=>n+Math.max(0,occupancy(state,t).delta),0);
 $('summary').textContent=`전체 참석 ${state.attendees.length}명 · 만찬 배정 ${assigned}명 / ${capacity}석 · 빈자리 ${empty}석 · 만찬 미배정 ${state.attendees.length-assigned}명`+(excess?` · 정원 초과 ${excess}명`:'');
 const previous=$('filter').value;$('filter').replaceChildren(new Option('모든 테이블','all'),new Option('만찬 미배정','none'));
 for(const t of state.tables.slice().sort((a,b)=>a.number-b.number))$('filter').add(new Option(`${t.number}번 (${membersAt(state,t.id).length}/${t.capacity})`,t.id));
 $('filter').value=Array.from($('filter').options).some(o=>o.value===previous)?previous:'all';
 for(const t of state.tables.slice().sort((a,b)=>a.number-b.number)){
  const group=make('div','tableGroup');group.dataset.tid=t.id;group.style.left=t.x+'px';group.style.top=t.y+'px';
  const occ=occupancy(state,t),disc=make('button',`tableDisc ${occ.kind} ${t.number<=3?'vip':''}`);disc.type='button';disc.dataset.tableHandle=t.id;
  disc.title=!editable()?'테이블 좌석 정보 보기':fixedHall(state)?'다른 테이블에 놓아 두 명단 교환 · 클릭해서 정원 수정':'끌어서 테이블과 명단 함께 이동 · 클릭해서 정원 수정';disc.setAttribute('aria-label',`${t.number}번 테이블, ${occ.count}명, 정원 ${t.capacity}명`);
  disc.append(make('strong','',t.number+'번'),make('span','count',`${occ.count} / ${t.capacity}명`),make('small','',occ.delta>0?`${occ.delta}명 초과`:occ.delta<0?`${-occ.delta}석 여유`:'정원 일치'));group.append(disc);
  const people=membersAt(state,t.id),vacancies=Math.max(0,t.capacity-people.length),drawEmpty=Math.min(vacancies,3);
  // Up to three visible empty-seat markers. Very large capacities remain legible;
  // remaining empty chairs are counted together on the final marker.
  const slots=people.length+drawEmpty,radius=slots>12?174:151;
  people.forEach((a,i)=>{
   const rad=(-90+i*360/slots)*Math.PI/180,b=make('button','seat'+(a.name.length>10?' long':''));b.type='button';b.dataset.aid=a.id;b.style.left=(Math.cos(rad)*radius-71)+'px';b.style.top=(Math.sin(rad)*radius-19.5)+'px';
   b.title=`${a.name} · ${a.affiliation||'소속 미입력'} · ${t.number}번 ${i+1}석`;b.append(make('span','num',i+1),make('span','name',a.name));group.append(b);
  });
  for(let j=0;j<drawEmpty;j++){
   const i=people.length+j,rad=(-90+i*360/slots)*Math.PI/180,remaining=vacancies-j;
   const e=make('span','vacant');e.style.left=(Math.cos(rad)*radius-63)+'px';e.style.top=(Math.sin(rad)*radius-18)+'px';
   const grouped=j===drawEmpty-1&&remaining>1;
   if(!grouped)e.append(make('small','',i+1));
   e.append(document.createTextNode(grouped?`빈자리 ${remaining}석`:'빈자리'));
   group.append(e);
  }
  $('tables').append(group);
 }
 renderPeople();
}
function unseatedBadge(a){
 const name=String(a.name).normalize('NFC').trim(),studio=String(a.affiliation||'').normalize('NFC').replace(/\s+/g,'');
 return ['정연호','유부강'].includes(name)&&studio==='제이크이미지연구소'?'촬영 · 좌석 없음':'만찬 미배정';
}
function renderPeople(){
 $('people').replaceChildren();const q=$('search').value.trim().toLowerCase(),filter=$('filter').value;
 const list=state.attendees.filter(a=>(filter==='all'||(filter==='none'?a.tableId===null:a.tableId===filter))&&(!q||`${a.name} ${a.affiliation}`.toLowerCase().includes(q))).sort((a,b)=>a.name.localeCompare(b.name,'ko'));
 $('rosterCount').textContent=state.attendees.length;
 for(const a of list){const b=make('button','personRow');b.type='button';b.dataset.aid=a.id;const info=make('span','info');info.append(make('strong','',a.name),make('small','',a.affiliation||'소속 미입력'));const t=state.tables.find(t=>t.id===a.tableId),seat=t?membersAt(state,t.id).findIndex(x=>x.id===a.id)+1:null;b.append(info,make('span',t?'badge':'badge staffNoSeat',t?`${t.number}번 · ${seat}석`:unseatedBadge(a)));$('people').append(b);}
 if(!list.length)$('people').append(make('p','muted','조건에 맞는 참석자가 없습니다.'));
}
async function mutate(operation,label,kind='edit'){
 if(!editable()){toast(editingWindowOpen()?'편집하려면 승인된 계정과 서버 연결이 필요합니다.':'공동 편집 기간이 끝났습니다.');return false;}
 const actor=user.uid,session=authEpoch;
 pending=true;syncButtons();status('공동 저장 중… 서버의 확인 전에는 창을 닫지 마세요.','wait');
 waitTimer=setTimeout(()=>{if(pending)status('서버 응답 확인 중 — 아직 저장 완료가 아닙니다.','wait');},12000);
 try{
  const ref=F.doc(db,SHARED_DOCUMENT),historyRef=F.doc(F.collection(ref,'history'));
  const result=await F.runTransaction(db,async tx=>{
   const snapshot=await tx.get(ref),previous=snapshot.exists()?snapshot.data():null,base=startingState(previous,seed);
   if(kind==='initial'&&snapshot.exists())throw Error('이미 저장된 좌석표가 있습니다. 기존 배치를 유지합니다.');
   let op=operation;
   if(kind==='undo'){
    if(!sameHead(pointer(previous),operation.head)||previous.updatedBy!==actor)throw Error('다른 변경이 먼저 저장되어 되돌릴 수 없습니다. 최신 배치를 유지합니다.');
    const h=await tx.get(F.doc(ref,'history',operation.target.id)),entry=h.exists()?h.data():null;
    if(!entry||entry.by!==actor||entry.rev!==operation.target.rev||entry.before?.rev!==entry.rev-1)throw Error('되돌릴 변경 이력을 확인하지 못했습니다.');
    op={type:'replace',expectedRev:previous.rev,value:entry.before};
   }
   const change=prepareChange(base,op,previous??base);
   if(session!==authEpoch||user?.uid!==actor||!hasStaff()||!editingWindowOpen())throw Error('편집 권한이 바뀌었습니다. 좌석표를 다시 확인해 주세요.');
   const head={rev:change.next.rev,changeId:historyRef.id,lastAction:label,updatedBy:actor};
   tx.set(ref,{...change.next,updatedAt:F.serverTimestamp(),updatedBy:actor,lastAction:label.slice(0,160),changeId:historyRef.id});
   tx.set(historyRef,{before:change.before,rev:change.next.rev,action:label.slice(0,160),by:actor,at:F.serverTimestamp()});
   return {...change,previous,head};
  },{maxAttempts:3});
  if(session!==authEpoch||user?.uid!==actor||!hasStaff())return false;
  keepJournal(advanceTrail(journal,result.previous,result.head,actor,kind));
  if(state.rev<=result.next.rev){state=result.next;serverHead=result.head;}existsOnServer=true;
  if(undoItems().length)armBack();
  if(kind==='undo')toast('바로 전 배치로 되돌리고 공동 저장했습니다.');
  status(`공동 저장 완료 · 변경 ${result.next.rev} · ${new Date().toLocaleTimeString('ko-KR')}`,'ok');return true;
 }catch(error){status('저장 실패 — 이 변경은 서버에 반영되지 않았습니다.','error');toast(editingWindowOpen()?connectionError(error):'공동 편집 기간이 끝났습니다.');return false;}
 finally{clearTimeout(waitTimer);pending=false;render();}
}
function openEditor(title){$('save').textContent='저장';$('editorTitle').textContent=title;$('editorFields').replaceChildren();$('remove').hidden=true;$('save').hidden=!editable();$('editor').showModal();}
function field(label,value,type='text'){const id='f'+Math.random().toString(36).slice(2),l=make('label','',label),i=make('input');l.htmlFor=id;i.id=id;i.type=type;i.value=value??'';$('editorFields').append(l,i);return i;}
function tableSelect(value,label='배정 테이블'){const id='s'+Math.random().toString(36).slice(2),l=make('label','',label),s=make('select');l.htmlFor=id;s.id=id;s.add(new Option('미배정',''));for(const t of state.tables.slice().sort((a,b)=>a.number-b.number))s.add(new Option(`${t.number}번 · ${membersAt(state,t.id).length}/${t.capacity}명`,t.id));s.value=value??'';$('editorFields').append(l,s);return s;}
function editPerson(id){
 const a=state.attendees.find(a=>a.id===id);if(!a)return;const expected=personSignature(a);openEditor('참석자 · '+a.name);
 const name=field('성명',a.name),affiliation=field('소속',a.affiliation),target=tableSelect(a.tableId);name.maxLength=80;name.required=true;affiliation.maxLength=200;[name,affiliation,target].forEach(e=>e.disabled=!editable());
 formAction=async()=>{if(!name.value.trim())return;if(await mutate({type:'editPerson',id,expected,name:name.value.trim(),affiliation:affiliation.value.trim(),tableId:target.value||null},'참석자 정보·배정 변경'))$('editor').close();};
 $('remove').hidden=!editable();$('remove').onclick=async()=>{if(confirm(`${a.name} 님을 명단에서 삭제할까요?`)&&await mutate({type:'removePerson',id,expected},'참석자 삭제'))$('editor').close();};
}
function addPerson(){if(!editable())return;openEditor('참석자 추가');const name=field('성명',''),aff=field('소속',''),target=tableSelect(null);name.required=true;name.maxLength=80;aff.maxLength=200;
 formAction=async()=>{if(!name.value.trim())return;const person={id:crypto.randomUUID(),name:name.value.trim(),affiliation:aff.value.trim(),tableId:target.value||null};if(await mutate({type:'addPerson',person},'참석자 추가'))$('editor').close();};
}
function capacityFields(host,t){
 const label=make('label','','테이블 정원 (1~30석)'),row=make('div','capacityStep'),cap=make('input');
 cap.id='capacityInput';cap.type='number';cap.inputMode='numeric';cap.step='1';cap.min='1';cap.max='30';cap.required=true;
 cap.value=t.capacity;cap.disabled=!editable();label.htmlFor=cap.id;
 const minus=make('button','','−'),plus=make('button','','＋');
 for(const [button,by,text] of [[minus,-1,'정원 1석 줄이기'],[plus,1,'정원 1석 늘리기']]){
  button.type='button';button.setAttribute('aria-label',text);button.title=text;
  button.onclick=()=>{if(editable()){const current=Number(cap.value);cap.value=Math.min(30,Math.max(1,(Number.isInteger(current)&&current>=1&&current<=30?current:t.capacity)+by));update();}};
 }
 const note=make('p','capacityDetails');note.id='capacityProjection';note.setAttribute('aria-live','polite');cap.setAttribute('aria-describedby',note.id);
 function update(){const val=Number(cap.value),n=membersAt(state,t.id).length,valid=cap.value!==''&&Number.isInteger(val)&&val>=1&&val<=30;
  minus.disabled=!editable()||(valid&&val<=1);plus.disabled=!editable()||(valid&&val>=30);
  note.className='capacityDetails'+(valid?(val<n?' over':val>n?' under':''):'');
  note.textContent=valid?`현재 배정 ${n}명 · 정원 ${val}석 → `+(val>n?`빈자리 ${val-n}석`:val<n?`${n-val}명 초과 (기존 배정은 유지됩니다)`:'빈자리 없음'):'1부터 30까지 정수로 입력하세요.';
 }
 cap.oninput=update;row.append(minus,cap,plus);host.append(label,row,note);update();return cap;
}
async function saveCapacity(t,cap){
 if(!editable()||!cap.reportValidity())return;
 const n=Number(cap.value);if(n===t.capacity){$('editor').close();return;}
 if(await mutate({type:'capacity',id:t.id,capacity:n,expectedCapacity:t.capacity},`${t.number}번 테이블 정원 ${t.capacity}→${n}석`))$('editor').close();
}
function chooseCapacity(){
 if(!editable())return;openEditor('테이블 정원 조정');$('save').textContent='정원 저장';
 const host=$('editorFields'),l=make('label','','조정할 테이블'),sel=make('select');sel.id='capacityTable';l.htmlFor=sel.id;
 for(const t of state.tables.slice().sort((a,b)=>a.number-b.number))sel.add(new Option(`${t.number}번 테이블 · 배정 ${membersAt(state,t.id).length}명 / ${t.capacity}석`,t.id));
 const selected=$('filter').value;if(Array.from(sel.options).some(o=>o.value===selected))sel.value=selected;
 const area=make('div');host.append(l,sel,area);
 const show=()=>{const t=state.tables.find(t=>t.id===sel.value);area.replaceChildren();if(!t){formAction=null;return;}const cap=capacityFields(area,t);formAction=()=>saveCapacity(t,cap);};
 sel.onchange=show;show();sel.focus();
}
$('capacityTool').onclick=chooseCapacity;
function editTable(id){
 const t=state.tables.find(t=>t.id===id);if(!t)return;const expectedRev=state.rev;openEditor(`${t.number}번 테이블`);
 const cap=capacityFields($('editorFields'),t);const swap=tableSelect(null,'테이블 전체 위치 교환');for(const option of Array.from(swap.options))if(option.value===id)option.remove();swap.options[0].text='교환할 테이블 선택';
 const b=make('button','','선택한 테이블과 위치 교환');b.type='button';b.disabled=!editable();swap.disabled=!editable();$('editorFields').append(b,make('p','muted',fixedHall(state)?'번호는 위치에 고정됩니다. 두 테이블의 참석자와 정원이 좌석 순서 그대로 자리를 바꿉니다.':'두 테이블의 위치를 명단과 함께 교환합니다.'));
 b.onclick=async()=>{if(!swap.value){toast('교환할 테이블을 선택하세요.');return;}if(await mutate({type:'swapTables',id,otherId:swap.value,expectedRev},'테이블 위치 교환'))$('editor').close();};
 formAction=()=>saveCapacity(t,cap);
}
$('editForm').onsubmit=async e=>{e.preventDefault();if(!editable())return;try{await formAction?.();}catch(error){toast(connectionError(error));}};$('cancel').onclick=()=>$('editor').close();$('add').onclick=addPerson;
function clickTarget(node){const a=node.closest('[data-aid]'),t=node.closest('[data-table-handle]');if(a)editPerson(a.dataset.aid);else if(t)editTable(t.dataset.tableHandle);}
let suppressClickUntil=0;
for(const host of [$('tables'),$('people')]){
 host.addEventListener('click',e=>{if(Date.now()<suppressClickUntil)return;clickTarget(e.target);});
 host.addEventListener('pointerdown',pointerDown);
}
function pointerDown(e){
 if(e.button!==0||drag||!editable())return;const a=e.target.closest('[data-aid]'),t=e.target.closest('[data-table-handle]');if(!a&&!t)return;
 const id=a?a.dataset.aid:t.dataset.tableHandle,source=a?state.attendees.find(p=>p.id===id):state.tables.find(t=>t.id===id);if(!source)return;
 drag={type:a?'person':'table',id,source:copy(source),rev:state.rev,startX:e.clientX,startY:e.clientY,lastX:e.clientX,lastY:e.clientY,pointerId:e.pointerId,node:a||t,active:false,ghost:null};
 drag.node.setPointerCapture?.(e.pointerId);
}
function hitTarget(x,y){
 const el=document.elementFromPoint(x,y);if(el?.closest('#unassigned'))return {unassigned:true};
 const p=el?.closest('#tables [data-aid]');if(p&&p.dataset.aid!==drag?.id)return {person:p.dataset.aid};
 const viewport=$('viewport').getBoundingClientRect();if(x<viewport.left||x>viewport.right||y<viewport.top||y>viewport.bottom)return {};
 const r=$('world').getBoundingClientRect(),wx=(x-r.left)/zoom,wy=(y-r.top)/zoom;
 const nearest=state.tables.map(t=>({t,d:Math.hypot(t.x-wx,t.y-wy)})).sort((a,b)=>a.d-b.d)[0];return nearest?.d<210?{table:nearest.t.id}:{};
}
function clearTarget(){document.querySelectorAll('.dropTarget').forEach(e=>e.classList.remove('dropTarget'));}
function pointerMove(e){
 if(!drag||drag.pointerId!==e.pointerId)return;drag.lastX=e.clientX;drag.lastY=e.clientY;
 if(!drag.active&&Math.hypot(e.clientX-drag.startX,e.clientY-drag.startY)<7)return;
 if(!drag.active){drag.active=true;document.body.classList.add('dragActive');if(drag.type==='person'){drag.node.classList.add('dragging');drag.node.style.pointerEvents='none';drag.ghost=make('div','ghost',drag.source.name);document.body.append(drag.ghost);}}
 if(drag.type==='person'){
  drag.ghost.style.left=e.clientX+'px';drag.ghost.style.top=e.clientY+'px';clearTarget();const h=hitTarget(e.clientX,e.clientY);
  if(h.unassigned)$('unassigned').classList.add('dropTarget');else if(h.table)document.querySelector(`[data-table-handle="${CSS.escape(h.table)}"]`)?.classList.add('dropTarget');
 }else{
  const x=drag.source.x+(e.clientX-drag.startX)/zoom,y=drag.source.y+(e.clientY-drag.startY)/zoom;
  const g=document.querySelector(`[data-tid="${CSS.escape(drag.id)}"]`);
  if(g){g.style.left=x+'px';g.style.top=y+'px';}
  if(fixedHall(state)){clearTarget();const target=dropTableAt(state,x,y);if(target&&target!==drag.id)document.querySelector(`[data-table-handle="${CSS.escape(target)}"]`)?.classList.add('dropTarget');}
 }
 e.preventDefault();
}
function finishDrag(){if(!drag)return;drag.ghost?.remove();drag.node.classList.remove('dragging');drag.node.style.pointerEvents='';try{drag.node.releasePointerCapture?.(drag.pointerId);}catch{}drag=null;clearTarget();document.body.classList.remove('dragActive');}
async function pointerUp(e){
 if(!drag||drag.pointerId!==e.pointerId)return;const d=drag,hit=d.active&&d.type==='person'?hitTarget(e.clientX,e.clientY):{};finishDrag();
 if(!d.active)return;suppressClickUntil=Date.now()+350;
 if(e.type==='pointercancel'){render();return;}
 if(!editable()){render();toast('연결 또는 편집 기한을 확인하세요. 변경은 저장되지 않았습니다.');return;}
 if(d.type==='table'){
  const x=d.source.x+(e.clientX-d.startX)/zoom,y=d.source.y+(e.clientY-d.startY)/zoom;
  if(fixedHall(state)){
   const target=dropTableAt(state,x,y),v=$('viewport').getBoundingClientRect();
   if(!target||target===d.id||e.clientX<v.left||e.clientX>v.right||e.clientY<v.top||e.clientY>v.bottom){render();return;}
   await mutate({type:'swapTables',id:d.id,otherId:target,expectedRev:d.rev},'테이블 단체 자리 교환');
  }else await mutate({type:'tablePosition',id:d.id,fromX:d.source.x,fromY:d.source.y,x,y},'테이블 위치 이동');
  return;
 }
 const expected=personSignature(d.source);
 if(hit.person){const b=state.attendees.find(a=>a.id===hit.person);if(b)await mutate({type:'swapPeople',id:d.id,expected,otherId:b.id,otherExpected:personSignature(b)},'두 참석자 자리 교환');}
 else if(hit.unassigned||hit.table){const target=hit.unassigned?null:hit.table;if(target!==d.source.tableId)await mutate({type:'move',id:d.id,expected,tableId:target},'참석자 테이블 이동');else render();}
 else render();
}
window.addEventListener('pointermove',pointerMove,{passive:false});window.addEventListener('pointerup',pointerUp);window.addEventListener('pointercancel',pointerUp);
$('search').oninput=renderPeople;$('filter').onchange=renderPeople;$('zoomIn').onclick=()=>setZoom(zoom+.1);$('zoomOut').onclick=()=>setZoom(zoom-.1);$('fit').onclick=fit;
async function undoOne(){
 const target=undoItems().at(-1);
 if(!target||!editable())return false;
 return mutate({head:pointer(serverHead),target},'한 단계 되돌리기 · 변경 #'+target.rev,'undo');
}
$('undo').onclick=undoOne;
window.addEventListener('keydown',e=>{
 if(e.defaultPrevented||e.isComposing||e.repeat||!(e.metaKey||e.ctrlKey)||e.altKey||e.shiftKey||e.key.toLowerCase()!=='z')return;
 if(document.querySelector('dialog[open]')||e.target.closest?.('input,textarea,select,[contenteditable]:not([contenteditable="false"])')||!editable()||!undoItems().length)return;
 e.preventDefault();void undoOne();
});
// Only edits made on this page create a same-page Back entry. Normal navigation,
// refresh, and viewing the plan never silently write to the shared document.
const backTag='snu60SeatBackV1';
let armed=Boolean(history.state?.[backTag]==='edit');
function armBack(){
 if(armed)return;
 try{
  const canLeave=history.state?.[backTag]==='base'?history.state.snu60CanLeave:history.length>1;
  history.replaceState({...history.state,[backTag]:'base',snu60CanLeave:canLeave},'');
  history.pushState({...history.state,[backTag]:'edit'},'');armed=true;
 }catch{}
}
window.addEventListener('popstate',()=>{
 const previous=armed;armed=history.state?.[backTag]==='edit';
 if(!previous||history.state?.[backTag]!=='base')return;
 if(pending){armBack();toast('공동 저장 중입니다. 저장이 끝난 뒤 다시 시도해 주세요.');return;}
 if(!editable()||!undoItems().length){if(history.state?.snu60CanLeave)history.back();return;}
 $('backLeave').hidden=!history.state?.snu60CanLeave;
 const dialog=$('backDialog');if(!dialog.open)dialog.showModal();
});
$('backUndo').onclick=async()=>{$('backDialog').close();if(await undoOne()){if(undoItems().length)armBack();}else if(undoItems().length)armBack();};
$('backStay').onclick=()=>{$('backDialog').close();armBack();};
$('backDialog').addEventListener('cancel',()=>armBack());
$('backLeave').onclick=()=>{$('backDialog').close();if(history.state?.snu60CanLeave)history.back();};
$('publish').onclick=async()=>{if(existsOnServer||!editable())return;await mutate({type:'replace',expectedRev:0,value:state},'초기 배치 공동 저장','initial');};
function download(name,text,mime){const url=URL.createObjectURL(new Blob([text],{type:mime})),a=make('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),5000);}
$('export').onclick=()=>download(`snu60-shared-${new Date().toISOString().replaceAll(':','-')}.json`,JSON.stringify(normalize(state),null,2),'application/json');
$('csv').onclick=()=>download('snu60-shared.csv',toCsv(state),'text/csv;charset=utf-8');$('print').onclick=()=>window.print();
let xlsxLoader;
function loadXlsx(){if(window.XLSX)return Promise.resolve(window.XLSX);if(!xlsxLoader)xlsxLoader=new Promise((resolve,reject)=>{const s=make('script');s.src='https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js';s.onload=()=>resolve(window.XLSX);s.onerror=()=>{xlsxLoader=null;s.remove();reject(Error('엑셀 읽기에 실패했습니다. CSV 또는 JSON 파일을 사용하세요.'));};document.head.append(s);});return xlsxLoader;}
$('import').onclick=()=>{if(editable())$('file').click();};
$('file').onchange=async()=>{
 const file=$('file').files[0];$('file').value='';if(!file||!editable())return;if(file.size>5*1024*1024){toast('5MB 이하 파일을 사용하세요.');return;}
 try{const rev=state.rev;let next;
  if(/\.json$/i.test(file.name))next=normalize(JSON.parse(await file.text()));
  else if(/\.csv$/i.test(file.name))next=rowsToState(parseCsv(await file.text()),state);
  else if(/\.xlsx$/i.test(file.name)){const X=await loadXlsx(),book=X.read(await file.arrayBuffer(),{type:'array'}),sheet=book.Sheets['좌석별명단']||book.Sheets[book.SheetNames[0]];next=rowsToState(X.utils.sheet_to_json(sheet,{header:1,raw:false,defval:''}),state);}
  else throw Error('XLSX·CSV·JSON 파일을 사용하세요.');
  if(confirm(`${next.attendees.length}명의 이름·소속·좌석을 공개 공동 배치에 저장합니다. 현재 명단 전체가 교체됩니다. 계속할까요?`))await mutate({type:'replace',expectedRev:rev,value:next},'명단 파일 불러오기');
 }catch(error){toast(connectionError(error));}
};
$('history').onclick=async()=>{
 if(!canSeeHistory()||pending)return;const session=authEpoch;
 try{const q=F.query(F.collection(db,SHARED_DOCUMENT,'history'),F.orderBy('rev','desc'),F.limit(30)),snaps=await F.getDocs(q);
  if(session!==authEpoch||!canSeeHistory())return;$('historyList').replaceChildren();
  snaps.forEach(snapshot=>{const h=snapshot.data(),e=make('div','historyEntry',`#${h.rev} · ${h.action}`);e.append(make('small','',`${h.at?.toDate?.().toLocaleString('ko-KR')||'시간 확인 중'} · ${h.by===user.uid?'내 계정':String(h.by).startsWith('guest-')?'이전 공개 편집':'다른 운영진'}`));
   const b=make('button','','이 변경 직전으로 복원');b.type='button';b.disabled=!editable();b.onclick=async()=>{if(session!==authEpoch||!editable())return;const rev=state.rev;if(confirm(`변경 #${h.rev} 직전의 전체 배치로 되돌릴까요? 현재 배치는 새 이력으로 남습니다.`)&&await mutate({type:'replace',expectedRev:rev,value:h.before},'이전 배치 복원'))$('historyDialog').close();};e.append(b);$('historyList').append(e);
  });if(snaps.empty)$('historyList').append(make('p','muted','저장된 이력이 없습니다.'));$('historyDialog').showModal();
 }catch(error){if(session===authEpoch&&canSeeHistory())toast(connectionError(error));}
};$('historyClose').onclick=()=>$('historyDialog').close();

function watchShared(){
 const token=++epoch;unsubscribe?.();connected=false;syncButtons();
 unsubscribe=F.onSnapshot(F.doc(db,SHARED_DOCUMENT),{includeMetadataChanges:true},snapshot=>{
  if(token!==epoch)return;
  try{const incoming=startingState(snapshot.exists()?snapshot.data():null,seed);if(!snapshot.metadata.hasPendingWrites&&(!snapshot.metadata.fromCache||incoming.rev>=state.rev)){state=incoming;serverHead=snapshot.exists()?snapshot.data():null;}
   existsOnServer=snapshot.exists();connected=!snapshot.metadata.fromCache&&!snapshot.metadata.hasPendingWrites;
   if(!pending){if(connected)connectionStatus();else status('서버 확인 대기 — 아직 편집·저장할 수 없습니다.','wait');}
   if(!drag)render();else syncButtons();
  }catch(error){connected=false;status(connectionError(error),'error');syncButtons();}
 },error=>{if(token!==epoch)return;connected=false;status(connectionError(error),'error');syncButtons();});
}
function connect(){
 if(connecting||pending||!db||!F)return;
 status('최신 좌석표를 확인하고 있습니다.','wait');watchShared();
}
$('reconnect').onclick=()=>{if(!db){void initialize();return;}connect();if(!auth)void startAuth();else if(user)void updateUser(auth.currentUser);};
window.addEventListener('offline',()=>{connected=false;finishDrag();status('오프라인 — 공동 저장이 불가능하므로 편집을 잠갔습니다.','error');render();});
window.addEventListener('online',()=>{if(!pending)connect();});
window.addEventListener('beforeunload',e=>{if(pending){e.preventDefault();e.returnValue='';}});
for(const note of DISPLAY_NOTES)$('notesList').append(make('li','',note));
let previouslyOpen=editingWindowOpen();
setInterval(()=>{const open=editingWindowOpen();if(open!==previouslyOpen){previouslyOpen=open;finishDrag();if(!open&&$('editor').open)$('editor').close();if(!pending&&connected)connectionStatus();render();}},10000);
fit();render();
const sdk='https://www.gstatic.com/firebasejs/13.2.0/';
function clearPrivilegedUI(){
 finishDrag();formAction=null;
 for(const id of ['historyDialog','backDialog','editor'])if($(id).open)$(id).close();
 $('historyList').replaceChildren();$('editorFields').replaceChildren();$('remove').onclick=null;
}
function setRole(value,phase,message){
 const had=hasStaff();role=editorRole(value)?value:null;roleState=phase;
 if(had&&!hasStaff())clearPrivilegedUI();$('authMessage').textContent=message;
 if(connected&&!pending)connectionStatus();syncButtons();
}
async function updateUser(account){
 const token=++authEpoch;stopMember?.();stopMember=null;role=null;
 clearPrivilegedUI();user=account&&!account.isAnonymous?account:null;loadJournal();
 if(!user){setRole(null,'signed-out','');return;}
 redirectOffered=false;setRole(null,'checking','Google 계정의 편집 권한을 확인하고 있습니다.');
 try{
  const result=await A.getIdTokenResult(account);if(token!==authEpoch)return;
  const email=googleMemberEmail(account,result.claims);
  if(!email){setRole(null,'none','인증된 Google 계정으로 로그인해야 편집 권한을 확인할 수 있습니다.');return;}
  stopMember=F.onSnapshot(F.doc(db,'members',email),{includeMetadataChanges:true},snap=>{
   if(token!==authEpoch)return;
   if(snap.metadata.fromCache||snap.metadata.hasPendingWrites){setRole(null,'checking','서버에서 계정 권한을 확인하고 있습니다.');return;}
   const r=snap.exists()?snap.data()?.role:null;
   setRole(r,'ready',editorRole(r)?'':r==='viewer'?'이 계정은 조회 권한이 있습니다.':'이 계정은 조회만 가능합니다. 편집이 필요하면 준비위원회에 계정 승인을 요청해 주세요.');
  },err=>{if(token===authEpoch)setRole(null,'error','계정 권한을 확인하지 못했습니다. '+connectionError(err));});
 }catch(err){if(token===authEpoch)setRole(null,'error','계정 권한을 확인하지 못했습니다. '+connectionError(err));}
}
const redirectKey='snu60-google-redirect-pending';
function markRedirect(flag){try{if(flag)sessionStorage.setItem(redirectKey,'1');else sessionStorage.removeItem(redirectKey);}catch{}}
async function requestLogin(useRedirect){
 if(!auth||user||signing)return;signing=true;$('authMessage').textContent='';syncButtons();
 try{
  const provider=new A.GoogleAuthProvider();provider.setCustomParameters({prompt:'select_account'});
  if(useRedirect){markRedirect(true);await A.signInWithRedirect(auth,provider);}
  else await A.signInWithPopup(auth,provider);
 }catch(err){
  if(useRedirect)markRedirect(false);
  redirectOffered=['auth/popup-blocked','auth/popup-closed-by-user','auth/operation-not-supported-in-this-environment','auth/web-storage-unsupported'].includes(err?.code);
  $('authMessage').textContent=connectionError(err);
 }finally{signing=false;syncButtons();}
}
$('login').onclick=()=>void requestLogin(false);$('loginRedirect').onclick=()=>void requestLogin(true);
$('logout').onclick=async()=>{
 if(!auth||!user||pending||signing)return;
 signing=true;await updateUser(null);syncButtons();
 try{await A.signOut(auth);}catch(err){await updateUser(auth.currentUser);$('authMessage').textContent=connectionError(err);}
 finally{signing=false;syncButtons();}
};
async function startAuth(){
 if(auth||authLoading||!app)return;authLoading=true;syncButtons();
 try{
  A=await import(sdk+'firebase-auth.js');auth=A.getAuth(app);
  A.onAuthStateChanged(auth,u=>void updateUser(u),err=>{void updateUser(null);$('authMessage').textContent=connectionError(err);});
  let returning=false;try{returning=sessionStorage.getItem(redirectKey)==='1';}catch{}
  if(returning){markRedirect(false);try{const result=await A.getRedirectResult(auth);if(!result&&!auth.currentUser)$('authMessage').textContent='로그인이 완료되지 않았습니다. Safari 또는 Chrome에서 페이지를 열고 다시 시도해 주세요.';}catch(err){$('authMessage').textContent=connectionError(err);}}
 }catch(err){auth=null;$('authMessage').textContent='로그인 도구를 불러오지 못했습니다. 좌석표는 계속 볼 수 있습니다. 연결을 다시 시도해 주세요.';}
 finally{authLoading=false;syncButtons();}
}
async function initialize(){
 if(connecting)return;connecting=true;syncButtons();
 try{const [appModule,storeModule]=await Promise.all([import(sdk+'firebase-app.js'),import(sdk+'firebase-firestore.js')]);
  F=storeModule;app=appModule.getApps().length?appModule.getApp():appModule.initializeApp(firebaseConfig);db=F.getFirestore(app);
  connecting=false;connect();void startAuth();
 }catch(error){status('연결 도구를 불러오지 못했습니다. 초기 배치 보기만 가능하며 저장은 되지 않습니다.','error');toast(connectionError(error));}
 finally{connecting=false;syncButtons();}
}
initialize();

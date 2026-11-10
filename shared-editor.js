import {WIDTH,HEIGHT,copy,normalize,membersAt,occupancy,personSignature,rowsToState,parseCsv,toCsv} from './core.mjs';
import {firebaseConfig} from './firebase-config.js';
import {publishedPlan,DISPLAY_NOTES} from './public-plan.mjs';
import {SHARED_DOCUMENT,mayEdit,startingState,prepareChange,connectionError} from './guest-policy.mjs';

const $=id=>document.getElementById(id);
const make=(tag,cls,text)=>{const e=document.createElement(tag);if(cls)e.className=cls;if(text!=null)e.textContent=text;return e;};
const seed=publishedPlan();
let state=startingState(null,seed),user=null,auth=null,db=null,F=null,A=null,unsubscribe=null;
let connected=false,pending=false,existsOnServer=false,zoom=.55,drag=null,undo=null,epoch=0,connecting=false;
let toastTimer,waitTimer,formAction=null;
const editable=()=>mayEdit({user,connected,pending,online:navigator.onLine});
function status(text,kind=''){ $('status').textContent=text;$('status').className='status '+kind; }
function toast(text){$('toast').textContent=text;$('toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').hidden=true,8000);}
function syncButtons(){
 document.querySelectorAll('[data-edit]').forEach(b=>b.disabled=!editable());
 $('undo').disabled=!editable()||!undo;$('publish').disabled=!editable()||existsOnServer;
 $('reconnect').disabled=pending||connecting;$('history').disabled=!connected||!user;
 $('accountLabel').textContent=user?'방문자 연결 · '+user.uid.slice(0,6):'로그인 없이 보기';
}
function setZoom(v){zoom=Math.max(.2,Math.min(1.5,v));$('world').style.transform=`scale(${zoom})`;$('sizer').style.width=WIDTH*zoom+'px';$('sizer').style.height=HEIGHT*zoom+'px';$('zoomLabel').textContent=Math.round(zoom*100)+'%';}
function fit(){setZoom(($('viewport').clientWidth-16)/WIDTH);}
function render(){
 syncButtons();$('tables').replaceChildren();
 const assigned=state.attendees.filter(a=>a.tableId!==null).length,capacity=state.tables.reduce((n,t)=>n+t.capacity,0);
 $('summary').textContent=`${state.tables.length}개 테이블 · 배정 ${assigned}명 / ${capacity}석 · 미배정 ${state.attendees.length-assigned}명`;
 const previous=$('filter').value;$('filter').replaceChildren(new Option('모든 테이블','all'),new Option('미배정 / 학술행사만','none'));
 for(const t of state.tables.slice().sort((a,b)=>a.number-b.number))$('filter').add(new Option(`${t.number}번 (${membersAt(state,t.id).length}/${t.capacity})`,t.id));
 $('filter').value=Array.from($('filter').options).some(o=>o.value===previous)?previous:'all';
 for(const t of state.tables){
  const group=make('div','tableGroup');group.dataset.tid=t.id;group.style.left=t.x+'px';group.style.top=t.y+'px';
  const occ=occupancy(state,t),disc=make('button',`tableDisc ${occ.kind} ${t.number<=3?'vip':''}`);disc.type='button';disc.dataset.tableHandle=t.id;
  disc.title='끌어서 테이블과 명단 함께 이동 · 클릭해서 정원 수정';disc.setAttribute('aria-label',`${t.number}번 테이블, ${occ.count}명, 정원 ${t.capacity}명`);
  disc.append(make('strong','',t.number+'번'),make('span','count',`${occ.count} / ${t.capacity}명`),make('small','',occ.delta>0?`${occ.delta}명 초과`:occ.delta<0?`${-occ.delta}석 여유`:'정원 일치'));group.append(disc);
  const people=membersAt(state,t.id),slots=Math.max(t.capacity,people.length),radius=slots>12?174:151;
  people.forEach((a,i)=>{
   const rad=(-90+i*360/slots)*Math.PI/180,b=make('button','seat'+(a.name.length>10?' long':''));b.type='button';b.dataset.aid=a.id;b.style.left=(Math.cos(rad)*radius-71)+'px';b.style.top=(Math.sin(rad)*radius-19.5)+'px';
   b.title=`${a.name} · ${a.affiliation||'소속 미입력'} · ${t.number}번 ${i+1}석`;b.append(make('span','num',i+1),make('span','name',a.name));group.append(b);
  });$('tables').append(group);
 }
 renderPeople();
}
function renderPeople(){
 $('people').replaceChildren();const q=$('search').value.trim().toLowerCase(),filter=$('filter').value;
 const list=state.attendees.filter(a=>(filter==='all'||(filter==='none'?a.tableId===null:a.tableId===filter))&&(!q||`${a.name} ${a.affiliation}`.toLowerCase().includes(q))).sort((a,b)=>a.name.localeCompare(b.name,'ko'));
 $('rosterCount').textContent=state.attendees.length;
 for(const a of list){const b=make('button','personRow');b.type='button';b.dataset.aid=a.id;const info=make('span','info');info.append(make('strong','',a.name),make('small','',a.affiliation||'소속 미입력'));const t=state.tables.find(t=>t.id===a.tableId),seat=t?membersAt(state,t.id).findIndex(x=>x.id===a.id)+1:null;b.append(info,make('span','badge',t?`${t.number}번 · ${seat}석`:'미배정'));$('people').append(b);}
 if(!list.length)$('people').append(make('p','muted','조건에 맞는 참석자가 없습니다.'));
}
async function mutate(operation,label){
 if(!editable()){toast('아직 공동 저장이 연결되지 않았습니다. 저장 설정 안내를 확인하세요.');return false;}
 pending=true;syncButtons();status('공동 저장 중… 서버의 확인 전에는 창을 닫지 마세요.','wait');
 waitTimer=setTimeout(()=>{if(pending)status('서버 응답 확인 중 — 아직 저장 완료가 아닙니다.','wait');},12000);
 try{
  const actor=user.uid,ref=F.doc(db,SHARED_DOCUMENT),historyRef=F.doc(F.collection(ref,'history'));
  const result=await F.runTransaction(db,async tx=>{
   const snapshot=await tx.get(ref),base=startingState(snapshot.exists()?snapshot.data():null,seed),change=prepareChange(base,operation);
   tx.set(ref,{...change.next,updatedAt:F.serverTimestamp(),updatedBy:actor,lastAction:label.slice(0,160),changeId:historyRef.id});
   tx.set(historyRef,{before:change.before,rev:change.next.rev,action:label.slice(0,160),by:actor,at:F.serverTimestamp()});
   return change;
  },{maxAttempts:3});
  if(state.rev<=result.next.rev)state=result.next;existsOnServer=true;undo={before:result.before,rev:result.next.rev};
  status(`공동 저장 완료 · 변경 ${result.next.rev} · ${new Date().toLocaleTimeString('ko-KR')}`,'ok');return true;
 }catch(error){status('저장 실패 — 이 변경은 서버에 반영되지 않았습니다.','error');toast(connectionError(error));return false;}
 finally{clearTimeout(waitTimer);pending=false;render();}
}
function openEditor(title){$('editorTitle').textContent=title;$('editorFields').replaceChildren();$('remove').hidden=true;$('save').hidden=!editable();$('editor').showModal();}
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
function editTable(id){
 const t=state.tables.find(t=>t.id===id);if(!t)return;const expectedRev=state.rev;openEditor(`${t.number}번 테이블`);
 const cap=field('정원 (1~30명)',t.capacity,'number');cap.min=1;cap.max=30;cap.step=1;cap.disabled=!editable();const swap=tableSelect(null,'테이블 전체 위치 교환');for(const option of Array.from(swap.options))if(option.value===id)option.remove();swap.options[0].text='교환할 테이블 선택';
 const b=make('button','','선택한 테이블과 위치 교환');b.type='button';b.disabled=!editable();swap.disabled=!editable();$('editorFields').append(b,make('p','muted','번호와 명단을 유지하면서 두 테이블의 위치만 교환합니다.'));
 b.onclick=async()=>{if(!swap.value){toast('교환할 테이블을 선택하세요.');return;}if(await mutate({type:'swapTables',id,otherId:swap.value,expectedRev},'테이블 위치 교환'))$('editor').close();};
 formAction=async()=>{if(await mutate({type:'capacity',id,capacity:Number(cap.value),expectedCapacity:t.capacity},'테이블 정원 변경'))$('editor').close();};
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
 drag={type:a?'person':'table',id,source:copy(source),startX:e.clientX,startY:e.clientY,lastX:e.clientX,lastY:e.clientY,pointerId:e.pointerId,node:a||t,active:false,ghost:null};
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
 }else{const g=document.querySelector(`[data-tid="${CSS.escape(drag.id)}"]`);if(g){g.style.left=(drag.source.x+(e.clientX-drag.startX)/zoom)+'px';g.style.top=(drag.source.y+(e.clientY-drag.startY)/zoom)+'px';}}
 e.preventDefault();
}
function finishDrag(){if(!drag)return;drag.ghost?.remove();drag.node.classList.remove('dragging');drag.node.style.pointerEvents='';try{drag.node.releasePointerCapture?.(drag.pointerId);}catch{}drag=null;clearTarget();document.body.classList.remove('dragActive');}
async function pointerUp(e){
 if(!drag||drag.pointerId!==e.pointerId)return;const d=drag,hit=d.active&&d.type==='person'?hitTarget(e.clientX,e.clientY):{};finishDrag();
 if(!d.active)return;suppressClickUntil=Date.now()+350;
 if(e.type==='pointercancel'){render();return;}
 if(!editable()){render();toast('연결이 끊겨 변경을 저장하지 않았습니다.');return;}
 if(d.type==='table'){await mutate({type:'tablePosition',id:d.id,fromX:d.source.x,fromY:d.source.y,x:d.source.x+(e.clientX-d.startX)/zoom,y:d.source.y+(e.clientY-d.startY)/zoom},'테이블 위치 이동');return;}
 const expected=personSignature(d.source);
 if(hit.person){const b=state.attendees.find(a=>a.id===hit.person);if(b)await mutate({type:'swapPeople',id:d.id,expected,otherId:b.id,otherExpected:personSignature(b)},'두 참석자 자리 교환');}
 else if(hit.unassigned||hit.table){const target=hit.unassigned?null:hit.table;if(target!==d.source.tableId)await mutate({type:'move',id:d.id,expected,tableId:target},'참석자 테이블 이동');else render();}
 else render();
}
window.addEventListener('pointermove',pointerMove,{passive:false});window.addEventListener('pointerup',pointerUp);window.addEventListener('pointercancel',pointerUp);
$('search').oninput=renderPeople;$('filter').onchange=renderPeople;$('zoomIn').onclick=()=>setZoom(zoom+.1);$('zoomOut').onclick=()=>setZoom(zoom-.1);$('fit').onclick=fit;
$('undo').onclick=async()=>{if(!undo||!editable())return;const saved=undo;if(await mutate({type:'replace',expectedRev:saved.rev,value:saved.before},'내 마지막 변경 취소')){undo=null;syncButtons();}};
$('publish').onclick=async()=>{if(existsOnServer||!editable())return;await mutate({type:'replace',expectedRev:0,value:state},'초기 배치 공동 저장');};
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
 if(!connected||!user)return;
 try{const q=F.query(F.collection(db,SHARED_DOCUMENT,'history'),F.orderBy('rev','desc'),F.limit(30)),snaps=await F.getDocs(q);$('historyList').replaceChildren();
  snaps.forEach(snapshot=>{const h=snapshot.data(),e=make('div','historyEntry',`#${h.rev} · ${h.action}`);e.append(make('small','',`${h.at?.toDate?.().toLocaleString('ko-KR')||'시간 확인 중'} · ${h.by===user.uid?'이 브라우저':'방문자 '+String(h.by).slice(0,6)}`));
   const b=make('button','','이 변경 직전으로 복원');b.type='button';b.disabled=!editable();b.onclick=async()=>{const rev=state.rev;if(confirm(`변경 #${h.rev} 직전의 전체 배치로 되돌릴까요? 현재 배치는 새 이력으로 남습니다.`)&&await mutate({type:'replace',expectedRev:rev,value:h.before},'이전 배치 복원'))$('historyDialog').close();};e.append(b);$('historyList').append(e);
  });if(snaps.empty)$('historyList').append(make('p','muted','저장된 이력이 없습니다.'));$('historyDialog').showModal();
 }catch(error){toast(connectionError(error));}
};$('historyClose').onclick=()=>$('historyDialog').close();

function watchShared(){
 const token=++epoch;unsubscribe?.();connected=false;syncButtons();
 unsubscribe=F.onSnapshot(F.doc(db,SHARED_DOCUMENT),{includeMetadataChanges:true},snapshot=>{
  if(token!==epoch)return;
  try{const incoming=startingState(snapshot.exists()?snapshot.data():null,seed);if(!snapshot.metadata.fromCache||incoming.rev>=state.rev)state=incoming;
   existsOnServer=snapshot.exists();connected=!snapshot.metadata.fromCache&&!snapshot.metadata.hasPendingWrites;
   if(!pending){
    if(connected&&user)status(existsOnServer?`로그인 없이 공동 편집 연결 완료 · 변경 ${state.rev}`:'연결 완료 · 초기 배치입니다. 배치 공동 저장을 누르거나 자리를 옮기면 저장됩니다.','ok');
    else if(!user)status('보기 가능 · 저장하려면 익명 연결을 준비해야 합니다. 저장 설정 안내를 확인하세요.','wait');
    else status('서버 확인 대기 — 아직 편집·저장할 수 없습니다.','wait');
   }if(!drag)render();else syncButtons();
  }catch(error){connected=false;status(connectionError(error),'error');syncButtons();}
 },error=>{if(token!==epoch)return;connected=false;status(connectionError(error),'error');syncButtons();});
}
async function connect(){
 if(connecting||pending||!auth||!F)return;connecting=true;syncButtons();status('로그인 화면 없이 공동 저장소에 연결 중…','wait');watchShared();
 try{await auth.authStateReady();if(!auth.currentUser)await A.signInAnonymously(auth);user=auth.currentUser;syncButtons();
  if(connected)status(existsOnServer?`로그인 없이 공동 편집 연결 완료 · 변경 ${state.rev}`:'연결 완료 · 초기 배치 공동 저장을 눌러주세요.','ok');
 }catch(error){user=null;status(connectionError(error),'error');syncButtons();}
 finally{connecting=false;syncButtons();}
}
$('reconnect').onclick=()=>{if(auth)connect();else initialize();};
window.addEventListener('offline',()=>{connected=false;finishDrag();status('오프라인 — 공동 저장이 불가능하므로 편집을 잠갔습니다.','error');render();});
window.addEventListener('online',()=>{if(!pending)connect();});
window.addEventListener('beforeunload',e=>{if(pending){e.preventDefault();e.returnValue='';}});
for(const note of DISPLAY_NOTES)$('notesList').append(make('li','',note));
fit();render();
async function initialize(){
 if(connecting)return;
 try{const base='https://www.gstatic.com/firebasejs/13.2.0/';const [appModule,authModule,storeModule]=await Promise.all([import(base+'firebase-app.js'),import(base+'firebase-auth.js'),import(base+'firebase-firestore.js')]);
  A=authModule;F=storeModule;const app=appModule.getApps().length?appModule.getApp():appModule.initializeApp(firebaseConfig);auth=A.getAuth(app);db=F.getFirestore(app);
  A.onAuthStateChanged(auth,u=>{user=u;syncButtons();});await connect();
 }catch(error){status('연결 도구를 불러오지 못했습니다. 초기 배치 보기만 가능하며 저장은 되지 않습니다.','error');toast(connectionError(error));syncButtons();}
}
initialize();

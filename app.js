import {WIDTH,HEIGHT,copy,emptyState,demoState,normalize,membersAt,occupancy,personSignature,applyOperation,rowsToState,parseCsv,toCsv} from './core.mjs';
import {firebaseConfig,eventId} from './firebase-config.js';
const $=id=>document.getElementById(id);
const make=(tag,cls,text)=>{const e=document.createElement(tag);if(cls)e.className=cls;if(text!=null)e.textContent=text;return e;};
let state=null,mode='locked',role=null,user=null,auth=null,db=null,F=null,A=null,pending=false,serverKnown=false,unsubMember=null,unsubEvent=null,zoom=.55,drag=null,undo=null,authEpoch=0;
let toastTimer,waitTimer; const editable=()=>!pending&&!!state&&(mode==='demo'||(mode==='live'&&serverKnown&&navigator.onLine&&['editor','admin'].includes(role)));
function status(text,kind=''){ $('status').textContent=text;$('status').className='status '+kind; }
function toast(text){$('toast').textContent=text;$('toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').hidden=true,6500);}
function errorText(e){const c=e?.code||'';const known={
 'auth/operation-not-allowed':'Firebase Authentication에서 Google 로그인을 활성화해야 합니다.',
 'auth/configuration-not-found':'Firebase Authentication의 시작하기와 Google 로그인을 먼저 설정해 주세요.',
 'auth/unauthorized-domain':'Firebase Authentication → 설정 → 승인된 도메인에 toothcompany.github.io를 추가해 주세요.',
 'auth/popup-blocked':'팝업이 차단되었습니다. Safari 또는 Chrome에서 직접 열고 팝업을 허용해 주세요.',
 'auth/popup-closed-by-user':'로그인 창이 닫혔습니다. 다시 로그인해 주세요.',
 'auth/cancelled-popup-request':'로그인이 이미 진행 중입니다.',
 'permission-denied':'접근 권한이 없습니다. Firestore 보안 규칙과 members의 승인 계정을 확인해 주세요.',
 'unavailable':'서버에 연결할 수 없습니다. 저장되지 않았습니다. 연결 후 다시 시도해 주세요.',
 'failed-precondition':'Firestore 데이터베이스 생성과 설정을 확인해 주세요.'};return known[c]||e?.message||'요청을 완료하지 못했습니다.';}
function stopListeners(){unsubMember?.();unsubEvent?.();unsubMember=null;unsubEvent=null;serverKnown=false;}
function syncButtons(){document.querySelectorAll('[data-edit]').forEach(b=>b.disabled=!editable());$('undo').disabled=!editable()||!undo;$('export').disabled=!state;$('csv').disabled=!state;$('print').disabled=!state;$('history').disabled=mode!=='live'||!serverKnown||!role;$('logout').disabled=pending;$('demo').disabled=pending;$('login').disabled=pending||!auth;}
function setZoom(v){zoom=Math.max(.2,Math.min(1.5,v));$('world').style.transform=`scale(${zoom})`;$('sizer').style.width=WIDTH*zoom+'px';$('sizer').style.height=HEIGHT*zoom+'px';$('zoomLabel').textContent=Math.round(zoom*100)+'%';}
function fit(){setZoom(($('viewport').clientWidth-16)/WIDTH);}
function render(){
 syncButtons();$('tables').replaceChildren();$('people').replaceChildren();$('welcome').hidden=!!state;
 if(!state){$('summary').textContent='12개 테이블 · 정원 99석';$('rosterCount').textContent='0';return;}
 const assigned=state.attendees.filter(a=>a.tableId!==null).length,capacity=state.tables.reduce((a,t)=>a+t.capacity,0);
 $('summary').textContent=`${state.tables.length}개 테이블 · ${state.attendees.length}명 / ${capacity}석 · 미배정 ${state.attendees.length-assigned}명`;
 const previous=$('filter').value;$('filter').replaceChildren(new Option('모든 테이블','all'),new Option('미배정','none'));
 for(const t of state.tables.slice().sort((a,b)=>a.number-b.number)) $('filter').add(new Option(`${t.number}번 테이블 (${membersAt(state,t.id).length}/${t.capacity})`,t.id));
 $('filter').value=Array.from($('filter').options).some(o=>o.value===previous)?previous:'all';
 for(const t of state.tables){
  const group=make('div','tableGroup');group.dataset.tid=t.id;group.style.left=t.x+'px';group.style.top=t.y+'px';
  const occ=occupancy(state,t),disc=make('button',`tableDisc ${occ.kind} ${t.number<=3?'vip':''}`);disc.type='button';disc.dataset.tableHandle=t.id;disc.title='끌어서 이동 · 클릭하여 정원 수정 또는 위치 교환';disc.setAttribute('aria-label',`${t.number}번 테이블, 정원 ${t.capacity}명, 배정 ${occ.count}명`);
  disc.append(make('strong','',t.number+'번'),make('span','count',`${occ.count} / ${t.capacity}명`),make('small','',occ.delta>0?`${occ.delta}명 초과`:occ.delta<0?`${-occ.delta}석 여유`:'정원 일치'));group.append(disc);
  const people=membersAt(state,t.id),slots=Math.max(t.capacity,people.length),radius=slots>12?174:151;
  people.forEach((a,i)=>{
   const rad=(-90+i*360/slots)*Math.PI/180,b=make('button','seat'+(a.name.length>10?' long':''));b.type='button';b.dataset.aid=a.id;b.style.left=(Math.cos(rad)*radius-71)+'px';b.style.top=(Math.sin(rad)*radius-19.5)+'px';b.title=`${a.name} · ${a.affiliation||'소속 미입력'} · ${t.number}번 ${i+1}석`;
   b.append(make('span','num',i+1),make('span','name',a.name));group.append(b);
  });$('tables').append(group);
 }
 renderPeople();
}
function renderPeople(){
 if(!state)return;$('people').replaceChildren();const q=$('search').value.trim().toLowerCase(),filter=$('filter').value;
 const list=state.attendees.filter(a=>(filter==='all'||(filter==='none'?a.tableId===null:a.tableId===filter))&&(!q||`${a.name} ${a.affiliation}`.toLowerCase().includes(q))).sort((a,b)=>a.name.localeCompare(b.name,'ko'));
 $('rosterCount').textContent=state.attendees.length;
 for(const a of list){const b=make('button','personRow');b.type='button';b.dataset.aid=a.id;const info=make('span','info');info.append(make('strong','',a.name),make('small','',a.affiliation||'소속 미입력'));const t=state.tables.find(t=>t.id===a.tableId),seat=t?membersAt(state,t.id).findIndex(x=>x.id===a.id)+1:null;b.append(info,make('span','badge',t?`${t.number}번 · ${seat}석`:'미배정'));$('people').append(b);}
 if(!list.length)$('people').append(make('p','muted','조건에 맞는 참석자가 없습니다.'));
}
async function mutate(op,label){
 if(!editable()){toast('편집 권한과 서버 연결을 확인해 주세요.');return false;}
 if(mode==='demo'){try{const before=copy(state),next=applyOperation(state,op);next.rev=state.rev+1;state=next;undo={before,rev:next.rev};render();status('연습 모드 · 공동 저장되지 않으며 새로고침하면 사라집니다.','wait');return true;}catch(e){toast(errorText(e));render();return false;}}
 pending=true;syncButtons();status('공동 저장 중… 서버의 확인을 기다리고 있습니다.','wait');waitTimer=setTimeout(()=>{if(pending)status('서버 응답 대기 중 — 아직 저장 완료가 아닙니다. 창을 닫지 마세요.','wait');},12000);
 try{
  const ref=F.doc(db,'events',eventId),historyRef=F.doc(F.collection(ref,'history'));
  const result=await F.runTransaction(db,async tx=>{
   const snap=await tx.get(ref),before=snap.exists()?normalize(snap.data()):emptyState(),next=applyOperation(before,op);next.rev=before.rev+1;
   tx.set(ref,{...next,updatedAt:F.serverTimestamp(),updatedBy:user.uid,lastAction:label.slice(0,160)});
   tx.set(historyRef,{before,rev:next.rev,action:label.slice(0,160),by:user.uid,at:F.serverTimestamp()});
   return {before,next};
  },{maxAttempts:3});
  if(!state||state.rev<=result.next.rev)state=result.next;undo={before:result.before,rev:result.next.rev};
  status(`공동 저장 완료 · 변경 ${result.next.rev} · ${new Date().toLocaleTimeString('ko-KR')}`,'ok');return true;
 }catch(e){status('저장 실패 — 이 변경은 반영되지 않았습니다.','error');toast(errorText(e));return false;}
 finally{clearTimeout(waitTimer);pending=false;render();}
}
function openEditor(title){$('editorTitle').textContent=title;$('editorFields').replaceChildren();$('remove').hidden=true;$('save').hidden=!editable();$('editor').showModal();}
function field(label,value,type='text'){const id='f'+Math.random().toString(36).slice(2),l=make('label','',label),i=make('input');l.htmlFor=id;i.id=id;i.type=type;i.value=value??'';$('editorFields').append(l,i);return i;}
function tableSelect(value,label='배정 테이블'){const id='s'+Math.random().toString(36).slice(2),l=make('label','',label),s=make('select');l.htmlFor=id;s.id=id;s.add(new Option('미배정',''));for(const t of state.tables.slice().sort((a,b)=>a.number-b.number))s.add(new Option(`${t.number}번 · ${membersAt(state,t.id).length}/${t.capacity}명`,t.id));s.value=value??'';$('editorFields').append(l,s);return s;}
let formAction=null;
function editPerson(id){if(!state)return;const a=state.attendees.find(a=>a.id===id);if(!a)return;const expected=personSignature(a);openEditor('참석자 · '+a.name);const name=field('성명',a.name),affiliation=field('소속',a.affiliation),target=tableSelect(a.tableId);name.maxLength=80;name.required=true;affiliation.maxLength=200;[name,affiliation,target].forEach(e=>e.disabled=!editable());
 formAction=async()=>{if(!name.value.trim())return;const ok=await mutate({type:'editPerson',id,expected,name:name.value.trim(),affiliation:affiliation.value.trim(),tableId:target.value||null},'참석자 정보·배정 변경');if(ok)$('editor').close();};
 $('remove').hidden=!editable();$('remove').onclick=async()=>{if(confirm(`${a.name} 님을 참석자 명단에서 삭제할까요?`)){const ok=await mutate({type:'removePerson',id,expected},'참석자 삭제');if(ok)$('editor').close();}};
}
function addPerson(){if(!editable())return;openEditor('참석자 추가');const name=field('성명',''),aff=field('소속',''),target=tableSelect(null);name.required=true;name.maxLength=80;aff.maxLength=200;formAction=async()=>{if(!name.value.trim())return;const p={id:crypto.randomUUID(),name:name.value.trim(),affiliation:aff.value.trim(),tableId:target.value||null};if(await mutate({type:'addPerson',person:p},'참석자 추가'))$('editor').close();};}
function editTable(id){if(!state)return;const t=state.tables.find(t=>t.id===id);if(!t)return;const expectedRev=state.rev;openEditor(`${t.number}번 테이블`);const cap=field('정원 (1~30명)',t.capacity,'number');cap.min=1;cap.max=30;cap.step=1;cap.disabled=!editable();const swap=tableSelect(null,'테이블과 명단을 함께 위치 교환');for(const option of Array.from(swap.options))if(option.value===id)option.remove();swap.options[0].text='교환할 테이블 선택';const b=make('button','','선택한 테이블과 위치 교환');b.type='button';b.disabled=!editable();$('editorFields').append(b,make('p','muted','위치 교환은 테이블 번호와 명단을 유지한 채 두 테이블의 위치만 바꿉니다. 정원 변경은 아래 저장 버튼을 사용하세요.'));
 b.onclick=async()=>{if(!swap.value){toast('교환할 테이블을 선택해 주세요.');return;}if(await mutate({type:'swapTables',id,otherId:swap.value,expectedRev},'테이블 위치 교환'))$('editor').close();};
 formAction=async()=>{if(await mutate({type:'capacity',id,capacity:Number(cap.value),expectedCapacity:t.capacity},'테이블 정원 변경'))$('editor').close();};
}
$('editForm').onsubmit=e=>{e.preventDefault();if(editable())formAction?.();};$('cancel').onclick=()=>$('editor').close();$('add').onclick=addPerson;
$('tables').addEventListener('keydown',e=>{if(e.key!=='Enter'&&e.key!==' ')return;const a=e.target.closest('[data-aid]'),t=e.target.closest('[data-table-handle]');if(a){e.preventDefault();editPerson(a.dataset.aid);}else if(t){e.preventDefault();editTable(t.dataset.tableHandle);}});
$('people').onclick=e=>{const b=e.target.closest('[data-aid]');if(b)editPerson(b.dataset.aid);};
function pointerDown(e){
 if(e.button!==0||!state||drag)return;const a=e.target.closest('#tables [data-aid]'),t=e.target.closest('[data-table-handle]');if(!a&&!t)return;
 if(!editable())return;
 const id=a?a.dataset.aid:t.dataset.tableHandle,source=a?state.attendees.find(x=>x.id===id):state.tables.find(x=>x.id===id);
 drag={type:a?'person':'table',id,source:copy(source),startX:e.clientX,startY:e.clientY,lastX:e.clientX,lastY:e.clientY,pointerId:e.pointerId,node:a||t,active:false,ghost:null};
 (a||t).setPointerCapture?.(e.pointerId);
}
function hitTarget(x,y){
 const el=document.elementFromPoint(x,y);
 if(el?.closest('#unassigned'))return {unassigned:true};
 const personEl=el?.closest('#tables [data-aid]');if(personEl&&personEl.dataset.aid!==drag?.id)return {person:personEl.dataset.aid};
 const r=$('world').getBoundingClientRect(),wx=(x-r.left)/zoom,wy=(y-r.top)/zoom;
 const candidates=state.tables.map(t=>({t,d:Math.hypot(t.x-wx,t.y-wy)})).sort((a,b)=>a.d-b.d);
 return candidates[0]?.d<210?{table:candidates[0].t.id}:{};
}
function clearTarget(){document.querySelectorAll('.dropTarget').forEach(e=>e.classList.remove('dropTarget'));}
function pointerMove(e){
 if(!drag||e.pointerId!==drag.pointerId)return;drag.lastX=e.clientX;drag.lastY=e.clientY;
 if(!drag.active&&Math.hypot(e.clientX-drag.startX,e.clientY-drag.startY)<6)return;
 if(!drag.active){drag.active=true;document.body.classList.add('dragActive');if(drag.type==='person'){drag.node.classList.add('dragging');drag.node.style.pointerEvents='none';drag.ghost=make('div','ghost',drag.source.name);document.body.append(drag.ghost);}}
 if(drag.type==='person'){drag.ghost.style.left=e.clientX+'px';drag.ghost.style.top=e.clientY+'px';clearTarget();const hit=hitTarget(e.clientX,e.clientY);if(hit.unassigned)$('unassigned').classList.add('dropTarget');else if(hit.table)document.querySelector(`[data-table-handle="${CSS.escape(hit.table)}"]`)?.classList.add('dropTarget');}
 else {const g=drag.node.parentElement;g.style.left=Math.max(210,Math.min(WIDTH-210,drag.source.x+(e.clientX-drag.startX)/zoom))+'px';g.style.top=Math.max(230,Math.min(HEIGHT-210,drag.source.y+(e.clientY-drag.startY)/zoom))+'px';}
 e.preventDefault();
}
async function pointerUp(e){
 if(!drag||e.pointerId!==drag.pointerId)return;const d=drag;const hit=d.active&&d.type==='person'?hitTarget(e.clientX,e.clientY):{};d.ghost?.remove();d.node.style.pointerEvents='';d.node.classList.remove('dragging');document.body.classList.remove('dragActive');clearTarget();drag=null;
 if(e.type==='pointercancel'){render();return;}
 if(!d.active){if(d.type==='person')editPerson(d.id);else editTable(d.id);return;}
 if(d.type==='table'){const x=Math.max(210,Math.min(WIDTH-210,d.source.x+(e.clientX-d.startX)/zoom)),y=Math.max(230,Math.min(HEIGHT-210,d.source.y+(e.clientY-d.startY)/zoom));await mutate({type:'tablePosition',id:d.id,fromX:d.source.x,fromY:d.source.y,x:Math.round(x),y:Math.round(y)},'테이블 위치 이동');}
 else if(hit.person){const b=state.attendees.find(a=>a.id===hit.person);await mutate({type:'swapPeople',id:d.id,expected:personSignature(d.source),otherId:b.id,otherExpected:personSignature(b)},'두 참석자 자리 교환');}
 else if(hit.table||hit.unassigned){const to=hit.unassigned?null:hit.table;if(to!==d.source.tableId)await mutate({type:'move',id:d.id,expected:personSignature(d.source),tableId:to},to?'참석자 테이블 이동':'참석자 미배정 이동');else render();}
 else render();
}
$('tables').addEventListener('pointerdown',pointerDown);window.addEventListener('pointermove',pointerMove,{passive:false});window.addEventListener('pointerup',pointerUp);window.addEventListener('pointercancel',pointerUp);
$('search').oninput=renderPeople;$('filter').onchange=renderPeople;$('zoomIn').onclick=()=>setZoom(zoom+.1);$('zoomOut').onclick=()=>setZoom(zoom-.1);$('fit').onclick=fit;
$('undo').onclick=async()=>{if(!undo||!editable())return;const saved=undo;if(await mutate({type:'replace',expectedRev:saved.rev,value:saved.before},'내 마지막 변경 취소')){undo=null;syncButtons();}};
function download(name,text,mime){const url=URL.createObjectURL(new Blob([text],{type:mime})),a=make('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),5000);}
$('export').onclick=()=>{if(state)download(`snu60-seating-${new Date().toISOString().replaceAll(':','-')}.json`,JSON.stringify(state,null,2),'application/json');};
$('csv').onclick=()=>{if(state)download('snu60-seating.csv',toCsv(state),'text/csv;charset=utf-8');};$('print').onclick=()=>window.print();
let xlsxLoader;
function loadXlsx(){if(window.XLSX)return Promise.resolve(window.XLSX);if(!xlsxLoader)xlsxLoader=new Promise((resolve,reject)=>{const s=make('script');s.src='https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js';s.onload=()=>resolve(window.XLSX);s.onerror=()=>{xlsxLoader=null;s.remove();reject(Error('엑셀 읽기 도구를 불러오지 못했습니다. CSV 또는 JSON 파일을 사용해 주세요.'));};document.head.append(s);});return xlsxLoader;}
$('import').onclick=()=>{if(editable())$('file').click();};
$('file').onchange=async()=>{const f=$('file').files[0];$('file').value='';if(!f||!editable())return;if(f.size>5*1024*1024){toast('5MB 이하의 명단 파일을 사용해 주세요.');return;}try{const rev=state.rev;let next;if(/\.json$/i.test(f.name)){next=normalize(JSON.parse(await f.text()));}else if(/\.xlsx$/i.test(f.name)){const X=await loadXlsx(),book=X.read(await f.arrayBuffer(),{type:'array'}),sheet=book.Sheets['좌석별명단']||book.Sheets[book.SheetNames[0]];next=rowsToState(X.utils.sheet_to_json(sheet,{header:1,raw:false,defval:''}),state);}else if(/\.csv$/i.test(f.name)){next=rowsToState(parseCsv(await f.text()),state);}else throw Error('XLSX, UTF-8 CSV 또는 JSON 파일만 지원합니다.');
 const duplicates=next.attendees.length-new Set(next.attendees.map(a=>a.name)).size;
 const warning=duplicates?`\n같은 이름 ${duplicates}건이 있습니다. 동명이인 여부를 확인해 주세요.`:'';
 if(confirm(`${next.attendees.length}명 · ${next.tables.length}개 테이블을 불러옵니다.${warning}\n현재 명단 전체가 교체됩니다. 계속할까요?`))await mutate({type:'replace',expectedRev:rev,value:next},'명단 파일 불러오기');
 }catch(e){toast(errorText(e));}};
$('demo').onclick=()=>{if(pending)return;if(state&&!confirm('연습용 가상 명단으로 전환할까요? 공동 배치는 바뀌지 않습니다.'))return;authEpoch++;stopListeners();mode='demo';role='demo';state=demoState();undo=null;$('notice').textContent='연습 모드: 가상 명단입니다. 공동 저장되지 않고 새로고침하면 사라집니다. 실제 명단 파일을 읽어도 이 브라우저 메모리에서만 처리합니다.';status('연습 모드 — 공동 저장 안 됨','wait');render();fit();};
$('history').onclick=async()=>{if(mode!=='live'||!role)return;try{const q=F.query(F.collection(db,'events',eventId,'history'),F.orderBy('rev','desc'),F.limit(30)),snaps=await F.getDocs(q);$('historyList').replaceChildren();snaps.forEach(s=>{const d=s.data(),e=make('div','historyEntry',`#${d.rev} · ${d.action}`);e.append(make('small','',`${d.at?.toDate?.().toLocaleString('ko-KR')||'시간 확인 중'} · ${d.by===user.uid?'내 변경':'다른 운영진 변경'}`));$('historyList').append(e);});if(snaps.empty)$('historyList').append(make('p','muted','변경 이력이 없습니다.'));$('historyDialog').showModal();}catch(e){toast(errorText(e));}};$('historyClose').onclick=()=>$('historyDialog').close();
async function connectLive(u){
 const epoch=++authEpoch;stopListeners();mode='locked';state=null;role=null;undo=null;user=u;render();
 if(!u){status('로그인 후 승인된 운영진만 실제 명단에 접근할 수 있습니다.');return;}
 if(!u.email||!u.emailVerified){status('이메일이 확인된 Google 계정이 필요합니다.','error');return;}
 status('운영진 권한을 확인하고 있습니다…','wait');
 unsubMember=F.onSnapshot(F.doc(db,'members',u.email),snap=>{
  if(epoch!==authEpoch)return;
  const r=snap.exists()?snap.data().role:null;
  if(!['viewer','editor','admin'].includes(r)){unsubEvent?.();unsubEvent=null;role=null;state=null;serverKnown=false;mode='locked';status(`로그인은 완료됐지만 승인된 운영진이 아닙니다. 관리자에게 ${u.email} 계정 승인을 요청해 주세요.`,'wait');$('notice').textContent='최초 관리자는 Firebase 콘솔에서 members 컬렉션에 로그인 이메일을 문서 ID로 만들고 role: admin을 설정합니다. 상세 순서는 설정 안내를 확인하세요.';render();return;}
  role=r;mode='live';$('notice').textContent=`공동 편집 · ${r==='viewer'?'보기 전용':'수정 가능'} · 드래그를 놓은 뒤 서버가 확인하면 저장 완료로 표시됩니다. 실제 명단은 공개 코드에 포함되지 않습니다.`;
  if(unsubEvent){syncButtons();return;}
  unsubEvent=F.onSnapshot(F.doc(db,'events',eventId),{includeMetadataChanges:true},s=>{
   if(epoch!==authEpoch)return;
   try{const incoming=s.exists()?normalize(s.data()):emptyState();if(!state||incoming.rev>=state.rev)state=incoming;serverKnown=!s.metadata.fromCache&&!s.metadata.hasPendingWrites;
   if(!pending)status(serverKnown?(s.exists()?`공동 배치 연결 완료 · 변경 ${state.rev}`:'공동 저장소 연결 완료 · 실제 명단을 불러오세요.'):'서버 확인 대기 — 편집은 연결 확인 후 가능합니다.',serverKnown?'ok':'wait');if(!drag)render();else syncButtons();
   }catch(e){serverKnown=false;state=null;status(errorText(e),'error');render();}
  },e=>{if(epoch!==authEpoch)return;serverKnown=false;state=null;status(errorText(e),'error');render();});
 },e=>{if(epoch!==authEpoch)return;stopListeners();role=null;state=null;status(errorText(e),'error');render();});
}
$('login').onclick=async()=>{if(!auth)return;try{if(auth.currentUser){await connectLive(auth.currentUser);return;}const provider=new A.GoogleAuthProvider();provider.setCustomParameters({prompt:'select_account'});await A.signInWithPopup(auth,provider);}catch(e){status(errorText(e),'error');}};
$('logout').onclick=async()=>{if(pending||!auth)return;authEpoch++;stopListeners();state=null;role=null;mode='locked';undo=null;render();try{await A.signOut(auth);}catch(e){toast(errorText(e));}};
window.addEventListener('offline',()=>{serverKnown=false;if(mode==='live'){status('오프라인 — 공동 저장이 불가능하므로 편집을 잠갔습니다.','error');syncButtons();}});
window.addEventListener('online',()=>{if(mode==='live'&&user&&!pending)connectLive(user);});
window.addEventListener('beforeunload',e=>{if(pending){e.preventDefault();e.returnValue='';}});
fit();render();
async function initialize(){try{const base='https://www.gstatic.com/firebasejs/13.2.0/';const [appModule,authModule,storeModule]=await Promise.all([import(base+'firebase-app.js'),import(base+'firebase-auth.js'),import(base+'firebase-firestore.js')]);A=authModule;F=storeModule;const app=appModule.initializeApp(firebaseConfig);auth=A.getAuth(app);db=F.getFirestore(app);
 A.onAuthStateChanged(auth,u=>{user=u;$('accountLabel').textContent=u?.email||'로그인하지 않음';$('logout').hidden=!u;$('login').textContent=u?'공동 배치 열기':'Google 로그인';if(u||mode!=='demo')connectLive(u);syncButtons();});syncButtons();
 }catch(e){status('로그인 도구를 불러오지 못했습니다. 네트워크를 확인하세요. 가상 명단 연습은 사용할 수 있습니다.','error');syncButtons();}}
initialize();

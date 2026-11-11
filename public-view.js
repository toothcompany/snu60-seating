import { WIDTH, HEIGHT, normalize, membersAt, occupancy, toCsv } from './core.mjs';
import { publishedPlan, RELEASE, UPDATED_LABEL, SOURCE_LABEL, ACADEMIC_ONLY, DISPLAY_NOTES } from './public-plan.mjs';
import { numberedLayout } from './table-grid.mjs';
import { firebaseConfig, eventId } from './firebase-config.js';
const $ = id => document.getElementById(id);
const make = (tag, cls, text) => { const n = document.createElement(tag); if(cls)n.className=cls; if(text!=null)n.textContent=text; return n; };
let state = publishedPlan(), zoom = .55, liveRevision = -1;
const shortName = a => a.name === 'Prathip Phantumvanit' ? 'Prathip\nPhantumvanit' : a.name === 'Prathip Phantumvanit 가족' ? 'Prathip 가족' : a.name.replace('Dilip Prajapati 가족', 'Dilip 가족');
function setStatus(text, kind='') { $('status').textContent=text; $('status').className='status '+kind; }
function setZoom(v) { zoom=Math.max(.2,Math.min(1.5,v)); $('world').style.transform=`scale(${zoom})`; $('sizer').style.width=WIDTH*zoom+'px'; $('sizer').style.height=HEIGHT*zoom+'px'; $('zoomLabel').textContent=Math.round(zoom*100)+'%'; }
function fit() { setZoom(($('viewport').clientWidth-16)/WIDTH); }
function seatLabel(a) { const t=state.tables.find(t=>t.id===a.tableId); return t?`${t.number}번 · ${membersAt(state,t.id).findIndex(p=>p.id===a.id)+1}석`:ACADEMIC_ONLY.includes(a.id)?'학술행사만':'미배정'; }
function highlight(id) {
  document.querySelectorAll('.selected').forEach(n=>n.classList.remove('selected'));
  const a=state.attendees.find(p=>p.id===id); if(!a)return;
  document.querySelectorAll(`[data-aid="${CSS.escape(id)}"]`).forEach(n=>n.classList.add('selected'));
  const t=state.tables.find(t=>t.id===a.tableId); if(t) { document.querySelector(`[data-tid="${CSS.escape(t.id)}"]`)?.classList.add('selected'); $('viewport').scrollTo({left:Math.max(0,t.x*zoom-$('viewport').clientWidth/2),top:Math.max(0,t.y*zoom-$('viewport').clientHeight/2),behavior:'smooth'}); }
  $('selection').textContent=`${a.name} · ${a.affiliation || '소속 확인 필요'} · ${seatLabel(a)}`;
}
function renderPeople() {
  const q=$('search').value.trim().toLowerCase(), f=$('filter').value;
  const list=state.attendees.filter(a=>(f==='all'||(f==='none'?a.tableId===null:a.tableId===f))&&(!q||`${a.name} ${a.affiliation}`.toLowerCase().includes(q))).sort((a,b)=>a.name.localeCompare(b.name,'ko'));
  $('people').replaceChildren(); $('rosterCount').textContent=state.attendees.length;
  for(const a of list) { const row=make('button','personRow'); row.type='button'; row.dataset.aid=a.id; const info=make('span','info'); info.append(make('strong','',a.name),make('small','',a.affiliation||'소속 확인 필요')); row.append(info,make('span','badge',seatLabel(a))); row.onclick=()=>highlight(a.id); $('people').append(row); }
  if(!list.length)$('people').append(make('p','muted','검색 결과가 없습니다.'));
}
function render() {
  $('tables').replaceChildren();
  const assigned=state.attendees.filter(a=>a.tableId!==null).length, cap=state.tables.reduce((s,t)=>s+t.capacity,0), unassigned=state.attendees.length-assigned;
  $('summary').textContent=`${state.tables.length}개 테이블 · 만찬 ${assigned}명 / ${cap}석 · 별도 ${unassigned}명`;
  const old=$('filter').value; $('filter').replaceChildren(new Option('모든 테이블','all'),new Option('만찬 미배정 / 학술행사만','none'));
  for(const t of state.tables.slice().sort((a,b)=>a.number-b.number))$('filter').add(new Option(`${t.number}번 테이블 (${membersAt(state,t.id).length}/${t.capacity})`,t.id));
  if([...$('filter').options].some(o=>o.value===old))$('filter').value=old;
  for(const t of state.tables.slice().sort((a,b)=>a.number-b.number)) {
    const g=make('div','tableGroup'); g.dataset.tid=t.id; g.style.left=t.x+'px'; g.style.top=t.y+'px';
    const occ=occupancy(state,t), disc=make('button',`tableDisc ${occ.kind} ${t.number<=3?'vip':''}`); disc.type='button';
    disc.setAttribute('aria-label',`${t.number}번 테이블, ${occ.count}명, 정원 ${t.capacity}명`);
    disc.append(make('strong','',t.number+'번'),make('span','count',`${occ.count} / ${t.capacity}명`),make('small','',occ.delta>0?`${occ.delta}명 초과`:occ.delta<0?`${-occ.delta}석 여유`:'정원 일치'));
    disc.onclick=()=>{ $('filter').value=t.id; renderPeople(); }; g.append(disc);
    const people=membersAt(state,t.id), slots=Math.max(t.capacity,people.length), radius=slots>12?174:151;
    people.forEach((a,i)=>{const rad=(-90+i*360/slots)*Math.PI/180, seat=make('button','seat'+(a.name.length>10?' long':'')); seat.type='button'; seat.dataset.aid=a.id; seat.style.left=(Math.cos(rad)*radius-71)+'px'; seat.style.top=(Math.sin(rad)*radius-19.5)+'px'; seat.title=`${a.name} · ${a.affiliation} · ${t.number}번 ${i+1}석`; seat.setAttribute('aria-label',seat.title); seat.append(make('span','num',i+1),make('span','name',shortName(a))); seat.onclick=()=>highlight(a.id); g.append(seat);});
    $('tables').append(g);
  }
  renderPeople();
}
function download(name,text,type) { const u=URL.createObjectURL(new Blob([text],{type})),a=make('a'); a.href=u;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),3000); }
$('csv').onclick=()=>download('snu60-seating-public.csv',toCsv(state),'text/csv;charset=utf-8');
$('export').onclick=()=>download('snu60-seating-current.json',JSON.stringify(normalize(state),null,2),'application/json');
$('seedDownload').onclick=()=>download('snu60-seating-20261110.json',JSON.stringify(publishedPlan(),null,2),'application/json');
$('print').onclick=()=>window.print(); $('search').oninput=renderPeople; $('filter').onchange=renderPeople;
$('zoomIn').onclick=()=>setZoom(zoom+.1);$('zoomOut').onclick=()=>setZoom(zoom-.1);$('fit').onclick=fit;
$('sourceLabel').textContent=SOURCE_LABEL; $('updatedLabel').textContent=UPDATED_LABEL;
for(const note of DISPLAY_NOTES)$('notesList').append(make('li','',note));
render(); fit(); setStatus(`로그인 없이 보는 공개 배치안 · ${UPDATED_LABEL} · 보기 전용`);
// A failed/missing backend must not hide the user-approved initial public draft.
async function connectPublic() {
 try {
   const base='https://www.gstatic.com/firebasejs/13.2.0/';
   const [app,F]=await Promise.all([import(base+'firebase-app.js'),import(base+'firebase-firestore.js')]);
   const instance=app.getApps().length?app.getApp():app.initializeApp(firebaseConfig),db=F.getFirestore(instance);
   F.onSnapshot(F.doc(db,'publicPlans',eventId),{includeMetadataChanges:true},snap=>{
     if(!snap.exists()){setStatus(`공개 배치안 · ${UPDATED_LABEL} · 실시간 공개본은 아직 등록되지 않았습니다.`);return;}
     try { const d=snap.data(); if(d.releaseId!==RELEASE){setStatus(`공개 배치안 · ${UPDATED_LABEL} · 최신 명단 기준 고정본을 표시합니다.`);return;} const incoming=numberedLayout(d); if(incoming.rev<liveRevision)return; liveRevision=incoming.rev; state=incoming; render();
       setStatus(snap.metadata.fromCache?'마지막으로 읽은 공개 배치 · 서버 연결 확인 중':`공개 배치 실시간 연결 · 변경 ${state.rev} · 보기 전용`,snap.metadata.fromCache?'wait':'ok');
     } catch { setStatus('공개 저장소 데이터 형식 확인이 필요합니다. 현재 표시된 배치를 유지합니다.','wait'); }
   },()=>setStatus(`공개 배치안 · ${UPDATED_LABEL} · 현재 고정본(실시간 공개 연결 전)`));
 } catch { setStatus(`공개 배치안 · ${UPDATED_LABEL} · 현재 고정본(네트워크 연결 확인 필요)`); }
}
connectPublic();

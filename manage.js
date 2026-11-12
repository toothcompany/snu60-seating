import {firebaseConfig} from './firebase-config.js';
import {googleMemberEmail,connectionError,SHARED_DOCUMENT} from './guest-policy.mjs';
import {editingWindowOpen} from './temporary-access.mjs';
import {prepareRosterRevision,ROSTER_ACTION} from './roster-update.mjs?v=banquet102';
import {numberedLayout} from './table-grid.mjs';
import {membersAt} from './core.mjs';

const $=id=>document.getElementById(id);
const say=s=>{$('result').textContent=s;};
const sdk='https://www.gstatic.com/firebasejs/13.2.0/';
let F,A,db,auth,memberEmail=null,role=null,epoch=0,busy=false,previewTicket=0;
// A one-time, immutable Firestore history entry; re-opening does not reapply prior seat changes.
const auditId='Snu60RsvpSeats2026V2';
const auditRef=plan=>F.doc(F.collection(plan,'history'),auditId);
function validTarget(){const value=$('target').value.trim();return $('target').validity.valid&&value.length<=254&&/^[^@\s/#?]+@[^@\s/#?]+\.[^@\s/#?]+$/.test(value)?value:null;}
function buttons(){const canSave=!!memberEmail&&!busy&&editingWindowOpen(),enable=canSave&&role==='admin'&&!!validTarget();
 $('seats').disabled=!canSave;
 for(const id of ['both','grant'])$(id).disabled=!enable;
 $('login').hidden=!!auth?.currentUser;$('login').disabled=!auth||busy;
 $('logout').hidden=!auth?.currentUser;$('logout').disabled=busy;$('target').disabled=busy;
}
async function identify(u){
 const now=++epoch;memberEmail=null;role=null;buttons();say('');
 if(!u){$('actor').textContent='기존 관리자 또는 편집 권한이 있는 Google 계정으로 로그인하세요.';void showPreview();return;}
 $('actor').textContent='서버에서 이 계정의 좌석표 권한을 확인하고 있습니다.';
 try{
  const claims=(await A.getIdTokenResult(u)).claims;
  const email=googleMemberEmail(u,claims);
  if(!email)throw Error('이 계정으로는 관리할 수 없습니다. 인증된 Google 계정으로 로그인해 주세요.');
  const mine=await F.getDocFromServer(F.doc(db,'members',email));
  const access=mine.exists()?mine.data().role:null;
  if(!['admin','editor'].includes(access))throw Error('이 계정에는 좌석표 편집 권한이 없습니다. 기존 운영진 계정을 선택하거나 아래 Firebase 안내를 이용하세요.');
  if(epoch!==now)return;memberEmail=email;role=access;$('actor').textContent=email+(role==='admin'?' · 좌석표 관리자':' · 편집자 (좌석만 적용 가능)');
  if(!editingWindowOpen())say('공동 편집 기간이 끝났습니다.');
 }catch(e){if(epoch===now)$('actor').textContent=connectionError(e);}
 finally{if(epoch===now){buttons();void showPreview();}}
}
function describeSeats(raw){
 const layout=numberedLayout(raw), tables=new Map(layout.tables.map(t=>[t.id,t]));
 const seated=layout.attendees.filter(a=>tables.has(a.tableId)).length;
 const capacity=layout.tables.reduce((n,t)=>n+t.capacity,0);
 const free=layout.tables.map(t=>({n:t.number,d:t.capacity-membersAt(layout,t.id).length})).sort((a,b)=>a.n-b.n);
 const available=free.reduce((n,t)=>n+Math.max(0,t.d),0);
 const over=free.filter(t=>t.d<0);
 const summary='행사 참석 '+layout.attendees.length+'명 · 만찬 배정 '+seated+'명 · 만찬 좌석 미배정 '+(layout.attendees.length-seated)+'명';
 const capacityLine='의자 '+capacity+'석 · 빈자리 '+available+'석'+(available?' ('+free.filter(t=>t.d>0).map(t=>t.n+'번에 '+t.d+'석').join(', ')+')':'');
 const mismatches=layout.attendees.length===102?'':'\n※ 현재 명단은 확인 인원 102명과 '+Math.abs(layout.attendees.length-102)+'명 차이가 있습니다. 다른 참석자는 자동으로 추가하거나 삭제하지 않습니다.';
 const people=['정진희','최은재','신종학','백인채','정연호','유부강'].map(name=>{
   const a=layout.attendees.find(x=>x.name===name);if(!a)return name+' · 명단 확인 필요';
   const t=tables.get(a.tableId);
   return t?name+' · '+t.number+'번 테이블 '+(membersAt(layout,t.id).findIndex(x=>x.id===a.id)+1)+'번 좌석':name+' · 참석 (만찬 좌석 미배정)';
 }).join('\n');
 return summary+'\n'+capacityLine+(over.length?'\n정원 초과: '+over.map(t=>t.n+'번 '+(-t.d)+'명').join(', '):'')+mismatches+'\n\n'+people;
}
async function showPreview(){
 const ticket=++previewTicket,me=memberEmail;
 try{
  const plan=F.doc(db,SHARED_DOCUMENT);
  const [live,mark]=await Promise.all([F.getDocFromServer(plan),me?F.getDocFromServer(auditRef(plan)):null]);
  if(ticket!==previewTicket)return;
  if(!live.exists())throw Error('저장된 공동 좌석표가 없습니다.');
  const raw=live.data();let sample=raw,heading;
  if(mark?.exists()||raw.changeId===auditId){heading='적용 완료 · 현재 공동 좌석표';}
  else {
   try{
    const change=prepareRosterRevision(raw);sample=change.next;
    heading=change.status==='unchanged'?'현재 공동 좌석표':'적용 후 예상 배치'+(!me?' · 로그인 후 적용 이력 확인':'');
   }catch(e){$('preview').textContent='현재 공동 좌석표 (아직 변경하지 않음)\n'+describeSeats(raw)+'\n\n예상 배치 확인 필요: '+connectionError(e);return;}
  }
  $('preview').textContent=heading+'\n'+describeSeats(sample);
 }catch(e){if(ticket===previewTicket)$('preview').textContent='좌석 미리보기: '+connectionError(e);}
}
async function execute(mode){
 const includeSeats=mode!=='grant',includeGrant=mode!=='seats';
 if(!memberEmail||busy||(includeGrant&&role!=='admin'))return;
 const target=includeGrant?validTarget():null,u=auth.currentUser,me=memberEmail,now=epoch;
 if((includeGrant&&!target)||!u)return;
 const assertActor=()=>{if(now!==epoch||memberEmail!==me||auth.currentUser?.uid!==u.uid)throw Error('로그인 계정이 바뀌었습니다. 다시 확인해 주세요.');
  if(!editingWindowOpen())throw Error('공동 편집 기간이 끝났습니다.');};
 const member=includeGrant?F.doc(db,'members',target):null,mine=F.doc(db,'members',me),plan=F.doc(db,SHARED_DOCUMENT),audit=auditRef(plan);
 busy=true;previewTicket++;buttons();say('서버에서 권한과 최신 배치를 확인하고 있습니다.');
 let committed=false;
 try{
  await F.runTransaction(db,async tx=>{
   assertActor();
   const own=await tx.get(mine);
   if(!own.exists()||!(includeGrant?['admin']:['admin','editor']).includes(own.data().role))throw Error('현재 계정에는 이 작업에 필요한 권한이 없습니다.');
   const dest=!includeGrant?null:target===me?own:await tx.get(member);
   const existingRole=dest?.exists()?dest.data().role:null;
   if(dest?.exists()&&!['viewer','editor','admin'].includes(existingRole))throw Error('기존 계정 역할을 확인할 수 없습니다. Firebase에서 확인해 주세요.');
   let change=null;
   if(includeSeats){
    const mark=await tx.get(audit),live=await tx.get(plan);
    if(!live.exists())throw Error('저장된 공동 좌석표가 없습니다. 권한만 부여한 뒤 공동 좌석표를 확인해 주세요.');
    if(!mark.exists()){
     change=prepareRosterRevision(live.data());
     // Seal an already-matching plan as well: later deliberate chair/seat changes must survive a repeated click.
     if(change.status==='unchanged')change={...change,next:{...change.next,rev:change.before.rev+1}};
    }
   }
   assertActor();
   if(includeGrant){if(!dest.exists())tx.set(member,{role:'editor'});else if(existingRole==='viewer')tx.update(member,{role:'editor'});}
   if(change){
    const {before,next}=change;
    tx.set(plan,{...next,changeId:audit.id,lastAction:ROSTER_ACTION,updatedBy:u.uid,updatedAt:F.serverTimestamp()});
    tx.set(audit,{before,rev:next.rev,action:ROSTER_ACTION,by:u.uid,at:F.serverTimestamp()});
   }
  },{maxAttempts:4});
  committed=true;
  const [dest,live,marker]=await Promise.all([includeGrant?F.getDocFromServer(member):null,includeSeats?F.getDocFromServer(plan):null,includeSeats?F.getDocFromServer(audit):null]);
  if(epoch!==now)return;
  if(includeGrant&&(!dest?.exists()||!['admin','editor'].includes(dest.data().role)))throw Error('이 계정에 편집 권한이 표시되지 않습니다.');
  const output=includeGrant?target+' · '+(dest.data().role==='admin'?'기존 관리자 권한 유지':'편집 권한 확인'):'계정 권한은 변경하지 않았습니다.';
  if(!includeSeats){say(output+'\n좌석 배치는 변경하지 않았습니다.');return;}
  if(!live?.exists()||!marker?.exists()||live.data().rev<marker.data().rev)throw Error('이번 변경의 저장 기록을 확인할 수 없습니다.');
  $('preview').textContent='적용 완료 · 현재 공동 좌석표\n'+describeSeats(live.data());say(output+'\n추가 참석자와 예비석 반영 이력을 서버에서 확인했습니다.');
 }catch(e){if(now===epoch)say((committed?'서버에서 저장을 수락했지만, 최종 상태를 다시 확인하지 못했습니다. 공동 좌석표를 확인하세요. ':'적용을 완료하지 못했습니다. ')+connectionError(e)+(includeSeats&&includeGrant&&!committed?'\n권한만 먼저 부여하려면 ‘권한만 부여’를 선택하세요.':''));}
 finally{busy=false;buttons();if(now===epoch)$('result').focus?.({preventScroll:false});}
}
$('target').oninput=()=>{say('');buttons();};
$('both').onclick=()=>execute('both');$('grant').onclick=()=>execute('grant');$('seats').onclick=()=>execute('seats');
$('login').onclick=async()=>{if(!auth||busy)return;busy=true;buttons();try{const p=new A.GoogleAuthProvider();p.setCustomParameters({prompt:'select_account'});await A.signInWithPopup(auth,p);}catch(e){say(e?.code==='auth/popup-blocked'?'로그인 창이 차단되었습니다. 이 사이트의 팝업을 허용한 뒤 다시 눌러 주세요.':connectionError(e));}finally{busy=false;buttons();}};
$('logout').onclick=async()=>{if(!auth||busy)return;try{await A.signOut(auth);}catch(e){say(connectionError(e));}};
try{
 const [M,fire,account]=await Promise.all(['firebase-app.js','firebase-firestore.js','firebase-auth.js'].map(p=>import(sdk+p)));
 const app=M.getApps().length?M.getApp():M.initializeApp(firebaseConfig);F=fire;A=account;db=F.getFirestore(app);auth=A.getAuth(app);
 A.onAuthStateChanged(auth,u=>void identify(u));buttons();
}catch(e){$('actor').textContent='로그인 도구에 연결하지 못했습니다. 인터넷 연결을 확인한 뒤 페이지를 새로고침해 주세요.';}

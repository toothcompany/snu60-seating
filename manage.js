import {firebaseConfig} from './firebase-config.js';
import {googleMemberEmail,connectionError,SHARED_DOCUMENT} from './guest-policy.mjs';
import {editingWindowOpen} from './temporary-access.mjs';
import {prepareRosterRevision,ROSTER_ACTION} from './roster-update.mjs';
import {numberedLayout} from './table-grid.mjs';
import {membersAt} from './core.mjs';

const $=id=>document.getElementById(id);
const say=s=>{$('result').textContent=s;};
const sdk='https://www.gstatic.com/firebasejs/13.2.0/';
let F,A,db,auth,memberEmail=null,role=null,epoch=0,busy=false;
function validTarget(){const value=$('target').value.trim();return $('target').validity.valid&&value.length<=254&&/^[^@\s/#?]+@[^@\s/#?]+\.[^@\s/#?]+$/.test(value)?value:null;}
function buttons(){const canSave=!!memberEmail&&!busy&&editingWindowOpen(),enable=canSave&&role==='admin'&&!!validTarget();
 $('seats').disabled=!canSave;
 for(const id of ['both','grant'])$(id).disabled=!enable;
 $('login').hidden=!!auth?.currentUser;$('login').disabled=!auth||busy;
 $('logout').hidden=!auth?.currentUser;$('logout').disabled=busy;$('target').disabled=busy;
}
async function identify(u){
 const now=++epoch;memberEmail=null;role=null;buttons();say('');
 if(!u){$('actor').textContent='기존 관리자 또는 편집 권한이 있는 Google 계정으로 로그인하세요.';return;}
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
 finally{if(epoch===now)buttons();}
}
function describeSeats(raw){
 const layout=numberedLayout(raw);
 return ['정진희','최은재'].map(name=>{
  const a=layout.attendees.find(x=>x.name===name);if(!a)return name+' · 명단 확인 필요';
  const t=layout.tables.find(x=>x.id===a.tableId);
  return t?name+' · '+t.number+'번 테이블 '+(membersAt(layout,t.id).findIndex(x=>x.id===a.id)+1)+'번 좌석':name+' · 미배정';
 }).join('\n');
}
async function showPreview(){
 try{
  const live=await F.getDocFromServer(F.doc(db,SHARED_DOCUMENT));
  if(!live.exists())throw Error('저장된 공동 좌석표가 없습니다.');
  const change=prepareRosterRevision(live.data());
  $('preview').textContent=(change.status==='unchanged'?'이미 반영된 좌석':'최근 공동 배치 기준 예상 좌석')+'\n'+describeSeats(change.next);
 }catch(e){$('preview').textContent='좌석 미리보기: '+connectionError(e);}
}
async function execute(mode){
 const includeSeats=mode!=='grant',includeGrant=mode!=='seats';
 if(!memberEmail||busy||(includeGrant&&role!=='admin'))return;
 const target=includeGrant?validTarget():null,u=auth.currentUser,me=memberEmail,now=epoch;
 if((includeGrant&&!target)||!u)return;
 const assertActor=()=>{if(now!==epoch||memberEmail!==me||auth.currentUser?.uid!==u.uid)throw Error('로그인 계정이 바뀌었습니다. 다시 확인해 주세요.');
  if(!editingWindowOpen())throw Error('공동 편집 기간이 끝났습니다.');};
 const member=includeGrant?F.doc(db,'members',target):null,mine=F.doc(db,'members',me),plan=F.doc(db,SHARED_DOCUMENT),audit=F.doc(F.collection(plan,'history'));
 busy=true;buttons();say('서버에서 권한과 최신 배치를 확인하고 있습니다.');
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
   if(includeSeats){const live=await tx.get(plan);if(!live.exists())throw Error('저장된 공동 좌석표가 없습니다. 권한만 부여한 뒤 공동 좌석표를 확인해 주세요.');
    change=prepareRosterRevision(live.data());}
   assertActor();
   if(includeGrant){if(!dest.exists())tx.set(member,{role:'editor'});else if(existingRole==='viewer')tx.update(member,{role:'editor'});}
   if(change?.status==='applied'){
    const {before,next}=change;
    tx.set(plan,{...next,changeId:audit.id,lastAction:ROSTER_ACTION,updatedBy:u.uid,updatedAt:F.serverTimestamp()});
    tx.set(audit,{before,rev:next.rev,action:ROSTER_ACTION,by:u.uid,at:F.serverTimestamp()});
   }
  },{maxAttempts:4});
  committed=true;
  const [dest,live]=await Promise.all([includeGrant?F.getDocFromServer(member):null,includeSeats?F.getDocFromServer(plan):null]);
  if(epoch!==now)return;
  if(includeGrant&&(!dest?.exists()||!['admin','editor'].includes(dest.data().role)))throw Error('이 계정에 편집 권한이 표시되지 않습니다.');
  const output=includeGrant?target+' · '+(dest.data().role==='admin'?'기존 관리자 권한 유지':'편집 권한 확인'):'계정 권한은 변경하지 않았습니다.';
  if(!includeSeats){say(output+'\n좌석 배치는 변경하지 않았습니다.');return;}
  if(!live?.exists()||prepareRosterRevision(live.data()).status!=='unchanged')throw Error('현재 좌석표가 달라졌습니다.');
  $('preview').textContent='저장된 좌석\n'+describeSeats(live.data());say(output+'\n좌석 2개를 서버에서 확인했습니다.');
 }catch(e){if(now===epoch)say((committed?'서버에서 저장을 수락했지만, 최종 상태를 다시 확인하지 못했습니다. 공동 좌석표를 확인하세요. ':'적용을 완료하지 못했습니다. ')+connectionError(e)+(includeSeats&&includeGrant&&!committed?'\n권한만 먼저 부여하려면 ‘권한만 부여’를 선택하세요.':''));}
 finally{busy=false;buttons();}
}
$('target').oninput=()=>{say('');buttons();};
$('both').onclick=()=>execute('both');$('grant').onclick=()=>execute('grant');$('seats').onclick=()=>execute('seats');
$('login').onclick=async()=>{if(!auth||busy)return;busy=true;buttons();try{const p=new A.GoogleAuthProvider();p.setCustomParameters({prompt:'select_account'});await A.signInWithPopup(auth,p);}catch(e){say(e?.code==='auth/popup-blocked'?'로그인 창이 차단되었습니다. 이 사이트의 팝업을 허용한 뒤 다시 눌러 주세요.':connectionError(e));}finally{busy=false;buttons();}};
$('logout').onclick=async()=>{if(!auth||busy)return;try{await A.signOut(auth);}catch(e){say(connectionError(e));}};
try{
 const [M,fire,account]=await Promise.all(['firebase-app.js','firebase-firestore.js','firebase-auth.js'].map(p=>import(sdk+p)));
 const app=M.getApps().length?M.getApp():M.initializeApp(firebaseConfig);F=fire;A=account;db=F.getFirestore(app);auth=A.getAuth(app);
 A.onAuthStateChanged(auth,u=>void identify(u));buttons();void showPreview();
}catch(e){$('actor').textContent='로그인 도구에 연결하지 못했습니다. 인터넷 연결을 확인한 뒤 페이지를 새로고침해 주세요.';}

import { publishedPlan, RELEASE } from './public-plan.mjs';
import { normalize } from './core.mjs';
import { firebaseConfig, eventId } from './firebase-config.js';
const $=id=>document.getElementById(id);
let role=null, epoch=0, stopMember=null, stopEvent=null;
const say=(text,kind='')=>{ $('publicationStatus').textContent=text; $('publicationStatus').className='publishStatus '+kind; };
function enableSeed(){ $('seed').disabled=$('import').disabled||!['admin','editor'].includes(role)||$('notice').textContent.includes('연습 모드'); }
new MutationObserver(enableSeed).observe($('import'),{attributes:true,attributeFilter:['disabled']});
new MutationObserver(()=>{ const n=$('notice'); if(n.textContent.includes('실제 명단은 공개 코드에 포함되지 않습니다.'))n.textContent=n.textContent.replace('실제 명단은 공개 코드에 포함되지 않습니다.','이름·소속·좌석은 공개보기 대상입니다. 연락처와 운영진 정보는 공개하지 않습니다.');enableSeed(); }).observe($('notice'),{childList:true,subtree:true});
$('seed').onclick=()=>{
  if($('seed').disabled)return;
  try {
    const file=new File([JSON.stringify(publishedPlan())],'snu60-seating-20261110.json',{type:'application/json'}),data=new DataTransfer();data.items.add(file);$('file').files=data.files;$('file').dispatchEvent(new Event('change',{bubbles:true}));
  } catch { say('브라우저에서 바로 적용하지 못했습니다. 공개보기의 ‘초기 배치 JSON’을 받은 뒤 명단 불러오기로 선택하세요.','error'); }
};
async function initializePublication(){
 try {
  const base='https://www.gstatic.com/firebasejs/13.2.0/';
  const [app,A,F]=await Promise.all([import(base+'firebase-app.js'),import(base+'firebase-auth.js'),import(base+'firebase-firestore.js')]);
  const instance=app.getApps().length?app.getApp():app.initializeApp(firebaseConfig),auth=A.getAuth(instance),db=F.getFirestore(instance);
  A.onAuthStateChanged(auth,u=>{
    const token=++epoch;stopMember?.();stopEvent?.();stopMember=null;stopEvent=null;role=null;enableSeed();
    if(!u){say('공개보기에는 초기 배치안이 표시됩니다. 운영진 로그인 후 공동 배치를 적용할 수 있습니다.');return;}
    let publishing=false,queued=false,latestRev=-1;
    async function publishLatest(){
      if(token!==epoch||publishing||!['editor','admin'].includes(role))return;
      publishing=true;queued=false;
      try{
        const rev=await F.runTransaction(db,async tx=>{
          const snap=await tx.get(F.doc(db,'events',eventId));if(!snap.exists())return null;
          const current=normalize(snap.data());
          if(!current.attendees.some(a=>a.id.startsWith('r261109-')))return null;
          if(token!==epoch)throw Error('계정이 변경되어 공개 동기화를 중단했습니다.');
          tx.set(F.doc(db,'publicPlans',eventId),{...current,releaseId:RELEASE,publishedAt:F.serverTimestamp()});
          return current.rev;
        },{maxAttempts:3});
        if(token===epoch){if(rev!==null){latestRev=rev;say(`공개화면 동기화 완료 · 변경 ${rev} · 로그인 없는 화면에서도 같은 배치를 볼 수 있습니다.`,'ok');}else{say('아직 최신 명단이 공동 저장소에 없습니다. 위의 ‘11월 10일 배치안 적용’을 눌러주세요.');}}
      }catch(e){if(token===epoch)say(e.code==='permission-denied'?'공동 편집 저장과 공개 동기화는 별개입니다. 공개 동기화 권한이 아직 없어 공개화면은 11월 10일 초기 배치안을 표시합니다. PUBLIC_SETUP의 보안 규칙을 게시하세요.':`공개화면 동기화 실패: ${e.message||e.code||'네트워크 확인'} · 공개화면은 마지막 공개본을 유지합니다.`,'error');}
      finally{publishing=false;if(queued&&token===epoch)publishLatest();}
    }
    stopMember=F.onSnapshot(F.doc(db,'members',u.email),snap=>{
      if(token!==epoch)return;role=snap.exists()?snap.data().role:null;enableSeed();
      if(!['editor','admin'].includes(role)){stopEvent?.();stopEvent=null;say('공개보기는 누구나 가능하지만, 공동 편집과 공개 동기화는 승인된 운영진만 가능합니다.');return;}
      if(stopEvent)return;
      stopEvent=F.onSnapshot(F.doc(db,'events',eventId),{includeMetadataChanges:true},s=>{
        if(token!==epoch||s.metadata.fromCache||s.metadata.hasPendingWrites)return;
        if(!s.exists()){say('공동 저장소 준비 완료. ‘11월 10일 배치안 적용’을 한 번 눌러 시작하세요.');return;}
        if(s.data().rev===latestRev)return;
        if(publishing){queued=true;return;}publishLatest();
      },()=>say('공동 데이터 읽기 권한을 확인해야 합니다. Firestore 규칙과 관리자 문서를 확인하세요.','error'));
    },()=>say('운영진 권한을 확인하지 못했습니다. 공개보기는 계속 사용할 수 있습니다.','error'));
  });
 }catch{say('공개 동기화 도구에 연결하지 못했습니다. 공개보기의 초기 배치안은 계속 열 수 있습니다.','error');}
}
initializePublication();

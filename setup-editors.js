// Owner setup: publish in Firebase Console; this page never writes any document.
import {firebaseConfig} from './firebase-config.js';
const $=id=>document.getElementById(id);
const preview=()=>{$('preview').open=true;$('rules').focus();$('rules').select();};
async function loadRules(){
 try{
  const r=await fetch('./firestore.rules?v=login-20261112',{cache:'no-store'});if(!r.ok)throw Error();
  const text=await r.text();
  const hashed=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text))),x=>x.toString(16).padStart(2,'0')).join('');
  if(hashed!=='fe4f7bc17d741797a3157e08c6e2f7a08eb1b70dddcc90a028b5781cd092ab3d')throw Error();
  $('rules').value=text;$('copy').disabled=false;$('select').disabled=false;$('result').textContent='Google 로그인과 편집 권한을 확인하는 새 규칙입니다.';
 }catch{$('result').textContent='최신 규칙 파일을 확인하지 못했습니다. 잠시 뒤 페이지를 새로고침하세요.';}
}
$('select').onclick=preview;
$('copy').onclick=async()=>{try{await navigator.clipboard.writeText($('rules').value);$('result').textContent='복사했습니다. 이제 2번 링크를 열어 Firebase에 게시하세요.';}catch{preview();$('result').textContent='전체 규칙을 선택했습니다. 맥은 ⌘C, Windows는 Ctrl+C를 누르세요.';}};
$('check').onclick=async()=>{
 $('check').disabled=true;$('checkResult').textContent='운영 서버에 이번 버전의 확인 경로를 조회하는 중…';
 try{
  const base='https://www.gstatic.com/firebasejs/13.2.0/';
  const [app,F]=await Promise.all([import(base+'firebase-app.js'),import(base+'firebase-firestore.js')]);
  const name='rules-check';const instance=app.getApps().find(x=>x.name===name)||app.initializeApp(firebaseConfig,name);
  const db=F.getFirestore(instance);
  const check=await F.getDocFromServer(F.doc(db,'policyChecks/snu60GoogleEditorsV1'));
  if(check.exists())throw Error('unexpected');
  // A matching deny on a reserved empty control prevents blanket-open rules from showing success.
  try{await F.getDocFromServer(F.doc(db,'policyChecks/snu60EditorsPrivateControl'));throw Error('unexpected');}catch(e){if(e?.code!=='permission-denied')throw e;}
  $('checkResult').textContent='서버가 이번 규칙의 확인 경로에 예상대로 응답했습니다. 좌석표에서 운영진 계정으로 로그인하세요.';
 }catch(e){$('checkResult').textContent=e?.code==='permission-denied'?'새 규칙을 아직 확인하지 못했습니다. 2번의 게시를 마치고 잠시 후 다시 확인하세요.':'서버에서 적용 여부를 확인하지 못했습니다. 인터넷 연결과 Firebase 게시 상태를 확인하세요.';}
 finally{$('check').disabled=false;}
};
loadRules();

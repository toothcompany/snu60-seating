import {copy, applyOperation} from './core.mjs';
import {numberedLayout} from './table-grid.mjs';
export const SHARED_DOCUMENT = 'sharedPlans/snu60';
export const editorRole=role=>role==='editor'||role==='admin';
export function googleMemberEmail(user,claims){
  const email=claims?.email;
  return user?.uid&&!user.isAnonymous&&user.emailVerified===true&&typeof email==='string'&&email.length>0&&!email.includes('/')&&user.email===email&&claims.email_verified===true&&claims.firebase?.sign_in_provider==='google.com'?email:null;
}
export function mayEdit({user, role, connected, pending, online}) {
  return Boolean(user?.uid && !user.isAnonymous && editorRole(role) && connected && !pending && online);
}
export function startingState(remote, seed) {
  if (remote != null) return numberedLayout(remote);
  const s = numberedLayout(seed); s.rev = 0; return s;
}
export function prepareChange(current, operation, rawCurrent=current) {
  // Rules compare this to the *exact* old document, including legacy coordinates.
  // Exclude Firestore metadata such as updatedAt, but never renumber the audit copy.
  const {version,rev,tables,attendees} = rawCurrent ?? current;
  const before = copy({version,rev,tables,attendees});
  const next = numberedLayout(applyOperation(numberedLayout(current), operation));
  next.rev = before.rev + 1;
  return {before, next};
}
export function connectionError(error) {
  const code = String(error?.code || '');
  const messages = {
    'auth/popup-blocked': '로그인 팝업이 차단되었습니다. ‘같은 창에서 로그인’을 선택하거나 Safari·Chrome에서 이 페이지를 열어 주세요.',
    'auth/popup-closed-by-user': '로그인 창을 닫았습니다. 좌석표는 그대로 볼 수 있습니다.',
    'auth/cancelled-popup-request': '이전 로그인 요청이 취소되었습니다. 다시 로그인해 주세요.',
    'auth/operation-not-allowed': 'Google 로그인이 활성화되지 않았습니다. 운영진에게 알려 주세요.',
    'auth/configuration-not-found': '로그인 설정을 확인할 수 없습니다. 운영진에게 알려 주세요.',
    'auth/unauthorized-domain': '이 사이트의 주소가 Google 로그인에 등록되지 않았습니다. 운영진에게 알려 주세요.',
    'auth/operation-not-supported-in-this-environment': '현재 브라우저에서는 로그인 창을 열 수 없습니다. Safari 또는 Chrome에서 열어 주세요.',
    'auth/web-storage-unsupported': '로그인에 필요한 브라우저 저장공간을 사용할 수 없습니다. Safari 또는 Chrome에서 열어 주세요.',
    'auth/network-request-failed': '연결에 실패했습니다. 인터넷 연결을 확인한 뒤 연결 다시 시도를 누르세요.',
    'auth/too-many-requests': '임시 접속 한도에 도달했습니다. 설정을 확인하고 다시 연결해 주세요.',
    'permission-denied': '이 계정에는 이 작업을 할 권한이 없습니다. 운영진에게 편집 권한을 확인해 주세요.',
    'unavailable': '서버와 연결되지 않았습니다. 변경은 저장되지 않았습니다.',
    'failed-precondition': 'Firestore 기본 데이터베이스와 보안 규칙 설정을 확인해 주세요.'
  };
  return messages[code] || error?.message || '요청을 완료하지 못했습니다.';
}

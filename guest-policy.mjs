import {normalize, applyOperation} from './core.mjs';
export const SHARED_DOCUMENT = 'sharedPlans/snu60';
// Anonymous authentication is automatic: visitors never enter an account or password.
export function mayEdit({user, connected, pending, online}) {
  return Boolean(user?.uid && connected && !pending && online);
}
export function startingState(remote, seed) {
  if (remote != null) return normalize(remote);
  const s = normalize(seed); s.rev = 0; return s;
}
export function prepareChange(current, operation) {
  const before = normalize(current);
  const next = applyOperation(before, operation);
  next.rev = before.rev + 1;
  return {before, next};
}
export function connectionError(error) {
  const code = String(error?.code || '');
  const messages = {
    'auth/admin-restricted-operation': 'Firebase Authentication에서 익명 제공업체를 사용 설정해야 합니다. 위의 저장 설정 안내를 열어주세요.',
    'auth/operation-not-allowed': 'Firebase Authentication → 로그인 방법 → 익명을 사용 설정해 주세요. Google 로그인은 필요 없습니다.',
    'auth/configuration-not-found': 'Firebase Authentication에서 익명 제공업체를 사용 설정해 주세요.',
    'auth/network-request-failed': '연결에 실패했습니다. 인터넷 연결을 확인한 뒤 연결 다시 시도를 누르세요.',
    'auth/too-many-requests': '임시 접속 한도에 도달했습니다. 설정을 확인하고 다시 연결해 주세요.',
    'permission-denied': '공동 저장 권한이 아직 없습니다. 저장 설정 안내의 새 Firestore 규칙 전체를 게시해야 합니다.',
    'unavailable': '서버와 연결되지 않았습니다. 변경은 저장되지 않았습니다.',
    'failed-precondition': 'Firestore 기본 데이터베이스와 보안 규칙 설정을 확인해 주세요.'
  };
  return messages[code] || error?.message || '요청을 완료하지 못했습니다.';
}

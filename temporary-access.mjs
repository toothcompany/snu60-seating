// Owner-approved, short-lived public editing. Browser IDs are labels, NOT credentials.
export const EDITING_END = '2026-11-16T00:00:00+09:00';
export const EDITING_END_LABEL = '2026년 11월 16일 00:00 (한국시간)';
export function editingWindowOpen(now = Date.now()) {
  return Number(now) < Date.parse(EDITING_END);
}
export function browserVisitor(storage, randomId) {
  const key = 'snu60-public-browser-id';
  try {
    const existing = storage?.getItem(key);
    if (typeof existing === 'string' && /^guest-[A-Za-z0-9-]{16,64}$/.test(existing)) return {uid:existing};
  } catch {}
  const uid = 'guest-' + randomId();
  if (!/^guest-[A-Za-z0-9-]{16,64}$/.test(uid)) throw Error('방문자 표시를 만들지 못했습니다.');
  try { storage?.setItem(key, uid); } catch {}
  return {uid};
}

# 로그인 없는 공동 편집 (2026-11-10)

The owner explicitly requested login-free viewing AND saving. `index.html` now uses `shared-editor.js`. Visitors do not press a login button or provide an email/password. The app automatically creates or reuses a Firebase anonymous session, solely to bind writes and history to an opaque browser identity. This is NOT verification of the person's real identity and does not restrict editing to invitees: anyone reaching the site can edit after setup.

## Owner setup — two settings

1. Firebase Authentication → 로그인 방법 → 새 제공업체 추가 → 익명 → 사용 설정 → 저장.
2. Copy the complete current `firestore.rules` into Firestore → 규칙 and 게시. `setup-shared.html` provides a copy button. Updating GitHub does not deploy Firebase rules.

Do not delete the existing Google provider or members administrator document. They still protect the legacy private editor.

## Data boundaries

- `sharedPlans/snu60`: public seating state; get without auth, writes by automatic anonymous or verified Google sessions. Other document IDs are not opened. Document deletion is prohibited.
- `sharedPlans/snu60/history`: limited history reads for sessions; append-only audit records paired atomically with state changes. Each record must contain the true previous state. Changes without a matching history write are rejected.
- `members`, `events/snu60`, and the legacy event history remain under the original staff authorization rules. Guest clients never subscribe to them.
- The initial published roster is used only before a shared state document exists. No existing shared state is overwritten on page load. Initial save or first drag stores the seed and change atomically. Latest server state wins on reload.
- The new shared store does not automatically merge legacy private edits. Do not use the old editor page for the same live seating plan.

Only names, affiliation labels, table positions, seat order and opaque visitor IDs are intended here. Do not enter contact details, addresses, emails or private notes into public attendee fields. Public editing permits unwanted but valid changes; rules are not a moderation system. Keep JSON backups, share only with intended collaborators, and revoke shared write access after the event.

## Checks and limits

`npm run check && npm test` test syntax and model behavior. The separate emulator workflow tests anonymous read/write, revision protection, mandatory append-only history and private-data isolation. Emulator success is NOT proof that production Anonymous auth is enabled or that production Firestore rules were published.

End-to-end confirmation requires opening the live site in two browsers, observing `공동 저장 완료`, reloading, and seeing the same update in both. Offline edits are disabled. Until setup succeeds, the published seed is viewable but changes are disabled, not silently saved to localStorage.

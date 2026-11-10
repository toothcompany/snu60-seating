# 임시 공개 공동 편집

The owner explicitly approved login-free viewing AND saving for this week's event. The main page now uses no Firebase Authentication SDK: visitors do not press login, enter credentials or require the Anonymous provider to be enabled. A random browser label is used only for convenient history grouping and undo. It is client-supplied and NOT an authenticated identity, secret or access control.

## One console step remains

Open `setup-shared.html`, copy the complete current `firestore.rules`, paste it into Firebase → Firestore → Rules, and Publish. Updating GitHub does not publish production Firebase rules. Do not remove existing Google login settings or members documents; the legacy private editor still uses them.

The production deadline for public writes is **2026-11-16 00:00 Asia/Seoul**, equivalent to **2026-11-15 15:00 UTC**. The browser disables editing at this time and, more importantly, the published Firestore rules reject writes using server request.time. No scheduled job or future manual action is needed to enforce this cutoff.

## Boundaries and residual risks

- Only `sharedPlans/snu60` and the mandatory paired history records accept unauthenticated writes before the deadline.
- Document deletion is blocked. Each update increments revision and atomically writes append-only history with the genuine previous state.
- Anyone can still make unwanted but schema-valid edits (including removing attendees from the state). Revision checks, immutable history and expiry do not prevent malicious editing, identity spoofing, copied names or usage/quota abuse.
- Names, affiliations and seating are intentionally public by the owner's request. Do not put phone numbers, addresses, emails or private notes into public data.
- `members`, the private `events/snu60` document and legacy history keep their original role-based protections. Other plan IDs are not opened.
- The published seed is shown before a server plan exists; page load does not overwrite an existing plan. First explicit save or edit stores it.
- After the deadline, reading and backup remain possible. Public copies, the repository's published seed and existing data are not automatically deleted. The owner can remove public data separately after the event.

## Verification

Unit tests cover model behavior, exact Korean-time cutoff, browser labels and absence of Auth SDK use. Emulator tests use open/expired deadline fixtures to verify unauthenticated paired saves, immutable history, stale revision rejection, private-data isolation and server-side expiry. Their success does not prove production rules were published.

Before relying on the live plan: publish rules, see `공동 저장 완료`, reload, and open another browser to check the same update. JSON backups remain recommended. Offline edits are blocked rather than falsely reported saved.

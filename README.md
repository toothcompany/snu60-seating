# 서울대학교 예방치학교실 창립 60주년 · 함께 만드는 자리

[좌석배치표](https://toothcompany.github.io/snu60-seating/) · [운영진 로그인 및 서버 규칙 설정](https://toothcompany.github.io/snu60-seating/setup-shared.html)

행사 링크로는 로그인 없이 최신 배치와 이름·소속을 볼 수 있다. 좌석 이동, 명단 수정, 저장, 이전 배치 복원은 Google 로그인과 사전 등록된 editor/admin 역할이 필요하다. 한국시간 2026년 11월 16일 00:00부터는 운영진도 공동 배치를 수정할 수 없다. 기존 `sharedPlans/snu60` 문서가 계속 우선하며, 명단을 다시 올릴 필요가 없다.

무대 앞부터 4줄, 각 줄 왼쪽부터 1~12번이다. 이름을 끌면 참석자를 이동하거나 자리를 교환하고, 테이블 원을 다른 원에 놓으면 명단이 함께 이동한다. 정원 초과는 빨강, 미달은 파랑으로 표시한다. 상단의 ‘한 단계 되돌리기’와 ⌘Z/Ctrl+Z로 내 최근 변경을 되돌릴 수 있다.

운영 서버의 권한 전환은 [Firestore 규칙](https://console.firebase.google.com/project/snu60-seating/firestore/rules)을 게시해야 끝난다. 배포·계정 등록은 [운영 안내](./SHARED_EDITING.md)를 따른다. 초기 명단과 과거에 공개된 자료가 비공개로 전환되지는 않는다.

검사: `npm run check`, `npm test`. GitHub Actions에서 브라우저 동작과 Firestore 에뮬레이터의 권한 정책을 검증한다.

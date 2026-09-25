# 멸망전 1.1.2 · 운영 중계 서버와 revision 조건 충돌

배포 전 검증 기록. 후보·운영 smoke 완료 후 배포 근거를 연결한다.

## 원인과 변경

1.1.1의 행별 큐는 로컬 HTTP에서는 동작했지만 운영의 응답 중계 조건을 재현하지 못했다. 운영 DB receipt의 최근 참가 심사 4건은 200 저장 성공이고, 같은 시각 Vercel request log는 412였다. 즉 DB에 저장된 후 `If-Match` 요청 헤더와 새 revision의 응답 `ETag`가 달라 중계 서버가 성공 JSON을 plain-text 412로 바꿨다. 클라이언트는 JSON을 읽지 못해 결과 미확인 상태로 심사를 잠갔다. 운영 참가자의 상태를 바꾸지 않고 읽기 전용으로 확인했다.

[운영 읽기 검증](./edge-read-only-proof.json)에서 같은 공개 GET이 기본 요청 200, 다른 `If-Match` 412 plain text, `X-Destruction-Revision` 200이었다. [수정 전 재현](./before-fix.txt)은 기존 운영 빌드를 응답 조건을 재현한 로컬 중계 서버에 연결했을 때 저장 후 다음 버튼이 열리지 않는 것을 보여준다.

- 멸망전 클라이언트의 생성·관리자·참가자 mutation은 `X-Destruction-Revision: "N"`으로 같은 revision 조건을 보낸다. HTTP의 응답 조건으로 처리되는 `If-Match`는 브라우저 요청에서 제거했다.
- 서버는 기존의 강한 ETag 형식 검증기를 재사용한다. 음수·weak ETag·wildcard·중복 값·안전 정수 범위 밖 값은 거절한다. 누락은 428, 잘못된 형식은 400이다. 이전 `If-Match` 입력도 서버 경계에서 호환하며 두 헤더가 다르면 400이다. 배포 중계 환경의 호출자는 전용 헤더를 사용해야 한다.
- 트랜잭션의 revision 비교, 권한·소유권 검사, 멱등성 fingerprint/receipt, 큐 순서와 다른 운영자의 변경 보호는 변경하지 않았다. stale revision은 계속 412로 거절한다.
- DB·migration·모집 인원·포지션 규칙 변경 없음. migration head `0046_overconfident_robbie_robertson` 유지.

## 검증

- [전체 검사](./check.txt): lint 오류 0(기존/로컬 제외 파일 경고 58), 타입·ERD·계약445·단위1009 PASS/1 SKIP·이미지 검사·운영 빌드 통과.
- [현재 트리 비밀정보 검사](./secrets.txt) 통과. 전체 Git 이력 검사를 의미하지 않는다.
- `PG_BIN_DIR`를 PostgreSQL18 bin으로 지정하고 `npx tsx scripts/test-db/run-destruction-browser-qa.ts` 실행. `--interactions-only`는 화면 매트릭스 촬영을 생략하고 같은 격리 DB·중계 서버·브라우저 상호작용을 실행한다.
- 중계 서버는 backend 응답을 받은 후 If-Match와 응답 ETag를 비교해 plain-text 412로 치환한다. 새 요청들은 전용 revision 헤더를 사용하고 이 치환을 일으키지 않아야 한다.
- [브라우저 결과](../../qa/destruction-review-refresh-2026-09-25/interactions.json): 74화면·18개 상호작용 PASS, axe 위반·브라우저 예외 0. [전송 검사](../../qa/destruction-review-refresh-2026-09-25/edge-transport.json): 전용 헤더 mutation 21건, If-Match mutation 0건, 중계 응답 치환 0건. [인증 검사](./auth-http.txt) PASS.
- 대회 생성, 참가 신청·심사 연속 처리, 저장 후 RSC 응답 지연 중 다른 행 활성 유지, 응답 유실 재확인, 실제 stale revision 충돌, 화면 갱신 사이의 외부 변경 보존, 경매 카드·효과음·모바일·접근성을 확인한다.

## 복구와 한계

이전 1.1.1 앱으로 단순 복구하면 운영 중계 문제가 다시 발생한다. 서버의 이전 헤더 호환은 유지하되, 운영 클라이언트는 전용 revision 헤더를 유지하는 forward-fix로 복구한다. 스키마 역방향 변경이나 저장된 심사 삭제는 필요하지 않다.

운영 인증 사용자의 심사를 대신 실행하지 않았다. 운영 검증은 공개 읽기·인증 경계·배포 상태, 실제 저장 동작은 격리 DB와 배포 서버의 응답 조건을 재현한 환경으로 구분한다.

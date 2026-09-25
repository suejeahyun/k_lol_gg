# 멸망전 참가 심사 1.1.1

운영 배포 전 검증 기록. 배포 후 후보·운영 smoke와 registry에 배포 ID를 연결한다.

## 변경과 범위

참가 확정·예비 선수·신청 거절 시 전체 신청 목록을 잠그던 동작을 행 단위로 바꿨다. 선택한 행만 잠그고 처리 중/대기 중을 표시하며 다른 신청의 심사와 검색은 계속할 수 있다. 공통 mutation의 If-Match·멱등성 키·재확인·화면 갱신을 그대로 사용해 클릭한 순서대로 한 건씩 저장한다. 다음 요청은 앞선 저장의 최신 aggregate를 받은 뒤 전송하되, 처음 선택할 때부터 이어진 예상 revision을 유지한다. 다른 운영자의 변경이 화면 갱신에 섞여도 대기 결정을 새 revision에 자동으로 재적용하지 않는다.

연결 오류 또는 충돌 시 미전송 대기 요청을 취소하고 건수를 안내한다. 응답 유실 요청은 기존 키로 확인하고 최신 상태가 복구될 때까지 추가 심사를 막는다. 모집 마감·일정 변경·대회 취소는 심사 대기가 끝난 뒤 실행할 수 있다. 동일 선수의 연속 클릭은 즉시 중복 제거한다.

협곡·칼바람·증바람 공통 모집 UI만 변경했다. DB/API/인원 규칙/포지션 규칙/경매 연출은 변경하지 않았다. migration head는 `0046_overconfident_robbie_robertson`이다. 운영 참가자의 신청 상태는 검증을 위해 변경하지 않는다.

## 재현과 검증

- `npm run check`: lint 오류 0(기존 57 + Git 제외 로컬 스크립트 1 경고), 타입·ERD·계약 445·단위 1,009 PASS/1 SKIP, 이미지 검사·운영 빌드 통과. [로그](./check.txt).
- `npm run verify:auth-http`: 인증·TOTP·쿠키·역할 경계·로그아웃·운영 fixture 차단 통과. [로그](./auth-http.txt).
- `node scripts/check-secrets.mjs --tree-only`: 현재 트리 비밀정보 검사 통과. [로그](./secrets.txt).
- `PG_BIN_DIR`를 PostgreSQL 18 bin에 지정하고 `npx tsx scripts/test-db/run-destruction-browser-qa.ts` 실행. 격리 DB에서 세 모드의 모집~종료 계약을 실행한 뒤 실제 Next 운영 빌드를 사용한다. 실제 운영 자격증명/참가자를 테스트에 사용하지 않는다.
- 390/768/1440px 74화면, 16개 상호작용 PASS. axe 위반·브라우저 예외 0. [브라우저 결과](../../qa/destruction-recruitment-review-2026-09-25/interactions.json), [74개 화면 검사](../../qa/destruction-recruitment-review-2026-09-25/screenshots/index.json), [행별 대기 화면](../../qa/destruction-recruitment-review-2026-09-25/recruitment-queued.png).

회귀 항목: 첫 PATCH를 지연시킨 상태에서 다른 두 선수 선택, 같은 행 중복 클릭, 총 3회 순차 저장·정확히 20명 확정; 성공 응답 유실과 미전송 2건 취소, 원래 키 재확인 중 추가 입력 차단·복구; 다른 운영자의 변경으로 412 충돌 시 미전송 요청 취소·상대 변경 보존. 저장 응답~화면 갱신 사이 외부 변경도 덮어쓰지 않는 것을 확인한다. 기존 12개 상호작용에는 단계 클릭·뒤로가기·생성 폼·로그인 신청·카드 뒤집기·WAV 효과음·모바일 경매·공개 화면·접근성 검사가 포함된다.

## 복구

스키마 변경이 없어 이전 `destruction-modes-v1.1.0` 앱으로 복구할 수 있다. 그 경우 참가 심사의 전체 잠금이 다시 나타난다. 저장 완료된 신청은 보존하며 데이터 삭제나 역방향 migration은 필요하지 않다.

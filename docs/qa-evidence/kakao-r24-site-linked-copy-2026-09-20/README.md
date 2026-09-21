# R24 사이트 연동 복사 참가 QA

상태: 소스·설치 산출물 및 로컬 테스트·빌드 확인 완료. 운영 배포·운영 DB migration·휴대폰 교체·커밋·태그 미실시.

작업 경로: `E:\k-LOL.GG\worktrees\kakao-v4-gateway`  
기준 HEAD: `b4d56f58`, 브랜치 `feat/kakao-v4-gateway-20260910`. 기존 R23 작업과 사용자 파일을 보존했다.

## 변경 내용

- 짧은 파티·내전 양식으로 복사 → 이름 추가 → 전체 전송 → 결과·최신 양식을 제공한다.
- 처음 모집하기와 기존 모집 참가하기를 분리한다. 처음 파티 양식에서는 시간·게임 설정, 미입력 시간은 미정.
- 추가 전용 저장과 서버 원본 코드로 동시 참가를 합친다. 기존 이름 삭제·교체·이동, 자동 예비 전환, 탈퇴자 되살림을 차단한다.
- 내전은 사이트 회원·시즌 신청에 연결한다. SITE 우선·확정 상태·기존 선호라인을 보존하고 회원 확인 필요를 별도 표시한다.
- 실제 SITE null-slot + 카카오 신청 + 미등록 대기 혼합 출력의 파싱→재전송까지 검증했다.
- 카카오 스크림을 종료하되 과거 DB·사이트·관리자 기록은 보존한다.

정책: [ADR 0010](../../architecture/0010-kakao-site-linked-copy-forms.md). R23 기록은 역사적 증거로 남기며 현재 정책은 R24가 우선한다.

## 검증 근거

| 검증 | 결과 | 근거 |
| --- | --- | --- |
| 전체 검사 `npm run check` | exit 0; 단위 862 PASS + DB 전용 1 skip, 계약 410/410, production build 93 pages | `npm-check.log` |
| lint·타입·ERD | 오류 0·경고 319, typecheck PASS, 103 tables / 165 FK 일치 | `npm-check.log` |
| 격리 PostgreSQL 모집·내전·운영 양식 | 59/59 PASS, skip 0 | `db-contracts.log` |
| 공개·비공개 ES5/Rhino | PASS, 경고 후보 0 | `rhino-audit.log` |
| 공개·비공개 SHA-256·LF/CRLF | 아래 값과 일치 | `artifact-check.log` |
| 현재 트리 비밀값 검사 | PASS | `secret-scan.log` |
| V1 원본 fixture·compatibility JSON | 기준 HEAD 대비 diff 없음 | `git diff --exit-code -- tests/fixtures/...` 읽기 검사 |
| 실제 휴대폰 컴파일·카카오 송수신 | 미실시 | 승인된 설치 후 확인 필요 |

DB 검사는 disposable PostgreSQL 18 cluster에서 수행했다. 새 migration을 포함한 스키마, 코드 scope·대상·날짜 바인딩, 동시 발급, rollback, 06:00 만료, DB 직접 우회 제약, 동시 참가·사이트 보존을 확인했다. 운영 DB를 테스트에 사용하지 않았다.

lint 경고는 보존된 private 과거 설치본·백업과 생성 JS 등에 포함된 미사용 변수 경고를 포함한다. 경고 0이라고 주장하지 않는다. 단위의 DB 전용 skip 1개는 격리 DB 실행에서 PASS했다. 전체 검사 중 구형 UI 기대값·코드 없는 테스트 대역의 실패를 R24 계약에 맞춰 갱신한 뒤 최종 전체 검사를 재실행했다.

## 설치 산출물

버전: `KLOL_KAKAO_BOT_V40_R24_2026_09_20`

| 용도 | LF / CRLF 문자 | SHA-256 |
| --- | --- | --- |
| 공개 검토본, 설치 금지 | 62,928 / 64,769 | `b1ee39b0c48f925d2d3b39831bd720c4e82356fef999eb168b785d29fb7e85fe` |
| `.private/KLOL_KAKAO_BOT_V1_STRICT_PRIVATE_MESSENGERBOT_R.js` | 61,217 / 63,059 | `49cbf16a70d0e34f5ebabfa3181baf012a6548cf405e1b9a8170f728aec6ed39` |

공개 경로: `integrations/messengerbot-r/v1-strict/KLOL_KAKAO_BOT_V1_STRICT_MESSENGERBOT_R.js`.

기존 R23 private은 `.private/backups/KLOL_KAKAO_BOT_V1_STRICT_PRIVATE_MESSENGERBOT_R.pre-r24-20260920-065116-919.js`에 보존했다. SHA-256 `e81d1f800f4a52d66f3afde85f21b16546a527db7dc18ccdf73bf1d246951a6c` 일치, private 설치본은 Git ignore 상태다. 실제 비밀값은 로그·문서에 포함하지 않는다.

## 배포 조건·복구·남은 위험

1. 이번 작업에서는 운영에 반영하지 않았다. 승인 후 **migration 0040 → 서버 R24 → 휴대폰 R24** 순서로 적용한다. migration은 새 테이블·인덱스 생성만 하며 기존 기록을 삭제하지 않는다.
2. 복구 시 서버와 휴대폰을 함께 이전 버전으로 복원한다. 새 snapshot 테이블을 급히 삭제하거나 기존 명단을 되돌리는 데이터 변경은 필요하지 않다.
3. 실제 MessengerBot R 및 카카오 전송은 미검증이다. 공개 파일은 CRLF 기준 제한까지 766자 여유이므로 설치 파일에 임의 문구·코드를 추가하지 않는다.
4. 코드 만료 후 저장은 거부되나 물리 정리는 요청당 최대 256개다. 무트래픽 시 원본 개인정보가 더 오래 남을 수 있다. 정기 정리·보존기간 모니터링은 후속 운영 작업이다.
5. 내전 이름은 계정 인증을 대신하지 않는다. 미등록·동명이인 확인은 기존 가입·운영진 검토 절차가 필요하다. 기존 SITE 명단에 구분 불가능한 동명이인이 이미 있으면 안전을 위해 복사 저장을 거부할 수 있다.
6. 최초 모집 정보를 변경한 뒤 예전 빈 파티 양식을 제출하면 이름만 추가했어도 최신 양식 재복사를 요구할 수 있다. 활성 모집의 시간·게임 수정은 일반 참가 복붙 범위가 아니다.
7. 운영에서 실제 휴대폰 두 방, 동시 참가, 미등록 내전, 사이트 선신청·라인 보존, 06:00 경계와 응답시간을 승인된 적용 후 확인한다.

복붙 공지: [DISCORD_NOTICE.md](./DISCORD_NOTICE.md). 다음 패치 추천 4개: [R24 패치 기록](../../patch-notes/2026-09-20-kakao-r24-site-linked-copy.md).

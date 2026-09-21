# 사이트 충원 알림·회원 연결 검토 — 소스 QA

- 작성일: 2026-09-22 KST
- 기능 후보: `kakao-site-notices@1.0.0` (최종 release registry/tag는 총괄 릴리스에 연결)
- 최종 통합: source `c5cbbcd8`, DB0044로 서버 운영 반영. 알림 전용 DB9·전체 DB139·339화면 PASS. 아래 담당별 기록은 당시 집중 검사이며, [통합 QA](../operational-readiness-v1.0.0-2026-09-22/README.md)를 따른다. **알림 OFF·휴대폰 미설치·실카카오 수신 미확인**.
- migration: outbox Drizzle 원본 `src/platform/db/schema/kakao-site-notices.ts`; migration 생성·fresh/upgrade 검증 및 배포는 총괄 통합 절차에서 관리.

## 변경

1. SITE 본 참가 <10→10 전이 때 신청 저장 transaction 안에서 알림 outbox를 기록. 동일 application revision 중복 차단, 취소 재충원은 새 이벤트. 대기 중 이전 전이의 안내는 새 전이가 대체.
2. 기본 OFF + 명시 target HMAC. 기존 내전의 FEATURES 설치 범위와 source hash가 일치하는 round만 enqueue. 별도 프로토콜 HMAC, installation/target 비교, timestamp/nonce 검증 후 REGISTER/POLL/ACK. 파티용 RECRUIT scope는 알림 대상으로 추정하지 않음.
3. 2분 lease, 최대 20회, backoff, 현재 정원·마감 재확인, 최대 24시간/운영일 06시 만료, 30일 terminal retention. 명단·개인정보 없는 고정 안내.
4. MessengerBot R **0.7.29a 기준** 별도 알림 companion. 일회용 등록 메시지의 replier만 보관하며 방이름이나 channelId로 재검색하지 않음. 재시작·재컴파일 후 재등록. 영속 dedupe 기록, SDK 결과 불명확 시 자동재발송 차단.
5. 기존 `linkReason=UNVERIFIED`를 회원 연결 검토 목록·상세의 한글 표시와 필터에 반영. DB enum 추가 없음. 일반 미일치 필터와 후보 1명 미확인 필터 구분.

## 실행 근거

| 검사 | 결과 |
|---|---|
| `npx tsx --test tests/kakao-site-notices.test.ts` | 6 tests 통과: OFF/설정, 실제 classifier·authorizer의 FEATURES 내전 scope 일치와 RECRUIT 거부, HMAC/변조/scope, DTO, 만료/UNVERIFIED, 실제 Request/Response HTTP 인증 경계·no-store·replay/lease 오류 |
| `node --test tests/kakao-site-notice-phone.test.mjs` | 6 tests 통과: ES5·길이, 등록·오발송 차단, ACK손실·재시작 dedupe, crash PREPARED·불확실 전송, 잘못된 target·stale lease·저장실패, SDK 명시거부 재시도 |
| `node --test tests/season-kakao-pending-http-ui.test.mjs` | 기존 HTTP/UI 계약 3 tests 통과 |
| 변경 파일 focused ESLint | exit 0 |
| `npx tsc --noEmit --pretty false` | 최초 검사 exit 0. 후속 통합 타입 오류 수정 뒤 총괄 `npm run check`도 통과 보고를 받음. 최종 로그·전체 DB 결과는 총괄 통합 증거를 따른다 |
| `node scripts/build-private-site-notice-companion.mjs` | 기본 OFF 비공개 설치본 생성, 기존 파일 백업, ES5/Rhino warning·LF/CRLF 65,535자 경계 검사 통과 |
| `tests/database/kakao-site-notices.contract.test.ts` | 테스트 작성됨. 실제 격리 DB 실행 결과는 총괄 통합 증거에 기록해야 함 |

별도 DB 계약은 실제 SeasonService 9→10/10→10/재시도, audit 실패 rollback, 취소 재충원, UNVERIFIED 분리, metadata가 없는 다른 scope·모드의 과거 pending 격리, scope/target/nonce, concurrent claim, lease expiry/구 lease ACK, terminal uncertain/attempt bound/retention을 검사한다. 사이트 명단과 발송 전 정원 확인은 카카오 명단과 같은 sourceRoomHash·모드를 사용한다. 운영 DB를 사용하지 않는다.

## 남은 실제 경계

- 0.7.29a의 비동기 replier 유지·백그라운드 30초 타이머·절전/알림 권한·재시작 후 재등록은 기기에서 확인해야 한다. 최신 channelId SDK 호출은 사용하지 않는다.
- `DELIVERED`는 SDK 호출 수락 기록이며 실카카오 수신 영수증이 아니다. 전송 직후 프로세스 종료 또는 저장실패는 일부 안내가 누락될 수 있다. `SEND_UNCERTAIN`은 중복발송을 피하려고 자동재전송하지 않는다.
- target/server ENABLED/companion 설치·등록 확인 전 OFF 유지. 실제 메시지를 이번 소스 QA 과정에서 발송하지 않았다.
- 총괄 통합 소스에서 기존 인증된 daily-close transaction도 `pruneSiteNotices`를 호출하도록 연결했다. 각 만료·보관정리 최대 500건, `skipLocked`, `siteNoticesExpired`·`siteNoticesRetired` 감사 건수로 폰 오프라인 상태에서도 정리한다. 실제 예약 실행·운영 배포는 별도 확인 대상이다.

설치·복구·전체 조건은 [companion 설치 안내](../../../integrations/messengerbot-r/site-notices/README.md)를 따른다.

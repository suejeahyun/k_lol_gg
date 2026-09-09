# Kakao R8 controller authorization + authoritative sync QA

## 범위와 기준

- 기준 커밋: `f20acc43e5528572b0be0188719149e04fa29a84` (`fix(kakao): unify slash commands and party metadata`)
- 격리 브랜치: `fix/kakao-slash-command-parity`
- 생성 버전: `KLOL_KAKAO_BOT_V41_V2_2026_09_09_R8_CONTROLLER_AUTH_SYNC`
- migration: `0030_secret_darwin.sql` (파일 생성만 수행, 운영 DB 미적용)
- 운영 배포·운영 DB 쓰기·MessengerBot R 설치: 수행하지 않음

## 확인된 수정

- 파티/스크림 생성 시 서명된 sender를 생성자 controller로 저장한다. 스크림 JOIN 성공 시 상대 발신자를 상대 팀장 controller로 저장하고 REOPEN 시 해제한다.
- 모집 생성·조회·JOIN과 lifecycle 변경을 명령별 정책으로 분리했다. 다른 방은 404, 같은 방 비소유자는 403, 생성자·상대 팀장·sender allowlist 운영자는 허용한다.
- `/V2모집 <JSON>`은 sender allowlist 또는 `NODE_ENV != production`이며 `KAKAO_RAW_RECRUIT_COMMANDS_DEVELOPMENT_ONLY=true`인 경우만 허용한다.
- 휴대폰 transport가 `COMPAT_V1`/`RAW_V2` 출처를 서명 body에 넣으며, 서버는 이 표식이 없는 Kakao 모집 body를 거부한다.
- 내전 전체 양식은 opaque room hash + 신청일 + 회차 + `RIFT` 범위로 동기화한다. 누락된 같은 범위 KAKAO 미검토 신청은 hard delete 없이 `CANCELLED`로 전환하고 감사 이벤트를 남긴다.
- SITE 신청, 관리자 확정/예비/거절, 다른 방·회차, provenance 없는 기존 KAKAO 행은 authoritative sync가 취소하지 않는다.
- 완전한 빈 1~정원 양식을 0명 동기화로 허용한다. 헤더·날짜·회차·협곡 모드·정원·연속 슬롯이 하나라도 불완전하면 서버 호출 전에 거부한다.
- 전체 양식 맨 앞의 ASCII `/`와 전각 `／`는 한 번만 제거한다. URL, 중간 slash, `//`, slash 뒤 공백 guard는 유지한다.
- 외출 양식은 간편 공지, `2. 양식작성`, 실제 `<외출>`, literal `&lt;외출&gt;` 래퍼를 같은 payload로 해석한다. 기간·사유·범위 누락은 서버 호출 전에 항목별로 안내한다.
- 외출 등 member-safe 운영 양식 제출은 허용 방의 일반 발신자에게 열고, 관리자 검토·삭제는 기존 ADMIN 세션/TOTP 경계를 유지한다.
- 제출 receipt 범위에 room+sender 해시를 넣어 같은 멱등성 키/본문도 다른 방 또는 다른 발신자와 충돌하지 않게 했다. 원문 room/sender는 공개 DTO에 포함하지 않는다.
- 연동 실패를 양식 필드 누락(400), 연동/서명 설정(401), 미연동 방(403), 기능 권한 부족(403)으로 구분한다. 미연동 방은 `/V2연동확인` 결과를 관리자에게 전달하도록 안내한다.

## 운영 장애 읽기 전용 조사

- 대상: production `k-lol-gg.vercel.app`, project `k-lol-gg`, main 배포 `dpl_GEHKurQ58nmTLQb7k1tJ6pgfv6rn` (기준 commit `e408bdd50260b9f48ebea5ee509d34aced295ca6`).
- 2026-09-09 12:18:33.050, 15:36:49.894, 15:36:58.649, 15:37:05.579 KST의 `POST /api/integrations/kakao/operation-forms`가 모두 `KAKAO_WEBHOOK_REJECTED`, `ROOM_FORBIDDEN`으로 종료된 것을 확인했다. 마지막 함수 실행은 7ms이고 outgoing request가 없어 DB/외부 서비스 진입 전 차단이다.
- 검증 순서상 HMAC 확인 뒤 room allowlist를 판정하며 operation-forms는 이미 일반 발신자 허용 정책이었다. 따라서 **서명·서버 주소·sender capability가 아니라 room allowlist 불일치가 확정 원인**이다.
- probe room/sender fingerprint는 운영자가 별도 보관하며 코드·fixture·이 문서에 하드코딩하지 않았다.

### 별도 운영 room hotfix 후속 증거

- 기존 allowlist 1개를 보존하고 확인된 신규 room 1개만 추가했다. 정규화 후 2개, duplicate 0, wildcard 없음이며 sender/secret/다른 env는 변경하지 않았다.
- 변경 전 집합 SHA-256 `1b145d58492c59a043c404dd4cf176b41638b1c0b442f295c475c05f85014901`, 변경 후 집합 SHA-256 `6d5ddd6d9433c0ee87db1d7e8ec7c4eb4ae2c4b1a55651bd7a6f1b8d575e52c7`; Vercel env history가 rollback 근거다.
- 기존 운영 소스 `e408bdd50260b9f48ebea5ee509d34aced295ca6`를 deployment `dpl_7ggWSkbjf3Qq9aoQaGT8Bn6hf2ue`로 재배포했고 production alias와 `/api/health` 200 `status: ready` 및 DB `select 1`을 확인했다.
- 이 hotfix는 room allowlist 복구만 반영한 것이다. 이 R8 commit/migration/휴대폰 코드는 아직 운영 미배포이며, 실제 외출 양식 재전송의 2xx 또는 필드 오류 응답도 아직 미확인이다.

## 검증 증거

- contracts 209/209, unit 477/477, TypeScript typecheck 통과.
- 격리 PostgreSQL 18 `recruiting` scope: 9/9 통과. controller 2xx/403/404, 재전송, 방·발신자별 외출 멱등성 격리, 2→1→2→0, 확인 필요 철회, SITE/관리자 확정 보존, 다른 방·회차 격리를 실제 transaction으로 확인했다. 클러스터 종료·임시 경로 제거도 확인했다.
- 봇 집중 fixture 27/27: 일반/ASCII slash/전각 slash 빈 전체 양식 parity, 불완전 빈 양식과 double/URL/중간 slash 거부, 외출 4개 래퍼 동일 payload, 필드 누락 시 제출 0회, 오류 분류를 확인했다.
- 휴대폰 설치본: LF 기준 64,489자(<65,535, 여유 1,046자), 75,669 bytes, 966줄, SHA-256 `f0f5f5d950c75b93a573a8167ae48ea02e812936084dc7faf3096063ad06839d`. 모든 LF가 CRLF로 바뀌는 보수적 계산도 65,454자로 한도 안이다.
- 개발 전체본: 114,559자, 125,873 bytes, 2,653줄, SHA-256 `97647b713a9b2a27760a9440ee187f843dbc71a5a221384515ac15acf62e918d`.

## 배포 주의

R8 서버와 R8 휴대폰은 모집 body의 필수 출처 표식 때문에 R7과 교차 호환되지 않는다. migration → 서버 → 휴대폰을 하나의 점검 시간에 연속 반영해야 하며, 혼용 중에는 모집 변경을 중지한다. room allowlist hotfix만 기존 e408 운영 artifact에 반영됐고 R8 코드·migration·휴대폰 반영은 미수행이다.

## 남은 위험

- 실제 MessengerBot R/Rhino 컴파일, 카카오 callback, 운영 키·allowlist, 운영 migration과 end-to-end는 미확인이다.
- `0030` 이전 KAKAO 신청에는 room/mode provenance가 없으므로 새 빈 양식으로 자동 철회되지 않는다. 운영자가 안전하게 검토해야 한다.
- 확인된 문제 방은 운영 `KAKAO_WEBHOOK_ALLOWED_ROOMS`에 hotfix로 추가됐지만, 실제 외출 양식 재전송 성공은 아직 확인하지 못했다.
- 휴대폰 설치본은 LF 기준 여유 1,046자지만 전 줄 CRLF 변환 기준 여유가 81자뿐이므로 후속 기능 추가 전에 모듈 분리 또는 안전한 추가 축약이 필요하다.

## 다음 패치 추천

1. 같은 방에서 실제 외출 양식을 한 번 재전송해 새 deployment 로그에서 `ROOM_FORBIDDEN` 소멸과 2xx/정확한 필드 오류를 확인한다.
2. preview에서 R8 서버·폰 동시 전환/rollback 시간을 측정한다.
3. provenance 없는 기존 KAKAO 신청을 운영자 검토 후 room/mode에 귀속하는 일회성 관리 도구를 별도 구현한다.
4. aggregate controller 변경·실패율과 authoritative sync 카운트를 식별자 없는 운영 지표로 노출한다.
5. 휴대폰 번들 LF/CRLF 65,535자 회귀를 CI 필수 gate로 유지하고 기능 모듈 분리를 설계한다.

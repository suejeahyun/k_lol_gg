# Kakao R14.2 설치본 scope QA

상태: 소스·격리 PostgreSQL 검증 완료. Production 배포, Neon migration 적용, 휴대폰 설치는 운영 인계 전이며 이 작업에서 수행하지 않았다.

## 현장 증상과 기대 동작

- 증상: MessengerBot R callback의 `room`이 같은 실제 방에서도 발신자 표시명처럼 달라져 `/V2연동확인`이 `V2 방 식별 불가`를 출력했다.
- 영향: `5인파티`, `2인파티`, `/구인현황`, 운영 양식 등 signed API 명령이 사용자별로 `ROOM_BINDING_REQUIRED` 또는 요청 실패가 될 수 있었다.
- 기대: callback room 파싱 없이 같은 봇 설치본의 모든 사용자가 같은 canonical room을 사용하고, 발신자별 소유권·역할은 별도 opaque sender ID로 유지한다.

## 반영 범위

1. 인증·라우팅·로컬 상태·delivery ID에서 raw `room`, `channelId`, `isGroupChat` 의존을 제거했다.
2. 공개 installation ID에서 domain-separated SHA-256으로 `room-<32hex>` scope를 서버와 휴대폰이 동일하게 계산한다. V3 HMAC이 이 scope까지 서명하며 서버가 기대값을 다시 계산한다.
3. `kakao_bot_installations.canonical_room_id`를 추가해 설치본 하나가 canonical room 하나에만 귀속되도록 했다.
4. 최초 정상 서명 요청은 설치본을 기록한 뒤 `ROOM_BINDING_REQUIRED`를 반환한다. 일회용 pairing이 canonical room을 지정하며 다른 방으로의 재바인딩은 충돌로 거부한다.
5. unknown sender는 모두 MEMBER로 자동 기록한다. callback `userHash`가 있으면 `sender-user-*`, 표시명 fallback이면 `sender-display-*`이며 fallback은 MEMBER를 넘을 수 없다. linked approved admin만 명시적으로 승격된다.
6. pairing 요청도 durable nonce binding을 claim한다. HMAC V3 timestamp·nonce·delivery·body digest, exact idempotency, paused/revoked 상태, 역할 경계는 유지했다.
7. `/V2연동확인`은 설치본·키 ID·opaque 발신자 ID와 `연동 기준: 설치본`만 표시한다. `/V2진단`은 room parser를 실패 조건으로 사용하지 않는다.
8. 사이트 사진 세션은 공개 installation ID, 서명된 installation scope, canonical room 중 일치하는 안전한 scope를 받아 기존 흐름을 보존한다.
9. `5인파티`, `2인파티`, `구인현황`의 슬래시/무슬래시 V1 명령 문법과 나머지 V1 호환 router는 유지했다.

## DB migration 0033

- 0개 legacy binding: `canonical_room_id = null`, 첫 요청 뒤 pairing 필요.
- 1개 distinct canonical room: 기존 room으로 backfill.
- 2개 이상 distinct canonical room: `KAKAO_INSTALLATION_MULTIPLE_ROOMS`로 migration 전체 rollback. 자동 병합·삭제 없음.
- 설치본 scalar FK가 1:1 방향(installation → one room)을 강제한다. 여러 installation을 관리자가 같은 canonical room에 명시적으로 연결하는 것은 허용한다.

## 검증 증거

| 검증 | 결과 |
| --- | --- |
| MessengerBot 생성·ES5/용량 검사 | 통과, 최종 빌드 값은 아래 산출물 표 참조 |
| command parity 계약 | 216/216 통과 |
| unit 계약 | 481/481 통과 |
| TypeScript | `tsc --noEmit` 통과 |
| ESLint | 오류 0, 생성 압축 JS의 기존 유형 warning만 존재 |
| PostgreSQL 18 전체 계약 | 통과, migration 34개·head `0033_tan_sprite` |
| PostgreSQL recovery drill | exact table count/FK/migration replay/failed migration rollback 통과 |
| R14.2 0/1/>1 legacy binding fixture | 0 null, 1 backfill, >1 preflight 실패·DDL rollback, 명시 정리 후 재실행 통과 |
| production deploy / Neon apply / 실제 휴대폰 smoke | 미수행 |

## 산출물

| 구분 | 위치 | 문자/바이트 | SHA-256 |
| --- | --- | ---: | --- |
| public 휴대폰 설치본 | `integrations/messengerbot-r/KLOL_KAKAO_BOT_V41_MESSENGERBOT_R.js` | 64,566자 / 76,189 bytes | `4dc1746c625103478dcf1cd1f3c1d98063b240425c0e969fd49ab6a88ac84bf9` |
| public 검토용 전체본 | `integrations/messengerbot-r/KLOL_KAKAO_BOT_V41_V2_COMPLETE.js` | 122,237자 / 133,998 bytes | `128f5f29bd35076488b3675c767beac6ab279c7bd48206f2475f5c6e227de33f` |
| private 운영 인계본 | 저장소 밖 `_handoff/kakao-r14-2-installation-scope-20260909` | 64,981자 / 76,604 bytes | `59fed79a2bd32576a5e94c6344dd084577eef30a3784a6b0b4b061dbeb8115da` |

private 파일 본문과 비밀값은 Git에 포함하지 않았다. 이번 변경·신규 repository 경로 32개에 대한 high-confidence focused secret scan은 finding 0이었다. 전체 과거 Git history 재검사는 장시간 소요 때문에 중단했으며 이번 diff 검증 범위가 아니다.

## 운영 불변식과 남은 위험

동일 installer를 실제 카카오톡 방 둘 이상에서 실행하면 서버는 의도적으로 room parser를 사용하지 않으므로 두 방을 구분할 수 없다. 데이터와 멤버 권한이 같은 canonical room으로 합쳐지며 코드로 탐지할 수 없다. 실제 방마다 별도 identity secret, 별도 installation ID, 별도 MessengerBot 봇 프로필을 발급해야 한다.

R14.1 이하에서 R14.2로 교체하면 휴대폰 `DataBase`의 진행 중 모집 revision, 내전 미리보기, 사진 세션 cache key가 legacy room fingerprint에서 installation scope로 바뀐다. 전환 전에 진행 중 흐름을 완료·취소하고 전환 뒤 다시 시작한다. 서버의 기존 데이터는 삭제하지 않는다.

## 운영 인계 순서

1. Production DB를 읽기 전용으로 조회해 installation별 distinct legacy room 수가 0/1인지 확인한다. 2 이상이면 적용을 중지하고 운영자가 명시적으로 정리한다.
2. 복구 가능한 DB 백업을 확인한다.
3. migration `0033_tan_sprite.sql`을 적용한다.
4. 같은 커밋의 서버를 배포하고 health·DB 연결·제한된 reject code를 확인한다.
5. 방별 고유 identity가 주입된 private R14.2 installer 한 개만 휴대폰에 설치한다.
6. `/봇버전` → `/V2연동확인` → `/V2진단`(미페어링 403) → `/V2방연동 CODE` → `/V2진단`(200) 순서로 확인한다.
7. `5인파티`, `2인파티`, `/구인현황`, 외출 양식, 사진 세션을 실제 방에서 smoke한다.

Rollback은 먼저 R14.2 휴대폰 봇을 중지하고 이전 서버 배포로 되돌린 뒤, DB는 백업 복원 또는 사전 검토된 `canonical_room_id` 컬럼·인덱스·FK 제거 절차를 사용한다. migration 중 다중-room preflight가 실패한 경우 PostgreSQL transaction이 DDL까지 rollback하므로 DB 변경이 남지 않는다.

## 다음 패치 추천

1. 관리자 화면에 installation 회수·교체와 방별 private installer 발급 이력을 추가한다.
2. userHash 제공률을 비밀 없는 집계로 관측해 `sender-display-*` 비율을 줄인다.
3. 실제 기기 smoke 결과를 버전·설치본 hint·HTTP status만으로 자동 기록한다.
4. 사진 세션 UI의 `방 ID` 라벨을 `설치본 ID`로 변경하고 형식 도움말을 추가한다.
5. 전환 중 진행 세션을 사전 탐지해 재시작 대상을 관리자에게 보여준다.

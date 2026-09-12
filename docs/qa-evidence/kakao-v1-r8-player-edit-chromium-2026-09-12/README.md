# 카카오 V1 strict R8·플레이어 편집 Chromium QA

## 판정

- 기록일: 2026-09-12
- 기록 성격: 사이트 운영 배포 완료·휴대폰 설치 대기 QA 근거
- 기준 커밋: `80026b9da6139289f06c99db180e199d15ab251d`
- 기능 커밋: `2f576d939498d664db8962460ddf12200623b5c9`
- Git tag: `kakao-v1-r8-player-edit-qa-v1.0.0`
- DB migration: 없음, head `0037_swift_brood` 유지
- Vercel 운영 배포: `dpl_2hAKT6xuYPHsTTUgHuKzsZskMXxa`, `Ready`
- 운영 별칭: `https://k-lol-gg.vercel.app`, `/api/health` HTTP 200·`status: ready`
- MessengerBot R 설치: `KLOL_KAKAO_BOT_V40_SITE_FIRST_NO_CODES_R8_2026_09_12` 설치 대기
- 실제 Kakao 송수신: 미확인
- 운영 데이터 변경: 없음

카카오 R8 서버 대응과 플레이어 편집 보완은 커밋·tag·Vercel Ready 배포·운영 alias health까지 확인했다. 사이트·서버 범위는 운영 반영으로 판정한다. MessengerBot R의 R8 전체 설치본은 휴대폰 설치와 실제 Kakao 송수신 전이므로 외부 설치는 완료로 판정하지 않는다.

## 카카오 증상과 원인

완전한 빈 내전 양식은 인증 설정 오류로 보이고, 같은 방에서 참가자 한 명을 채운 양식은 정상 반영되는 차이가 있었다.

- 구형 V1 strict 후보 판별은 참가자가 채워진 행이 있을 때만 내전 전체 양식으로 인정했다.
- 완전한 빈 양식은 파티 구인 양식으로 잘못 분류되어 `RECRUIT` 프로필로 전송됐다.
- 서버는 내전 전체 스냅샷을 `FEATURES` 프로필에서만 허용하므로 `403 WRONG_PROFILE`을 반환했다.
- 구형 오류 변환은 `401`과 `403`을 모두 인증 설정 오류로 축약해, 잘못된 프로필과 잘못된 서명을 구분하지 못했다.
- 참가자 한 명이 있으면 내전 후보 판별을 통과해 `FEATURES`로 전송되므로 정상 반영됐다. 방 이름·발신자·설정 캐시 자체가 이 차이의 원인은 아니었다.

R7에서 완전한 빈 1..정원 스냅샷을 내전 전체 취소로 라우팅하는 동작을 추가했고, R8은 서버 오류 코드를 사용자가 실행할 수 있는 조치로 구분한다.

## 카카오 R8 변경 내용

- `WRONG_PROFILE`: 휴대폰 봇 코드를 최신 전체 설치본으로 교체하라고 안내한다.
- `KAKAO_V4_TIMESTAMP_STALE`: 휴대폰 날짜와 시간을 자동 설정하라고 안내한다.
- `INVALID_SIGNATURE`: 이 경우에만 봇 인증 설정 확인 안내를 표시한다.
- 코드가 없는 `401`·`403`: 비밀값이나 내부 오류를 노출하지 않고 권한과 설치본 확인을 안내한다.
- HTTP는 성공이어도 본문의 `statusCode`가 오류이면 성공으로 오인하지 않는다.
- 전적, 공개 명령, 내전 현황·양식, 파티 현황·양식, 운영 양식의 활성 서버 호출 경로가 같은 안전 분기를 사용한다.
- 서버 오류 본문에 일반 인증 문구가 함께 있어도 위 세 오류 코드의 전용 안내가 먼저 적용된다.
- HTTP 400의 서버 필드별 안내는 유지한다. 예를 들어 미완성 건의 양식은 누락된 `건의 내용`을 그대로 알려 준다.
- R7의 완전한 빈 내전 스냅샷 라우팅과 기존 V1 정상 성공 문구·양식 흐름은 유지한다.

## 카카오 검증 증거

- 휴대폰용 생성본: `integrations/messengerbot-r/v1-strict/KLOL_KAKAO_BOT_V1_STRICT_MESSENGERBOT_R.js`
- 생성본 버전: `KLOL_KAKAO_BOT_V40_SITE_FIRST_NO_CODES_R8_2026_09_12`
- 생성본 SHA-256: `23327ee15dc3ab2b1b5a9c8f26b78251d7a353da35d6acb3e354b317737b8e59`
- 생성본 크기: 62,997자, 69,728바이트
- V1 strict 생성본 집중 테스트: 14/14 PASS
- 운영 양식 후보와 R8 생성본 결합 회귀: 20/20 PASS
- V4 클라이언트 계약: 20/20 PASS
- Phase 3 계약: 33/33 PASS
- 내전 집중 검증: 16/16 PASS
- Rhino 정적 검사: ES5 PASS, 경고 후보·unsafe sequence·void expression·조건식 대입 0
- 비밀값을 출력하지 않는 운영 서명 smoke: `HTTP 200`, `command gateway: 정상`
- 현재 tree와 전체 Git 이력 비밀값 검사: PASS
- 변경 범위 `git diff --check`: PASS, 개행 변환 경고만 있음
- 비밀값은 생성본, 테스트 응답과 이 문서에 기록하지 않았다.

통합 `npm run check`의 첫 실행에서는 R8 공통 오류 처리 순서가 HTTP 400의 서버 필드별 안내를 일반 운영 양식 오류로 축약해 계약 359개 중 1개가 실패했다. 400의 안전한 서버 안내를 보존하도록 보완한 뒤 전체 검사를 다시 실행해 계약 359/359, 단위 검사, Data Dragon 홈 아트 검증과 프로덕션 빌드까지 종료 코드 0으로 통과했다. 관련 집중 테스트도 20/20, Rhino ES5 정적 검사도 경고 후보 0으로 통과했다.

## 플레이어 편집 Chromium QA 범위

실제 임시 PostgreSQL 18, 실제 Next 서버와 격리된 headless Chromium/CDP를 사용했다. 합성 계정과 합성 Riot 데이터만 사용했고 운영 사용자와 운영 DB는 변경하지 않았다.

### 본인 편집

- 로그인 세션으로 `/account?tab=player`에 접근해 Riot ID·현재 티어·최고 티어의 초기값, 레이블과 길이 제한을 확인했다.
- 실제 키보드 입력과 Enter 제출로 세 필드를 저장하고 HTTP 200, 폼·요약 정보 갱신과 DB revision 증가를 확인했다.
- 다른 요청이 revision을 먼저 올린 뒤 오래된 폼을 제출해 HTTP 412를 재현했다.
- 412 뒤 폼이 최신 서버값으로 다시 마운트되고 오래된 입력이 DB를 덮어쓰지 않는 것을 확인했다.

### 관리자 편집

- 일반 사용자는 관리자 편집 화면 대신 `/admin/login`으로 이동하며 편집 폼이 노출되지 않는 것을 확인했다.
- 관리자는 `/admin/players/:playerId?mode=edit`에서 실제 저장값이 채워진 입력과 저장 버튼을 확인했다.
- 티어만 변경할 때 Riot 연결 상태, 보호 PUUID와 대기·실행 중 동기화 작업이 유지되는 것을 확인했다.
- 관리자 폼에서도 concurrent revision 변경 뒤 HTTP 412와 최신값 재마운트를 확인했다.
- Riot ID 변경 경고, 저장 뒤 기존 연결의 `DISCONNECTED`, 보호 PUUID 제거, 동기화 작업 2건 취소와 감사 이벤트 1건을 확인했다.
- 관리자 Riot 감사 화면에는 안전한 연결 해제 사유와 취소 건수만 표시되고 Riot ID와 보호 PUUID가 노출되지 않는 것을 확인했다.

## 플레이어 편집 검증 증거

- `npm run test:db`: 종료 코드 0
- 관리자 Chromium 포커스는 DOM 직접 선택 대신 공용 CDP 포커스·Ctrl+A 입력으로 고정했으며, 보완 뒤 전체 DB 검증을 처음부터 다시 통과했다.
- 본인·관리자 Chromium 회귀: 위 전체 DB 검증 안에서 PASS
- 계정 route 계약: 3/3 PASS
- TypeScript: PASS
- ESLint: 오류 0
- 인증 HTTP 검증: guards, limits, password+TOTP, cookie, roles, headers, logout, 운영 fixture 잠금 PASS
- DB 스키마 변경과 운영 데이터 변경: 없음

Chromium QA와 관련 코드는 `2f576d93`에 고정했고 동일 소스의 Vercel 배포 ID와 운영 alias health를 확인했다. 실제 운영 계정으로 Riot ID를 바꾸거나 Riot RSO를 재연결하는 파괴 가능 검증은 수행하지 않았다.

## 재현 명령

```powershell
node scripts/build-messengerbot-v1-strict.mjs
node --test tests/kakao-v1-strict-messengerbot.test.mjs tests/kakao-v1-strict-operation-form-candidate.test.mjs
node scripts/audit-messengerbot-rhino-static.mjs integrations/messengerbot-r/v1-strict/KLOL_KAKAO_BOT_V1_STRICT_MESSENGERBOT_R.js
node --test tests/kakao-v4-client-acceptance.test.mjs
npx tsx --test tests/kakao-v4-phase3-acceptance.test.ts
node --test tests/account-player-route.test.mjs
npm run test:db
npm run release:evidence:check
```

릴리스 후보 커밋 뒤에는 동일 SHA의 Vercel Ready 배포와 운영 alias smoke가 추가로 필요하다.

## 실기기 확인 절차

1. MessengerBot R의 기존 코드를 R8 전체 생성본으로 한 번에 교체하고 컴파일한다.
2. `봇버전`으로 R8 문자열을 확인한다.
3. 완전히 빈 내전 전체 양식을 보내 전체 취소가 인증 오류 없이 반영되는지 확인한다.
4. 일부러 이전 프로필 설치본을 호출했을 때 인증 오류 대신 최신 전체 설치본 교체 안내가 나오는지 확인한다.
5. 휴대폰 자동 시간을 끈 테스트 환경에서 시간 오차 안내가 구분되는지 확인하고 즉시 자동 시간으로 복구한다.
6. 참가자 한 명 추가·삭제, `내전현황`과 운영 양식의 필드 누락 안내를 확인한다.

## 남은 위험과 롤백

- R8 휴대폰 설치와 실제 두 카카오방 송수신은 아직 확인하지 않았다.
- 사이트 배포는 확인됐지만 인증된 실제 운영 사용자·관리자 브라우저 세션에서 저장을 실행하지 않았다.
- 휴대폰 비밀값 산출물은 `.private/`에만 있고 Git에서 제외된다. 로컬 Vercel 업로드에서도 제외되도록 `.vercelignore`에 `.private/`을 명시했다.
- 플레이어 브라우저 QA는 합성 세션·합성 Riot provider 기반이다. 실제 운영 Riot 계정 재연결은 사용자 동의 없이 실행하지 않았다.
- 문제가 확인되면 휴대폰은 직전 확인 설치본으로 되돌리고, 사이트는 새 배포를 만들지 않거나 배포했다면 직전 Ready 배포로 되돌린다.
- 이번 변경에는 migration과 운영 데이터 변경이 없어 DB 롤백은 필요하지 않다.

## 다음 권장 패치

1. 현재 검증된 변경을 commit·tag하고 동일 SHA의 배포 ID·alias smoke를 release registry에 등록한다.
2. 실기기에서 빈 내전 취소와 세 오류 코드를 확인해 설치본 해시와 익명화한 입력·출력을 추가한다.
3. 본인·관리자 Chromium 회귀를 CI의 PostgreSQL job에서 정기 실행해 412 재마운트와 Riot 연결 안전 경계를 고정한다.
4. 관리자 감사 화면의 개인정보 비노출 검사를 스냅샷이 아닌 구조화 DTO 계약에도 추가한다.

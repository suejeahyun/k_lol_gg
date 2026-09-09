# Kakao R14 installation identity and message dedupe QA

## 결론

첨부 화면의 동일 오류 반복은 단일 R13 소스 안의 이중 응답으로 확인되지 않았다. 운영 로그에는 2026-09-09 18:53:46~18:54:18 KST 사이 `/api/integrations/kakao/openchat`으로 들어온 서로 다른 5개 요청이 있었고 모두 `401 INVALID_SIGNATURE`였다. 동일 millisecond 중복은 없고 간격은 3~13초였다. 20:23:01 KST에도 실제 사용자 재시도 1건이 같은 코드로 거부됐다. 소스에는 `response()` 진입점이 정확히 하나이며 `BotManager`, `addListener`, `setCommandPrefix` 등록도 없다.

따라서 확인된 직접 원인은 휴대폰 요청의 서명 키와 운영 서버 current/previous 키 불일치다. 반복 요청의 기기 측 원인은 복수 MessengerBot R 스크립트·프로필 활성 또는 재시도 중 하나로 추정하며, 서버 로그만으로 둘을 확정할 수 없다.

## R14 변경

- 휴대폰이 V3 HMAC에 설치본 ID, 공개 key ID, message delivery ID, 봇 버전을 포함한다.
- 서버는 실제 검증에 성공한 secret의 key ID와 휴대폰이 보고한 key ID가 다르면 `INVALID_SIGNATURE`로 거부한다.
- 설치본은 `key_id`, `last_bot_version`, `last_seen_at`, `ACTIVE/REVOKED` 상태를 DB에 유지한다.
- previous ID로 등록된 설치본은 서버 current ID 요청으로만 단방향 승격할 수 있고 이전 ID로 되돌아갈 수 없다.
- 동일 canonical 방·동일 delivery ID는 설치본이 달라도 같은 request fingerprint와 멱등성 키를 사용한다.
- 생성 aggregate UUID도 delivery ID에서 결정해 두 설치본의 body hash가 같게 유지된다.
- 휴대폰은 30초 동안 같은 메시지 callback을 `DataBase` 키로 선차단한다. Java crypto가 없는 호환 런타임에는 ES5 결정적 fallback을 사용한다.
- `/봇버전`, `/V2연동확인`은 설치본 ID와 key ID를 함께 표시한다.
- `INVALID_SIGNATURE`, `INSTALLATION_REVOKED`, room binding 오류를 서로 다른 한국어 조치로 안내한다.
- 거부 로그에는 원문 설치본·서명 대신 서버 키 HMAC의 12자리 비밀 비노출 hint만 기록한다.
- `/admin/kakao/rooms`에서 설치본 상태, key ID, 마지막 봇 버전, 최근 확인 시각을 조회한다.

## 검증 결과

- MessengerBot R 생성: 통과
  - 휴대폰 64,358자
  - CRLF 보수 환산 64,448자 (`65,535` 미만)
  - 소스 전체의 `response()` 진입점 1개, listener 등록 0개
- 전체 source contract: 217/217 통과
- 전체 unit: 481/481 통과
- 중복 fixture: 같은 signed delivery를 서로 다른 두 installation으로 전송해 party 1개, audit 1개, outbox 1개만 생성
- 격리 PostgreSQL 18 전체 계약: 통과
  - migration 33개, head `0032_bent_ultimates`
  - 신규 설치·재실행·실패 rollback·custom archive 복구 통과
  - installation key 불일치 차단, previous→current 승격, old key 재사용 차단, REVOKED 차단 통과
- TypeScript typecheck: 통과
- ESLint: 오류 없이 통과
- production build: 통과(정적 페이지 91개)
- 인증 HTTP: 통과
- 비밀 유출 검사: tracked tree 및 전체 Git history 통과
- MessengerBot 명령 audit: 통과
- `git diff --check`: 통과

## 생성본

| 파일 | 줄 | bytes | 문자 | SHA-256 |
| --- | ---: | ---: | ---: | --- |
| `KLOL_KAKAO_BOT_V41_MESSENGERBOT_R.js` | 91 | 75,915 | 64,358 | `242dac7363414599b6716a672107c98fcf63040d80c3164bf619ffa7c589bdca` |
| `KLOL_KAKAO_BOT_V41_V2_COMPLETE.js` | 2,777 | 133,623 | 121,928 | `ef1a0a9ad3ba3c86b7f715a406c219e256b8e251d8e1211e31a9ee99b355e28e` |

### 운영 휴대폰 설치본(로컬 전용)

- 경로: `E:\k-LOL.GG\_handoff\kakao-r14-20260909\KLOL_KAKAO_BOT_V41_R14_READY_TO_INSTALL_PRIVATE.js`
- 크기: 92줄, 76,331 bytes, 64,774자
- SHA-256: `f5e4c7b150c6c861e4c21f405a5756789aa2898c63774e0277f7f41d99f38510`
- 서버/설치본 signing fingerprint: `ba01041ac8d46598dfa731b5737a37b106fe03f04dbfdddfa531aa5980393b06`
- installation identity fingerprint: `c874f248ce4cc5f01395974310035ed3122e5a9d729aad3c6d32e386047893e7`
- signing secret와 installation identity는 서로 다른 값임을 확인했다.
- 비밀이 포함된 파일이므로 Git 추적·스테이징 대상에서 제외하고 로컬 전달 폴더에만 보관한다.

## 운영 반영 상태

### Preview 사전 검증

- Neon preview branch `preview-kakao-r14-20260909-2000-kst`에서 `0029`~`0032` migration, 재실행, rollback smoke를 통과했다.
- Preview Vercel deployment `dpl_4jPBNxU3Nw2jw2Jr5RaRs1NurRNt`는 source `ef6628b`로 Ready였다.
- Preview 전용 `DATABASE_URL`, `V2_PUBLIC_DATA_SOURCE`는 검증 뒤 제거했고 해당 branch-scoped Preview 환경변수가 0개임을 확인했다.

### Production DB

- 2026-09-09 20:35 KST 기준 `0032_bent_ultimates`까지 적용했다.
- migration: 33개, head hash `d50101d75f3cfa8e1eacf84ece19a41b12517aaf6d1b6ea94ab105f1e36f03c8`
- R14 신규 테이블 5개, 신규 컬럼 7개를 확인했다.
- 기존 데이터 건수는 적용 전후 동일하다: user accounts 146, players 179, season applications 445, pending applications 58, parties 1,376, scrims 24, operation forms 102.
- 휴대폰 연결 전 신규 `kakao_bot_installations`, `kakao_rooms`는 각각 0건이다.

### Production 서버

- 배포 source: clean working tree의 `ef6628bc970b4b1d3f18bfc0e68283a5da422ac7`
- Vercel deployment: `dpl_5c8PTp2T7ARstvyYPCqXwDs6uzQb` (Ready)
- 운영 alias: `https://k-lol-gg.vercel.app`
- `/api/health`: 200, `status=ready`
- `/api/auth/me`: 200, 비로그인 `user=null`
- unsigned `/api/integrations/kakao/openchat`: 401, 예상된 `BOT_SELF_HEADER_INVALID`; 5xx 없음
- 기존 sensitive current secret는 Vercel에서 원문 회수가 불가능해 48-byte base64url 신규 값으로 안전하게 회전했다. 문서에는 원문을 남기지 않고 fingerprint만 기록한다.
- 키 ID는 `current`, 허용 방 목록은 변경하지 않았다.

### 현장 활성화 대기

- 서버·DB rollout: 완료
- MessengerBot R R14 운영 설치본: 생성·무결성 확인 완료, 실제 휴대폰 설치는 아직 미수행
- 실제 signed 카카오 명령 smoke: 휴대폰 설치 뒤 수행 필요

휴대폰에서 기존 봇·스크립트·프로필을 모두 중지하고 위 로컬 전용 R14 파일 하나만 활성화한 뒤 `/봇버전` → `/V2연동확인` → pairing → `5인파티` 순서로 확인한다.

## 복구 지점

- 애플리케이션: 이전 Ready deployment `dpl_7ggWSkbjf3Qq9aoQaGT8Bn6hf2ue`로 alias를 되돌릴 수 있다.
- DB: 적용 직전 Neon branch `recovery-pre-kakao-r14-20260909-2000-kst` (`br-nameless-moon-am5dsbqt`)를 만들었고 2026-09-10 20:00 KST까지 유지한다.
- migration은 destructive down을 실행하지 않는다. 이상 시 앱을 이전 deployment로 되돌리고 recovery branch 비교 후 fail-forward한다.
- 로컬에 잠시 사용한 raw secret/env/SQL helper는 배포 후 제거했다.

## 남은 위험

- 운영 설치본이 아닌 이전 휴대폰 파일은 회전된 current 키와 불일치해 안전하게 401로 차단된다.
- 기기의 복수 활성 스크립트·프로필 여부는 저장소에서 원격 확인할 수 없다. 설치 시 사람이 목록을 확인해야 한다.
- callback에 stable `logId`가 없는 런타임에서는 30초 안의 동일 방·발신자·본문 재입력을 중복으로 볼 수 있다. 0.7.34a 이상과 stable callback 식별자를 사용한다.
- 휴대폰 번들은 문자 제한까지 1,087자 여유뿐이므로 다음 기능 추가 전에 모듈 분리 또는 더 작은 명령 데이터 표현이 필요하다.
- 실제 signed 요청·DB 등록·명령 mutation 검증은 휴대폰 설치 전이라 아직 확인되지 않았다.

## 다음 패치 추천

1. SUPER 전용 installation `ACTIVE/REVOKED` 변경 API·감사 로그를 UI에 연결한다.
2. secret-free rejection hint별 횟수와 첫/마지막 발생 시각을 관리 대시보드에 집계한다.
3. `/봇버전` 결과를 pairing 화면에 붙여 넣으면 installation/key/version을 대조하는 사전 점검기를 추가한다.
4. 운영 smoke에 복수 installation 동시 전달, previous→current 회전, REVOKED 복구를 자동화한다.
5. MessengerBot R에서 stable logId 부재를 진단해 경고하는 `/V2진단` 명령을 추가한다.

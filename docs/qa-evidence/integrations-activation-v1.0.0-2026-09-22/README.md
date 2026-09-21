# 사이트 알림·Riot API·운영 진단 통합 QA

작성일: 2026-09-22 KST. 기존 운영 준비 릴리스 `c5cbbcd8`와 문서 `c2d0dcbd` 이후 변경이다. 기존 태그의 근거는 수정하지 않는다.

## 범위와 사전 상태

- 사용자는 운영 Riot API 키 보유, RSO 미승인 상태를 확인했다. 장애 확인은 운영자 페이지를 요청했다.
- 사전 DB 읽기: Riot 사이트 기능 false/revision 0, DISCONNECTED 계정 92건, 동기화 작업 0건, 사이트 알림 0건. 기존 계정을 임의로 연결하지 않는다.
- 운영 환경의 기존 API 키를 유지하고, 누락된 Riot 암호화 키링을 별도로 준비했다. RSO 자격은 만들거나 대신하지 않는다.
- 별도 사이트 알림 설치본 1.0.1을 활성 상태로 만들었고 기존 서버 target 설정과 일치를 확인했다. 일반 R25 파일은 변경하지 않았다.
- migration head `0044_vengeful_trauma`; 이번 범위는 migration 없음.

## 운영 반영

- source `c3442ace1e04054ada05f1f6842f4699b45a0bb6`.
- Vercel `dpl_BdpAWrcHPKAchNU9K644dHfajNxu`, [immutable URL](https://k-lol-9xz5yaj9g-tjdmswo11-3715s-projects.vercel.app), [운영 URL](https://k-lol-gg.vercel.app). 후보 READY 확인 후 2026-09-22 08:41 KST 운영 반영·health/smoke PASS.
- API 키는 기존 값을 유지했다. Riot 암호화 키링을 sensitive 환경에 추가하고 API·사이트 알림 서버 flag를 활성화했다. 사이트 알림 target은 기존 값과 일치한다.
- DB 사이트 Riot flag는 revision 0→1, false→true. 사용자 요청에 따른 배포 설정 변경이며 인간 계정을 가장하지 않고 nullable system actor 감사와 outbox, 비공개 설정 이전값을 보관했다. 계정 연결·명단 쓰기는 수행하지 않았다.
- 실제 KR status-v4가 운영 설정 키를 HTTP 200으로 수락했고 성공 기록이 운영 maintenance 테이블에 남았다. 운영 읽기 사후 집계는 DISCONNECTED 92건, Riot 작업 0건, 알림 0건이다.
- Vercel 예약에 Riot 5분 작업을 추가했다. 통계 5분·카카오 06:00 KST 마감은 유지했다. 08:45:45 KST 실제 예약 요청 HTTP 200과 같은 시각의 durable job nonce를 확인했다(`riot-cron-runtime.json`, `db-post-activation.json`). 수동 Cron Bearer 호출은 없었다. 이 요청은 같은 source의 main 자동 배포 `dpl_YNNUMWjout3VezZPxPELLKeqgtda`에서 실행됐다. 연결된 계정·작업이 0건인 상태이므로 실제 회원 전적 갱신 완료로 확대하지 않는다.

## 검증 결과

| 검사 | 결과·근거 |
|---|---|
| 전체 `npm run check` | PASS, lint 오류 0·기존 경고 55, 타입·ERD·이미지·빌드 포함 (`check.log`) |
| 마지막 429 보완 후 타입·전체 tests·빌드 | 계약 424 PASS, 단위 948 PASS + DB 전용 1 skip (`post429-check.log`) |
| Riot 집중 단위 / 격리 PG | 48 / 4 PASS (`riot-unit.log`, `riot-db.log`) |
| 전체 PostgreSQL | 142 PASS, 실패·skip 0. 일회성 cluster 종료·삭제 (`full-page-qa.log`) |
| 인증 HTTP | 로그인·TOTP·권한·쿠키·헤더·로그아웃·운영 fixture 차단 PASS (`auth-http.log`) |
| 브라우저 | 105페이지·339화면, issue 0. 관리자·회원·익명·setup 세션. synthetic 자료만 사용 (`browser-summary.json`, `capture-index.json`) |
| 후보·운영 외부 경계 | 각각 9건 PASS. 사이트 알림 HMAC·nonce, signed Riot IDLE, 익명 인가 경계 (`live-candidate.json`, `live-production.json`) |
| 실제 Riot 상태 API·probe replay | HTTP 200 수락·동일 nonce 409 (`riot-provider-probe.json`) |
| 기존 일반 카카오 읽기·도움말 | PASS. 현재 모집 0건이므로 파티·내전 상세 2종은 대상 없음으로 생략 (`general-live-production.json`) |
| 비밀 검사·배포 입력 | 현재 tree PASS, private/tmp/env 제외 (`secret-tree.log`, `deployment-inputs.json`) |
| 원격 CI | source `c3442ace`의 [V2 CI](https://github.com/suejeahyun/k_lol_gg/actions/runs/35668661793) success (`github-ci.json`) |

데스크톱·390px 관리자 화면과 Riot 도움말을 눈으로 확인했다. 전체 화면 검사의 `/account/riot`는 합성 환경 비활성 분기를 캡처하며, 실제 소유자의 연결·동기화 조작 증거는 아니다. 변경 화면 대표 6장은 `screenshots/`, 전체 339장은 로컬 `.tmp/integrations-qa-complete/screenshots/`에 보관한다.

첫 check는 신규 테스트의 POST literal 타입 오류 2건으로 실패해 수정했고 재검사를 통과했다. 후보 첫 smoke의 계정 페이지는 Next.js 스트리밍 로그인 redirect를 HTTP 200으로 반환했다. 실제 `NEXT_REDIRECT`와 login meta refresh, 비공개 계정 내용 미노출을 확인하고 검사 기대값을 수정했으며 재실행 PASS다. 두 첫 시도 로그도 보존했다. 비밀 검사에서 합성 테스트 상수의 이름이 탐지되어 명시적 synthetic fixture 표기로 바꾸고 6건 회귀를 통과했다. 실제 키 유출은 없었다.

## 실제 기기와 외부 권한

사용자가 제공한 MessengerBot R 0.7.29a의 R25 버전·구인현황·내전현황 응답은 확인했다. companion 설치, 실제 SITE 충원 알림 수신, 잠금화면 타이머 유지 및 재시작 후 재등록은 아직 확인되지 않았다. 서명된 REGISTER smoke는 서버 인증·nonce 검사이며 휴대폰 설치 증거가 아니다.

RSO는 별도 승인 대기다. 고정 status-v4 probe 성공은 해당 API 경로의 키 수락만 증명한다. 이번 검증을 위해 회원 계정을 연결하거나 실제 구인/내전 명단을 만들지 않는다.

활성 설치본은 `KLOL_SITE_NOTICE_COMPANION_1.0.1`, SHA-256 `c845948a4f5b53919476be40233e31e4415070088f09e797e44f3bd9831c532e`, 10,388자다. 비공개 ZIP의 JS·setup·한국어 설치 안내 3개 파일은 원본 해시와 일치한다. 기존 일반 R25는 유지하고 별도 Legacy 봇 하나에 설치한다. 등록 문구는 private 안내에만 제공하며 public Git·문서에 넣지 않는다.

남은 사용자/제공자 작업은 companion 설치·지정 그룹 등록·신규 SITE 충원 실수신, 소유자가 명시 연결한 계정의 League/Match 실전적 확인, Riot의 RSO 승인이다. 기존 API 키 등급은 사용자 확인이며 서버 status 응답으로 등급을 추정하지 않는다.

## 안전한 중지

사이트 알림은 서버 `KAKAO_SITE_NOTICE_ENABLED=false` 반영과 companion 정지로 멈춘다. 새 설치본 재발급 없이 사용한 등록 코드를 다시 쓰지 않는다. Riot는 운영자 사이트 기능 `riotIntegration` 또는 서버 `V2_RIOT_INTEGRATION_ENABLED`로 중지할 수 있다. 생성한 암호화 키링은 기존 데이터 복호화에 필요하므로 임의 교체·삭제하지 않는다.

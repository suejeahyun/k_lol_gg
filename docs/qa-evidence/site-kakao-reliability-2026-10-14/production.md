# 사이트·카카오 봇 안정성 보완 1.0.0 운영 반영

## 배포와 검증

- source `cf32d4f9ee94149a3fb0be81301f9943ccd6c7a0`, tag `site-kakao-reliability-v1.0.0`. GitHub main·작업 branch·tag에 소스를 게시했다.
- production 환경의 별도 후보 `dpl_7Hpo2sbGcXbFFg6dQnJ4rNaq7YL2`를 `--skip-domain`으로 배포했다. READY·동일 source·project를 확인한 뒤 익명 앱 GET 9조건을 통과했다. [후보](candidate-deployment.json), [후보 HTTP](candidate-http.json).
- main 운영 배포 `dpl_BpxTdkKCLLGa2nwrp1F1o8T2Q5pc`, [immutable URL](https://k-lol-przjk8616-tjdmswo11-3715s-projects.vercel.app), [운영 주소](https://k-lol-gg.vercel.app). READY 시각 2026-10-13T19:14:41.920Z, source·production target·canonical alias 확인 2026-10-13T19:14:51.910Z. [provider 근거](production-deployment.json).
- 운영 익명 GET 9조건 PASS: health ready, 홈·모집·신청·도움말 2개, 모집코드/명단버전 문구와 관리자·cron 비인증 401. [HTTP](production-http.json).
- 실제 운영 브라우저에서 모집일·고정 코드 표시와 코드 없는 기존 모집의 안내를 확인했다. 1280px에서 가로 넘침과 깨진 이미지가 없었으며 모집 자료를 수정하지 않았다. [브라우저 확인](production-browser.json).
- 실제 서명 RECRUIT/V1_STRICT 조회 2조건 PASS: 없는 고정 코드의 정상 안내와 구인도움말, HTTP 200·계약/protocol/event 일치·aggregate 미노출. [서명 HTTP](production-signed.json). 실제 모집을 생성·수정·마감하거나 카카오 방에 발송하지 않았다. 기술적 nonce/receipt가 기록될 수 있으며 원문·비밀값은 보관하지 않았다.
- 운영 DB catalog를 READ ONLY transaction으로 확인했다. migration 50개/head `0049_stable-recruit-codes`, SQL hash·when 일치, 모집코드 table 2개·제약 10개 모두 정상, invalid 0. 이번 릴리스에 migration/DDL은 없으며 운영 설정도 변경하지 않았다. [DB](production-db-postdeploy.json), [사전 설정](production-policy-preflight.json).

## 수정 범위와 검증 한계

[재점검 9건](../site-kakao-reaudit-2026-10-14/README.md)의 고정 코드 복사, 신청 대상 고정, 서버 시각·재전송, V4 운영 정책, 답장 재시도, 예비 등록, 경기 초안 충돌, 설정 저장, 휴대폰 별칭을 보완했다. [변경 안내](../../patch-notes/site-kakao-reliability-v1.0.0.md).

전체 check: 계약 704/704, 단위 1,112 pass/1 skip, lint 오류 0/기존 경고 58, typecheck·ERD·이미지·production build PASS. 격리 DB 112/112, 실제 시즌 HTTP, 합성 React 브라우저의 초안 복구·입력 잠금·320px 확인, 휴대폰 VM 47/47 및 ES5/Rhino 검사를 통과했다. [검증 요약](validation.json), [DB 상세](data.md), [브라우저 범위](browser.json). 운영 관리자 저장·실제 모집 변경이나 휴대폰 실기기 송수신은 시험하지 않았다.

## 휴대폰 설치

R29 비공개 한 파일은 생성·검증 완료이며 상태는 **PENDING_USER_INSTALL**이다. `KLOL_KAKAO_BOT_V40_R29_2026_10_14`, LF 61,884자/CRLF 63,667자, SHA-256 `7641aa4fa9f4e753d1059b79ce25ce0a8a53d19f0d999ec74871e52d7260a9c1`. [산출물 검증값](bot-artifacts.json), [설치 안내](../../../integrations/messengerbot-r/MESSENGERBOT_R_INSTALL.md).

휴대폰의 답장 재시도·마감 별칭과 고정 코드 직접 명령을 사용하려면 R29로 전체 파일을 교체하고 저장·컴파일·재시작해야 한다. 서버 배포만으로 기존 휴대폰 코드가 갱신되지는 않는다. 이전 버전의 실기기 확인을 R29 설치 확인으로 간주하지 않는다.

## 복구

직전 READY 앱은 `dpl_HzWW4ADSsWBc7zATWfgi6WBaHxj5`, source `4d6a4aa30171774876c4f4af2b031301d23656a0`다. [직전 provider 기록](production-before.json). 앱 이상 시 이 배포로 rollback할 수 있다. DB 구조와 기존 모집코드 registry는 보존하며 코드를 재발급하거나 자료를 삭제하지 않는다.

0049 이전 백업·복원 근거는 [이전 릴리스](../stable-recruit-codes-2026-10-14/production.md)에 보존했다. 이 릴리스에서 새 DB 백업이나 복원 시험을 했다는 의미가 아니며, 앱 rollback에 DB 복원은 필요하지 않다. 이후 운영 쓰기를 잃는 DB 복원은 별도 검토가 필요하다. 휴대폰은 hash를 확인한 기존 R28 비공개 파일을 별도 보존했다.

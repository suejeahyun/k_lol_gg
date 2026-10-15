# 사이트·카카오 안정성 1.0.1 운영 배포

source `daab5eb44997674968dcea118f6ff81c9d217700`, tag `site-kakao-reliability-v1.0.1`. 최신 main의 내전 공정성 1.1.0을 보존하며 재현한 6건을 수정했다. [변경 안내](../../patch-notes/site-kakao-reliability-v1.0.1.md).

- 후보 `dpl_B6yQyYqZZeveTMmMHsnz9FCVZnB7`를 production 환경에서 도메인 미전환으로 배포했다. 동일 source·READY 및 인증된 deployment-protection 접근을 통한 익명 앱 GET 12조건 PASS. [후보](candidate-deployment.json), [HTTP](candidate-http.json).
- main `dpl_HBvtYAMgEAt8VGmRD3DtXmJ9bKjr`, [immutable URL](https://k-lol-44oy5js0t-tjdmswo11-3715s-projects.vercel.app), [운영 주소](https://k-lol-gg.vercel.app). READY 2026-10-15T18:48:18.240Z, source·project·canonical alias 확인 2026-10-15T18:48:42.939Z. [provider](production-deployment.json).
- 운영 GET 12조건 PASS: health ready, 홈·모집·신청·팀 편성·도움말, 관리자·팀 API·cron의 비인증 접근 차단. [운영 HTTP](production-http.json).
- 실제 카카오 서명 조회 2조건 PASS: 없는 고정 코드 조회와 구인도움말. 계약·protocol·event 일치, aggregate 미노출. 운영 모집을 생성·수정·마감하거나 카카오 방에 발송하지 않았다. 기술적 nonce/receipt는 기록될 수 있으며 원문·비밀값은 보관하지 않았다. [서명 HTTP](production-signed.json).
- DB catalog READ ONLY 확인: migration 50개/head0049 및 모집코드 table2/제약10 정상. 스키마·운영 설정 변경 없음. [DB 확인](production-db-postdeploy.json).

## 검증 범위

전체 check 계약717·단위1,147 pass/1 skip·lint오류0/기존경고58·typecheck·ERD·이미지·build, 격리DB recruiting112/team-tools8, 사이트회귀43, R29 VM48을 통과했다. 경기 폼의 합성 브라우저 입력 잠금·실패 복구·재저장·320px도 확인했다. [검증](validation.json), [사이트](site.md), [팀 데이터](team-data.md), [카카오](kakao.md). 운영 실계정 저장이나 휴대폰 실기기 송수신을 시험한 것은 아니다.

이번 수정은 서버·사이트에서 적용되며 휴대폰 R29 공개/비공개 산출물은 변경하지 않았다. 기존 실기기 설치 대기 상태를 새 설치 확인으로 간주하지 않는다.

## 복구와 반복 점검

직전 READY 앱 `dpl_kUH56WuhFGXS9Xt6C9EmoQbeWxdU`, source `69127364dd8bf567fb21d9abcdafcb082245f50d`로 앱 rollback 가능. [사전 상태](production-before.json). 이번 변경에 migration은 없으므로 DB 복원·자료 삭제·모집코드 재발급은 필요하지 않다. 기존 백업 근거는 이전 릴리스 기록을 유지하며 이번에 새 백업을 수행했다는 의미가 아니다.

사용자 요청으로 이 대화의 1시간 간격 반복 점검을 활성화했다. 매 회차 최신 코드·진행 작업을 확인해 충돌을 피하고, 재현한 새 결함만 수정·검증·배포한다. 변화가 없으면 알리지 않으며 새 발견·배포·실패·사용자 조치만 알린다.

# 파티 고정 모집코드 1.0.0 운영 반영 근거

## 운영 DB

- 대상과 직전 앱: [provider 조회](production-before.json)의 프로젝트·운영 alias·DB 환경변수 metadata를 기존 연결 binding과 대조했다. 직전 READY 앱은 `dpl_8hhjPC8sMT12bB7ZTCtQavyPcchX`, source `5b3a616749f17ae5199ba599bf6bb4ac6f50ff24`다.
- [백업·격리 복원](production-backup-restore.json): 2026-10-13 16:06:41 UTC snapshot, 181,732,943 bytes, SHA-256 `41e39b8a24d1487822cb69f1ec27973e0707135b3847aa202aa4db875c0f4904`. 기존 193개 table·927개 constraint와 MMR 10개 table 내용을 대조했다. 복원 cluster는 종료해 보존했다.
- [복원본 rehearsal](migration-rehearsal.json): `0049_stable-recruit-codes` 적용 및 replay no-op PASS. 검토한 LF SQL hash는 `2f2428fb5f9d308a06936f3e608773fce43cf0a469682fc3169712de4cc66c35`다.
- [운영 적용](production-migration.json): 2026-10-13 16:16:58 UTC, migration 50개/head 0049. 기존 파티 1,660·legacy 원본 12·receipt 2,597개 보존, 신규 두 table 각각 0개, invalid constraint 0. 같은 migration 재실행은 no-op이다.
- 실제 적용 전 archive bytes/hash·backup age·rehearsal·대상 fingerprint·직전 migration head를 확인했다. release advisory lock과 transaction, 5초 lock timeout·30초 statement timeout을 사용했다. 기존 테이블의 자료를 이동하거나 삭제하지 않았다.

## 앱 배포

- 소스 `4d6a4aa30171774876c4f4af2b031301d23656a0`, tag `stable-recruit-codes-v1.0.0`를 GitHub main·작업 branch·tag에 게시했다.
- 먼저 production 환경의 별도 후보 `dpl_3AisPtsQfMNhTWyahQngEiASeCLG`를 `--skip-domain`으로 만들었다. READY·동일 source·프로젝트를 확인하고 인증된 deployment-protection 우회로 앱 익명 GET 9조건을 검증했다. [후보](candidate-deployment.json), [HTTP](candidate-http.json).
- main 배포 `dpl_HzWW4ADSsWBc7zATWfgi6WBaHxj5`, [immutable URL](https://k-lol-okucz4htp-tjdmswo11-3715s-projects.vercel.app), [운영 주소](https://k-lol-gg.vercel.app). 2026-10-13 16:26:01 UTC READY, 16:26:18 UTC에 동일 source·프로젝트·production target·canonical alias를 확인했다. [provider 근거](production-deployment.json).
- 운영 익명 GET 9조건 PASS: health ready, 홈·모집·참가 신청·두 도움말과 새 모집코드/명단버전 문구, 관리자·두 cron의 비인증 401. [HTTP](production-http.json).
- 16:26:29 UTC 실제 서명 RECRUIT/V1_STRICT 요청 2조건 PASS: 없는 고정 코드 조회의 정상 안내와 새 구인도움말. HTTP 200·계약/protocol/event 일치·aggregate 미노출을 확인했다. 실제 운영 모집의 생성·수정·쫑 성공이나 휴대폰 송수신을 시험한 것은 아니다. 요청·응답 원문과 비밀값을 보관하지 않았다. [서명 HTTP](production-signed-http.json).
- 배포 후 운영 DB catalog를 읽기 전용 transaction으로 재확인했다. migration 50개/head 0049 hash·when 일치, 신규 table 2개·기대 제약 10개 모두 존재, invalid 0. 참가 자료 조회·수정 없음. [DB](production-db-postdeploy.json).

## 검증 범위

최종 `npm run check`: 계약 691/691, 단위 1,101 pass/1 skip/0 fail, lint 오류 0/기존 경고 58, ERD 114 table/175 FK, 가이드 이미지와 production build PASS. 실제 격리 PostgreSQL recruiting 110/110 및 kakao-v4 scope 33/33 PASS. [전체 검증](README.md), [데이터 검증](data.md).

격리 DB에서 원본 발급·수정·종료·같은 번호 재사용·날짜 경계·다른 scope·종료 뒤 재요청·원자 rollback을 확인했다. 운영에서는 실제 명단을 시험 수정하거나 마감하지 않는다. 서명 조회 smoke는 기술적인 nonce·receipt를 만들 수 있으며 참가 자료를 바꾸지 않는다.

## 휴대폰 설치

서버 배포와 R28 휴대폰 설치를 구분한다. 비공개 한 파일을 생성했고 LF 61,849자/CRLF 63,739자, SHA-256 `2a7874198cdfb97116a5572afdbdc77a4129654617730752fa120f4f9ee98b37`이다. 실기기 상태는 `PENDING_USER_INSTALL`이다.

새 두 줄 양식의 전체 복사는 기존 compact copy 전달과 호환된다. 코드로 직접 상세·추가·삭제·쫑을 실행하려면 R28로 교체해야 한다. 교체 전에는 기존 당일 숫자 명령과 전체 양식 복사를 사용한다. 공개 도움말은 최신 서버·R28의 명령 계약을 설명한다. [한 파일 교체 안내](../../../integrations/messengerbot-r/MESSENGERBOT_R_INSTALL.md).

## 복구

앱 이상 시 직전 READY 앱 `dpl_8hhjPC8sMT12bB7ZTCtQavyPcchX`로 rollback할 수 있다. 0049의 두 테이블과 모집코드·마지막 버전은 보존한다. 이전 앱이 새 양식을 처리하지 못하면 이전 앱의 최신 상세 양식을 다시 받으며, registry를 삭제하거나 코드를 다시 배정하지 않는다.

Private archive는 `.private/recovery/stable-recruit-before-migration-074fe10d-9782-42da-bbf1-0c1a8ddd6c43/production-before.dump`에 보존했다. 운영 DB 복원은 이후 쓰기 손실을 따로 검토해야 하며 앱 rollback과 구분한다. 이 백업·복원 시험은 provider PITR·Blob 전체 복원 검증을 뜻하지 않는다. 원본 행·서명키·연결 문자열·휴대폰 비공개 소스는 저장소에 게시하지 않는다.

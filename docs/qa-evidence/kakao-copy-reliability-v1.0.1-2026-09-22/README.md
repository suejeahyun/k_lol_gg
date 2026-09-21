# 카카오 복사 양식 안정화 운영 적용 1.0.1

- 기능: `kakao-copy-reliability@1.0.1`, tag `kakao-copy-reliability-v1.0.1`.
- 배포 소스: `b7798363f9b0caee847a654afe2dde07afbcb2f9`.
- 상태: **PRODUCTION**, 2026-09-22 00:58 KST 운영 주소 전환 및 확인.
- Vercel: `dpl_Enu7zPFs7kr4pqUpiveAhB7BKXDJ`, READY · production.
- 운영: https://k-lol-gg.vercel.app · 고정 배포: https://k-lol-lnp08nrkv-tjdmswo11-3715s-projects.vercel.app.
- DB: `0041_clever_skullbuster`, 운영 journal 41→42, 적용·재실행 no-op·제약 확인 PASS.
- 사용자 승인: 운영 적용까지 진행. 휴대폰 교체는 필수인 경우만 안내.

## 변경과 적용 범위

[1.0.0 패치](../kakao-copy-reliability-v1.0.0-2026-09-22/README.md)의 안전한 번호형 파티 복사 편집, 동시 변경 보존·충돌 거부, 마감·불완전 양식 안내, 예비 번호 정렬과 자모 보존, 구형 내전 양식 호환을 운영에 적용했다. 앞선 미배포 내전 패치의 라인 입력·회원 후속 연결·명단 보존 마감 및 0041도 함께 포함한다. 추가로 공개 도움말 두 페이지의 편집 금지·자동 회원 연결처럼 읽히던 과거 안내를 실제 정책에 맞췄다.

## 배포 및 검증 근거

| 검사 | 결과 | 근거 |
|---|---|---|
| 실제 기존 운영 조회 | 0c188785 / dpl_FmnnD2FtSWmTm7Ks6zrZ8it78jF7 READY 확인 | production-before.json, live-before.json |
| 최종 전체 검사 | exit 0, 계약 410 PASS, 단위 902 PASS·DB 전용 1 skip, 타입·ERD·빌드 PASS | check.log |
| lint | 오류 0, 기존 경고 326 | check.log |
| 격리 DB·0041 migration | 이전 검증된 동일 서버 소스의 모집 DB 86 PASS; fresh·데이터 있는0040 upgrade·재실행 포함 | [1.0.0 db.log](../kakao-copy-reliability-v1.0.0-2026-09-22/db.log) |
| 기존 R24 호환 | 공개 R24 원본 VM 70 PASS. R25 차이는 버전표시·로컬 도움말이며 R24 교체 필수 아님 | phone-compatibility.json |
| 운영 logical backup | 5,409,724 bytes, SHA-256·pg_restore 목록 확인 PASS | db-backup.json |
| 운영 0041 적용 | transaction 적용·재실행 no-op; nullable 열2개·CLOSED·ACTIVE 인덱스·CHECK 유효; 주요 상태별 건수 동일 | db-migration.json, db-production-after.json |
| 업로드 입력 | .private·.tmp·실제 .env 비공개 파일 0건 | deploy-inputs.json |
| Vercel 후보 빌드 | exit 0, READY, provider metadata 소스SHA 일치 | vercel-deploy.log, deployment-source.json |
| 후보 읽기 확인 | 21/21 PASS | live-candidate.json |
| 운영 전환·alias | 승인된 후보로 promote, 운영 alias 배포ID 일치 | vercel-promote.log, production-after.json |
| 운영 HTTP·표시 검사 | 21/21 PASS: HTTP 15건 모두200, 현재 파티3·내전3 상세 구조6건 PASS | live-production.json |
| 운영 오류 로그 | 전환 이후 조회된15건 모두200, error/fatal0, 결과잘림 없음 | runtime-logs.json |
| 비밀정보 검사 | 현재 트리 PASS; 전체Git이력 재검사 의미 아님 | secret-scan.log |
| 릴리스 기록 | 소스/tag/migration/QA/운영 근거 연결 | release-check.log, [등록부](../../releases/registry.json) |
| Git | 기능 브랜치·소스tag push | git-push-source.log |

적용 순서: 운영 상태 확인 → logical backup → 전체 검사 → 운영용 후보 빌드(대표 주소 미전환) → 0041 migration·재실행·제약 검사 → 후보 읽기 확인 → 대표 운영 주소 promote → 운영 읽기·로그 확인. 관리형 Vercel 배포 전환을 사용했으며 기존 명단의 일괄 수정·삭제나 외부 채팅 발송은 하지 않았다.

백업은 `.private/backups/copy-production-20260922/before-0041.dump`에 보관한다. SHA-256 `6942b8b78ee8bc884ca7ef17a286b023b21f42e0b2d3064c082444a190752a99`. 운영 원본 archive의 실제 복원이나 provider PITR 실행은 이번에 하지 않았다. 원본 개인정보와 비밀값은 저장소 증거에 복제하지 않았다.

## 검증 한계와 복구

운영 검사는 서명된 도움말·현황·기존 상세 조회와 공개 페이지·health이다. 기존 명단에 테스트 참가자를 추가하거나 삭제하지 않았다. 저장·동시성은 격리 DB 합성 데이터 검사로 검증했다. 실제 기기 설치 버전·카카오 알림부터 답장까지의 송수신은 별도 미확인이다. 기존 R24를 사용 중이라면 핵심 서버 패치를 위한 교체는 필요하지 않다.

0041은 데이터 UPDATE/DELETE나 테이블 삭제 없이 nullable 열·enum·제약을 변경한다. 새 버전이 CLOSED 또는 취소 이력과 새 ACTIVE접수를 저장한 후에는 구 서버의 데이터 가정과 달라질 수 있다. 단순 alias 복귀를 안전한 복구로 간주하지 않으며 DB를 유지하는 검증된 forward-fix를 우선한다. archive/PITR 복원이 필요하면 복구시점 이후의 쓰기 손실을 검토해야 한다.

과거 1.0.0 및 내전1.0.0의 NOT_DEPLOYED 기록은 당시 시점의 근거로 유지하며 이번 1.0.1이 운영 적용 기록이다. ADR0011 전체 목록·직접 상세·빈 초안 개선 및 사이트 충원 시 카카오 서버발 푸시는 이번 범위가 아니다.

## 다음 권장 작업

1. 실제 기기·사이트에서 줄바꿈, 재복사와 동시 참가를 함께 확인하는 통합 회귀.
2. 개인정보 없이 요청 ID와 처리 시간을 연결하는 응답 지연 추적.
3. 파티 직접 상세 조회와 빈 초안 취소 흐름 개선.

[디스코드 복붙 공지](DISCORD_NOTICE.md) · [패치 기록](../../patch-notes/2026-09-22-kakao-copy-reliability-production.md). 외부 게시하지 않았다.

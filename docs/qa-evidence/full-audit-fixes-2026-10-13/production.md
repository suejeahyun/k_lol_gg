# 전체 점검 보완 1.0.0 배포 근거

## 운영 DB — 2026-10-13 KST

- 운영 변경 전 READY 배포: `dpl_7sTiDeiGCTk9mhh689b54UXiJySu`, source `8ce5e7aa9171732edf4f47eb6b548e884f14a14c`. [provider 조회](production-before.json).
- 운영 DB 연결은 새 provider 환경변수 metadata, 기존 연결 binding, 실제 운영 probe 기록과 target fingerprint를 교차 확인했다. 비밀값·원본 행을 출력하거나 저장소에 기록하지 않았다.
- [백업·복원](production-backup-restore.json): 175,220,674 bytes의 private archive, 192개 table와 922개 constraint, MMR 9개 table 내용 일치. SHA-256 `e0d02d471cca86e05f09e4c60eaf9236a33118ffe91ec6b2725e4b6e5fb045d6`.
- [복원본 rehearsal](migration-rehearsal.json): reviewed migration 0048 및 재실행 no-op 통과.
- [운영 적용](production-migration.json): 2026-10-12 18:01 UTC에 `0048_mmr-game-source-history` transaction 적용과 재실행 no-op 통과. 기존 MMR 9개 table·event 1,950개 유지, legacy source 참조 195개 생성, missing/invalid 0, migration 49개.
- 적용 직전 archive의 실제 bytes/hash, rehearsal의 SQL·backup hash·migration 이름·복원 cluster 종료 상태, DB 연결 대상과 backup age를 재검사했다. release/MMR advisory lock, event table lock, 5초 lock timeout/30초 statement timeout을 사용했다.

## 앱 배포

- source: `5b3a616749f17ae5199ba599bf6bb4ac6f50ff24`, tag: `full-audit-fixes-v1.0.0`. GitHub main·작업 branch·tag에 게시했다.
- 먼저 production 환경의 별도 후보 `dpl_4ANEhEjy1fLYeRPbXzjX4Xg83sXX`를 `--skip-domain`으로 만들고 READY·동일 source와 읽기 전용 9조건을 검증했다. [후보](candidate-deployment.json), [검사](candidate-smoke.json). 후보 업로드에는 후속 문서 수정만 일부 포함되었으며 runtime 파일은 source commit과 일치했다. 공개 목록에서 변환 대상 private asset을 찾지 못해 실제 운영 이미지 파생 변환 성공은 이 smoke로 주장하지 않는다.
- main 배포: `dpl_8hhjPC8sMT12bB7ZTCtQavyPcchX`, [immutable URL](https://k-lol-fqdo24m2r-tjdmswo11-3715s-projects.vercel.app), [운영 주소](https://k-lol-gg.vercel.app). 2026-10-12 18:07:34 UTC READY, 18:07:53 UTC에 source·project·production target·canonical alias 일치를 확인했다. [provider 근거](production-deployment.json).
- 18:08:08 UTC 운영 익명 GET **34조건 PASS**: 주요 화면, 로그인 복귀, MMR 페이지·입력, 공통 랭킹 순서, 관리자/정리 cron의 비인증 차단, health `ready`. [HTTP](production-http.json).
- 실제 운영 브라우저에서 모집 새로고침과 조회 시각을 확인했다. 플레이어 최근 경기 5개가 320/390/1440에서 가로 넘침 없이 표시되고 깨진 이미지 0이었다. [측정](production-browser.json), [참가 신청 화면](production-applications.png), [320px 화면](production-player-320.png). 운영 계정의 시험 저장은 하지 않았다.
- 배포 후 읽기 전용 DB 재확인: migration 49개·0048 hash 일치, MMR generation 2 READY, event 1,950개/source 195개, 누락 참조·식별자 불일치·무효 제약 0. 구 writer trigger와 새 FK 존재 확인. [DB](postdeploy-db.json).
- 새 security-maintenance는 04:30 KST 예약이며 이번 확인창에서 자연 실행은 미관측이다. 수동 삭제/cron 호출을 시험하지 않았다. GitHub connector의 source commit workflow/status 조회는 빈 결과여서 원격 CI 성공으로 표시하지 않으며, 로컬 최종 check·인증 HTTP·격리 DB·복구 검증과 Vercel build 성공을 근거로 사용한다.

## 복구

앱 이상 시 직전 READY 배포로 되돌릴 수 있다. 0048 DB는 유지한다. 구 writer 호환 trigger로 이전 앱의 event-only 삽입이 가능하며, 수정된 live game을 참조하는 예전 FK로 down migration하지 않는다. 과거 MMR 참조는 legacy identity로 표시하며 당시 원본 전체를 복원했다고 주장하지 않는다.

Private backup은 `.private/recovery/full-audit-before-migration-a18db198-e775-4af8-be5b-f79ccf21c3c2/production-before.dump`에 보존했다. 실 운영 복원은 이후 쓰기를 잃을 수 있으므로 앱 rollback과 구분해 사고 시점·새 자료·복구 대상을 다시 확인해야 한다. dump/restore 검증이 provider PITR·Blob 전체 복원을 의미하지 않는다.

# 전체 점검 보완 1.0.0 배포 근거

## 운영 DB — 2026-10-13 KST

- 운영 변경 전 READY 배포: `dpl_7sTiDeiGCTk9mhh689b54UXiJySu`, source `8ce5e7aa9171732edf4f47eb6b548e884f14a14c`. [provider 조회](production-before.json).
- 운영 DB 연결은 새 provider 환경변수 metadata, 기존 연결 binding, 실제 운영 probe 기록과 target fingerprint를 교차 확인했다. 비밀값·원본 행을 출력하거나 저장소에 기록하지 않았다.
- [백업·복원](production-backup-restore.json): 175,220,674 bytes의 private archive, 192개 table와 922개 constraint, MMR 9개 table 내용 일치. SHA-256 `e0d02d471cca86e05f09e4c60eaf9236a33118ffe91ec6b2725e4b6e5fb045d6`.
- [복원본 rehearsal](migration-rehearsal.json): reviewed migration 0048 및 재실행 no-op 통과.
- [운영 적용](production-migration.json): 2026-10-12 18:01 UTC에 `0048_mmr-game-source-history` transaction 적용과 재실행 no-op 통과. 기존 MMR 9개 table·event 1,950개 유지, legacy source 참조 195개 생성, missing/invalid 0, migration 49개.
- 적용 직전 archive의 실제 bytes/hash, rehearsal의 SQL·backup hash·migration 이름·복원 cluster 종료 상태, DB 연결 대상과 backup age를 재검사했다. release/MMR advisory lock, event table lock, 5초 lock timeout/30초 statement timeout을 사용했다.

## 앱 배포

아직 앱 배포 완료를 기록하지 않았다. 최종 source SHA·tag, Vercel READY ID, 운영 alias와 health/HTTP/브라우저 확인 후 이 절을 갱신한다.

## 복구

앱 이상 시 직전 READY 배포로 되돌릴 수 있다. 0048 DB는 유지한다. 구 writer 호환 trigger로 이전 앱의 event-only 삽입이 가능하며, 수정된 live game을 참조하는 예전 FK로 down migration하지 않는다. 과거 MMR 참조는 legacy identity로 표시하며 당시 원본 전체를 복원했다고 주장하지 않는다.

Private backup은 `.private/recovery/full-audit-before-migration-a18db198-e775-4af8-be5b-f79ccf21c3c2/production-before.dump`에 보존했다. 실 운영 복원은 이후 쓰기를 잃을 수 있으므로 앱 rollback과 구분해 사고 시점·새 자료·복구 대상을 다시 확인해야 한다. dump/restore 검증이 provider PITR·Blob 전체 복원을 의미하지 않는다.

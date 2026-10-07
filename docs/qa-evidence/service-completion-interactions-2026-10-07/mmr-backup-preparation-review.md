# MMR 전환 전 백업 준비본 독립 읽기 검토

2026-10-07, `visual_quality_audit`. 실행 대상은 `.tmp/mmr-before-transition-backup-20261007.mjs`이며 원본 `.tmp/mmr-before-transition-backup.mjs`와 diff를 대조했다. 이 검토자는 백업·복원·DB 연결·브라우저·MMR 변경을 실행하지 않았다. 문법 검사는 작성 담당자의 결과와 구분한다.

- 변경은 준비 주석, 새로운 QA 출력 경로, 원본/복원본 inspect transaction의 UTC 지정·확인 및 로컬 READ ONLY transaction 추가에 한정된다.
- source는 `REPEATABLE READ READ ONLY`와 UTC를 직접 확인한 뒤 snapshot을 export한다. inspect와 pg_dump의 `--snapshot`이 같은 snapshot을 사용하고 덤프가 끝나기 전 원본 transaction을 종료하지 않는다. source의 명시 SQL에 데이터 변경/DDL이 없으며 정상 경로는 ROLLBACK/end다.
- archive/cluster/오류 로그는 UUID별 `.private/recovery/mmr-before-transition-*` 하위에 만든다. resolve/relative 경계 검사와 무작위 이름을 유지한다. 기존 덤프 디렉터리를 덮어쓰거나 정리하는 코드가 추가되지 않았다.
- restore 대상은 별도 임의 포트의127.0.0.1 PostgreSQL과 `klol_v2_test_mmr_recovery_*` DB다. local inspect의 READ ONLY transaction을 ROLLBACK한 뒤 기존 constraint canonicalization의 별도 BEGIN/ALTER/ROLLBACK으로 넘어간다. 원본에서 제약을 변경하지 않는다. 예외 시 연결 종료와 로컬 cluster 정리 경로는 유지된다.
- 새 요약은 `service-completion-interactions-2026-10-07/mmr-before-transition-backup.json`에 쓰므로10/06 기록을 덮어쓰지 않는다. 출력은 집계·해시·스키마/상태·실행 메타데이터이며 자격 증명을 로그 인자로 추가하지 않았다. 원본 dump와 도구 실패 원문은 private 위치에 유지한다.

이 최소 diff에서 준비를 막는 새 중대 문제는 발견하지 못했다. 실제 실행 전에 root가 최신 운영 DB binding·소스 migration/MMR 상태·명시된 운영 권한 조건을 별도로 확인해야 한다. 이전 binding 파일을 읽는 코드 자체를 최신 provider 연결 확인으로 간주하지 않는다. 이번 결과는 실제 백업 성공, 복원 일치, provider PITR/Blob 복구, MMR 전환 성공을 증명하지 않는다.

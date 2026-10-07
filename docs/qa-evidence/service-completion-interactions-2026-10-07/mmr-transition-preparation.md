# MMR 전환 준비 검토 — 2026-10-07

이 기록은 기존 소스·런북·실행기를 읽은 준비 결과다. 이번 준비 중 운영 DB 연결, 영향 미리보기, 백업, 재계산, cron 호출, 브라우저 조작을 실행하지 않았다. 전달받은 현재 UI는 ADMIN이며 generation1·42회차·91게임·미소비 변경 이벤트13건이다. 이를 SUPER_ADMIN 권한이나 갱신된 영향 미리보기로 해석하지 않는다.

## 실행 전 경계

1. 실제 `/admin/balance-ai` 세션이 **SUPER_ADMIN / ADMIN-purpose**인지 확인한다. 서버는 APPROVED·세션 유효성·authVersion·폐기·만료를 transaction에서 다시 확인한다. 현재 ADMIN, ACCOUNT 로그인 또는 DB 자격으로 대체하지 않는다.
2. 현재 production alias·source와 기존 DB 환경 바인딩을 다시 대조한다. 준비한 백업 실행기의 알려진 storage-probe 일치 검사만으로 지금의 환경 metadata 확인을 대신하지 않는다.
3. 같은 원장으로 최신 영향 미리보기를 얻고, 현재 점수·순위가 바뀌는 범위를 알린다. 기존 사용자의 실행 허가가 있으면 일반 승인을 반복 요청할 필요는 없지만 실제 권한 검사는 생략하지 않는다.
4. 새 읽기 전용 백업을 만들고 격리 복원·비교 PASS를 확인한 뒤 UI의 전체 원장 재계산/공식 전환 확인으로 진행한다. 백업 실패·generation 변경·영향 변화가 있으면 원인을 확인하기 전 실행하지 않는다.

## 준비된 기존 명령

다음은 **아직 실행하지 않은 명령**이다. 작업 디렉터리는 `E:\k-LOL.GG\worktrees\ux-discoverability-20261002`다.

```powershell
npx tsx qa/mmr-transition-impact-readonly.ts E:/k-LOL.GG/1.k_lol_gg_v2/.env.local docs/qa-evidence/service-completion-interactions-2026-10-07/mmr-transition-impact.json
node .tmp/mmr-before-transition-backup-20261007.mjs
```

영향 도구는 기존 `loadLedger`의 정확한 SELECT 매핑과 순수 `rebuildMmrProjection`을 READ ONLY snapshot에서 실행하고 집계만 저장한다. 기본 출력은 10/06 근거이므로 위처럼 새 출력 경로를 반드시 명시한다. 이 비교에는 공식 변경과 미반영 경기 반영이 함께 포함된다. 원장·활성 선수 상태가 달라질 수 있어 10/06의 47회차/104게임·프로필93을 현재 예상값으로 고정하지 않는다.

백업 준비본은 `.tmp/mmr-before-transition-backup.mjs`를 보존한 별도 사본이다. 인수는 없으며 새 결과는 `docs/qa-evidence/service-completion-interactions-2026-10-07/mmr-before-transition-backup.json`이다. 임의 UUID의 `.private/recovery/mmr-before-transition-<UUID>/production-before.dump`에만 운영 archive를 보관한다. 공개 결과에는 크기·SHA-256·경로·비교 결과만 남는다. 10/06 결과와 archive를 덮어쓰지 않는다. 새 결과가 생긴 뒤 재실행할 경우에도 실패 근거를 먼저 보존해야 한다.

변경은 새 출력 경로와 UTC 비교뿐이다. 원본 source의 `REPEATABLE READ READ ONLY`·storage-probe 바인딩·generation1/V1·LF migration hash 검사·exported snapshot을 유지한다. 원본 조회 transaction 안에 UTC를 설정하고 검증한다. `pg_dump --snapshot`이 끝나면 원본은 ROLLBACK/end 한다. 복원 대상은 새 loopback PostgreSQL18·`klol_v2_test_mmr_recovery_*` DB다. 복원 검사만 READ ONLY+UTC transaction으로 감싸고, ROLLBACK 후 기존의 로컬 CHECK 표현식 비교 transaction을 실행한다. 해당 ALTER 비교도 마지막에 ROLLBACK하며, 원본 DDL/DML은 없다. 마지막에 로컬 cluster를 정지하고 비공개 archive는 보존한다.

`node --check .tmp/mmr-before-transition-backup-20261007.mjs`는 통과했다. 독립 검토는 [백업 준비본 검토](mmr-backup-preparation-review.md)에 기록한다. 이는 실제 dump·restore 성공을 뜻하지 않는다. `npm run verify:recovery`는 합성·loopback 전용 복구 드릴이므로 위 실제 운영 archive 검증을 대신하지 않는다.

## 실제 명령 및 실행 후 확인

기존 UI는 `/api/admin/balance-ai/recalculate`에 현재 generation의 `If-Match`, 멱등 키, 빈 JSON body `{}`를 보낸다. 같은 출처와 SUPER_ADMIN 권한을 서버가 확인한다. 현재 세션으로 UI에서 수행하며 세션을 만들어내거나 DB 포인터를 직접 수정하지 않는다. 412는 최신 generation/영향을 다시 확인할 사유이고, 401/403은 실제 세션/권한을 해결할 사유다.

성공 뒤 공개 GET `/api/rankings/mmr`와 READ ONLY 집계를 대조한다. 공식은 `V2_DETERMINISTIC_1`, `formulaTransition=null`, 새 generation과 계산 시각, 실행 직전 영향 미리보기의 회차·게임·조정·프로필 수를 확인한다. 원장이 그대로면 generation은1→2다. 중간 경기 변경이 있으면 최신 원장과 새 변경 영수증을 다시 대조하며 수치를 억지로 고정하지 않는다.

READ ONLY 검사는 `mmr.projection_states`, projection_runs의 ADMIN trigger/이전·다음 generation/집계·시각, generation별 프로필·포지션·경기 이벤트 건수, `mmr.consumer_receipts`의 적용 건수, `competition.match_recalculation_outbox`의 미소비 건수만 반환한다. 사용자 식별자·점수 원장·요청 본문은 결과에 남기지 않는다. 이전 generation이 보존됐는지도 집계로 확인한다. 13건은 이벤트 수이며 서로 다른13경기를 뜻하지 않는다.

후속 5분 자연 cron의 HTTP 상태를 provider 로그로 읽고 공개 summary·pending 집계와 함께 확인한다. 로그가 응답 body를 제공하지 않으면 HTTP200만으로 IDLE/REBUILT를 읽었다고 주장하지 않는다. generation 그대로+대기0이면 새 반영이 필요 없는 상태와 일치하며, 새 CATCH_UP run/영수증이 있으면 그 범위의 반영을 대조한다. 검증 목적으로 cron endpoint를 수동 실행하지 않는다. 계속409면 공식 전환 미완료, 503이면 잠금·저장소 등 원인을 확인하며 추가 재계산을 무작정 반복하지 않는다.

기존 generation은 남지만 이를 선택하는 복귀 API는 없다. **Vercel 배포 롤백만으로 점수는 V1로 돌아가지 않는다.** 이상 시 예약을 멈출 필요와 영향 범위를 검토하고 forward-fix 또는 백업/PITR 복원 범위를 결정한다. 전체 DB 복원은 백업 이후 다른 회원·경기·연동 쓰기의 손실을 포함하므로 별도 판단 없이 실행하지 않는다. 이번 준비는 provider PITR·Blob 파일·비밀키 복구를 검증하지 않았다.

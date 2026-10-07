# 2026-10-08 운영 환경·DB 연결 대상 재확인

2026-10-08 **00:53:09 KST**(2026-10-07T15:53:09.348Z)에 읽기 전용 대조를 마쳤다. [안전한 결과 JSON](environment-binding.json)에 메타데이터·집계·검증 상태만 기록했다. 비밀값·연결 URL·선수/계정/경기 원문은 출력하거나 이 증거에 저장하지 않았다.

## 판단

**현재 알려진 로컬 DB 연결값을 운영 영향 분석·백업의 대상으로 판단할 충분한 복합 근거를 확인했다.** 과거 `.private/operational-readonly-result.json`의 `matched` 값을 재사용하지 않았다. 아래 네 근거를 이번 실행에서 대조했다.

| 근거 | 현재 확인 |
|---|---|
| 운영 canonical/provider | `https://k-lol-gg.vercel.app` → `dpl_BTfa4hYSa6ZR19K4Lfszsu88Lhr2`, READY·production |
| 운영 source | `653023b0f8dd1640b42afebf5e1fa3e2c7a3bee6`, 같은 프로젝트와 canonical alias 확인 |
| 최신 production DATABASE_URL metadata | 인증된 Vercel GET으로 다시 읽음. 환경 항목 id·updatedAt·sensitive type이 기존 인증된 운영 probe 당시 metadata와 동일 |
| 알려진 DB의 인증된 probe 표식 | 정확한 기존 storage-probe run 한 건을 새 READ ONLY transaction에서 다시 조회. SUCCEEDED·realStorage=1 일치 |
| 현재 공개 응답 ↔ 현재 DB snapshot | generation·상태·공식·경기/게임/조정 수·계산 시각·미소비 outbox 수 모두 일치 |

Vercel은 `DATABASE_URL`을 `sensitive`로 관리하며, 단일 환경 변수 읽기 API도 값을 반환하지 않았다. 따라서 **현재 plaintext URL 문자열 자체의 직접 동일성 검사는 수행할 수 없었다**. `PASS_WITH_SENSITIVE_VALUE_LIMITATION`은 이 한계와 위 복합 대조를 함께 표현한다. URL 원문을 비교했다거나 과거 probe만으로 현 운영 대상을 확정했다고 쓰지 않는다. 환경 id·갱신 시각·배포·DB 표식·공개 집계 중 하나라도 달라지면 기존 판단을 재사용하지 않고 중단해 다시 대조해야 한다.

## 실제 조회 범위

- 기존 Vercel CLI의 `api`를 통해 현재 canonical deployment, production 환경 metadata, 해당 DATABASE_URL 항목을 GET했다. 현재 연결된 프로젝트와 팀 범위를 사용했고 새 권한·설정·키를 만들지 않았다.
- 현재 `/api/health`는 200/ready였다. `/api/rankings/mmr`에서는 공개 집계만 취해 DB와 대조했고 플레이어 행은 보존하지 않았다.
- DB에서는 `REPEATABLE READ READ ONLY`, UTC, statement timeout 10초를 확인했다. 정확한 probe 행·GLOBAL MMR 상태·미소비 이벤트 수만 조회한 뒤 ROLLBACK하고 연결을 종료했다.
- 현재 상태는 generation **1**, `V1_INTERNAL_MMR_1`, **42회차·91게임**, 수동 조정 **0**, 반영 대기 outbox 이벤트 **13**이다. 이벤트 13개는 경기 13개를 뜻하지 않는다. 공식 전환 필요 상태가 유지됐다.
- 운영 mutation·백업·복원·cron 직접 호출·외부 Riot 호출·브라우저 조작은 수행하지 않았다. 기존 `.env` 파일을 덮어쓰거나 `env pull`을 실행하지 않았다.

이번 읽기 전용 실행기는 무시 경로 `.tmp/environment-binding-20261008.cjs`다. 원시 provider 응답과 안전하게 취급해야 할 fresh binding 표식은 새 무시 디렉터리 `.private/environment-binding-20261008-7490d2/`에만 두었다. `current-binding.json`에는 현재 확인 시각·target fingerprint·검증한 probe 식별자를 담아 새 백업 runner에서 사용할 수 있게 했다. 과거 실행 결과 파일은 수정하지 않았다.

## 백업 실행기 검토와 다음 조건

기존 10/07 백업 준비본의 source transaction은 READ ONLY·exported snapshot을 유지하고 `pg_dump --snapshot`을 끝낸 뒤 종료한다. 복원과 constraint 비교는 UUID를 포함한 private 경로의 loopback 임시 cluster에만 수행한다. 이번 담당자는 새 10/08 백업을 실행하거나 수정하지 않았다.

새 runner는 이번 fresh binding 표식과 실제 연결 URL의 비밀값 없는 target fingerprint를 대조하고, source의 READ ONLY·UTC·migration head·전환 전 generation/formula를 다시 확인해야 한다. 환경·대상·집계가 달라지면 영향 분석을 갱신한다. 이 문서는 백업 생성·복원 성공이나 실제 최고 관리자 확인창 승인을 대신하지 않는다. 추후 1.0.9가 배포되면 runtime ID/source는 그 새 배포 근거로 갱신해야 한다.

## 전환 후 읽기 검증 준비

1. 통합 담당자가 실제 최고 관리자 UI에서 전환을 완료하고 확정 시각·결과 generation을 알려준 뒤 시작한다. 공개 MMR summary와 같은 DB의 새 READ ONLY snapshot을 대조해 V2 공식·새 generation·집계·영수증을 확인한다. 새 경기 이벤트가 들어오면 대기 수가 다시 증가할 수 있으므로 수치만으로 실패를 판단하지 않는다.
2. 기존 generation과 수동 조정 원장의 보존은 백업 전후 집계 및 기존 불변 이력으로 확인한다. 게시 generation이나 원장 값을 직접 수정하지 않는다.
3. 다음 자연 발생 5분 MMR 예약 경계 이후 **한 번의 유의미한** provider 로그 조회를 한다. 기존 CLI의 `logs --environment production --since <전환확정 UTC> --until <관측끝 UTC> --limit 250 --json --no-follow` 옵션이 현재 도움말에 있음을 확인했다. 원문은 새 private 파일로만 받고 정확한 `/api/cron/mmr-projection`의 시각·배포 ID·HTTP 상태만 집계한다.
4. 실제 cron 요청을 수동 실행하지 않는다. 기존 공식에서는 의도된 409 `MMR_FORMULA_TRANSITION_REQUIRED`이며 전환 후에는 IDLE/REBUILT 또는 오류 여부를 구분한다. 요청 로그의 200만으로 반환 body의 IDLE/REBUILT를 읽었다고 주장하지 않고, 공개/DB 집계와 함께 확인한다. 로그 표본이 없거나 status 0이면 성공으로 처리하지 않는다.

기존 followup/Riot 읽기 실행기는 과거 날짜·출력 경로·배포 guard를 포함하므로 그대로 실행해 오늘 근거로 사용하지 않는다. 후속 작업이 배정되면 현재 배포와 이번 binding으로 guard를 갱신한 별도 출력 경로를 사용한다. 위 후속 검증은 준비만 했으며 이번 실행에서 수행하지 않았다.

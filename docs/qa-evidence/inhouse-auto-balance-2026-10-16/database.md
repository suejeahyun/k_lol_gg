# 자동 최선 편성의 저장 경계 검증

사용자가 조건 충돌 때 오류로 종료하지 않고 최선의 팀을 자동 편성하도록 요청했다. 기존 회차와 원본 참가자 입력을 보존하면서, 서버가 실제 자동 완화한 평가 회차의 결과를 선택·수동 평가·저장·재평가할 수 있도록 연결했다. 운영 DB와 스키마를 변경하지 않았으며 migration head는 `0049_stable-recruit-codes`다.

## 서버 정책 근거

`PostgresTeamBalanceRepository`는 같은 초안·같은 평가 회차의 `AUTO`, `rank=1` 후보에 저장된 `score.fairness.constraintRelaxation.applied`를 읽는다. 이 값이 true인 회차에서만 도메인 평가에 `allowConstraintRelaxation`을 전달한다. 선택된 수동 후보의 표시 상태나 클라이언트가 보낸 flag로 정책을 결정하지 않는다.

자동 후보 선택, 수동 배치 평가, 저장 직전 재검증이 같은 정책을 사용한다. 기존 엄격 회차와 과거 후보는 자동으로 완화하지 않는다. 재평가에서 새로 엄격한 편성이 가능해지면 새 회차에 완화 marker가 없으므로 해당 회차는 다시 엄격하게 검사한다. 인원 10명·양 팀 각 5명·역할별 1명·중복 선수 금지는 완화하지 않는다.

## 격리 DB 검증

```powershell
$env:V2_DB_CONTRACT_SCOPE='team-tools'
$env:PG_BIN_DIR='C:/Program Files/PostgreSQL/18/bin'
npm run test:db
```

새 일회성 PostgreSQL 18에서 최종 **8/8 PASS**: 초안 계약 6개와 팀 점수 계약 2개. 기존 공정성 계약에 아래 새 연결 시나리오를 추가했으며, assertion 수를 별도의 테스트 개수로 세지 않는다. cluster 종료와 임시 경로 제거도 확인했다.

- 엄격 편성이 불가능한 고정 역할·바텀 티어 조합에서 새 초안을 생성하고 동일 멱등성 키의 재전송을 확인했다. 조회 결과에 `REVIEW_REQUIRED`와 실제 완화 사유가 보존된다.
- 원본 참가자의 `eligiblePositions`와 rating JSON이 입력과 동일하다. 완화를 위해 역할 입력이나 개인 점수를 바꿔 저장하지 않는다.
- 자동 후보 선택 → 저장 → 재전송 → 수동 선택 → 저장 → 재평가 → 저장을 실제 service/repository/SQL로 실행했다.
- 수동 선택을 원래 허용 역할로 되돌리면 역할 이탈 0명, 바텀 큰 티어 제한 위반 1건이 명시된 채 저장된다. 서버가 자동 완화한 회차가 다시 엄격 검사에 막히지 않는다.
- 과거 후보가 현재 역할·바텀 제한을 위반한 경우 자동 선택·수동 평가·저장은 기존 엄격 정책으로 거절한다. 유효한 과거 후보는 계속 저장할 수 있다. 사용자가 재평가한 뒤 생성된 새 회차에서는 완화 편성이 저장되며, 이전 회차의 append-only score JSON은 그대로다.
- 미드만 가능한 인원이 3명인 역할 충돌에서는 필요한 역할 이탈 1명이 표시되고 저장된다. 원래 선택 포지션은 보존한다.
- 이후 최신 점수로 엄격 편성이 가능한 회차를 만들면 marker가 사라지고 임의 역할 위반을 다시 거절한다. 생성/수동 선택 body의 `allowConstraintRelaxation` 추가는 `INVALID_INPUT`으로 거절한다.
- 완화 회차에서도 중복 선수를 넣은 수동 배치를 거절한다. 기존 소유자/관리자 권한, transaction 세션, 멱등성, revision, 조회 스냅샷, 06시 날짜 경계 및 팀 점수 계약도 함께 통과했다.

첫 실행에서는 신규 시나리오의 클라이언트 flag 거절을 검사하면서 동기 예외를 `assert.rejects`로 받아 테스트가 실패했다(초안 파일 5 pass/1 fail). 실제 서비스는 의도대로 `INVALID_INPUT`을 동기 발생시켰다. `assert.throws`로 수정하고, 수동 바텀 제한 완화의 명시적 숫자 검사도 추가한 뒤 새 cluster에서 최종 8/8을 확인했다.

담당 repository·DB 테스트의 ESLint 오류/경고 0, `git diff --check` PASS. 기존 팀 점수 provider의 동일 연결 병렬 쿼리에서 node-postgres deprecation 안내가 남으며 이번 수정으로 해결했다고 주장하지 않는다. 최종 전체 lint·타입·계약·단위·build 결과와 배포는 상위 QA 기록을 따른다.

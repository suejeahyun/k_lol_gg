# 멸망전 판수 절대평가 1.6.0 검증

## 범위

ABSOLUTE_V3 기본 비중 30/50/10/5/5. 본인 기재 승수 + 패수를 300판 상한의 선형 경험 점수로 환산한다. 같은 총 판수의 승패 구성이 점수에 영향을 주지 않는다. 명시적 0판은 READY 0점이며 미입력은 NO_DATA다. ABSOLUTE_V1/V2 읽기와 확정된 경매 스냅샷은 보존한다.

300판 상한은 이번 초기 운영 기준이다. 통계적으로 추정된 실력 경계라는 주장을 하지 않는다. 향후 기준 변경 시 새 공식 버전으로 기록하여 확정 경매의 의미를 보존한다.

## 재현

```powershell
npm run check
$env:V2_DB_CONTRACT_SCOPE='destruction'
npx tsx scripts/test-db/run-data-contracts.ts
npx tsx scripts/test-db/run-destruction-browser-qa.ts --self-reported-only
node scripts/check-secrets.mjs --tree-only
```

- 단위 테스트: 0/1/10/100/150/299/300/301/1,000,000판, 승패 교환 불변성, 잘못된 입력, 합산 비중, V2 보정 승률 호환, 미확정 공식 전환, 별도 비중 보존, 확정 후 전환 금지.
- [DB 검사](database.txt): 격리 PostgreSQL의 실제 명령·예약 작업, 기존 V2 기본 비중에서 V3 전환, 신청자 수정·재계산, 소유권·멱등성·확정 잠금 및 경매 금액 검증.
- [전체 검사](check.txt): lint·타입·계약·단위·ERD·빌드.
- 화면/상호작용 근거는 `docs/qa/destruction-game-count-2026-09-28`에 새로 저장하며 1.5.0 근거를 덮어쓰지 않는다.

## 배포 및 복구

운영 전환 결과는 배포 완료 후 별도 `production.md`와 registry 항목에 기록한다. 운영 전 미확정 비협곡 대회 1개·참가자 20명의 원본을 비공개 백업했다. 기존 운영 기준은 1.5.0 런타임의 c3b05d99 / dpl_2Qt35k5W86ZrafXiQrhwkSScn1eZ다. V3 데이터는 이전 서버가 읽을 수 없으므로 배포만 되돌리지 않으며, forward-fix 또는 이후 신규 입력을 보존하는 데이터 복원 절차가 필요하다. 운영 DDL은 없다.

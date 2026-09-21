# Storage probe 경계·격리 DB QA

- 날짜: 2026-09-22
- 상태: **소스·합성 집중 검사·격리 PostgreSQL PASS. 실제 운영 Blob 실행은 이 문서의 검증 범위 밖이다.**
- API: 서명된 `POST /api/internal/jobs/storage-probe`, 입력은 빈 JSON object.

인증된 요청만 서버 생성 UUID의 `readiness/storage/<UUID>` 객체에 접근한다. 새 PNG 한 개를 업로드한 뒤 SHA-256으로 동일 바이트를 확인하고 삭제·부재 확인을 한다. 호출자가 key·URL·크기·횟수를 지정할 수 없다. 기존 이미지나 명단·계정은 수정하지 않는다.

nonce hash와 실행 이력을 한 transaction에서 확보한다. 같은 nonce는 409, 최근 5분 안의 다른 호출은 429이며 advisory lock으로 동시 두 호출의 이중 진단을 방지한다. 예약·결과 기록에는 lock/statement timeout이 적용된다. 결과는 `maintenance_runs`에 성공/실패·건수·정규화 실패코드로 남고, API에는 provider를 표시한다. `realStorage: 0` 기록은 합성 어댑터 검사이며 실 Blob 증거가 아니다. 예상 밖 probe 예외는 `STORAGE_PROBE_FAILED`로 기록한다. DB 자체가 끊겨 결과 기록을 못하면 성공 응답을 보내지 않는다.

인증 뒤의 HTTP 추적 ID는 DB `request_id` UUID에서 하이픈만 제거한 값이다. 요청자가 보낸 trace header로 저장소 경로를 고를 수 없다. 비밀값·원본 provider 오류·운영 데이터는 응답하지 않는다.

| 검사 | 결과 | 근거 |
|---|---|---|
| Probe·HTTP·production adapter seam·private storage·daily close | 17 PASS / 0 fail | `boundaries.log` |
| Operations scope 격리 PostgreSQL 18 | S13 기존 계약 + storage 신규 계약, 2 PASS | `database.log` |
| TypeScript | exit 0 | `typecheck.log` |
| 대상 ESLint | exit 0 | `lint.log` |

DB 계약은 동시 두 요청에서 하나만 storage 호출, nonce replay, 성공/실패 실행 기록, nonce 원문 비저장, 24시간 claim 수명, 업로드 실패 후 보상 삭제, 삭제 실패 표시, storage unavailable 무기록을 확인한다. runner는 격리 cluster 정상 종료·일회성 경로 제거까지 확인했다.

```powershell
npx tsx --test tests/storage-probe.test.ts tests/storage-probe-http.test.ts tests/private-blob-storage.test.ts tests/vercel-kakao-daily-close.test.ts
$env:PG_BIN_DIR='C:\Program Files\PostgreSQL\18\bin'
$env:V2_DB_CONTRACT_SCOPE='operations'
npm run test:db
```

Production adapter는 `access: private`, 덮어쓰기 금지, `useCache: false`를 사용한다. SDK 로컬 정의와 [Vercel의 private storage consistent reads 공지](https://vercel.com/changelog/vercel-blob-now-supports-consistent-reads-on-private-storage)를 대조했다. 최종 확인은 실제 배포에서 `storageProvider: VERCEL_BLOB_PRIVATE`, 각 건수 1, `ok: true`, 같은 요청 ID의 실행 기록을 확보해야 한다. 이 검사는 raw 저장소 왕복이며 앱의 업로드 권한·미디어 등록·DB 연결 전체 E2E를 대신하지 않는다.

업로드 timeout 뒤 원격 완료가 늦게 발생하는 경우와 런타임 강제 종료는 별도 운영 실패 상황이다. 성공으로 판정하지 말고 요청 ID로 진단 객체·실행 기록을 확인한다. cleanup 실패 상태에서 기존 업무 이미지 전체 삭제를 재시도하지 않는다.

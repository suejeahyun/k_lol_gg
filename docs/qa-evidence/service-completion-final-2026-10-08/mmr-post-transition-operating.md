# MMR 공식 전환 후 운영 확인 — 2026-10-08 KST

상태: **PASS**. 실제 최고 관리자 UI 전환 후 공개 API, 정확한 원장 재계산 검증, 다음 자연 5분 예약 실행, 그 이후 읽기 전용 DB 상태가 일치한다. 이번 관측자가 운영 데이터를 쓰거나 cron·Riot 작업을 임의 호출하지 않았다.

## 전환 결과와 공개 화면 기준

- 운영 주소: `https://k-lol-gg.vercel.app`
- 관측 배포: `dpl_BTfa4hYSa6ZR19K4Lfszsu88Lhr2`, source `653023b0f8dd1640b42afebf5e1fa3e2c7a3bee6` (service-completion 1.0.8).
- 공식 계산 확정: **2026-10-07T15:57:52.679Z** (2026-10-08 00:57:52.679 KST).
- `mmr-after.json`의 독립 읽기 전용 검증 20개가 모두 통과했다. 저장소의 실제 SELECT mapper와 순수 계산기로 재생한 **93 프로필·465 포지션 프로필·1,040 경기 이벤트**가 게시 결과와 일치한다.
- 원 generation 1의 전체 행 해시는 보존되었고 수동 조정은 변경되지 않았다. 정확한 13개 대기 원장 이벤트가 generation 2 영수증으로 소비되었으며 ADMIN 실행·감사·outbox·성공 명령 영수증의 연결이 확인됐다.
- 후속 공개 `GET /api/rankings/mmr`는 HTTP 200, `READY`, **generation 2 / V2_DETERMINISTIC_1 / 47회차·104게임 / 대기 0 / 공식 전환 경고 없음**이었다. 계산 시각까지 `mmr-after.json`과 같았다. 플레이어 이름·ID·개별 점수 행은 저장하지 않았다.

## 다음 자연 예약 실행과 이후 DB

기존 인증된 Vercel CLI로 production 로그를 `2026-10-07T15:57:52.679Z`부터 `2026-10-07T16:00:30.532Z`까지 한 번 조회했다. 한도 250개 중 87개 요청 행을 받았고, 정확한 `/api/cron/mmr-projection` 요청은 **2026-10-07T16:00:13.328Z**, 위 운영 배포의 **HTTP 200 한 건**이었다. 이는 `*/5 * * * *`의 다음 자연 예약 경계와 일치한다. 요청 원문은 `.private/mmr-post-transition-20261008/provider.raw.jsonl`에만 보관했다.

그 이후 **2026-10-07T16:01:57.102Z** snapshot에서 `READ ONLY`, `REPEATABLE READ`, UTC를 실제 DB 설정으로 확인한 뒤 SELECT만 수행하고 ROLLBACK했다. 새로 확인된 환경 바인딩과 정확한 기존 storage-probe marker를 다시 대조했다.

| 항목 | 관측 결과 |
|---|---|
| 현재 generation·공식·계산 시각·원장 체크섬 | 전환 직후와 동일 |
| 미소비 MMR 원장 이벤트 | 0 |
| projection 실행 | 기존 BOOTSTRAP 0→1 한 건, ADMIN 1→2 한 건 |
| generation 2 이후 추가 projection 실행 | 0 |
| generation 2 소비 영수증 | 13 |
| 수동 조정 | 0, 전환 직후와 동일 |
| 공개 API 요약과 DB | 일치 |

`postgres-mmr-repository.ts`의 `catchUp()`은 현재 공식의 READY 상태에서 대기 이벤트가 없으면 새 generation을 만들지 않고 `IDLE`을 반환한다. **HTTP 200과 위 불변 상태는 이 IDLE 경로와 일치한다.** provider 요청 로그에서 응답 본문을 읽은 것은 아니므로 `kind: IDLE`을 직접 관측했다고 주장하지 않는다. 한 구간의 요청 기록은 장기 가동률이나 예약 호출자 신원의 증거도 아니다.

## Riot 진단의 실제 운영 관측 갱신

같은 snapshot에서 이름·계정·경기 ID 없이 집계했다. 요청 시각 기준 최근 24시간은 성공 270건, `PARTIAL_MATCH_INVALID` 부분 반영 10건, 과거 `failure_code`가 없는 부분 반영 8건이었다.

현재 배포 READY 시각 `2026-10-07T13:54:26.070Z` 이후 요청되어 완료된 `PARTIAL_MATCH_INVALID`는 **3건**, 완료 시각 범위는 `2026-10-07T15:00:48.731Z`~`2026-10-07T15:45:48.797Z`였다. 따라서 이전 1.0.7 근거의 “새 부분 반영 진단이 아직 실제 운영에서 관측되지 않음”은 현재 시점에는 해소됐다. 이 결과는 **부분 반영 원인의 코드 저장과 운영 가시성**을 입증한다. 외부의 부적합 경기 응답이 복구되었거나 모든 Riot 경기가 완전 반영되었다는 뜻은 아니다. 외부 작업을 재실행하거나 원문을 추가 수집하지 않았다.

## 근거와 한계

- 기계 판독 집계: `mmr-post-transition-operating.json`.
- 전환 전/후 재계산 대조: `mmr-before.json`, `mmr-after.json`.
- 현재 운영 바인딩: `environment-binding.json`, `environment-binding.md`. 민감 환경 변수의 평문 직접 비교 불가라는 기존 한계는 그대로 유지된다.
- 재현 runner: ignored `.tmp/mmr-post-transition-operating.cjs`. 기존 환경 파일에서 연결값을 메모리로 읽고 공개 HTTP 요약과 SELECT 집계만 기록한다. 원문 로그와 인증정보는 공개 근거에 포함하지 않는다.
- 이 확인은 위 시점의 현재 원장과 다음 예약 한 번에 대한 증거다. 이후 새 경기 입력의 자동 `REBUILT`를 운영 데이터를 만들어 시험하지 않았다. 이 분기의 동시성·원자성·재시도는 별도 격리 MMR 계약 검증 범위다.

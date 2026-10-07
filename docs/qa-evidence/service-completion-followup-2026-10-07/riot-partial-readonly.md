# Riot 부분 성공 19건 추가 조사 — 2026-10-07

12:35:13 KST의 읽기 전용 DB snapshot으로, [오늘 최초 관측](external-runtime.md)의 최근 24시간 PARTIAL 19건을 같은 시간 창으로 다시 집계했다. 결과는 [riot-partial-readonly.json](riot-partial-readonly.json)에 보존한다. 앱 소스·환경·운영 데이터 변경과 Riot/Vercel API 호출은 하지 않았다.

## 실제 확인

| 범위 | 결과 | 해석 경계 |
|---|---|---|
| 최초 관측과 동일한 시간 창 | 10/06 12:10:37.785~10/07 12:10:37.785 KST, SUCCEEDED 269 / PARTIAL 19 | 작업 요청 시각 기준. 19명을 뜻하지 않음 |
| PARTIAL 19건의 코드·시도 수 | 전부 `failure_code=null`, `attempt_count=1`; JOB 요청 18 / ADMIN 요청 1 | 재시도 고갈·429라는 증거가 아님 |
| 같은 연결의 후속 작업 | 19건 중 13건 이후 다른 PARTIAL이 있고, 6건 이후에는 SUCCEEDED/PARTIAL이 없음. 19건 모두 후속 SUCCEEDED 없음 | 작업 건수 단위이며 13개의 서로 다른 연결을 뜻하지 않음. 완전 복구했다고 표시할 수 없음 |
| 새 snapshot 직전 24시간 | SUCCEEDED 269 / PARTIAL 19, 대기 QUEUED/RUNNING/RETRY_WAIT 0 | 지속적인 전체 중단이나 현재 처리 대기는 관측하지 못함 |
| 전체 요약의 최신 시각 | 티어/최근 솔로 모두 12:30:48.245 KST | 전체 중 어느 요약의 최신값인지에 관한 집계. PARTIAL 대상 각각의 자료 완전성을 증명하지 않음 |

## 원인 분류와 한계

검토 소스 `0277c327cb9054ef78ca2646982d0833e234f4db`와 이전 운영 소스 `c9431b9e68b468c17d02c6ff7595de7e14a7c9c8` 사이 Riot 모듈·스키마 변경은 없다.

- **정책으로 의도된 부분 성공:** `finishRiotSyncJob`는 SUCCESS의 partial=true를 PARTIAL로 저장하며 오류 코드를 null로 끝낸다. 랭크 성공 후 선택적 analytics 실패가 이미 얻은 랭크를 무효화하지 않도록 한 동작이다. [도메인](../../../src/modules/riot/domain/riot-integration.ts), [애플리케이션](../../../src/modules/riot/application/riot-application.ts).
- **가능하지만 이번 19건에서 확인되지 않은 원인:** 전체 25초 예산 소진, HTTP/전달 실패, 목록·경기 자료 검증 실패, 지원하지 않는 정상 timeline 자료, 최근/솔로 표본 불완전 모두 partial=true로 합쳐질 수 있다. [gateway](../../../src/modules/riot/infrastructure/riot-api-gateway.ts), [승인된 수집 정책](../../architecture/0013-riot-player-detail-projections.md). 단순히 과거 이력을 아직 전부 수집하지 않았다는 것만으로 항상 PARTIAL인 것은 아니다.
- **별도 분기:** analytics에서 관측된 429는 RATE_LIMITED로 전달되어 RETRY_WAIT 또는 최대 시도 후 FAILED가 된다. 따라서 이 19건을 429로 단정하지 않는다. timeline 404도 다른 실패가 없으면 그 자체로 partial을 만들지 않는다.
- **제품의 진단 공백:** [sync_jobs 스키마](../../../src/platform/db/schema/riot.ts)는 단일 failure_code만 보존하고, 작업 audit/outbox snapshot도 같은 status/attemptCount/failureCode를 복사한다. provider 세부 코드와 부분 성공 이유는 이 경로에서 보존하지 않는다. null 집계로는 예산 제한·외부 지연·자료 정규화 실패·예외를 구별할 수 없다. 이번 감사는 계정·경기·요청/응답 본문을 읽어 원인을 추정하지 않았다.

따라서 PARTIAL 자체가 잘못 저장되거나 기존 성공 자료가 손상된 제품 오류라고 판정할 증거는 없다. 반대로 19건이 정상적으로 완전 복구됐다고 판단할 근거도 없다. 재시도 횟수·호출 예산을 늘리거나 검증을 완화할 근거가 없어 그 동작은 바꾸지 않았다. 원인을 닫으려면 향후 작업에서 비식별·유한 집합의 부분 성공 사유를 보존하는 계측이 필요하다. 이는 새로운 RSO 권한이나 회원 동의를 기다려야 하는 항목이 아니라 **제품 진단 개선으로 가능한 미해결 범위**이며, 과거 19건의 세부 원인을 소급 복원할 수는 없다.

이번 릴리스 변경과 직접 연결된 새로운 중대 장애는 확인하지 못했다. 정확한 PARTIAL 원인 규명을 완료했다는 뜻은 아니다.

## 안전·검증 경계

기존 인증 운영 환경 metadata의 DATABASE_URL 식별/갱신 시각이 이전 probe와 동일함을 재대조하고, 오늘 최초 공개 MMR/DB 일치 결과를 전제로 같은 연결을 재사용했다. 같은 DB 안의 알려진 storage-probe 성공 기록을 다시 확인했다. 이번 조회 중 provider 환경 metadata를 새로 요청하지 않았다는 한계도 JSON에 명시했다.

`REPEATABLE READ READ ONLY`, `transaction_read_only=on`, statement 10초/query 15초 제한을 확인하고 ROLLBACK으로 종료했다. SQL은 상태·오류 코드·요청자 범주·시도 수·시각·건수만 반환했다. 연결 ID는 DB 내부 후속 작업 비교에만 쓰고 반환하지 않았다. 비밀값·회원 식별자·PUUID·원문 분석 JSON·요청/응답 본문은 출력·증거에 보존하지 않았다. 기존 합성 테스트를 이번 운영 원인 증명으로 대체하거나 반복 실행한 결과로 합산하지 않았다.

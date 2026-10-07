# Riot 부분 성공 원인 보존

기준 소스 `0277c327cb9054ef78ca2646982d0833e234f4db` 이후의 1.0.7 후보 변경이다. [10/07 운영 읽기 조사](../service-completion-followup-2026-10-07/riot-partial-readonly.md)에서 동일 24시간 PARTIAL 19건 모두 failure_code가 null이고 후속 SUCCEEDED가 없었다. 당시 원문을 읽거나 외부 API를 다시 호출하지 않고는 개별 원인을 복원할 수 없었다. 이 반복 진단 공백을 다음 작업부터 줄이는 변경이며, 과거 19건을 성공으로 바꾸거나 원인을 소급 추정하지 않는다.

## 최소 변경과 기존 경계

`RiotApiGateway`의 실제 실패 지점에서 비식별 유한 코드 하나를 기록하고, application → `finishRiotSyncJob` → 기존 `sync_jobs.failure_code` → 기존 audit/outbox → 관리자 조회 경로로 전달한다. 저장 필드 varchar48을 재사용하며 migration·새 API·새 provider 호출·새 요청 기록 테이블은 없다.

코드는 `PARTIAL_*` 접두사로 진짜 RATE_LIMITED/TIMEOUT/NETWORK/UPSTREAM_5XX 등의 재시도·실패와 구분한다. 도메인은 등록된 18개 값만 저장하고 그 외 값은 `PARTIAL_UNSPECIFIED`로 치환한다. SUCCESS가 완전 성공이면 코드는 null로 초기화한다. partial 상태·시도 횟수·lease·revision·availableAt·최대 재시도·전역 429 backoff 규칙은 그대로다.

한 작업에는 **최초로 관측한 원인 하나**만 남긴다. 랭크 단계에서 먼저 불완전을 확인하면 랭크 코드가 우선한다. analytics에서 동시에 여러 요청이 끝나는 경우 처음 관측한 원인이며 모든 실패의 완전한 원장이나 일정한 공급자 응답 순서를 뜻하지 않는다. 429가 하나라도 있으면 기존 Retry-After outcome이 진단 코드보다 우선한다.

| 코드 | 실제 발생 지점 |
|---|---|
| `PARTIAL_RANK_FIELDS` | 성공한 랭크 응답에서 일부 필수 필드가 누락되거나 허용 범위를 벗어남 |
| `PARTIAL_BUDGET` | analytics 또는 이전 recent-solo 경로의 총 25초 예산 소진 |
| `PARTIAL_PROVIDER_TIMEOUT` / `PARTIAL_PROVIDER_NETWORK` / `PARTIAL_PROVIDER_5XX` | 요청 또는 응답 본문 timeout / 네트워크 실패 / provider 5xx |
| `PARTIAL_PROVIDER_NOT_FOUND` / `PARTIAL_PROVIDER_UNAUTHORIZED` / `PARTIAL_PROVIDER_RESPONSE` | 선택적 자료의 404 / 401·403 / 잘못된 HTTP·JSON·응답 용량 |
| `PARTIAL_LIST_INVALID` / `PARTIAL_MATCH_INVALID` / `PARTIAL_TIMELINE_INVALID` | 전달 성공 후 목록 / 경기 / timeline 계약 검증 실패 |
| `PARTIAL_SOLO_INCOMPLETE` / `PARTIAL_RECENT_INCOMPLETE` | 유효하게 모은 자료만으로 해당 전체 표본을 완성할 수 없음 |
| `PARTIAL_ANALYTICS_EXCEPTION` / `PARTIAL_RECENT_EXCEPTION` | 랭크 성공 뒤 선택적 수집 중 예외. 메시지·URL·원문은 보존하지 않음 |
| `PARTIAL_RECENT_UNAVAILABLE` | 이전 optional recent-solo adapter가 세부 이유 없이 UNAVAILABLE 반환 |
| `PARTIAL_INPUT_INVALID` | gateway 입력의 연결 식별값 검증 실패. 실제 식별값은 코드에 포함하지 않음 |
| `PARTIAL_UNSPECIFIED` | 세부 이유가 없는 adapter 또는 허용되지 않은 진단값. 성공 자료는 유지 |

동시 최대 2요청, 총 예산25초, 응답 용량 상한, timeline 최대4경기, 캐시 재사용·역사 cursor 검증·429 뒤 후속 요청 중단을 유지한다. timeline 404는 기존처럼 UNAVAILABLE일 뿐 자체로 부분 실패를 만들지 않는다. 이미 수집한 랭크·경기·timeline 자료와 이전의 최근 솔로 집계는 기존 저장 계약대로 보존한다. 공개 summary/analytics DTO에는 진단 필드나 공급자 원문이 추가되지 않는다.

## 표시

관리자 Riot 동기화 탭의 상태 옆과 기존 API 안전 로그에서 원시 finite code를 확인할 수 있다. 기능 위치나 탭을 새로 만들지 않았다. 일반 회원의 `/account/riot`는 기존 표시 함수 모듈에 한국어 원인표를 추가해 “일부 전적 응답 지연”, “전적 조회 시간 초과”처럼 보여준다. 미지 코드·원문·상속 키는 “원인 확인 필요”로 표시한다. 기존 PARTIAL/null은 “일부 전적 미반영”이며, 기존 “지금 동기화” 동작을 유지한다. `RATE_LIMITED`는 실제 상태가 FAILED여도 자동 재시도를 약속하지 않는 “조회 요청 한도 초과”로 표시한다.

같은 표시 모듈에서 실제 연결 방식인 DIRECT_OWNER/RSO_VERIFIED/ADMIN을 기존 DIRECT/RSO 별칭과 함께 한국어로 처리했다. 이전에는 실제 값이 “상태 확인 필요”로 표시됐다. 관리자 연결은 “관리자 연결”이며 소유권 미인증 안내를 유지한다.

## 독립 검토에서 추가 확인한 timeout 오류

HTTP200 응답 헤더를 받은 뒤 본문 stream이 timeout으로 중단되는 경우 `readBoundedJson`의 catch가 이를 INVALID_RESPONSE로 분류했다. 이 경우 analytics에서는 원인을 잘못 기록하고, 랭크 경로에서는 transient timeout을 영구 응답 오류로 취급했다. `controller.signal.aborted`인 경우만 TRANSIENT/TIMEOUT으로 먼저 분류하도록 수정했다. timeout이 아닌 syntax·용량 초과는 기존 INVALID_RESPONSE를 유지한다.

[독립 수정 전 재현](riot-independent-before.log)은 성공 자료와 429가 섞인 경우 PASS, 본문 timeout 분류 FAIL이었다. 공식 회귀에 analytics와 rank 양쪽의 실제 abort stream을 추가했고 각각 provider 호출1회·후속 호출 없음·TIMEOUT 분류를 확인했다. 별도 검토자가 [동일 조건 수정 후 2PASS](riot-independent-after.log)와 [최종 교차 검토](riot-independent-review.md)를 기록했고, 검토 범위에서 새 중대 문제는 없었다.

## 실제 검증 범위

- [최초 수정 전](riot-partial-before.log): 신규 6검사 중 원인 보존 5FAIL, 기존 rate-limit/진짜 rank 실패 분리 1PASS. 원인 필드가 없는 실제 gateway/domain 경로에서 실패했다.
- [수정 후 focused](riot-partial-focused.log): 61PASS. 신규 진단9검사와 application/audit/outbox1검사, 기존 gateway·도메인·public-state·recent-solo 계약을 포함한다. 중간 실행 숫자를 더하지 않았다.
- [실제 페이지 컴포넌트 SSR](riot-partial-ui.log): 10PASS. 기존 관리자 pagination6, 관리자 진단표시1, 회원 한국어·미지값 차단·실제 연결방식3. 기존 버튼 컴포넌트도 렌더했지만 브라우저 클릭·provider 실행을 검증했다는 뜻은 아니다.
- [변경 파일 lint](riot-partial-lint.log), [typecheck](riot-partial-types.log), 변경 범위 `git diff --check`: exit0.
- `tests/database/riot.contract.test.ts`에 실제 PostgreSQL 저장 코드, 관리자 sync/API-log 조회, 기존 공개 DTO shape 검증을 추가했다. 이 문서 최초 작성 시 해당 격리 DB 실행은 통합 담당자 검증 대기다. 실행 후의 DB·전체 check·배포 증거는 이 폴더의 통합 기록으로 연결한다.

중간 SSR 회귀의 `FAILED` 부재 정규식은 필터의 정상 FAILED option까지 잡아 실패했으므로 상태 badge에만 한정했다. 제품 기대값을 완화한 수정이 아니다. 초기 타입 검사에서 union closure narrowing 오류를 고쳤으며 최종 typecheck는 통과했다.

## 남은 확인

위 구현 담당자의 검사는 소스·로컬 회귀 범위다. 통합 담당자의 최종 격리 DB·필수 check·1.0.7 READY·운영 확인은 [배포 근거](production.md)에 기록했다. 새 운영 PARTIAL 코드 관측은 자연 발생 예약 동기화의 읽기 전용 집계와 구분한다. 이번 구현·검증에서 운영 Riot API를 수동 재시도하거나 실제 사용자 자료를 시험 변경하지 않았다. 과거 null 원인의 복원, RSO 소유권 확인, 모든 선수 전적의 완전 수집을 완료했다고 표시하지 않는다.

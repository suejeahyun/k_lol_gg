# Riot 부분 성공 진단 독립 검토

2026-10-07, 검토자 `visual_quality_audit`. 작성 담당자의 안정 통보 후 기존 ADR0013·S12 계약·현재 domain/application/gateway·PostgreSQL repository·스키마·DTO와 diff를 대조했다. 제품·정식 테스트는 편집하지 않았다. 외부 Riot 호출, 운영 DB, 로그인, 공유 브라우저, 전체 빌드/배포는 수행하지 않았다.

## 계약 대조

| 항목 | 확인한 구현과 해석 |
|---|---|
| 원인 우선순위 | provider429의 retryAfter가 있으면 application은 PARTIAL 진단보다 RATE_LIMITED를 우선한다. 일반 부분 성공은 랭크의 원인을 먼저 보존하고, 그 외 gateway에서 최초 관측한 원인 하나를 기록한다. 동시 복수 원인 전체 목록이 아니다. |
| 25초 제한 | gateway의 단조 시계 deadline과 각 요청의 남은 시간 제한을 그대로 사용한다. 총 예산/동시2요청/상세·timeline 응답 크기 제한을 늘리지 않는다. 예산이 끝나면 새로운 provider 요청을 하지 않는다. |
| 유효 자료 보존 | application의 rankSucceeded/snapshot 저장 조건과 현재 연결·revision 재검사 유지. repository는 미확인 최근 솔로를 기존 timestamp와 함께 보존하고, AVAILABLE timeline을 낮은 상태로 덮지 않는다. 새 partialCode는 공개 projection 저장 필드로 복사하지 않는다. |
| 실제 실패 구분 | 랭크 NOT_FOUND/UNAUTHORIZED/INVALID_RESPONSE는 기존 영구 실패, TIMEOUT/5xx/NETWORK는 재시도 경로다. 선택적 상세 조회의 부분 실패가 이미 확인된 랭크를 무효화하지 않는다. 정상 timeline404는 UNAVAILABLE로 처리하며 그 자체로 PARTIAL을 만들지 않는 기존 정책을 유지한다. |
| 저장·DTO | 새 상태 enum/스키마/migration이 없다. 기존 PARTIAL 상태와 varchar48의 failure_code에 18개 유한 코드를 보존한다. 기존 Owner/Admin failureCode DTO·audit/outbox 경로를 재사용하고 공개 요약 DTO의 필드 목록을 늘리지 않는다. 정식 DB 회귀는 저장된 코드·관리자 목록/로그를 추가 확인하며 실제 실행은 root 통합 근거에 맡긴다. |
| 비식별 진단 | domain은 allowlist와 정확히 일치하지 않는 값을 PARTIAL_UNSPECIFIED로 바꾼다. provider 본문·예외 메시지·PUUID·토큰을 진단으로 복사하지 않는다. 알려진 코드도 성공(partial=false)이면 failureCode=null이다. |
| 소유자 표시 | 기존 공개 표시 함수 모듈을 확장해 한국어로 표시하고, 진단의 unknown 값은 `원인 확인 필요`, 과거 PARTIAL/null은 `일부 전적 미반영`이다. `Object.hasOwn`으로 prototype 이름도 원문으로 반환하지 않는다. 관리자 코드 표시와 기존 DTO는 유지한다. |

## 독립 추가 실행

ignored `.tmp/riot-diagnostic-independent.test.ts`에 실제 `RiotApiGateway`와 domain 함수 및 기존 합성 match fixture를 사용한 2개 검사를 작성했다. fetch만 제어 가능한 대역이다. 제품/기존 테스트를 바꾸거나 실제 제공자에 요청하지 않았다.

1. 동시 상세 요청 중 한 경기 성공+다른 경기429: 성공한 경기1개 보존, Retry-After73초, 나머지 경기/timeline 요청 중단, 최대 동시2, 이력 cursor 미전진, RATE_LIMITED/RETRY_WAIT 우선과 본문·키 미노출을 확인했다.
2. HTTP200 headers 수신 뒤 응답 body stream을 읽는 중 요청 제한 시간 만료: stream이 abort로 실패하고 단조 시계가25초에 도달하도록 제어했다. 추가 요청 없음·calls1, cursor 미전진, timeout 진단 보존과 원문 미노출을 검사했다.

[최초 실행](riot-independent-before.log)은 **1 PASS / 1 FAIL**이다. 1번은 통과했고 2번은 timeout을 PARTIAL_PROVIDER_RESPONSE로 기록하여 실패했다.

## 확인된 후속 문제와 조치

**P2: body 읽기 중 timeout을 응답 형식 오류로 오분류.** `fetchJson`의 내부 readBoundedJson catch가 controller abort 여부를 보지 않고 INVALID_RESPONSE로 반환했다. 바깥 fetch 예외의 TIMEOUT 분기까지 전달되지 않아 같은 요청에서도 headers 이전/이후 timeout의 진단이 달라졌다. 기존 구현에 있던 경계지만 이번 진단 개선 목적상 수정이 필요하다.

작성 담당자가 controller가 aborted인 내부 catch에서 TRANSIENT/TIMEOUT을 먼저 반환하도록 최소 수정했다. 실제 잘못된 JSON/크기 초과는 INVALID_RESPONSE를 유지한다. 랭크에서도 같은 catch를 사용하므로 해당 경우가 영구 형식 오류가 아닌 일시 TIMEOUT으로 전달되는 정식 회귀가 추가됐다.

[동일 독립 조건의 재실행](riot-independent-after.log)은 **2 PASS**다. 이력/재시도/기존 성공 자료를 바꾸지 않으면서 body timeout의 원인을 바로잡은 것을 확인했다. 작성 담당자의 analytics+rank 정식 회귀 및 invalid JSON/oversize 기존 검사 통과는 담당 focused 로그와 구분한다.

최종 표시 변경도 다시 읽었다. 소유자 페이지의 상태는 여전히 `일부 반영`이고 진단은 유한 한국어 표현으로 표시한다. null/unknown과 prototype 이름이 원문 출력으로 빠지지 않으며 기존 실제 연결 방식 DIRECT_OWNER/RSO_VERIFIED/ADMIN의 명칭도 일치한다. 관리자 진단 DTO·원래 raw 코드 표시는 별도 운영 경계로 유지된다. 추가 제품 편집 없이 검토를 마쳤고 `git diff --check` exit0을 확인했다.

검토한 변경 경계에 남은 중대 오류나 명확한 과업 방해는 발견하지 못했다. 이 판정은 아래 외부·운영·통합 확인을 완료했다는 뜻은 아니다.

## 확인 한계

이 검토는 과거 운영 PARTIAL19건의 원인을 소급 복원하지 않는다. 새 유한 코드는 향후 작업의 첫 원인을 구분하는 진단이며 전체 원인 목록/자동 복구를 보장하지 않는다. 실제 제공자의 지연·429, 운영 작업의 새 코드 저장, DB 계약, 최종 빌드와 배포 후 확인은 root의 별도 근거가 필요하다. 합성 단조 시계·제어된 body stream 검사를 실제25초 부하 측정으로 표현하지 않는다.

## 배포 전 최종 diff 재검토

root의 최종 격리 실행과 소스 안정 통보 후 남은1.0.7 diff 전체를 다시 읽었다. 위 Riot 변경·소유자 한국어 표시 외에 홈 이름 CSS, capture 시드/QA pool 수명주기 수정 및 새 회귀를 포함한다. 광범위 검사·DB·브라우저를 재실행하지 않았고 제품 소스를 편집하지 않았다.

- 홈은 이름의 nowrap/ellipsis만 해제하고 최소 높이·자연 줄바꿈으로 바뀐다. 클릭 링크의 이름 텍스트, 순위·수치, 키보드 조작·모션 감소·테마·홈 순서와 단일 캐러셀 구조는 유지된다. 2·3위의 stretch/flex 규칙은 모바일에만 적용되며 고정 높이/line clamp를 도입하지 않는다. root의 [실측](home-names-after.json) 및 [배포 전 통합 기록](production.md)을 이 읽기 검토와 구분한다.
- capture 함수는 기존 browser hold와 loopback/테스트 DB 이름 가드를 거친 뒤 transaction에서 합성 행만 추가한다. 기존 READY generation을 교체하지 않고, projection이 없는 새 ACTIVE fixture에만 표시용 READY 행을 추가한다. 실제 경기 원장/시즌 수명주기 변경은 없다. 이 경로는 운영 페이지·API에서 호출되지 않는다.
- QA 서버의 바깥 try/finally가 계정·시드 준비 실패도 pool 종료 대상으로 포함한다. 기존 child 종료 finally가 안쪽에 유지되어 서버 시작 후의 정리도 보존한다. 새 회귀는 실제 함수의 실패 경로·DB 안전 가드·기존 READY 보존을 다루고 제품 동작을 기대값 변경으로 통과시키지 않는다.
- 마지막 Riot diff에 진단 코드 원문·예외 본문 노출,429 우선순위 변경, 추가 제공자 호출, 권한/연결 generation 우회, 기존 공개 요약 필드 확대는 없다. 앞서 수정한 body timeout 검사도 유지된다.

최종 읽기 재검토에서 새 중대 문제나 명확한 이용 차단은 발견하지 못했다. 실제 운영 새 진단 작업·배포 후 확인은 아직 이 검토에 포함되지 않으며, root가 수행한 격리 HTTP/화면 측정을 이 검토자가 직접 수행했다고 주장하지 않는다.

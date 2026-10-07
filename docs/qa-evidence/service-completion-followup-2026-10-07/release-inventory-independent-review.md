# 독립 교차 검토 — 미디어·소유자 과제

검토자 `release_inventory`, 기준 `5c51fe51` 대비 2026-10-07 작업 diff. 검토자는 아래 제품/회귀 코드의 작성자가 아니며, 본인이 작성한 이벤트 설정 수정은 이 독립 검토에서 제외했다. 소스·API·DB·운영 데이터는 수정하지 않았다.

## 판정

현재 검토한 미디어 목록/게시 화면 연결과 소유자 과제 업로드 복구 변경에서 새 중대 결함 또는 명확한 이용 차단을 발견하지 못했다. 전체 서비스/모든 미디어 mutation을 검증했다는 판정은 아니다. 실제 브라우저·새 빌드·운영 배포 확인은 root 근거와 구분한다.

## 대조 범위

| 변경 | 확인한 근거와 결과 |
|---|---|
| `admin-media-pages.tsx` | 실제 parser와 PostgreSQL repository의 `currentPage/totalPages`를 대조했다. 페이지 이동은 기존 검증 범위(page≤100/pageSize≤50)를 유지하고 상태/크기를 보존한다. native GET의 단일 빈 status만 정규화하며 중복 status·알 수 없는 query는 여전히 거절한다. 페이지/상태/크기 key가 미적용 select 값을 새 조회로 넘기지 않도록 한다. |
| 미디어 공개 화면 연결 | 공개 URI는 기존 `/highlights/{id}`·`/images/{id}`이고 PUBLISHED일 때만 표시한다. 기존 ADMIN page 권한 검사를 유지한다. 읽기 링크 추가로 초안/보관 데이터의 public API 권한을 바꾸지 않는다. |
| `admin-media-form.tsx` | 이번 변경은 `draft 복구`→`초안 복구` 문구 한 곳이다. RESTORE payload/API와 기존 업로드·게시·보관 동작은 변경하지 않았다. 새 목록 검사를 기존 모든 폼 저장/동시 수정의 신규 PASS로 세지 않는다. |
| `owner-discipline-tasks.tsx` | 파일 해시·fetch·JSON을 finally까지 감싸고 불명확한 업로드 뒤 최신 상태를 읽는다. 기존 raw 경로는 소유 과제 조회·revision 검증→stage→finalize→SUBMIT_EVIDENCE다. 서버는 READY 자산의 task/owner/purpose를 확인하며, 클라이언트가 임의 자산 경로를 새로 구성하지 않는다. raw 자동 재전송 대신 서버 조회로 보이는 기존 READY 자산 제출 버튼을 사용한다. |
| READY JSON 재시도 | 키의 fingerprint에 endpoint(asset/task)·revision·빈 본문이 포함된다. 네트워크·읽을 수 없는 응답·401에서는 키가 남고, 명확한 412 이후 최신 revision에는 새 키를 사용한다. 서버는 매번 인증을 다시 확인한 다음 receipt를 읽고, 새 명령에서 소유권·task revision을 검증하는 순서를 유지한다. 클라이언트 응답도 같은 taskId/증가한 정수 revision이어야 성공으로 인정한다. |
| 잠금·복구 | 파일 읽기 시작 전에 ref guard를 잡고 전체 과제에서 한 mutation만 허용한다. raw/READY 모두 refresh transition 동안 입력을 잠근다. 실패를 성공으로 보이지 않으며, 파일 선택값을 비워 같은 파일 재선택이 가능하다. |

미디어 `tests/admin-media-pagination.test.mjs`의 실제 페이지 SSR/parser와 상태·경계·초기화·조회 실패·filter remount 검사를 검토했다. 최종 14조건은 [담당 focused 로그](admin-followup-focused.log)에 있으며 이전12조건 로그를 최종14검사라고 바꾸지 않았다.

과제 `tests/discipline-owner-upload-recovery.test.mjs`의 실제 TSX handler 6조건과 [수정 전 실패](discipline-owner-before.log)·[수정 후 통과](discipline-owner-after.log)를 대조했다. 초기 하니스 의존성 누락은 [별도 환경 기록](discipline-owner-harness-initial.log)이고 제품 실패 근거에서 제외한 것을 확인했다. before는 HEAD 원본에 같은 하니스를 적용한 실행이며 단순 문자열 기대값 교체가 아니다.

## 독립 추가 실행

기존 실제 handler 하니스를 ignored `.tmp/discipline-independent.test.mjs`로 복사해 아래 3개 조건만 추가 실행했다. 제품/기존 테스트 파일은 변경하지 않았다. [independent-discipline-handler.log](independent-discipline-handler.log) **3 PASS**, exit0.

1. READY 제출 412 → refresh 동안 버튼 disabled 및 직접 handler 재호출도 요청 없음 → revision1 과제를 반영 → If-Match가 0에서1로 바뀌고 새 키로 재시도.
2. HTTP200이지만 다른 taskId를 담은 응답 → 오류·refresh, 다음 raw 파일을 보내지 않음.
3. 파일 해시 전 두 번 change → 파일 읽기와 POST 각각1회, 응답 후 refresh 동안 파일 입력 잠금 유지, refresh 완료 뒤 해제.

이 3개는 DB/Blob 통합이나 실제 브라우저 검사가 아니다. 요청 결과를 제어하는 handler 실행이며 기존 작성자6검사를 반복해서 합산하지 않았다. 서버의 auth/receipt/owner/race 안전성은 기존 코드·계약과 대조한 범위다.

## 남은 확인 경계

- 실제 브라우저 파일선택·느린 네트워크·401 로그인 전환·여러 과제의 키보드 이동은 root의 합성 fixture UI 확인과 연결해야 한다.
- 실제 private Blob 왕복과 휴대폰에서의 파일 선택은 위 handler 로그로 확인되지 않는다. 현재 운영 읽기/과거 실제 진단 날짜는 [외부 기록](external-runtime.md)에 분리돼 있다.
- 조회 API의 page100 제한보다 많은 전체 목록 탐색은 이번 수정에서 확장하지 않았다. 기존 API 계약에 맞춘 연결이며 무제한 목록 지원이라고 쓰지 않는다.
- 연결된 팀 불러오기와 제출 검토 성공 응답의 후속 검토는 아래에 별도로 기록한다.

## 후속 — 연결된 현재 팀 배치와 제출 검토

`journey_audit`의 안정 통보 후 제출 상세 page·`submission-review.tsx`·상태 label 매핑·두 관련 테스트를 읽었다. 연결된 팀 자체는 아래 경계를 확인했고 새로운 차단 문제를 발견하지 못했다.

- 서버 페이지가 ADMIN 인증을 먼저 수행한 뒤 기존 admin 읽기로 팀 초안을 조회한다. PENDING_REVIEW·저장 검토안 없음·명시적 연결 draft ID가 있을 때만 선택적인 조회를 한다.
- 현재 draft의 소유자가 제출 소유자와 일치하고 보관되지 않았으며, 선택 candidate의 signature/source/evaluationRound가 현재 draft와 일치해야 한다. 기존 `validTeamBalanceSubmissionAssignments`로 10명·같은 참가자 집합·블루/레드 각5명·각 포지션1명을 확인한다. catalog에는 해당 선수 ID를 포함하여 조회하고 모두 ACTIVE인 경우에만 최소 배치 props를 반환한다.
- 팀 조회 실패·선택 없음·잘못된 선수는 불러오기 기능만 숨기고 기존 수동 검토를 유지한다. 당시 제출 시점의 팀 스냅샷이라고 주장하지 않고 현재 제목·변경 버전을 표시한다.
- 실제 handler는 모든 game의 playerId가 빈 경우에만 명시적 클릭으로 채운다. updater 안에서도 기존 선택 유무를 다시 확인하므로 이전 버튼 참조로 호출해도 새 수동 선택을 덮지 않는다. 팀/포지션으로 매칭하고 챔피언·KDA·승패는 보존한다. 모든 원본 대조 확인을 해제하고 미저장으로 바꾸며 자동 승인/저장 요청을 보내지 않는다.
- [불러오기 handler 2조건](submission-linked-team-after.log), [실제 서버 page 5조건과 기존 순수 배치 검증](submission-linked-team-page.log)을 검토했다. 이 로그는 실제 DB 조회/브라우저 조작과 구분한다.

별도의 **P2 성공 응답 검증 누락**을 공통 command 경로에서 재현했다. HTTP200의 `{}`를 성공으로 받아 키를 완료하고 `revision=undefined`, 검토안 저장 완료·refresh로 진행했다. [submission-response-independent-before.log](submission-response-independent-before.log)의 실제 handler 추가1검사는 이 잘못된 성공 처리를 FAIL로 기록한다. 기존 테스트 파일을 ignored `.tmp/submission-review-independent.test.mjs`로 복사해 추가 조건만 실행했으며, 제품 소스는 변경하지 않았다.

해당 문제는 `journey_audit`와 root에 전달했고, 담당자가 API가 실제 반환하는 submission ID·증가한 정수 revision·작업별 status/승인 UUID match ID를 확인한 뒤 키를 완료하도록 수정했다. OCR도 같은 submission/image ID·증가한 이미지 revision·완료/실패 상태와 error code를 확인한다. 실제 repository가 반환하는 body 필드와 대조했고 성공 OCR·정상적인 외부 OCR 실패도 처리하는 담당자의 양성 회귀를 확인했다.

수정 후 **처음 실패했던 독립 검사 그대로 재실행하여 PASS**했다([submission-response-independent-after.log](submission-response-independent-after.log)). 불명확한 성공은 refresh/저장 완료로 진행하지 않고 동일 body·revision·키 재시도를 유지한다. 이 finding은 해당 소스/handler 경계에서 해결됐다. 새 전체 검사·실제 서버·브라우저는 root 통합 근거에 연결해야 하며, 이 독립 검토 범위에 현재 미해결 중대 finding은 없다.

## 실제 HTTP 연결 검증 준비

root 요청에 따라 `scripts/test-db/verify-admin-service-write-http.ts`의 기존 안전 가드를 유지하고 `linked-team-submission-read` 그룹만 추가했다. 이 실행기는 새 합성 WEB 접수와 PNG2장을 만들고 실제 ADMIN 페이지의 불러오기 버튼·RSC에 전달된 현재 배치 및 ACTIVE catalog10명을 대조한다. 익명 API401·관리자 로그인 복귀 경로와 기존 fixture draft revision 불변도 확인하도록 구성했다. 기존 event SSR 검사는 수정하지 않았다.

12:28:40 KST 기준 [실행기 ESLint](linked-team-http-eslint.log)와 [단독 TypeScript 검사](linked-team-http-typecheck.log)는 exit0이다. **새 최적화 fixture의 실제 HTTP 실행은 아직 대기**하며 준비를 실행 PASS로 표시하지 않는다. 세션/응답 원문은 파일로 남기지 않고 기존 단계 status/etag/replayed만 출력한다. 이 실행기는 버튼 클릭이나 브라우저 파일선택을 주장하지 않는다.

root의 첫 실제 실행에서 기존6그룹은 PASS했고 새 그룹은 ACCOUNT 로그인·소유 draft 조회200·새 접수 생성201 이후 **QA 코드 형식 오타**로 중단했다. [최초 결과 보존본](admin-service-write-first-qa-failure.json)을 남겼다. 실행기의 기대값 `MR`+16hex가 틀렸으며 실제 `src/modules/matches/domain/match.ts:356,400`의 canonical parser, `postgres-match-repository.ts:1960`의 생성 코드, 기존 `tests/match-domain.test.ts:23`은 모두 **MR2+대문자16hex**다. 정상 응답을 거절한 것이므로 제품 결함으로 세지 않는다.

기대값을 실제 계약에 맞춘 한 줄과 출처 주석만 수정했다. 기존 [도메인 계약 10개](linked-team-code-contract.log)와 실행기 ESLint가 PASS했다. 그 뒤의 업로드·실제 page props·익명 권한 검증은 root가 새 그룹만 재실행한 결과로 판정해야 하며, 최초 실패 뒤 미실행 단계를 통과했다고 쓰지 않는다.

root 통합 후속: [팀 연결 그룹 재실행](linked-team-write-final.json)은 새 WEB 접수·PNG2장·검토대기·실제 관리자 page props·익명401/로그인 복귀·기존 draft revision 유지 모두 통과했다. 첫 실행의 기존6개 그룹 통과는 [원래 기록](admin-service-write-final.json)에 남아 있고, 같은 검사들을 다시 실행해 수를 늘리지 않았다.

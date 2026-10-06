
## release_inventory — 멸망전 생성 독립 검토와 이벤트 재시도 재점검

검토 기준: 2026-10-06, `ca242292` 이후 현재 소스 diff. 이번 검토에서는 제품 코드·테스트·DB·배포를 변경하지 않았다. 멸망전 생성 폼은 다른 담당자의 변경을 독립 검토했다. 이벤트 adapter는 본 검토자가 작성한 부분이므로 아래 이벤트 항목은 **작성자 재점검**이며 독립 승인의 근거로 세지 않는다.

### 멸망전 생성: 추가 차단 결함 미발견

- `destruction-create-form.tsx`의 실제 submit 흐름과 `destruction-create-recovery.test.mjs`를 대조했다. 네트워크 실패·503·성공 응답 JSON 유실 후 같은 tournamentId/body/idempotency key를 보존하고, 401/403/408/429가 이전 요청의 저장 실패를 입증하지 않는다는 점을 처리한다.
- 미확정 요청이 있을 때 필드를 잠그되 제출 버튼은 재확인을 제공한다. 재시도는 disabled 필드에서 새 FormData를 읽지 않고 원래 body를 사용한다. 인증 복구는 별도 로그인 창을 열어 원래 폼의 미확정 요청을 유지한다.
- 동기 ref 잠금으로 React가 다시 렌더하기 전 연속 submit도 1회만 전송한다. 성공 후 router 이동이 끝나기 전에도 잠금을 유지한다. 확정된 400 응답은 편집을 열고 수정한 입력에 새 identity를 부여한다. 미확정 오류를 확정 실패로 처리해 새 대회를 중복 생성하던 경계가 보강됐다.
- CLASSIC/ARAM/ARAM_MAYHEM의 포지션별/총 모집 입력과 실제 도메인 8개 예선 값·구분되는 이름이 보존된다. 필수 인원/모집 상한/점수 자료 출처와 계산 의미도 제거하지 않았다.
- [담당 실행 로그](destruction-create-after.log)의 12 PASS와 테스트 본문을 읽었다. 3모드×8방식은 실제 validateDestructionConfiguration을 호출한다. 다만 FormData/React hook/router/fetch를 대체한 handler 검사이므로 실제 브라우저 native validation, 새 창 로그인 후 재확인, 네트워크 단절 후 서버 저장 완료를 통째로 검증한 결과는 아니다. 새 fixture의 실제 생성/이동 UI는 통합 담당의 별도 관측이다.

### 이벤트 adapter: 작성자 재점검

- 변경은 serializable 트랜잭션 전체를 40001/40P01에 한해 최대 3회 다시 시작한다. 20/40ms 대기 후 각각 새로운 context를 만들고 실패/성공 모두 context와 actor 매핑을 폐기한다. cause 순환도 무한 탐색하지 않는다.
- 매 시도에서 계정/세션의 현재 권한 재검사→receipt claim/replay→aggregate revision 검사→save/audit/outbox/receipt 완료 순서가 다시 실행된다. 무효 세션을 영수증만으로 허용하거나 이미 실패한 snapshot/transaction을 재사용하지 않는다. 23505·도메인 오류·검증 실패를 무조건 재시도하지 않는다.
- 해당 이벤트 작업 안에는 HTTP 발송 같은 트랜잭션 밖 외부 부작용이 없다. 팀 평가는 transaction에 연결된 DB 조회와 순수 계산이며 감사·outbox·영수증은 같은 transaction에서 rollback된다. DB 스키마/migration, 이벤트 도메인 규칙, 공개 DTO, API 권한 경계 변경은 없다.
- [수정 전 unit](event-transaction-retry-before.log) 1 PASS/2 FAIL → [수정 후 unit](event-transaction-retry-after.log) 3 PASS. [원본 실제 HTTP](admin-service-write-before.json)의 동일 생성 201/503을 숨기지 않았다. 신규 DB 회귀는 동일 생성의 정확한 replay와 서로 다른 동시 수정의 승자/REVISION_CONFLICT 및 감사/outbox/receipt 수를 확인하도록 보강했다.
- 이 시점의 새 최적화 빌드·fresh DB/HTTP 재실행은 대기다. 따라서 unit 통과만으로 운영 경쟁 복구까지 완료되었다고 판정하지 않는다. 다른 담당자의 독립 event adapter 검토와 root 통합 검증은 별도 근거로 연결한다.

## journey — 미디어 확인 응답 및 이벤트 PostgreSQL 재시도 독립 검토

2026-10-06 현재 통합 소스를 읽기 전용으로 검토했다. 이벤트 adapter/DB 회귀의 작성자는 release_inventory이며, 본 검토자는 해당 제품·테스트를 작성하거나 수정하지 않았다. 전체 check 진행 중에 새 build/DB server/브라우저 검사를 시작하지 않았다.

### 미디어 후속 수정: 기존 발견 해소 확인

- 생성 폼의 원래 요청/파일 스냅샷, 미확정 상태 입력 잠금과 재확인 버튼, 인증 후 동일 요청 보존, 생성 성공 후 이동 잠금을 검토했다. 상세 결과는 [admin-create-independent-review.md](admin-create-independent-review.md)에 있다.
- 독립 재현에서 연결 PATCH 200의 잘린 JSON을 linked=1로 오판한 P2를 발견했다. 담당자의 후속 guard는 성공 응답에 비음수 safe-integer revision이 있어야 확인된 결과로 다루도록 한다. 실제 미디어 생성/수정/보관 응답 계약이 revision을 반환하는 점과 일치한다.
- 동일 독립 재현을 고치지 않고 다시 실행한 [admin-media-review-after.log](admin-media-review-after.log)는 1 PASS다. [before](admin-media-review-before.log)의 1 FAIL을 보존했다. 신규 null/empty/invalid-revision 회귀는 담당자가 실행한 [admin-media-confirmation-after.log](admin-media-confirmation-after.log)와 대조했으며 내 실행 수로 합산하지 않았다.
- 이미 생성한 갤러리와 업로드 자산을 유지하면서 연결 미확정을 보고하고 편집 화면으로 이동한다. 서버에서 다시 읽은 연결 상태가 최종 판단 기준이며, 응답을 확인하지 못했다고 새 초안을 생성하지 않는다.

### 이벤트 bounded retry: 추가 차단 결함 미발견

- `PostgresEventAdapter.dependencies.unitOfWork.transaction`은 40001/40P01만 cause 체인을 따라 판별한다. 순환 참조 guard가 있고, 20/40ms 대기 후 최대 총 3회 시도한다. 비직렬화 오류/검증/권한 오류를 임의 재시도하지 않으며 PostgreSQL serializable 수준을 유지한다.
- 재시도마다 `database.transaction`과 context가 새로 만들어진다. 성공/실패 모두 context·actor 매핑을 finally에서 해제한다. 이전 트랜잭션의 snapshot 또는 actor를 재사용하지 않는다.
- `EventCommandHandler`에서 매 시도는 트랜잭션 권한 재검사→receipt 검증/재생→현재 aggregate·revision 확인→도메인 변경→save/audit/outbox/receipt 저장을 실행한다. 시간값과 내부 행 ID가 다시 계산될 수 있지만 rollback된 시도의 값이며, 공개 eventId/원래 command fingerprint는 유지된다. 외부 HTTP 발송은 이 callback 안에 없고 팀 평가는 현재 transaction의 rating 조회 및 순수 계산이다.
- `tests/event-postgres-retry.test.ts`는 wrapped 40001의 새 context, 40P01의 3회 상한, 검증/23505의 재시도 금지, 종료 후 context 사용 불가를 확인한다. [담당 unit 결과](event-transaction-retry-after.log)를 읽었으며 DB 경합을 실제 재현하는 시험과 구분했다.
- DB contract diff는 동일 생성 2개의 동일 응답/정확히 1 replay, 같은 revision의 서로 다른 설정 수정 중 정확히 1 성공과 REVISION_CONFLICT, 최종 revision/내용 및 receipt·outbox·audit 수를 확인한다. 결과만 덮어쓰기하거나 테스트 기대를 storage-error로 완화하지 않는다.
- 이 검토 시점의 새 격리 DB/HTTP와 최종 최적화 화면 검증 결과는 root 작업이 진행 중이다. SQL 재시도 단위 통과만으로 실제 운영 동시성이 확인됐다고 쓰지 않는다. 검토 범위에서 현재 추가 차단 결함은 발견하지 않았다.

### release_inventory 후속 통합 증거 — 2026-10-06 10:57 KST

위 작성자 재점검 당시 대기였던 이벤트 저장의 fresh DB/새 최적화 HTTP 검증이 완료됐다. [fresh DB 로그](completion-browser-final-database.log)의 확장 S07 계약이 통과했고, [이벤트 HTTP](event-write-http-after.json)는 같은 생성의 201+정확한 replay, 본문 변경 409, 다른 키 동시 수정의 200/412, 승자 재조회, 취소/replay/복구/재취소까지 11응답 PASS(exit 0)다. 실제 UI·운영 쓰기를 실행했다는 뜻은 아니다. 이어 수행한 [전체 페이지 HTTP](release-http.json)는 108페이지/169조건 실패 0(exit 0)이다. 각 검사의 원본 수정 전 실패를 보존했고, 기존 fixture 데이터나 운영 자료는 변경하지 않았다. 이는 새 증거 추가이며 작성자 점검을 독립 코드 승인으로 바꾸지 않는다.

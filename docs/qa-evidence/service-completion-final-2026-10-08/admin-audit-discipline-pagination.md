# 징계·운영 로그 목록의 첫 50건 이후 접근 복구

## 확인된 문제와 최소 수정

P2: `/admin/discipline`과 `/admin/logs`가 repository의 페이지·총개수 지원을 사용하지 않고 `page: 1, pageSize: 50`을 고정했다. 51번째 이후의 징계·감사·AI 요청 기록을 목록에서 찾을 수 없었다. 소스의 실제 Page를 합성 자료와 실행한 수정 전 회귀는 9개 실패했고, 수정 후 같은 과업 회귀는 모두 통과했다.

- 징계는 기존 `records/tasks/reviews` 분류와 조회 권한을 유지하면서 이전·다음, 전체 건수·현재 범위, 빈 페이지의 같은 분류 첫 페이지 복귀를 연결했다. 분류 전환은 첫 페이지에서 시작한다.
- 감사·AI 원장은 `eventsPage`와 `aiPage`를 따로 유지한다. 탭 전환·이전·다음에서 양쪽 페이지와 필터를 보존한다. 기존 repository가 제공하던 exact `action`·AI `status` 필터를 화면에 연결했다. 필터 적용/초기화는 자기 목록만 첫 페이지로 되돌리고 다른 원장의 문맥은 보존한다.
- 잘못된 값·중복 query·알 수 없는 필드는 조회 전에 거절하고 초기화 동작을 제공한다. 유효한 주소의 조회 실패·unavailable은 같은 조건의 `<a>` 재시도로 실제 GET을 다시 수행한다.
- 로그 form에 canonical query key를 적용해 Link 초기화/뒤로 가기에서 이전 uncontrolled 입력값이 남지 않도록 했다. 독립 검토에서 확인된 이 문제를 수정한 뒤 실제 Page element key·기본값 회귀를 보강했다.
- 로그 표의 기존 필드는 그대로이며 keyboard로 가로 스크롤 영역에 들어갈 수 있도록 region 이름과 tabIndex를 추가했다. AI 상태는 한글 표시만 바꾸고 canonical query 값은 유지한다. 기존 운영 field CSS에 select와 44px 최소 높이만 적용했다.

수정 파일은 징계·로그 두 `page.tsx`, 기존 `operations.module.css` 한 selector, 신규 목록 회귀와 기존 징계 계약의 설명문구 단언 한 곳이다. API·repository·DB·권한·외부 서비스 변경은 없다. ADMIN 검사가 모든 query/조회 분기에 선행하고 새 개인정보·프롬프트 본문을 노출하지 않는다.

## 조회 범위와 호출 수

한 페이지 50건을 유지하고 최대 페이지는 기존 관리자 목록의 숫자 상한 패턴에 맞춘 10,000으로 제한했다. 이를 넘는 query는 DB 조회를 시작하지 않으며 UI는 최대 500,000건의 페이지 범위와 추가 분류/필터 안내를 표시한다. 허용 상한에서 다음 페이지 10,001을 생성하지 않는 회귀가 있다. 기존 OFFSET·정렬·count 쿼리를 재사용하며 대량 전체 목록을 메모리에 읽지 않는다.

이전 로그 Page는 어느 탭에서도 `listAuditLogs`·`getAuditStats`·`listAiRequests`를 모두 호출했다. 현재는 표시하는 탭의 한 메서드만 호출한다. [실제 Page 합성 호출 측정](admin-log-query-calls.json)은 HEAD 원본과 현재 소스를 각각 실행하여 **세 탭 모두 3회→1회**임을 기록한다. 이는 repository 메서드 호출 수이다. 운영 DB 지연·쿼리 planner·브라우저 렌더링·처리량 개선 수치를 측정한 것은 아니다.

## 검증

- `admin-audit-discipline-pagination-before.log`: 수정 전 9 FAIL. 최초 페이지 밖 데이터·pager·복구·검증 부재를 재현했다.
- `admin-audit-discipline-pagination-after.log`: 신규 실제 Page 회귀 9 PASS. 101건에서 1~50→51~100→101 및 복귀, 독립 원장 페이지와 필터, 각 탭 한 번 조회, 필터 초기화, query key, 빈 페이지와 오류 복구, 잘못된/중복 주소·ADMIN 거부 시 조회 없음, 상한을 검사했다.
- `admin-audit-discipline-pagination-combined.log`: 신규 9 + 기존 `discipline-http-ui` 6 = **15 PASS**.
- focused ESLint exit 0, 경고 0. 타입 검사 exit 0은 최초 Page 구현 시점의 결과다. 이후 query key·GET retry·문구 축소는 최종 통합 check의 대상으로 구분한다. diff whitespace 검사 통과.
- [별도 재검토](admin-pagination-independent-review.md): release_inventory가 실제 query/DTO와 최종 key·retry 보완을 다시 읽었고 추가 차단 문제 없음.

최종 통합 검사에서 기존 `discipline-http-ui.test.mjs`가 안내 문구 “필터를 바꾸거나…”를 정확 비교해 실패했다. 이는 새 “분류…” 표현과의 문구 불일치로, 실패 로그는 root가 보존한다. 제품 안내를 추가하거나 옛 문구로 되돌리지 않았다. 기존 ready/unavailable/alert 선언 검사를 유지하고, 해당 한 줄의 문구 단언을 신규 실제 Page의 빈 상태/빈 페이지 복구/오류·unavailable 동일 주소 재시도 회귀로 연결했다. 중복 하니스를 새로 유지하지 않는다.

## root의 실제 브라우저 확인 경로

아래는 새 격리 빌드의 origin에 붙여 확인할 query다. 운영 자료를 만들거나 수정할 필요가 없다.

| 경로 | 확인할 동작 |
|---|---|
| `/admin/discipline?tab=records&page=2` | 자료가 51건 이상이면 다음 범위, 없으면 같은 분류 첫 페이지 복귀 |
| `/admin/discipline?tab=tasks&page=2` | `징계 목록 페이지`와 분류 보존 또는 빈 페이지 복구 |
| `/admin/logs?view=events&eventsPage=2&aiPage=2&status=FAILED` | 감사 목록의 `감사 이벤트 페이지`; AI 탭 전환 후 aiPage·status 유지 |
| `/admin/logs?view=events&action=MMR_PROJECTION_REBUILT` | 입력 편집 후 `필터 초기화`, 뒤로 가기에서 실제 query와 작업 코드 입력 일치 |
| `/admin/logs?view=ai-requests&aiPage=2&eventsPage=2&action=MMR_PROJECTION_REBUILT&status=FAILED` | AI 빈 페이지/페이지 이동, `AI 요청 원장 페이지`, 감사 문맥 유지 |
| `/admin/logs?view=stats&eventsPage=2&aiPage=2&status=FAILED` | 통계 표시와 돌아갈 양쪽 페이지 유지 |
| `/admin/discipline?page=0`, `/admin/logs?eventsPage=1&eventsPage=2` | 조건 오류와 초기화, 조회 시작 안 함 |

필터 form 이름은 `감사 이벤트 필터`·`AI 요청 필터`, 표 영역은 `감사 이벤트 목록`·`AI 요청 원장 목록`, 조회 범위는 `징계 조회 범위`·`로그 조회 범위`다. 표에 충분한 합성 자료가 없는 경우 실제 많은 데이터 페이지 이동은 위 합성 Page 회귀로만 확인한 것으로 구분한다.

이 담당 작업은 실제 브라우저·운영 DB에 접속하지 않았다. 최종 통합 check·격리 DB·빌드 UI·배포·배포 후 확인은 root의 후속 근거와 연결한다.

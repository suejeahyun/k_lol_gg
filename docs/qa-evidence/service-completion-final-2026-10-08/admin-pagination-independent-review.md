# 관리자 목록 복구의 교차 검토

2026-10-08 `release_inventory`의 독립 읽기 검토다. root가 확정한 6개 목록 화면 변경 경계만 확인했다. 취향·새 추상화·다른 화면 확장은 포함하지 않았다. 제품 수정, 테스트 재실행, DB·브라우저·서버 조작은 하지 않았다.

## 소유와 독립성

- 이벤트/멸망전 목록은 이 검토자가 구현했다. 자체 [12 FAIL → 관련 21 PASS](admin-competition-pagination.md)와 구분해 `journey_audit`가 두 실제 페이지·parser·회귀·로그를 독립 읽기로 확인했다. 필터/페이지 크기/첫 페이지/10000 상한/invalid no-read/ADMIN 선행 검사에서 새 차단 문제 없음을 회신했다. 그 담당의 별도 문서가 최종 교차 검토 근거다.
- 아래 MMR·챔피언은 `journey_audit`, 징계·운영 로그는 `security_data_audit`가 구현했으므로 이 검토자의 독립 검토 대상이다.

## MMR·챔피언

추가 배포 차단 finding 없음. `balance-ai/page.tsx`, `champions/page.tsx`, 수동 조정 select의 한국어 라벨·명시적 canonical value, 새 회귀를 대조했다.

MMR player/review 탭은 서로 다른 기존 parser를 사용한다. 각 허용 키와 10/20/50 크기·10000 상한이 화면의 form/link와 일치한다. 탭·검색·포지션·크기를 페이지 이동에 보존하고 새 검색 시 page는 제출하지 않는다. 잘못된/중복 query는 load 이전에 거절한다. 선택 조정 원장 닫기는 현재 페이지를 유지하면서 review/action만 제거하며, 페이지 이동으로 재계산을 실행하지 않는다. ADMIN 검사는 조회보다 앞이고 MMR mutation 컴포넌트의 SUPER_ADMIN 조건은 유지한다.

포지션 기준은 기존 repository의 정렬 query와 표시 점수/표본이 연결된다. `PostgresMmrRepository.playerDtos`가 모든 `MMR_POSITIONS` 값을 채우므로 `item.positions[selected]` 접근은 실제 DTO 계약과 맞다. 신뢰도는 종합이라고 표시해 포지션 표본과 구분한다. 수동 조정 form의 한국어 라벨은 제출할 canonical position을 바꾸지 않는다.

챔피언 링크는 기존에 빠졌던 q/status를 포함하고, parser의 1000 상한과 현재 page/pageSize를 따른다. invalid/no-read, 검색 결과 없음, 빈 페이지의 같은 조건 첫 페이지 복귀, 실패의 같은 query GET 재시도, uncontrolled form의 query key와 상태 ACTIVE/INACTIVE 값을 확인했다.

[담당 focused 로그](admin-mmr-champion-pagination-after.log)의 29 PASS와 0출력 [타입 검사](admin-mmr-champion-pagination-typecheck.log)를 읽어 대조했으며 직접 추가 실행하지 않았다. 이는 합성 페이지/handler 검사이며 실제 HTTP·브라우저·실기기 검증을 대신하지 않는다.

## 징계·운영 로그: 수정 요청 후 재검토

초기 읽기에서는 고정 50건·10000 상한, 징계 tab 유지, 로그 eventsPage/aiPage 독립 유지, action/status 필터와 기존 repository의 exact-match query·totalCount가 일치했다. 활성 로그 탭만 조회하므로 숨은 목록 조회는 늘어나지 않았다. ADMIN 검사는 모든 분기에 선행하며 새 개인정보 필드·본문·쓰기 API를 추가하지 않았다.

단, 초기 새 로그 form은 `defaultValue`를 사용하면서 query key가 없어 Link 초기화/뒤로 가기 시 기존 입력 DOM을 재사용할 수 있었다. 필터 표시와 실제 결과 query가 달라질 수 있는 좁은 복구 문제로 담당자에게 전달했다. root도 같은 문제와 동일 주소의 실제 GET 재시도를 요청했다.

담당자 보완 후 최종 source를 다시 대조했다. form의 `key={logHref(query)}`는 view/action/status/두 page를 포함하는 canonical identity이고, 초기화된 실제 Page element의 key 변경·input defaultValue 공백을 회귀가 확인한다. 징계와 로그의 실패 재시도는 같은 주소의 `<a>`로 바뀌어 fresh GET에 연결되며 회귀도 element type을 확인한다. 잘못된 주소의 불필요한 개발자 설명은 제거하고 제목·초기화 동작을 유지했다. 기존 운영 CSS의 input/textarea 규칙에 select와 44px 최소 높이만 적용했다.

[최종 담당 focused](admin-audit-discipline-pagination-after.log)는 9 PASS이며, 두 page의 합성 자료·실제 SSR/element/query를 검증한다. [ESLint](admin-audit-discipline-pagination-lint.log)와 [타입](admin-audit-discipline-pagination-typecheck.log)은 0출력 exit 0으로 보고됐고 파일을 확인했다. 독립 검토자가 실행 횟수·통과 수를 추가한 것이 아니다. 최종 변경 경계에서 새로운 차단 문제는 발견하지 않았다. repository/API/권한·개인정보 DTO는 그대로이며 실제 UI·통합·배포 결과는 root의 후속 기록에 따른다.

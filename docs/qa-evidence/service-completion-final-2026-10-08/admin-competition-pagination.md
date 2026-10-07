# 관리자 대회 목록 페이지 이동 복구

## 확인한 P2와 범위

최종 관리자 표시 diff를 읽다 `/admin/progress/destruction`의 기본 12건 이후로 이동하는 UI가 없음을 확인했다. 같은 구조의 `/admin/progress/event`도 동일했다. 두 repository는 이미 limit/offset·total·totalPages를 제공하지만 페이지가 연결하지 않았다. 서버의 기존 기능을 화면에 연결하는 수정이며 API·DB·새 라이브러리는 필요하지 않았다.

두 실제 async 페이지와 기존 parser를 실행한 [수정 전 회귀](admin-competition-pagination-before.log)는 **12 FAIL**이다. 13번째 이후 대상 접근, 필터/표시 개수 보존, 빈 페이지 복귀, 잘못된 주소의 조회 차단과 오류 재시도를 포함한다. 최초 검사에서 없는 이전 링크를 dereference한 2개 TypeError는 [초기 로그](admin-competition-pagination-before-initial.log)에 보존했고, 링크 존재 assertion을 먼저 넣은 뒤 제품 수정 전에 다시 실행했다. 최종 before의 12개는 AssertionError이며 인증·저장소 대역 로딩 오류가 아니다.

## 수정

제품 파일은 관리자 event/destruction의 `page.tsx` 두 개다. 기존 멸망전 한국어 표시 수정은 보존했고, 같은 이벤트 목록도 기존 상태/경기 방식 표시 함수를 재사용했다. 한국어 option 문구와 실제 canonical `value`는 분리한다. 목록의 제목·상세 ID·인원·변경 버전·ADMIN 선행 검사는 유지한다.

- 기존 전역 `pagination` 스타일과 이전·현재·다음 패턴을 사용한다. 조작 요소의 기존 최소 높이는 44px다. 새 공통 컴포넌트나 CSS는 추가하지 않았다.
- 페이지 링크에 q/status/format/pageSize를 보존한다. GET 검색 폼은 page를 제출하지 않아 첫 페이지에서 새로 검색하고, 표시 개수는 hidden input으로 유지한다. query에 따라 form key를 바꿔 뒤로 가기·초기화 후 입력이 이전 조건에 머물지 않게 한다.
- 유효한 주소지만 현재 페이지가 비었으면 같은 필터의 `첫 페이지로`를 제공한다. 전체 미등록·조건에 맞는 결과 없음·현재 페이지만 없음은 구분한다. 검색 초기화는 pageSize만 유지하고 다른 필터를 제거한다.
- page 0/문자열/10001/중복 값 등 기존 parser가 거절하는 주소는 조용히 전체 목록으로 바꾸지 않는다. 저장소를 조회하지 않고 `목록 초기화`를 제공한다. 실제 페이지 이동도 기존 10000 상한을 넘기지 않는다.
- 저장소 unavailable/error는 각각 status/alert로 표시하고 같은 조건을 GET으로 다시 요청할 수 있다. 민감한 오류 원문은 추가하지 않았다.

## 검증 결과와 한계

[수정 후 focused](admin-competition-pagination-after.log)는 새 페이지 실행 12조건과 기존 관리자 표시·대회 공개/권한 9조건을 포함해 **21 PASS**다. 합성 25건을 실제 페이지로 렌더링해 1→2→3페이지, 13~25번째 카드 접근, 이전 링크와 필터를 확인했다. pageSize 24 유지, 필터 초기화, 빈/오류/잘못된 주소, 10000 상한, 인증 거절 시 조회 0건을 확인했다.

[첫 after](admin-competition-pagination-after-initial.log)는 새 12개가 통과하고 기존 소스 토큰 검사 한 개가 오류/미연결 role의 표현 순서 때문에 실패했다. 원래 계약의 error→alert 표현을 유지하고 invalid도 alert에 포함하는 동일 의미의 분기를 명시했다. 기존 테스트 기대값은 바꾸지 않았고 새 실행 회귀에서도 error/invalid alert 및 unavailable status를 확인한다.

[범위 ESLint](admin-competition-pagination-lint.log)는 exit 0, 출력은 0바이트다. scoped diff 공백 검사도 통과했다. 새 검사는 실제 TSX·parser를 실행하지만 repository·인증·Next Link를 합성하므로 HTTP·DB 저장·실제 브라우저 렌더링 통과를 주장하지 않는다. root의 전체 check·새 최적화 서버·배포 확인과 구분한다.

## 실제 격리 UI 확인 경로

최신 ready origin에서 합성 관리자 계정으로 확인한다. pageSize 허용 값은 **12/24/48**, 최솟값은 12다.

| 대상 | 시작/필터 예시 | 페이지 nav 접근성 이름 |
| --- | --- | --- |
| 이벤트 | `/admin/progress/event?pageSize=12` / `?q=S07&status=RECRUITING&format=ARAM&pageSize=12` | 이벤트전 관리 목록 페이지 |
| 멸망전 | `/admin/progress/destruction?pageSize=12` / `?q=S08&status=TOURNAMENT&format=SWISS_ROUND_BO1&pageSize=12` | 멸망전 관리 목록 페이지 |

필터 예시는 parser에 유효한 값이며 실제 fixture에서 결과가 있다고 보장하는 값은 아니다. 다음·이전 UI를 실제 누르려면 해당 조건에 13건 이상 필요하다. 데이터가 적으면 합성 테스트용 생성/seed를 준비해야 하며, 직접 seed를 UI 생성 완료로 세지 않는다. page999는 실제 결과가 남아 있다면 첫 페이지 복귀를 확인할 수 있고, page0/10001은 잘못된 주소 복구를 확인한다. 운영 데이터는 추가·변경하지 않는다.

## 같은 원인의 읽기 전용 대조

한정 검색에서 관리자 MMR players/reviews, 징계, 운영 감사/AI 로그의 pager 누락 및 챔피언 pager의 q/status 손실도 확인해 root에 전달했다. root가 MMR/챔피언은 `journey_audit`, 징계/로그는 `security_data_audit`에 별도 배정했다. 이 담당자는 해당 제품 파일을 수정하지 않는다. 계정·선수·팀초안·경기·Riot·미디어·회차는 페이지 또는 cursor 이동 UI가 존재함을 확인했으며, 이번 빠른 존재 검사만으로 그 모든 동작을 새로 PASS 처리하지 않는다.

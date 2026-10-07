# 최종 추가 변경의 독립 경계 검토

2026-10-08, `release_inventory`의 읽기 전용 후속 검토다. 앞선 [모달 검토](modal-independent-review.md) 이후 추가된 관리자 멸망전 목록 표시와 격리 DB fixture 정리만 대조했다. 제품·DB·브라우저를 변경하거나 검사·서버를 다시 실행하지 않았다. root의 최종 전체 검사는 별도 진행 중이다.

## 변경으로 인한 새 회귀

검토한 diff에서 새 명확한 회귀는 발견하지 않았다.

- `admin/progress/destruction/page.tsx`: 기존 상세에서 쓰는 상태/예선 방식 표시 함수를 재사용한다. 8개 상태와 8개 방식의 키가 실제 상수·parser와 일치하고, 단판/3판 2선승을 구분한다. option에 `value={status}`·`value={format}`를 명시했으므로 한국어 표시가 기존 query 값으로 잘못 제출되지 않는다. ADMIN 검사→조회 순서, 카드 대상 ID/인원/변경 버전, 오류·빈 상태는 변경하지 않았다.
- `tests/destruction-admin-display.test.mjs`: 실제 async 페이지·표시 함수·parser를 실행하고 repository/인증을 합성한다. 모든 선택 값의 실제 parser 수용, 현재 선택, 카드 신원·인원·버전, 기존 상세의 stage 링크를 확인한다. [담당 기록](destruction-admin-display.md)의 초기 하니스 오류와 실제 제품 2 FAIL/1 PASS, 수정 후 6 focused PASS 구분이 소스·로그와 일치한다. 이는 HTTP·실제 브라우저 실행을 대신하지 않는다.
- `tests/database/destruction-competition.contract.test.ts`: TEST_DATABASE_URL의 기존 안전 guard 뒤에만 실행된다. 임시 GLOBAL 변경 전 전체 row를 저장하고 finally transaction에서 복원한다. 삭제 범위는 이 시험이 randomUUID로 만든 선수의 generation 1 profile이며 기존 projection run/receipt/다른 선수/조정 원장을 삭제하지 않는다. snapshot 부재 시 GLOBAL을 제거하는 분기도 시험이 삽입한 임시 상태의 복구다. 전체 row 동일성·합성 profile 제거·최신 run generation 일치 assertion과 pool 종료를 유지한다. runner가 MMR 계약 후 destruction 계약을 순차 await하므로 현재 공유 fixture의 순서와 맞다. 운영 제품·migration은 변경하지 않았다.

격리 fixture 정리의 실제 재실행 결과는 root의 **새 전체 DB** 로그로 확인해야 한다. 이 독립 읽기는 이전 오염 상태의 서버를 정상 결과로 바꾸거나 아직 실행되지 않은 복원 결과를 PASS 처리하지 않는다. [원인 기록](isolated-mmr-fixture-diagnostic.md)을 참조한다.

## 기존 목록에서 별도로 확인한 과업 공백

**P2, 이번 표시 변경 이전부터 존재:** 관리자 멸망전 목록에는 페이지 이동 UI가 없다. 페이지는 `page`·`pageSize`를 parser에 전달하고 기본 12건을 요청한다. `PostgresDestructionAdapter.list`는 실제 limit/offset과 `totalPages`를 반환하지만 페이지 JSX는 필터·카드·빈/오류 상태만 렌더링한다. 따라서 조회 결과가 12건을 넘으면 다음 대회를 보려면 URL을 직접 수정하거나 이름/필터를 먼저 알아야 한다.

이는 이번 한국어 표시의 회귀와 분리해 root에 전달했다. 실제 운영 데이터 건수나 새 브라우저 재현을 확인한 주장이 아니라 현재 source의 페이지/조회 계약 대조 결과다. 제품 freeze 중이라 이 검토자가 임의 수정하지 않았고, 후속 처리 여부는 root의 통합 기록에 이어서 남긴다. 이 항목이 남은 상태에서 목록 전체를 과업 공백 없음으로 선언하지 않는다.

후속 시점: root가 이 과업 공백과 같은 구조의 이벤트 목록을 명시적으로 수정 범위에 포함했다. 이후 `release_inventory`가 두 페이지를 수정했으므로 그 부분은 독립 검토가 아닌 구현/자체 검증이다. [별도 수정 기록](admin-competition-pagination.md)에 원본 12 FAIL → 관련 21 PASS와 실제 UI 미확인 경계를 남겼다. 앞선 독립 판정은 라벨/격리 fixture diff에 대한 것이며, 이후 pagination 수정의 독립 검토는 다른 담당자가 수행한다.

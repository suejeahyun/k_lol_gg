# 대회 관리자 목록 독립 교차검토

2026-10-08, journey_audit. release_inventory가 수정한 이벤트전·멸망전 관리자 목록을 읽기 전용으로 검토했다.

대상은 `admin/progress/event/page.tsx`, `admin/progress/destruction/page.tsx`, 실제 목록 query parser, `tests/admin-competition-pagination.test.mjs`, 관련 수정 후 21 PASS 로그다. 갤러리·모달·DB·운영을 추가 실행하거나 제품을 수정하지 않았다.

- q/status/format/pageSize가 canonical 값으로 페이지 이동·조회 실패 재시도에 유지된다. 입력 배열을 버리지 않아 중복 query가 parser에서 거절된다.
- 검색 폼은 page를 전송하지 않으므로 새 조건은 첫 페이지에서 시작한다. 검증된 query를 key로 사용해 navigation 후 미저장 필터 값이 잔류하지 않는다.
- 첫/마지막 페이지의 방향, 허용 최대 page 10000, total이 있는 빈 페이지와 검색 결과 없음의 복구가 서비스 DTO·파서와 일치한다.
- invalid query는 읽기 없이 안내·초기화로 연결하며, ADMIN 권한 확인은 query 조회 이전에 유지된다.
- 기존 표시 helper를 사용하고 enum option value는 유지한다. 멸망전 BO1/BO3 구분도 유지된다.

수정 범위에서 추가 차단 결함은 발견하지 못했다. 12개 새 회귀가 실제 Page를 실행하고 repository query와 다음 페이지의 합성 결과를 검사함을 확인했으며, 같은 검사를 중복 실행하지 않았다. 최종 통합 빌드·실제 브라우저·배포 근거는 root 기록에서 따로 확인해야 한다.

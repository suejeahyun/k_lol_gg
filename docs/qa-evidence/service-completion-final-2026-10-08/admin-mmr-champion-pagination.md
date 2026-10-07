# MMR·챔피언 관리자 목록 탐색 복구

2026-10-08. 제품 범위는 `admin/balance-ai/page.tsx`, `admin/champions/page.tsx`, MMR 수동 조정 폼의 포지션 표시 한 곳이다. 기존 모달 동작, mutation handler, 서비스·API·DB·CSS는 변경하지 않았다.

## 원인과 수정

| 중요도 | 확인한 문제 | 원인과 최소 수정 |
|---|---|---|
| P2 | MMR 플레이어·조정 이력 첫 페이지 이후를 UI로 열 수 없음 | 서비스는 LIMIT/OFFSET와 totalPages를 반환하지만 Page에 pager가 없었다. 기존 페이지 링크·전역 pagination 스타일로 이동을 연결했다. |
| P2 | 챔피언 다음·이전 페이지가 검색어·상태를 잃음 | href에 page/pageSize만 있었다. 검증된 q/status/pageSize로 링크를 생성한다. |
| P2 | 잘못된 MMR 주소가 기본 첫 페이지로 조용히 바뀜 | parser null을 기본 query로 대체하고 배열 query를 누락했다. 중복값을 그대로 parser에 전달하고 invalid는 읽기 없이 초기화 동작을 제공한다. reviews는 기존 `parseMmrReviewQuery`를 별도로 사용한다. |
| P2 | 범위 밖 빈 페이지에서 실제 데이터가 없는 것처럼 보이며 돌아갈 이동이 없음 | 전체 total과 현재 items를 구분하고 같은 조건의 첫 페이지로 복구한다. 조회 실패는 같은 조건의 GET 재시도를 제공한다. |
| P2 | MMR 포지션 정렬 순서와 표시 점수가 다름 | repository는 선택 포지션 점수로 정렬하지만 Page는 항상 종합 점수를 표시했다. 공개 MMR의 기존 정책대로 선택 포지션 점수·표본을 표시한다. 종합 신뢰도는 구분한다. |
| P3 | MMR 조정 포지션, 챔피언 상태와 버전이 내부 표기로 노출 | 기존 `competitionPositionLabel`을 사용하고 option value를 명시한다. 챔피언은 기존 관리자 플레이어 화면의 활성/비활성 표시 패턴과 변경 버전 문구를 재사용한다. 별도 helper를 추가하지 않았다. |

MMR 검색·포지션·표시 개수는 기존 조회 계약을 UI에서 선택하도록 연결했다. 플레이어 query와 조정 이력 query를 혼합하지 않는다. 탭 변경은 page와 플레이어 필터를 초기화하고 표시 개수만 보존한다. 각 tab에 기존 `page`를 사용하며 새로운 `reviewsPage` 파라미터는 만들지 않았다. 선택 조정 상세를 닫을 때 현재 이력 page/pageSize를 보존한다. `getAdjustment`는 페이지와 독립적으로 조회하므로 없음 안내에서 잘못된 “현재 페이지” 표현을 제거했다.

검색 폼에 page를 넣지 않아 적용 시 첫 페이지부터 조회한다. 검증된 query가 바뀌면 폼 key도 바뀌어 이전 편집값이 새 목록 조건과 어긋나지 않는다. MMR page 상한 10000, 챔피언 상한 1000을 넘는 이동 링크를 만들지 않는다. 원본 API 계약은 유지한다.

## 실행 근거

- [수정 전 목록 회귀](admin-mmr-champion-pagination-before.log): 실제 async Page와 실제 query parser 기반 5 FAIL. 합성 DTO를 주입하며 운영·DB 쓰기는 없다.
- [수정 전 MMR 포지션](mmr-position-label-before.log): 실제 client JSX 옵션의 한국어 표시 누락 1 FAIL.
- [수정 전 챔피언 상태](champion-status-label-before.log): 실제 Page 렌더링 옵션·배지 표시 누락 1 FAIL.
- [수정 후 관련 회귀](admin-mmr-champion-pagination-after.log): 29 PASS. 새 목록·챔피언 표시 6개, MMR 조정 표시 1개 및 기존 모달·동일 요청 재시도·응답 generation 검증·권한·공개 MMR·챔피언 경계 검사를 포함한다.
- [범위 ESLint](admin-mmr-champion-pagination-lint.log): exit 0.
- [타입 검사](admin-mmr-champion-pagination-typecheck.log): `tsc --noEmit --incremental false`, exit 0.

MMR 조정 회귀 하니스의 기존 포지션 fixture가 `JUNGLE`/`SUPPORT`를 썼으나 실제 도메인은 `JGL`/`SUP`였다. 이번에는 실제 도메인 `MMR_POSITIONS`를 로드하며, 한국어 선택값 5개 각각이 원래 canonical 코드로 handler 요청 body에 전달됨을 확인했다. 모달의 키보드·초점·배경 잠금 회귀도 그대로 통과했다.

## Root 최종 브라우저 확인 경로

격리 fixture의 합성 데이터로만 확인한다. MMR pageSize 최소값은 10(허용 10/20/50), 챔피언은 1(허용 1–100)이다. 해당 조건에 다음 페이지가 생길 만큼 합성 행이 있어야 한다.

1. `/admin/balance-ai?tab=players&pageSize=10&page=2&q=S06&position=MID`: `MMR 플레이어 목록 페이지` nav의 이전/다음으로 q·position·pageSize 보존 확인. 미드 MMR·표본이 표시되고 종합 신뢰도는 따로 표시된다.
2. `/admin/balance-ai?tab=reviews&pageSize=10&page=2`: `MMR 조정 이력 페이지` nav의 이동 확인. 플레이어 탭으로 전환하면 이력의 page는 초기화되고 pageSize는 유지된다. 유효한 합성 `review` 코드로 상세를 연 경우 닫기 후 같은 page를 유지한다.
3. 두 탭의 유효하지만 범위 밖 `page=9999`: 실제 total이 있는 상태에서 첫 페이지 복구. `page=bad` 또는 `page=1&page=2`: 초기화 안내 확인.
4. `/admin/champions?pageSize=1&q=합성&status=INACTIVE`: 합성 비활성 챔피언이 2개 이상이면 `챔피언 목록 페이지` nav의 다음/이전에서 q/status/pageSize 보존. 필터 수정 후 적용은 page 1로, 상태는 활성/비활성으로 보인다.
5. `/admin/champions?page=999&pageSize=1&q=합성&status=INACTIVE`: 첫 페이지 복구. `page=bad`: 초기화 안내. 조회 오류의 실제 장애 주입은 별도 fixture 조건이 필요하며, 이번 합성 실행 회귀에서는 요청 없는 runtime error로만 검증했다.

이 문서는 실제 브라우저 클릭·HTTP·운영 반영을 완료했다고 주장하지 않는다. 해당 확인과 통합 검사·최종 빌드·배포는 root가 별도로 수행한다. 제품 안정 통보 후 release_inventory가 두 parser·DTO·페이지·표시 변경·회귀 로그를 독립 읽기 검토했고 새 차단 문제를 발견하지 못했다. 이 독립 검토는 추가 브라우저나 테스트 실행을 뜻하지 않는다.

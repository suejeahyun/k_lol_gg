# 목록 수정 통합 후 실제 과업 검증

2026-10-08. 최적화 빌드, 새 일회성 PostgreSQL, 합성 최고관리자만 사용했다. 이전 후보의 모달·갤러리 확인은 [별도 기록](browser-verification.md)에 보존한다. 운영 데이터로 시험하지 않았다.

## 저장과 목록 과업

`127.0.0.1:65312`에서 실제 관리자 로그인과 `/admin/balance-ai` 복귀를 확인했다. 이전 fixture 오염은 해소됐고 최초 GLOBAL 차수는 계약 검사가 남긴 4였다.

- 재계산 확인창의 초기 취소 초점·배경 조정 잠금·Shift+Tab 순환을 확인하고 실제 실행했다. 성공 문구와 차수 5를 확인했다.
- 합성 MMR플레이어1을 검색·선택하고 탑 +1bp, `SYNTHETIC_UI_QA`, 합성 공개 설명으로 실제 조정했다. 차수 6·조정 2건, 성공 문구, 입력 초기화, 새로고침 후 상태와 조정 내역을 확인했다. [저장 결과](mmr-isolated-store-final.png).
- 플레이어 포지션을 탑으로 선택하고 적용해 탑 점수·탑 표본과 0표본을 확인했다. 이 fixture의 활성 프로필은 10개여서 실제 다음 페이지는 운영 읽기 확인과 합성 SSR 회귀로 분리한다.
- 격리 API로 이벤트·멸망전 각 13개를 준비했다([합성 설정](pagination-fixture.json)). 각 화면에서 이름·상태·방식 조건을 적용해 실제 다음 페이지의 13번째 항목, 이전, 새로고침의 값 유지를 확인했다. 멸망전 page999에서 같은 조건 첫 페이지 복귀도 확인했다. 생성 API 준비를 실제 브라우저 생성 과업으로 세지 않는다.
- 챔피언은 MMR 검색·활성·pageSize1로 실제 2/10 페이지를 열고 q/status 유지, 초기화 뒤 두 필드 공백을 확인했다. 처음 기대했던 2/11은 합성 자료 개수를 잘못 가정한 도구 대기 오류였다. 실제 목록 총10과 URL로 정정했으며 제품 실패가 아니다.
- 감사 로그는 실제 1/18→2/18 이동, AI 요청 탭에서 실패 필터 적용→초기화, 감사 탭 복귀 시 2/18 보존을 확인했다. 초기화 후 실제 select 값도 공백이다.
- 징계 tasks page2의 빈 페이지→첫 페이지 복귀에서 분류 유지와 기존 합성 과제 1건을 확인했다. 50건을 넘는 징계/AI/MMR 조정 이력의 다음 페이지는 합성 실제 Page 회귀 범위이며 실제 클릭으로 과장하지 않는다.
- 같은 환경의 108페이지·179 HTTP 조건이 통과했다([HTTP](page-http-final.json)). 정상 stop 명령으로 cluster 종료·일회성 경로 제거·wrapper exit0을 확인했다([DB 로그](database-store-verified.log)).

빠른 client navigation 직후 관측은 이전 DOM일 수 있어 예상 URL/heading/페이지 상태를 기다린 뒤 판정했다. native confirm의 기존 도구 제약은 재시도하지 않았으며 최종 경기 승인·별도 취소 클릭 완료로 기록하지 않는다.

## 320px 필터 문제와 추가 수정

수정된 관리자 6화면을 320/390/768/1280px로 렌더했다. 22조건은 문서 가로 넘침이 없었지만 두 대회 화면의 320px 필터가 카드 밖으로 밀렸다. 문서 clientWidth305/scrollWidth306, 실제 label/input/select/button의 오른쪽305.59px가 카드 경계를 벗어났다. 단순 1px 숫자 차이로 무시하지 않았다([재현 이미지](admin-filter-320-before.png), [24조건 원본](admin-responsive-before-filter-fix.json)).

원인은 공통 event-admin.module.css의 필터 label/input에 intrinsic 최소 너비가 남은 것이다. 기존 form과 같은 `min-width:0`, label의 `minmax(0,1fr)`, input/select의 너비 상한을 두 규칙으로 적용했다. overflow:hidden으로 증상을 가리지 않는다. release_inventory가 두 규칙·전역 border-box·기존 breakpoint 보존을 독립 검토했고 새 회귀 우려가 없었다. 최종 빌드의 실제 재확인은 뒤에 기록한다.

최종 check 통과 뒤 새 격리 runtime `127.0.0.1:62356`으로 두 화면×네 폭 8조건을 재검증했다. 문서 가로 넘침 0, 모든 필터 조작의 오른쪽 경계가 카드 안에 있음을 확인했고 root가 실제 320px 이미지를 검토했다. [최종 측정](admin-filter-responsive-final.json), [이벤트](admin-filter-event-320-after.png), [멸망전](admin-filter-destruction-320-after.png). 동일 최종 빌드 108페이지·179 HTTP 조건도 통과했다([최종 HTTP](page-http-css-final.json)). CSS 외 제품 변경이 없어 앞선 실제 저장·페이지 동작 검증과 구분해 연결한다.

# 공통 화면 정리와 오류 복구

전체 기능 분석 후 SiteShell → 전역 검색/전체 메뉴 → 상태/오류 → AI 도우미 순으로 수정했다. 제목과 행동으로 알 수 있는 문구는 실제 JSX에서 제거했다.

| 항목 | 처리 | 유지·검증 |
|---|---|---|
| 공통 header/footer | 브랜드 부제·footer 소개 삭제 | 홈 링크·메뉴·로그인·정책 링크·Riot 고지·생성 아이콘 유지 |
| 전역 검색 | 영문 장식, 각 결과의 부연 설명, 키보드 사용법 삭제. 제목 ‘전체 검색’ | 검색 입력/결과/로그인 필요 상태, 키보드 handler, 검색어의 설명 키워드 매칭 유지. 설명 데이터는 검색 색인에서 사용하므로 숨김 CSS로 처리하거나 데이터까지 지우지 않음 |
| 전체 메뉴 | ‘참가와 팀 만들기…’ 문장·영문 장식 삭제 | 모든 기능 링크·그룹·현재 경로·접근 조건 유지 |
| loading/404/error | 제목 반복 문장·영문 장식 삭제, 404 번호 유지 | 제목·role/status/alert·로딩 표시·다시 시도·홈/플레이어 링크·오류 식별자 유지 |
| 기능 중단/조회 실패 | 기술 설명을 없애고 두 상태를 제목에서 구분 | 상태 data 속성·alert/status·홈 복귀 유지. 사라진 문장의 여백을 CSS에서 정리 |
| 권한 없음 | 일반 설명 대신 ‘내 계정 상태’ 링크 | 권한 없음 제목·홈 복귀·서버 권한 경계 유지 |
| AI 도우미 | 반복 부제/환영 문장 삭제 | 실제 질문/응답·전송·오류·개인정보 안내 유지. 질문 송신/보관 정책·API 변경 없음 |

삭제한 브랜드·검색 설명·메뉴 힌트·AI 환영의 미사용 CSS를 정리했다. 전역 테마·생성 이미지와 모션 설정은 변경하지 않았다. 공통 focused lint는 오류 없이 종료했고 [기존 동작 회귀 10개](shared-focused.log)가 통과했다. 최종 브라우저·전체 check 결과는 통합 운영 기록에서 연결한다.

## 재시도 결함과 검사 환경 정정

Next 16.3.8의 로컬 공식 문서 `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/error.md`와 실제 `error-boundary.js`를 읽었다. `reset`은 오류 상태만 지우며 `retry`는 router refresh 후 오류 상태를 지운다.

실제 오류 컴포넌트와 설치된 Next `ErrorBoundaryHandler`를 실행한 회귀에서 참가 신청·관리자 플레이어·관리자 계정 목록 **3개**가 새 데이터를 요청하지 않는 것을 재현했다. 관리자 계정 상세는 전체 `window.location.reload()`로 이미 복구 가능했다. 상세는 서버 segment 재시도로 통일하는 개선이며 기존 재조회 결함으로 세지 않는다.

- 최초 harness는 계정 상세의 next/link stub이 없었다: `recovery-before.log`.
- import stub 보강 후에는 상세의 window stub이 없어 실제 결함 3개와 환경 오류 1개가 함께 실패했다: `recovery-product-before.log`. 이 파일명만으로 네 번째를 제품 결함으로 해석하지 않는다.
- 전체 재로드도 올바른 재조회로 인정하는 환경을 만든 뒤 **수정 전 3 FAIL / 상세 1 PASS**: `recovery-corrected-before.log`.
- 수정 후 네 경계 모두 실제 새 조회 후 복구 **4 PASS**: `recovery-after.log`.

회귀는 특정 문구나 retry 호출 문자열을 검색하지 않고 ‘사용자가 다시 시도를 누르면 새 요청이 발생하는가’를 검증한다. 테스트 실패를 없애기 위해 정상 전체 재로드를 제품 결함으로 표시하지 않았다. 초기 진행 보고의 ‘4곳 결함’도 3곳으로 정정했다.

추가 공통 원인 확인: 공개 layout이 이미 main을 제공하는데 신청 error가 다시 main을 반환하고 있었다. 실제 PublicLayout+SiteShell+오류 컴포넌트 조합에서 main 2개를 재현(`application-landmark-before.log`)하고 내부 컨테이너만 div로 변경했다. 권한·alert·버튼은 유지했으며 오류 경계와 재조회 8개 회귀가 통과했다(`application-landmark-after.log`). 공개의 다른 page/loading/error에는 중복 main을 만들 위치가 없었다.

통합 check 첫 실행은 487개 계약 중 485개 통과, 2개 실패였다. 두 실패는 정상 승인 상태의 반복 소개와 `window.location.reload()`라는 옛 구현을 요구한 검사였다. 승인됨 상태 배지가 실제 상태에서 계산되는지·오류의 목록 복구 링크가 남는지 확인하고 해당 기대를 갱신했다. 실제 fresh request 여부는 위 실행 회귀로 계속 검증한다. 이 실패를 제품 정상으로 숨기지 않고 `check-initial.log`에 원본을 보존했다. 보정 후 `shell-final.log`가 통과했고 필수 check를 다시 실행한다.

두 번째 통합 실행은 계약 487 PASS 후 단위 1,043 PASS / 4 FAIL / 1 SKIP이었다(`check-second.log`). 세 실패는 삭제한 카카오·미디어·Riot 장문 안내를 그대로 요구한 검사였다. 짧아진 실제 상태, 권한 검사 순서, 업로드 불가/부분 성공, 연결 해제·재연결과 RSO 비활성 조건을 추가로 확인하도록 갱신했다. 나머지 하나는 이미지 아이콘 소비자가 106개 이상이어야 한다는 과거 개수 하한이었다. 장식 블록 삭제가 소비자 수를 줄일 수 있으므로, 전체 현재 import의 생성 이미지 렌더 검증은 유지하고 필수 내비게이션 3개 소비자의 존재를 명시적으로 검증한다. 원본 이미지 hash·투명도·전송 크기와 접근성 검사는 유지했고 `image-theme-final.log` 3 PASS를 확인했다. 이들은 새 요구와 과거 문구/개수 기대의 불일치로 분류하며 제품 결함으로 세지 않는다.

마지막 관리자 장식 제거 뒤 계약 검사 두 개가 `관리자 · 상세`, `관리자 · 새 기록`이라는 삭제한 eyebrow를 요구해 실패했다(`check-decoration-drift.log`). 대상 이름 h1과 ADMIN 읽기 guard, 새 기록의 실제 제목과 등록 폼을 확인하도록 교체했다. 기존 SUPER_ADMIN mutation 경계·한글 상태 label 검사는 유지했다. focused 6 PASS(`discipline-final.log`) 후 최종 전체 check를 재실행한다.

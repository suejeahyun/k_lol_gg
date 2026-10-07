# 실제 브라우저 확인 · 2026-10-08

## 운영 1.0.8

최고관리자 실제 로그인, MMR 전환·완료·공개 랭킹 필터/다음 이동은 [전환 기록](mmr-transition.md)에 따로 기록한다. 수정 전 MMR Escape 무반응·Tab 이탈·초점 손실, Riot 선택 동기화 확인창의 Shift+Tab 이탈·초점 손실도 실제 운영에서 재현했다. 확인창 취소만으로 재현했고 Riot 작업을 실행하지 않았다.

## 첫 1.0.9 후보 빌드 / 새 격리 환경

`check-first.log`가 통과한 최적화 빌드, loopback `127.0.0.1:64377`, 일회성 PostgreSQL과 합성 SUPER_ADMIN을 사용했다. 뒤에 발견한 관리자 멸망전 목록 한국어 표시와 DB fixture 복원 수정은 이 첫 빌드에 포함되지 않았으며 최종 검사와 구분한다.

### MMR 확인창

로그인 복귀 주소가 `/admin/balance-ai`로 유지됐다. 열기 → 초기 취소 초점, 배경 수동 조정 fieldset disabled, 취소에서 Shift+Tab → 확인, 확인에서 Tab → 취소, Escape → 닫힘·원래 재계산 버튼 초점 복원을 실제 확인했다.

실제 재계산은 `새 Idempotency-Key로 다시 요청해 주세요.` 오류가 났다. [격리 환경 진단](isolated-mmr-fixture-diagnostic.md)에서 DB 계약 fixture가 기존 generation 4 이력을 남긴 채 GLOBAL만 1로 되돌린 것이 원인으로 확인됐다. 실제 PostgreSQL 충돌 제약은 `mmr_projection_runs_generation_uidx`, 중복 result_generation 2다. 이를 제품 정상 저장으로 기록하지 않는다. fixture 복원 수정 후 새 환경에서 정상 재계산·수동 조정을 재검증한다.

### 갤러리 등록·대회 연결·이미지 확대

합성 PNG 960×540 한 장을 선택해 갤러리 초안 생성·업로드·게시를 실제 수행했다. 종료 상태 합성 대회의 `게시된 갤러리`에서 새 갤러리 선택 → 갤러리 반영 → 공개 화면 → 갤러리 탭 → 이미지 크게 보기를 수행했다. 이미지 실제 bytes가 로컬 fake storage에 있으며 확대 이미지 naturalWidth 960·complete를 확인했다. 과거 fixture의 이미지 대체 화면을 이번 실제 업로드 성공으로 사용하지 않았다.

- native dialog의 `open` 속성을 locator로 확인했고 접근성 트리는 모달의 닫기/제목/이미지만 표시했다. 초기 초점은 `이미지 닫기`였다.
- Tab·Shift+Tab 모두 닫기 링크에 머물렀다. Escape 후 dialog detached를 기다려 갤러리 URL과 원래 썸네일 `destruction-gallery-image-0` 초점 복귀를 확인했다.
- 확대 주소 새로고침에서도 native open·닫기 초기 초점을 확인했다. 닫은 뒤 뒤로 가기 → 확대 재진입, 앞으로 가기 → 갤러리 복귀·썸네일 초점 유지도 확인했다.
- PC·320×800·390×844·768×1024에서 확인했다. 320/390/768의 scrollWidth가 viewport와 같고 닫기 버튼은 44×44로 화면 안에 있었다. 임시 viewport는 원복했다. [PC](gallery-modal-desktop.png), [320px](gallery-modal-320.png), [390px](gallery-modal-mobile.png), [태블릿](gallery-modal-tablet.png).
- DOM evaluate의 `:modal`/`hasAttribute(open)` snapshot 값과 locator의 실제 open 속성이 달랐다. 후속 native Escape 동작·locator·AX 결과로 검증했다. 또 비동기 URL 이동 직후의 즉시 DOM 값은 이전 dialog를 포함해, 최종 판정은 detached 대기와 갱신된 URL/초점을 사용했다. 이 초기 관측을 제품 실패로 단정하지 않았다.

Riot은 이 격리 runtime에서 외부 연동 비활성 상태이므로 두 모달의 실제 조작을 이 환경에서 통과로 표시하지 않는다. 합성 handler 회귀와 실제 운영 배포 후 읽기·취소 조작을 구분한다.

### 첫 환경 종료

첫 실행 wrapper를 PTY 없이 시작해 입력 파이프가 닫힌 실행 환경 문제가 있었다. `stop` 입력은 전달되지 않았다. 확인된 부모·자식 관계의 해당 Node 프로세스와 loopback PostgreSQL만 종료했다. PostgreSQL은 정확한 `data` 경로로 `pg_ctl -m fast -w stop` 성공을 확인했고, 대상 Node PID가 사라진 것을 확인했다. 처음 상위 임시 경로를 준 pg_ctl은 클러스터 경로 아님으로 거절돼 데이터 변경이 없었다.

프로세스/파일의 일괄 정리 명령은 자동 정책에서 거절됐다. 더 좁게 정확한 클러스터 정상 종료와 확인한 세 프로세스 종료만 수행했고 파일 삭제는 생략했다. `.tmp/postgres-tests/klol-v2-pg-sQM0k9`는 진단용으로 남아 있으나 서버는 실행 중이 아니다. 정상 `stop`·자동 경로 제거·exit0으로 기록하지 않는다. 다음 환경은 PTY로 실행한다.

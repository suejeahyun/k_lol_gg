# UI·운영 흐름 보완 패치

내 정보의 티어 입력을 선택형으로 정리하고, 홈과 갤러리에 공통 사진 캐러셀을 적용했다. 구인 현황에는 참가자 이름과 포지션을 표시하며, 공개 내전 상세에서는 경기 진행 시간을 제거했다. 이벤트 대회와 멸망전은 목록·상세·관리자 이동 경로를 분리했다.

기능 커밋은 `fd819b0c5fd19957b95ecff3d2708da61f8d5ce7`, tag는 `ui-workflow-refinement-v1.0.0`이다. `npm run check`, 전체 격리 PostgreSQL 계약과 브라우저 계정 저장 회귀, 105개 페이지 339개 Chromium 캡처가 통과했다. 이번 릴리스 후보는 운영에 배포하지 않았고 운영 DB도 변경하지 않았다.

검증 근거와 운영 데이터 보완 조건은 [`docs/qa-evidence/ui-workflow-refinement-2026-09-13/README.md`](../qa-evidence/ui-workflow-refinement-2026-09-13/README.md)에 기록했다.

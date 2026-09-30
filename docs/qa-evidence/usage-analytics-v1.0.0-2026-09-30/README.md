# 사이트 이용 통계 1.0.0 배포 후보

운영 기준 d6e8ce44116858e6b783cf6dbc6e2c9339ee9c58에서 통계·관리자 조회 변경만 이식했다. migration head: 0047_usage_analytics.

- npm run check: 계약 445개, 단위 1030개 통과·1개 skip, lint 오류 0·기존 경고 57, 타입·ERD·빌드 통과.
- 격리 PostgreSQL 18: 0046 → 0047 upgrade, 재실행, 방문 구분, 한국 날짜 경계, 중복 방지, 관리자 제외, 분당 제한 통과. HTTP 실행에서는 빈 DB에 전체 migration을 적용했다.
- 실제 localhost HTTP: 일반 ADMIN 통계·로그·CSV·카카오 탭 200, 미인증 401, 2단계 인증 미완료 403, 사이트 설정·카카오 변경 제한 통과.
- 1440/390px 브라우저: 가로 넘침·axe A/AA 위반 없음. 회원·비회원 가입 화면 수집, 검색어 미저장, 실제 링크 클릭, 수집 제외 통과. 스크린샷은 합성 데이터다.
- 비밀값 검사를 실행했고 값은 소스에 포함하지 않았다. Windows checkout 줄바꿈으로 기존 해시 검사 3개가 처음 실패해 Git 원본 바이트를 복원한 뒤 전체 검사를 통과했다.

복구 기준: 기존 운영 dpl_GmG7dNbzPv7TvC4zkJbA22vFKJbe. 새 schema와 테이블만 추가하므로 기존 앱 재승격이 가능하다. 통계 테이블은 삭제하지 않는다. 수집 중지는 USAGE_ANALYTICS_ENABLED=false 설정 후 재배포한다. 기존 migration 기록의 0015~0017 시각과 0023 해시에 과거 차이가 있지만 최신 0046 해시·시각은 일치하며 적용 범위는 0047 한 개로 제한한다.

운영 배포 근거는 후속 production.md와 릴리스 registry에 기록한다.

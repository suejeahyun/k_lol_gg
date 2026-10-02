# 홈 랭킹 쇼케이스 1.0.1

1.0.0의 화면 구성과 순위 규칙을 유지하면서 캐러셀의 장식 clipping을 수정한다. `overflow: hidden`이 생성하는 내부 스크롤 컨테이너 때문에 화면 폭 전환 후 포커스된 버튼을 보이게 하는 브라우저 동작이 내부를 96px 스크롤했다. `overflow: clip`으로 장식만 자르고 프로필·버튼 포커스는 페이지 스크롤을 사용하도록 한다.

[홈 개편 범위와 기존 검사](../home-ranking-showcase-v1.0.0-2026-10-03/README.md), [1.0.0 배포와 발견 경위](../home-ranking-showcase-v1.0.0-2026-10-03/production.md). 최종 배포와 재검사는 후속 `production.md`에 기록한다.

기능 버전: `home-ranking-showcase@1.0.1`. migration `0047_usage_analytics` 유지.

## 추가 검사

`npm run check` 재실행 통과: lint 오류 0·기존 경고 58, 계약 445 통과, 단위 1,036 통과·1개 기존 skip, typecheck·ERD·이미지 검사·production build 정상. 현재 트리 비밀정보 검사 통과.

격리 랭킹 fixture에서 데스크톱→390px 모바일→데스크톱 순서로 전환하고 위치 버튼·다음 버튼·ArrowRight를 조작했다. 내부 scrollTop은 0, 상단 표시 영역은 테두리 아래 27px, page overflow는 false다. [실측](local-regression.json). 캐러셀을 이동할 때 상단 안내가 사라지던 현상을 제거했다.

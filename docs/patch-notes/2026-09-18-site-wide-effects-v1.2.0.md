# site-wide-effects@1.2.0

## 변경 내용

- 공개·계정·인증·관리자 화면에 기능 상태 중심 효과를 확장했다.
- 실제 viewport 진입 시 한 번만 실행되는 reveal과 scroll header depth를 추가했다.
- 홈 여성 챔피언 이미지의 fine-pointer 광원, 미세 깊이 이동과 프리즘 효과를 추가했다.
- 구인 정원, 경기 승자·MVP, 접수 등록률, 팀 밸런스 점수·라인 차이를 데이터 상태와 연결했다.
- 미디어 load, 랭킹 Top 3·MMR 신뢰도, 이벤트·멸망전 상태와 우승 표시를 보강했다.
- 계정·관리자 폼·표·업로드·선택·저장 결과를 운영 피드백 중심으로 정리했다.
- reduced motion, forced colors, fine pointer, mobile 성능 경계를 유지했다.

## 호환성

- API, DB schema, migration, 운영 데이터 변경 없음
- 기존 URL, form action, 권한, 저장 계약 변경 없음
- 자동 재생, 전체 페이지 휠 가로채기, 무한 particle, 영상 배경 추가 없음

## 검증

- `npm run check` PASS
- 784 tests: 783 PASS, 1 intentional skip
- 105 pages / 339 captures / issue 0
- browser quality 27/27 PASS
- production build 93 static pages

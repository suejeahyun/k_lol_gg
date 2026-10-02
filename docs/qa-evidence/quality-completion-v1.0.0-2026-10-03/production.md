# 전체 화면·조회 복구 개선 1.0.0 운영 검증

- source: 667c33d4e74479a5acea81453571b541c7b58a36
- tag: quality-completion-v1.0.0
- Vercel: dpl_EvyosSgPiYDnFMiMWqU2KTGzt5AX, READY
- immutable URL: https://k-lol-r0lds9wec-tjdmswo11-3715s-projects.vercel.app
- 운영 alias: https://k-lol-gg.vercel.app
- HTTP 확인: 2026-10-02T23:55:14.270Z
- migration head: 0047_usage_analytics. 운영 DB migration·데이터 변경 없음.

Git source SHA와 Vercel 목록을 대조하고 inspect에서 같은 배포의 READY·운영 alias를 확인했다. [배포 기록](production-deployment.json). 기존 운영 HTTP 14개와 생성 이미지 해시 검증, 대회 검색 조건 6개 및 health=ready 재확인을 통과했다. [기본 HTTP](production-http-base.json), [빈 필터·오류 경계](production-http-filters.json).

운영 브라우저에서 변경된 공개 경로 7개 × 320·390·1440px의 21개 화면 조건을 확인했다. 가로 넘침, 제목/주요 영역, 조작 이름, 모바일 입력, 이미지 항목에서 미해결 문제가 없다. 요청한 여섯 홈 영역의 순서와 랭킹 승률 → 최다 참여자 → 최다 MVP 이동을 확인했다. 이벤트전·멸망전의 빈 필터 제출은 정상이며 초기화 후 상태/방식은 전체 값이다. [운영 브라우저](production-browser.json).

무작위 팀 도구는 운영 페이지에서 합성 이름 10명을 사용해 5:5 생성, 결과 제목 포커스, 16px 입력, 결과 제목 약 212px 위치를 확인한 뒤 초기화했다. 입력은 클라이언트 도구 안에서만 사용했다. [결과 측정](production-team-result.json), [모바일 결과 화면](production-team-result-mobile.png), [운영 홈](production-home-mobile.png).

로컬 필수 check 1,490개 통과·1개 skip, 전체 DB 계약 33개 실행 묶음/162개 테스트·5종 HTTP 검증·백업 복구, 169개 인증 HTTP 경로와 486개 브라우저 조건을 검증했다. [상세 분석·검증 범위와 제한](README.md), [한국어 업데이트 안내](../../patch-notes/2026-10-03-quality-completion.md).

운영 계정 변경이나 신청·모집 작성은 하지 않았다. 실제 휴대폰·실사용자·스크린리더 전수 검증, PageSpeed/Web Vitals 측정, 외부 검색 서비스 소유권 등록은 별도 확인 항목이다. PageSpeed API 429를 통과로 간주하지 않는다.

복구 기준은 [직전 READY 배포](rollback.json) dpl_6qxTyDes6czuujZfB4PwhEbxt2EK이다. 필요하면 그 배포를 재승격할 수 있다. source와 tag는 origin/main 및 codex/quality-completion-20261003에 push했다. 배포 근거 문서 커밋은 검증한 source tag를 이동하지 않는다.

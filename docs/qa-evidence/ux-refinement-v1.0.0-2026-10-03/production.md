# UX refinement 1.0.0 운영 검증

- source: be4dc46f46ab257ed50398ddb96615d0381f0813
- tag: ux-refinement-v1.0.0
- Vercel: dpl_7o8iQsemzwydvMV544uK3PPJyJTb, READY
- immutable URL: https://k-lol-279g9iv6k-tjdmswo11-3715s-projects.vercel.app
- 운영 alias: https://k-lol-gg.vercel.app
- HTTP 확인: 2026-10-02T23:00:03.409Z
- migration head: 0047_usage_analytics. 운영 데이터·DB migration 변경 없음.

Vercel 목록의 Git source SHA와 inspect의 배포 ID·READY·운영 alias를 대조했다. [배포 기록](production-deployment.json). 운영 14개 HTTP 경로와 새 이미지의 MIME·SHA-256이 모두 통과했다. [HTTP 결과](production-http.json). health는 HTTP 200, status=ready다.

운영 브라우저에서 요청한 여섯 홈 영역의 순서, 랭킹의 다음 지표 이동·내부 스크롤 0, 모바일 로그인·경기 목록, 상세 필터 적용·초기화, 모집 마감 구분을 확인했다. 390px와 1280px 화면에서 가로 넘침이 없다. 모바일 로그인 버튼은 약 409px, 경기 결과 제목은 634px, 랭킹은 약 478px 높이다. [측정](production-browser.json), [홈 PC](production-home.jpg), [홈 모바일](production-mobile.jpg), [모바일 로그인](production-login.jpg).

운영 계정 로그인이나 신청·모집 작성은 실행하지 않았다. 일반 계정 로그인 후 원래 팀 도구로 돌아오는 동작은 합성 계정·격리 DB에서 확인했다. 로컬 전체 검사와 제한은 [README](README.md)에 기록한다. [한국어 변경 안내](../../patch-notes/2026-10-03-ux-refinement.md), [생성 이미지와 정확한 프롬프트](../../design/image-theme-controls-v2.json).

복구 기준은 직전 READY 배포 dpl_8qHjykoMNz82LX7eBrE38SR1K1zT / https://k-lol-34l97dzpx-tjdmswo11-3715s-projects.vercel.app (source 0e1fc0ecfbf3bd16c678bb46b93f7cbe4809a7a0)이다. 필요 시 해당 배포 재승격으로 이전 화면을 복원할 수 있다. 소스와 태그를 origin/main 및 codex/ux-refinement-20261003에 push했다. 이후 배포 근거 문서 커밋은 검증한 source 태그를 이동하지 않는다.

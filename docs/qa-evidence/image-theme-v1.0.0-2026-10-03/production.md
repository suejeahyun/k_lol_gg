# 이미지 테마 1.0.0 운영 검증

- source: 16761e3f3ae85a9b7d6b6b1bdbdb5d8bcc18e412
- tag: image-theme-v1.0.0
- Vercel: dpl_CwPCXjmLXSPSvXNiFCuwct4ZUqhN, READY
- immutable URL: https://k-lol-gxd9v0bpb-tjdmswo11-3715s-projects.vercel.app
- alias: https://k-lol-gg.vercel.app
- 확인 시각: 2026-10-02T21:09:23.236Z
- migration head: 0047_usage_analytics. DB migration/운영 데이터 변경 없음.

운영 주소의 공개·로그인·관리자 로그인·도구·도움말·health 등 14개 HTTP 응답이 정상이며, 11개 WebP 이미지의 상태·MIME·SHA-256이 검증한 소스와 일치했다. [HTTP 결과](production-smoke.json).

운영 브라우저에서 홈과 구인/로그인 화면의 이미지 아이콘·배경을 확인하고 모바일/데스크톱 너비와 랭킹 슬라이드 이동을 검사했다. [실측](production-browser.json), [데스크톱](production-desktop.jpg), [모바일](production-mobile.jpg). 관리자 내부 화면은 합성 계정으로 격리 환경에서 검증했다.

생성 아이콘 96종과 배경 3종, 모바일 파생 크기를 포함해 전체 797,524 bytes다. 생성 방식은 built-in image_gen이며 [정확한 프롬프트와 파일](../../design/image-theme-v1.json)을 보존했다. 코드/접근성/자산 검사와 실제 화면 검증 범위, 기존 전체 DB fixture 실패는 [로컬 검증 문서](README.md)에 구분해 기록했다.

원복 기준은 직전 READY 배포 dpl_AGzBVSAgvpCPP9HfvMv7FvTVRVbR / https://k-lol-fzffixzvh-tjdmswo11-3715s-projects.vercel.app (source 8651fa8437bfc2418aedff8da4a9214e5095ab16)이다. 해당 배포를 재승격하면 이전 화면으로 돌아간다. 새 태그를 이동하지 않았고 origin/main과 codex/image-theme-20261003에 소스를 push했다.

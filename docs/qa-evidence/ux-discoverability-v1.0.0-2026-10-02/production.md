# 목적 중심 탐색 개선 1.0.0 운영 배포 근거

- 기능 버전: ux-discoverability@1.0.0
- Git tag: ux-discoverability-v1.0.0
- 소스: 52df8f75a0e09f621cc02a05f2e4a8d897af5f81
- 원격: origin/main 및 codex/ux-discoverability-20261002 반영 확인
- migration head: 0047_usage_analytics, 신규 migration 없음
- 운영 배포: dpl_7kg8HgGTQ3AzdKCHhRHarvqSNtSM
- 상태: READY
- immutable URL: https://k-lol-nza8kvbon-tjdmswo11-3715s-projects.vercel.app
- 운영 주소: https://k-lol-gg.vercel.app
- 확인 시각: 2026-10-02T12:40:50.950Z

## 배포와 검증

검증 소스를 먼저 운영 환경 변수로 빌드하되 도메인 연결을 보류한 배포 dpl_6tgACN6eArovWVWFsDVq3xbV9gF4에서 검사했다. Vercel 보호가 적용된 임시 주소는 인증된 CLI로 읽기만 수행했고, 홈·문의·로그인 복귀·robots·sitemap 및 관리자/cron의 401 응답을 확인했다. 플랫폼 로그인 화면을 실제 API 응답으로 간주하지 않았다. 이후 동일 소스를 main에 fast-forward push하여 위 Git 배포가 운영 주소에 연결되었다.

운영 주소에서 15개 공개 화면/파일/인증 경계를 검사했다. 홈의 주요 작업·내 활동, 문의 페이지 noindex, 올바른 canonical 사이트맵, 로그인 next 유지, health ready, 관리자 운영 신청서 401, 보관 정리 cron 401을 확인했다. 운영 DB에 합성 문의·참가 신청을 만들지 않았다. 실제 저장·재전송·180일 정리는 격리 DB/로컬 HTTP에서 검증했다.

근거: [전체 분석과 로컬 검사](README.md), [사전 배포 검사](candidate-smoke.json), [운영 HTTP 검사](production-smoke.json), [모바일 운영 화면](production-mobile.jpg).

운영 브라우저에서도 390×844 홈의 네 주요 작업과 하단 메뉴를 확인하고, 기능 검색에 `팀 만들기` 입력 후 Enter로 `/tools/team-balance`에 도달하여 `우리 팀, 근거 있게 나눠요` 제목과 로그인 복귀 링크가 표시되는 것을 확인했다. 브라우저의 임시 viewport 설정은 복원했다.

## 보존·복구

복구 기준 배포는 dpl_FgWLRyWXcPCF4tSdDFwk2LytFwue / https://k-lol-isb93x3aa-tjdmswo11-3715s-projects.vercel.app 이며 소스는 7d087fd03c1d5d255ab25a91818441c77c79647c 이다. 기존 로컬 OCR 작업은 통합하거나 되돌리지 않았다. 이번 릴리스는 기존 카카오 문의를 정리하지 않고 새 site-support-v1 문의만 180일 기준으로 정리한다. rollback은 이전 배포 재승격을 사용하고, 새 문의의 보존 기한 작업이 중단되는 점을 추적한다.

CRON_SECRET과 기존 운영 저장소를 재사용한다. 매일 04:00 KST의 실제 첫 정기 실행과 실제 운영팀 답변은 아직 관찰하지 않았다. 문의 조회/접수 시의 정리도 적용되며 장애 시 지연 가능성을 개인정보 안내에 명시했다. Search Console/Naver 소유권 등록과 실제 사용자 성과 측정은 별도 후속 항목이다.

# 관리자 경기 저장 인증 수정 — 운영 반영

- source: 69a6106142ec434b2f9dfaa3357659b2cf29118a
- tag: match-admin-auth-v1.0.1
- deployment: dpl_pdYj94XWTYbBTxPKNEW7STDQ35Cn, READY
- immutable URL: https://k-lol-4j5ean2ji-tjdmswo11-3715s-projects.vercel.app
- 운영 alias: https://k-lol-gg.vercel.app
- 확인: 2026-10-01T12:01:29.209Z
- migration head: 0047_usage_analytics (스키마 변경 없음)

[전체·DB/HTTP 검증](README.md), [운영 smoke](production-smoke.json). 운영 health ready, 관리자 로그인 200, 미인증 경기 페이지 로그인 이동, OCR 접수 API 미인증 401을 확인했다. 성공 로그인과 실제 OCR 접수·이미지 업로드는 합성 계정과 로컬 스토리지/OCR을 사용한 격리 PostgreSQL/HTTP에서 검증했다. 운영 계정의 세션을 임의 발급하지 않았다.

복구 기준은 직전 배포 dpl_8QFsioeFb9hAXAWhmB91zXHa6LS6이며 재승격할 수 있다. 개인정보 삭제 작업은 별도 데이터 작업이고 배포 복구로 되돌아가지 않는다.

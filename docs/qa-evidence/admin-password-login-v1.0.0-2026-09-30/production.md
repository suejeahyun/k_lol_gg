# 관리자 2차 인증 제거 — 운영 반영

- source: 32c3337317e03216a9a50b717f2626a170257488
- tag: admin-password-login-v1.0.0
- deployment: dpl_8QFsioeFb9hAXAWhmB91zXHa6LS6, READY
- immutable URL: https://k-lol-dn9rzaxlc-tjdmswo11-3715s-projects.vercel.app
- 운영 alias: https://k-lol-gg.vercel.app
- 확인: 2026-09-30T04:13:36.417Z
- migration head: 0047_usage_analytics (이번 변경은 DB migration 없음)

[전체/격리 검증](README.md), [운영 smoke](production-smoke.json). 실제 운영 로그인 화면 200과 비밀번호 로그인 안내, health ready, 관리자 페이지 미인증 redirect와 API 401, 외부 출처 403·잘못된 입력 400을 확인했다. 성공 로그인과 DB 저장은 격리 PostgreSQL에서 실제 비밀번호 인증으로 검증했고 운영 계정 로그인이나 보안 기록 변경은 수행하지 않았다.

배포 이전 복구 기준은 dpl_92RbwvnaMAcxVnNzzeuK9oNQUUwy. 기존 TOTP 암호화 기록은 보존했으므로 이전 배포 재승격으로 이전 인증 정책을 복원할 수 있다.

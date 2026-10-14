# 내전 공정성 1.1.0 배포 기록

운영 반영 완료: source `69127364dd8bf567fb21d9abcdafcb082245f50d`, tag `inhouse-fairness-v1.1.0`.

- 후보 `dpl_91cho2xDmDxZD8ZoUgkva7hTYGkd`를 운영 환경의 도메인 미전환 배포로 검증했다. READY·동일 source 및 공식 Vercel 인증을 통한 GET 8조건 PASS. [후보 상태](candidate-deployment.json), [후보 HTTP](candidate-http.json).
- main 배포 `dpl_kUH56WuhFGXS9Xt6C9EmoQbeWxdU`의 READY·동일 source·project·canonical alias를 2026-10-14T23:51:04.7763337Z에 확인했다. [운영 배포](production-deployment.json), [immutable URL](https://k-lol-jk2elsodj-tjdmswo11-3715s-projects.vercel.app).
- [운영 사이트](https://k-lol-gg.vercel.app/tools/team-balance) 공개 GET 및 인증 보호 8조건 PASS, health ready. [HTTP 결과](production-http.json).
- 공개 팀 밸런스 페이지의 JavaScript에서 새 계산식 버전과 순위 비교 지표를 확인했다. 인증된 초안 화면 조작 검증과 구분한다. [정적 파일](production-assets.json).
- 동일 source의 [GitHub V2 CI](https://github.com/suejeahyun/k_lol_gg/actions/runs/38656393907) success. [CI 기록](github-ci.json).
- 로컬 전체 check(계약 711·단위 1,145 pass/1 skip·lint 오류 0/기존 경고 58·typecheck·ERD·build), 격리 DB 6, 인증 HTTP, 현재 트리 비밀정보 검사 PASS. [검증 수치](validation.json).

## 복구 기준

배포 직전 운영 앱은 `dpl_J6gfStg7uPci5Nk4mianrZNREYq9`, source `3e8a84f5aff5497c6d01b92fc0039149c1419df9`이며 READY와 `k-lol-gg.vercel.app` alias를 확인했다. [provider 사전 확인](production-before.json).

DB 스키마·migration·운영 점수·환경 설정은 바꾸지 않는다. migration head는 `0049_stable-recruit-codes`다. 문제가 생기면 위 앱으로 rollback하며, 이 변경 때문에 DB 복원은 필요하지 않다. 새 `ruleViolations` 보고 필드는 optional이고 기존 점수 JSON과 호환된다.

## 검증 경계

운영 확인은 provider metadata와 공개 GET·비인증 보호 경계에 한정한다. 시험 초안 생성이나 실회원 점수 변경은 하지 않는다. 실제 사용자가 교환했던 초안과 실제 경기 승률의 통계적 검증은 포함하지 않는다.

[로컬 검사](README.md) · [운영 규칙](../../inhouse-balance-rules.md) · [변경 안내](../../patch-notes/inhouse-fairness-v1.1.0.md)

# 내전 공정성 1.1.0 배포 기록

현재 상태: 배포 전 검증 중. 운영 반영을 확인한 뒤 source SHA, 배포 ID, READY·alias 및 HTTP 근거를 기록한다.

## 복구 기준

배포 직전 운영 앱은 `dpl_J6gfStg7uPci5Nk4mianrZNREYq9`, source `3e8a84f5aff5497c6d01b92fc0039149c1419df9`이며 READY와 `k-lol-gg.vercel.app` alias를 확인했다. [provider 사전 확인](production-before.json).

DB 스키마·migration·운영 점수·환경 설정은 바꾸지 않는다. migration head는 `0049_stable-recruit-codes`다. 문제가 생기면 위 앱으로 rollback하며, 이 변경 때문에 DB 복원은 필요하지 않다. 새 `ruleViolations` 보고 필드는 optional이고 기존 점수 JSON과 호환된다.

## 검증 경계

운영 확인은 provider metadata와 공개 GET·비인증 보호 경계에 한정한다. 시험 초안 생성이나 실회원 점수 변경은 하지 않는다. 실제 사용자가 교환했던 초안과 실제 경기 승률의 통계적 검증은 포함하지 않는다.

[로컬 검사](README.md) · [운영 규칙](../../inhouse-balance-rules.md) · [변경 안내](../../patch-notes/inhouse-fairness-v1.1.0.md)

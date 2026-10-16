# 내전 자동 조정 2026-10-16

사용자가 조건 충돌 안내로 생성이 중단되는 실제 사용 문제를 보고했다. source 기준 `e271112b8912469509bf742c090c3ded29be7f0d`에서 기존 `NO_FEASIBLE_LAYOUT` 경로와 포지션·바텀 제한 검사를 확인했다.

이번 범위는 기존 후보가 없을 때 자동 조정 후보를 생성하고, 결과 설명과 후속 저장까지 같은 정책을 적용하는 것이다. [결정 기록](../../architecture/0015-inhouse-automatic-constraint-relaxation.md), [변경 안내](../../patch-notes/inhouse-fairness-v2.0.0.md).

## 검증 결과

- 최종 `npm run check`: 계약 721/721, 단위 1,151 PASS / 1 SKIP, lint 오류 0 / 기존 경고 58, 타입·ERD·가이드 이미지·production build PASS.
- [도메인 51/51](domain.md): 엄격 결과 보존, 전체 1,814,400 배치 탐색, 독립 비교 기준과 최소 역할 이탈, 결정성, 개인 점수·원본 포지션 보존.
- [격리 PostgreSQL 8/8](database.md): 자동 조정 생성·선택·수동 평가·저장·재평가, 과거 이력, 정책·권한·revision·멱등성.
- [UI 29/29 및 교환 3/3](site.md): 결과 설명·공유, 수동 배치, 충돌 복구와 진행 중 보호.
- [실제 브라우저 실행](browser.json): 전원 TOP 합성 10명 생성 200 → 수동 교환·평가 200 → 저장 200/SAVED. 320px 가로 넘침 없음. [자동 추천 화면](automatic-team.jpg).
- 인증 HTTP 전체 경계 PASS. production 의존성 감사 취약점 0. 최종 현재 트리 비밀정보 검사 PASS.

로컬 로그: `.tmp/balance-check-release.log`, `.tmp/balance-auth-http.log`, `.tmp/balance-dependency-audit.json`, `.tmp/balance-secrets-tree.log`. 전체 Git 이력 검사와 배포 근거는 최종 릴리스 기록에 연결한다.

운영 자료를 시험 변경하지 않으며 휴대폰 봇과 DB 스키마 변경은 없다. migration head는 `0049_stable-recruit-codes`다. 브라우저 저장 검사는 합성 메모리 API, 저장 계약 검사는 격리 PostgreSQL에서 수행했으며 운영 사용자 초안을 시험 생성하지 않았다.

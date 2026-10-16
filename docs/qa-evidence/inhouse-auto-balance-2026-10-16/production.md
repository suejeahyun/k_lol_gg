# 내전 공정성 2.0.0 운영 배포

source `1bf379eddcda98a338f41781529c23ac885baed5`, tag `inhouse-fairness-v2.0.0`. 등록 포지션과 바텀 티어 조건을 동시에 만족할 수 없을 때도 같은 참가자 10명으로 최선의 편성을 자동 추천한다. [변경 안내](../../patch-notes/inhouse-fairness-v2.0.0.md), [결정 기록](../../architecture/0015-inhouse-automatic-constraint-relaxation.md).

- production 환경 후보 `dpl_H2iFcWMAgtHLNU5vERtxU5nBpEbn`를 운영 도메인 전환 없이 확인했다. 동일 source·READY 및 앱 익명 GET 12조건 PASS. [후보 배포](candidate-deployment.json), [후보 HTTP](candidate-http.json).
- main 배포 `dpl_cRoMJfC7eaPPwjXvX3ZwzHTF2hD4`, [immutable URL](https://k-lol-h0o817epl-tjdmswo11-3715s-projects.vercel.app), [운영 주소](https://k-lol-gg.vercel.app). READY 2026-10-16T12:08:12.918Z, source·project·canonical alias 확인 2026-10-16T12:09:15.449Z. [배포 원문 요약](production-deployment.json).
- 운영 GET 12조건 PASS, 확인 2026-10-16T12:09:26.648Z: health ready, 홈·모집·신청·팀 편성·도움말, 관리자·팀 API·cron 비인증 접근 차단. [운영 HTTP](production-http.json).
- GitHub source CI success. [실행 근거](github-ci.json).

## 검증과 범위

최종 check 계약721/721·단위1,151 PASS/1 SKIP·lint오류0/기존경고58·typecheck·ERD·이미지·build, 도메인51/51, 격리DB8/8, UI29/29·교환3/3, 인증HTTP, 현재트리 및 전체Git이력 비밀정보 검사 PASS. production 의존성 취약점0. [검증 요약](validation.json), [도메인](domain.md), [저장 경계](database.md), [화면](site.md).

실제 브라우저에서 전원TOP 합성10명 생성 → 역할 교체 → 수동 평가 → 저장을 확인했다. 자동 추천의 최소 역할 이탈8명/바텀 위반0, 원본포지션 보존, 미평가 저장 차단과 수동 결과 문구, 320px 가로 넘침 없음도 확인했다. [브라우저](browser.json), [자동 추천 화면](automatic-team.jpg). 운영 사용자 계정·초안으로 쓰기를 시험하지 않았으며 실제 경기 승률 보장은 검증 범위가 아니다.

migration head0049와 휴대폰 봇 파일은 유지한다. 운영DB 스키마·자료·설정을 변경하거나 카카오 방에 메시지를 보내지 않았다. 이전 R29 실기기 설치 대기 상태를 설치 완료로 간주하지 않는다.

## 복구 및 실행 방식

직전 READY 앱 `dpl_HBvtYAMgEAt8VGmRD3DtXmJ9bKjr`, source `daab5eb44997674968dcea118f6ff81c9d217700`가 앱 rollback 기준이다. [사전 배포](baseline-deployment.json), [사전 HTTP](baseline-http.json). DB migration이 없으므로 DB 복원이나 자료 삭제는 필요하지 않다. 이전 앱은 새 자동 조정 조건을 지원하지 않으므로 rollback하면 해당 초안의 후속 선택·저장이 다시 제한될 수 있다. 새 결과 JSON은 보존하며 가능한 경우 forward fix를 우선한다.

이번 자동화는 팀 생성·재평가 버튼을 누를 때 계산에 적용된다. 사용자가 원하지 않은 1시간 간격 점검 예약은 중지된 상태이며 다시 활성화하지 않았다. 이전 릴리스 QA의 예약 활성화 문구는 그 당시 기록이다.

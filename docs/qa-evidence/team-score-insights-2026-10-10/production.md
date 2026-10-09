# 내전 점수 관리 1.1.0 배포 상태

2026-10-10 KST. 현재 상태: NOT_DEPLOYED. 소스·격리 검증은 [통합 기록](README.md)을 따르며 실제 운영 반영은 READY·source·alias·health 확인 후 이 문서와 릴리스 등록부에 기록한다.

기능 tag 예정: `team-balance-admin-v1.1.0`. DB migration head `0047_usage_analytics` 유지. 새 ADMIN 읽기 API와 점수 계산·UI를 변경하며 운영 회원 점수·MMR·기존 초안은 직접 수정하지 않는다.

배포 전 운영 복구 기준은 source `69d8336609b585f302c761042efa5f8f0362c172`, deployment `dpl_xSQWNy5KRhVQwcBvZCtE1XbmuVGP`, immutable `https://k-lol-jeo8m0wdr-tjdmswo11-3715s-projects.vercel.app`이다. 배포 전 CLI 조회에서 canonical alias와 READY를 확인했다. 웹 배포 복구는 배포 후 정상 저장된 보정값이나 팀 초안을 되돌리지 않는다.

실제 운영 관리자 세션은 로그인 화면으로 확인했으며 재로그인 응답을 기다리고 있다. 인증된 저장 검증은 격리 합성 자료에 한정한다. [외부·실계정 조건](external-conditions.md)은 배포 성공과 구분한다.

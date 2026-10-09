# 내전 점수 관리 1.1.0 배포 상태

2026-10-10 KST. 상태: PRODUCTION. 소스·격리 검증은 [통합 기록](README.md)을 따르며 운영 READY·source·alias·health 확인을 완료했다.

## 배포 근거

- source `8ce5e7aa9171732edf4f47eb6b548e884f14a14c`, tag `team-balance-admin-v1.1.0`.
- 후보 `dpl_6imDeVmYGC8E5C7HLwDGswRyJtw3`, immutable `https://k-lol-ifymuuv7g-tjdmswo11-3715s-projects.vercel.app`: READY·동일 source·7개 HTTP 조건 확인 후 승격했다. [후보 검사](candidate-http.json).
- 후보의 일반 접근은 Vercel 배포 보호로 302였다. 보호 설정을 끄지 않고 기존 인증을 사용하는 공식 `vercel curl <path> --deployment <candidate-url> -- --include --silent --max-time 30`으로 각 경로를 확인했다. Vercel 계층에 인증했지만 앱 관리자 로그인·운영 데이터 쓰기는 없었다.
- Git main·작업 브랜치·tag를 원자 fast-forward push했다. main 배포 `dpl_7sTiDeiGCTk9mhh689b54UXiJySu`, immutable `https://k-lol-ib6v62lf6-tjdmswo11-3715s-projects.vercel.app`가 READY·동일 source이며 canonical alias `https://k-lol-gg.vercel.app`를 가리킨다. `2026-10-09T15:54:22.168Z`(10/10 00:54 KST)에 확인했다. [배포·운영 경계 검사](production-deployment.json).
- [운영 HTTP 33조건](production-http.json): 공개 페이지·홈 순서·MMR 페이지·랭킹 정렬·로그인 복귀·관리자 및 cron 비인증 차단을 통과했다. 후보 승격 후 실행했으며 main 준비 후 source·alias·health·새 관리자 읽기 API 등 7개 조건을 다시 확인했다.
- DB migration head `0047_usage_analytics` 유지. 새 ADMIN 읽기 API와 점수 계산·UI를 변경하며 운영 회원 점수·MMR·기존 초안은 직접 수정하지 않았다.

## 복구와 한계

배포 전 운영 복구 기준은 source `69d8336609b585f302c761042efa5f8f0362c172`, deployment `dpl_xSQWNy5KRhVQwcBvZCtE1XbmuVGP`, immutable `https://k-lol-jeo8m0wdr-tjdmswo11-3715s-projects.vercel.app`이다. 배포 전 CLI 조회에서 canonical alias와 READY를 확인했다. 웹 배포 복구는 배포 후 정상 저장된 보정값이나 팀 초안을 되돌리지 않는다.

실제 운영 관리자 세션은 로그인 화면으로 확인했으며 재로그인 응답이 없었다. 인증된 저장·이력·통계 조회 검증은 격리 합성 자료에 한정한다. [외부·실계정 조건](external-conditions.md)은 배포 성공과 구분한다.

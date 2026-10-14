# 내전 공정성 규칙 1.0.0 운영 반영

- source `3e8a84f5aff5497c6d01b92fc0039149c1419df9`, tag `inhouse-fairness-v1.0.0`. 최신 운영 브랜치에 fast-forward로 반영했으며 작업 브랜치·main·tag를 원자 push했다.
- 후보 `dpl_6x6xAmDaRbiGnJcwvLsfVwQ9aJnd`를 운영 환경의 `--skip-domain` 배포로 확인했다. READY·동일 source·project 확인 후 공식 Vercel 보호 우회 인증으로 공개 GET 8조건을 통과했다. [후보 상태](candidate-deployment.json), [후보 HTTP](candidate-http.json).
- main 운영 배포 `dpl_J6gfStg7uPci5Nk4mianrZNREYq9`, [immutable URL](https://k-lol-8lmmg5pqr-tjdmswo11-3715s-projects.vercel.app), [운영 팀 밸런스](https://k-lol-gg.vercel.app/tools/team-balance). 2026-10-14T23:20:54.3538625Z에 READY·동일 source·project·canonical alias를 확인했다. [provider 근거](production-deployment.json).
- 운영 health ready, 홈·팀 밸런스·초안 로그인 안내·모집 페이지, 일반/관리자 API 비인증 401과 관리자 로그인 복귀를 포함한 GET 8조건 PASS. [운영 HTTP](production-http.json).
- 운영 팀 밸런스 페이지가 참조하는 정적 파일에서 새 기타 포지션 허용 옵션과 큰 등급 3단계 규칙 문구를 확인했다. [정적 파일 확인](production-assets.json). 인증된 화면을 조작했다는 의미는 아니다.
- provider의 실제 함수 출력에서 생성·일반/관리자 재평가 3개 경로 모두 Node.js 24·2048MB·실행 한도 60초 적용을 확인했다. [운영 함수 설정](production-runtime.json).
- 동일 source의 [GitHub V2 CI](https://github.com/suejeahyun/k_lol_gg/actions/runs/38653349321)가 success로 완료됐다. current tree 비밀정보·운영 의존성 감사·전체 check 및 관리자 HTTP 인증 행렬을 통과했다. [CI 상태](github-ci.json).

## 검증 범위

[통합 검증](README.md), [검증 수치](validation.json), [규칙 설명](../../inhouse-balance-rules.md), [변경 안내](../../patch-notes/inhouse-fairness-v1.0.0.md)를 연결한다. 로컬 전체 check, 격리 PostgreSQL의 선택·수동 평가·저장과 rollback, HTTP 인증 경계, 현재 tree와 전체 Git 이력 비밀정보 검사, 운영 의존성 감사를 통과했다.

실제 운영 계정으로 시험 초안을 만들거나 참가자의 점수를 변경하지 않았다. 최대 조합의 실제 운영 지연·사용자 경기 승률 검증은 이번 결과에 포함하지 않는다. 새 규칙은 새 초안과 재평가부터 판정에 표시되며, 이전 후보도 선택·저장 시 필수 조건을 다시 검사한다. 과거 점수 JSON을 덮어쓰지 않는다.

## 복구

직전 운영 READY 앱은 `dpl_BpxTdkKCLLGa2nwrp1F1o8T2Q5pc`, source `cf32d4f9ee94149a3fb0be81301f9943ccd6c7a0`다. [사전 provider 확인](production-before.json). 앱 이상 시 이 배포로 rollback할 수 있다.

DB 스키마·migration·운영 설정 변경은 없으며 migration head `0049_stable-recruit-codes`를 유지한다. 앱 rollback에 DB 복원은 필요하지 않다. 이번 릴리스는 새 운영 DB 백업·복원 시험이나 휴대폰 봇 설치를 포함하지 않는다.

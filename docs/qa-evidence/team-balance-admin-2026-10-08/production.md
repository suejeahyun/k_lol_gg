# 내전 팀 편성 점수 관리자 편집 1.0.0 운영 배포

2026-10-09 KST. 사용자 요청에 따라 일반 관리자 점수 수정 권한과 편집 UI를 운영 반영했다.

## 배포 근거

- source: `69d8336609b585f302c761042efa5f8f0362c172`
- tag: `team-balance-admin-v1.0.0`
- 후보: `dpl_33vEYoZvHVcY16kPLzi8Hikn4JPt`, READY·동일 source·7개 HTTP 조건 확인 후 운영 승격. [후보 검사](candidate-http.json)
- main: `dpl_xSQWNy5KRhVQwcBvZCtE1XbmuVGP`, READY·동일 source·운영 alias·health ready. 확인 시각 `2026-10-08T16:34:16.063Z`(KST 2026-10-09 01:34). [배포 메타데이터](production-deployment.json)
- 운영: https://k-lol-gg.vercel.app/admin/balance-ai#team-score
- immutable: https://k-lol-jeo8m0wdr-tjdmswo11-3715s-projects.vercel.app
- Git 작업 브랜치·main·tag를 fast-forward 원자 push로 반영했다. 강제 push는 하지 않았다.
- migration head `0047_usage_analytics` 유지. DB migration·운영 데이터 변경 없음.

## 검증

`npm run check` exit 0: 계약 672 통과, 단위 1069 통과/1 skip, 타입·ERD·68개 이미지·최적화 빌드 통과. lint 오류 없음(기존 경고 유지). 비밀정보 current-tree 검사와 diff 검사 통과.

[기능 검증](README.md)은 일반 ADMIN/SUPER_ADMIN 허용, USER/ACCOUNT 차단, 세션 재검증, 감사·멱등성·동시성 및 MMR 불변을 포함한다. 실제 Chromium 합성 ADMIN으로 검색·자동 조회·점수 저장·초기화·오프라인/충돌 복구를 확인했고 1440/390/320px 화면을 검증했다. 독립 최종 코드 검토에서 배포 차단 문제는 발견되지 않았다.

[운영 HTTP 검사](production-http.json)는 공개 페이지, 홈 순서, 랭킹·MMR 페이지, 로그인 복귀 및 비인증 API 차단 등 31개 조건을 통과했다. 동일 source 후보 승격 후 수행했으며 main 배포 준비 후 source·alias·health·관리자 페이지 로그인 이동과 보정 API 401을 다시 확인했다.

실제 운영 관리자 계정으로 점수를 시험 저장하지 않았다. 인증된 저장 검증은 격리 합성 데이터에 한정한다. MMR 원장 조정·전체 재계산은 기존 최고 관리자 전용 권한을 유지한다.

## 복구

새 권한이나 화면에서 회귀가 발견되면 직전 READY 배포 `dpl_5som3xAwEzW3Bqk1NMNMWHHhUNdW`(https://k-lol-5wt00cumj-tjdmswo11-3715s-projects.vercel.app)를 재승격하거나 검증된 수정 버전을 적용한다. DB 스키마 변경이 없어 되돌릴 migration은 없다. 웹 배포 복구는 배포 후 정상적으로 저장된 점수·MMR·경기 데이터를 되돌리지 않는다.

# 신규 참가자 점수 표시 검증

2026-10-18 (Asia/Seoul). 기준 main `365a4533`. 사용자 제공 초안을 로그인한 브라우저에서 읽기 전용으로 확인했으며, 전적 점수가 없는 참가자 카드에 일괄적으로 “기본 점수 50”을 표시하는 경로를 재현했다. 원본 닉네임·초안 식별자·인증 정보·운영 화면은 이 문서나 fixture에 보관하지 않는다.

## 원인과 변경

카드는 `participant.rating.overall`이라는 전적 입력을 표시했지만 팀 편성은 `assignment.rating.effectiveScore`라는 최종 역할 점수를 사용했다. 신규 참가자의 `overall=null`을 카드가 50으로 대체하면서 티어가 반영된 배정 결과와 달라졌다. 이제 저장된 후보의 선수·팀·역할이 일치하는 최종 점수를 표시한다. 수동 교환 중에는 동일 배치에 대해 검증된 미리보기 점수를 사용하며, 평가 실패 시 임의의 기본값을 만들지 않는다.

현재·최고 티어 및 내전 표본은 별도 표시한다. 전역 집계 세대가 없다는 이유로 개인 내전 경험도 없다고 단정하지 않는다. 점수 가중치와 계산식 버전, 자동 조정 정책, 과거 JSON은 유지한다. 티어가 실제로 누락된 사람은 확인 필요로 남으며, Riot 랭크로 등록 자료를 임의 대체하지 않는다. 추가 비교에서 확인한 임의 문자열의 티어 오인도 기존 공정성의 엄격 티어 파서를 재사용하여 수정한다. 정상 티어·LP·층 입력 점수는 보존한다.

## 검증

- UI focused 34/34 PASS: 다이아 IV 68, 플래티넘 IV 50, 티어 미확인 32, 부 포지션 교환 63/36, 자동 조정 역할 58, 저장된 과거 점수 73.25 보존, 미리보기 실패, 내전 0/3/20판과 집계 정보 부재.
- 격리 PostgreSQL 18 team-tools 9/9 PASS: 실제 provider→초안 생성에서 무전적 신규 참가자의 등록 티어 반영, 프로필 변경만으로 기존 초안 유지, 명시적 재평가 후 새 티어 적용, 이전 라운드 후보 행 전체 보존. 일회성 DB 정리 완료.
- 변경 UI·DB 테스트 파일 ESLint와 `git diff --check` PASS.
- 독립 검토의 집계 정보 문구 지적 1건 수정 완료. 추가 핵심 점수·수동 배치·과거 초안·자동 조정 문제 없음.
- 점수 파서 보완 후 도메인 focused TypeScript 70/70, JavaScript 6/6 PASS. 잘못된 현재/최고 티어의 대체값과 정상 한영 별칭·로마 숫자·LP·마스터 층 점수를 검사했다.
- 최종 `npm run check`: 계약 728/728, 단위 1,154 PASS / 1 SKIP, lint 오류 0 / 기존 경고 58, 타입·ERD·가이드 이미지·production build PASS. 현재 트리 비밀정보 검사 PASS.

인증 HTTP 검사도 PASS: 개발·production의 권한, 요청 제한, 관리자 암호, 쿠키, 역할, 보안 헤더, 로그아웃과 production fixture 차단을 확인했다. source `48e82aef`의 운영 READY·canonical alias·HTTP 8조건과 실제 소유 초안 10개 점수 카드를 확인했다. [운영 및 남은 자료 수정](production.md). migration head `0049_stable-recruit-codes`, DB 스키마 변경 없음.

실행 로그: `.tmp/newcomer-check-final.log`, `.tmp/newcomer-db-final.log`, `.tmp/newcomer-domain-focused.log`, `.tmp/newcomer-auth-http.log`, `.tmp/newcomer-secrets.log`. 로그에는 원본 운영 참가자 자료나 인증 정보를 기록하지 않는다.

[사용자 안내](../../patch-notes/inhouse-fairness-v2.0.1.md) · [계산 설명](../../inhouse-balance-rules.md)

[실제 입력 재현·256개 독립 배치 비교·반복 검사](comparison.md). 사용자가 확인한 누락 티어를 반영한 로컬 재추천의 점수 차이는 1.90점이며, 운영 반영 여부는 배포 및 작업 확인 기록으로 구분한다.

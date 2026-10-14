# 내전 공정성 규칙 1.0.0

사용자가 요청한 내전 밸런스 규칙과 “3티어는 세부 단계가 아닌 큰 등급 3단계” 해석을 운영 V2 팀 도구에 반영한다. 배포는 사용자의 “배포까지 진행” 요청 범위다.

## 통합 기준

- 최신 `origin/main`의 `91e72b3b8e624c649b35bbefef4a2c6f4b79a55b`에서 분리한 작업 디렉터리로 통합했다. 처음 수정했던 V1 디렉터리는 운영보다 461개 커밋 이전이므로 해당 디렉터리를 배포하지 않는다.
- 운영 V2의 점수 입력·관리자 보정·인증·초안 revision 및 멱등성·기존 JSON 이력을 보존하며 공정성 평가와 팀/포지션 동시 탐색을 확장한다.
- DB 스키마와 migration 변경은 없다. migration head는 `0049_stable-recruit-codes`다. 초안 참가자와 평가 결과의 기존 JSON 필드를 사용한다.
- 운영 전 복구 대상의 READY·source·canonical alias는 [provider 조회](production-before.json)에 기록했다. 앱 rollback에 DB 복원은 필요하지 않다. 이번 작업에서 새 운영 DB 백업이나 복원 시험을 했다는 의미는 아니다.

## 검증 상태

- `npm run check` 최종 exit 0: 계약 709/709, 단위 1,137 pass / 기존 skip 1, lint 오류 0 / 기존 경고 58, typecheck, ERD 114 tables / 175 FK, 가이드 이미지 68개와 production build 통과.
- 격리 PostgreSQL 18의 `V2_DB_CONTRACT_SCOPE=team-tools npm run test:db`: 6/6 PASS. 새 규칙을 모르는 기존 후보도 선택·저장 전에 검사하며 실패 시 revision·receipt·과거 후보 JSON이 바뀌지 않음을 확인했다. 임시 DB는 runner가 정리했다.
- 공정성 HTTP 경계 5/5, 집중 도메인 42개, UI·공유·재시도 관련 24개 통과. 빠른 탐색과 전체 보고서의 200개 대칭 사례, 20개 독립 oracle 사례를 대조했다.
- 모든 역할을 명시적으로 허용한 1,814,400개 조합은 집중 검사 약 1.95초, 최종 전체 검사 약 2.02초였다. 로컬 수치이며 운영 지연의 보장이 아니다. 생성·재평가 API는 실행 한도 60초를 명시했다.
- 처음 전체 검사에서는 CPU 작업이 병렬 실행되는 중 기존 5초 성능 단정만 5.317초로 실패했다. 조합 수·결과 검증은 유지하고 API 한도의 절반인 30초를 회귀 예산으로 명시한 뒤 전체 검사를 다시 통과했다. 최초 인증 HTTP 검사는 빌드 전 실행해 production artifact가 없어 실패했으므로 빌드 후 재실행 결과만 최종 근거로 사용한다.
- 현재 tree 비밀정보 검사와 운영 의존성 감사(취약점 0), 기존 릴리스 99개 tag·migration 근거 검사를 통과했다.
- 빌드 후 `npm run verify:auth-http` exit 0: 권한 guard·제한·관리자 비밀번호·쿠키·역할·보안 헤더·로그아웃·production fixture 차단을 확인했다.

실제 배포 결과는 `production.md`에 별도로 기록한다. 후보·운영 공개 HTTP 검증과 격리 합성 데이터 검증은 구분하며, 실제 운영 사용자의 팀 초안을 테스트 목적으로 생성하지 않는다.

# 프로젝트 규칙·ERD·UI 재사용 기반 QA

상태: 소스 수정과 로컬 통합 검증을 완료했다. 커밋 `8dcbee424a0b8ca1f480858af00196daedfd0dff`을 Vercel Production에 배포했고 운영 별칭의 health/DB 연결을 확인했다.

## 요구사항별 반영

1. `AGENTS.md`의 자동 생성 Next.js 구역은 보존하고, 그 뒤에 K-LOL.GG 고유 문서 우선순위·재사용·DB·보안·검증·릴리스 규칙을 추가했다.
2. `PROJECT_RULES.md`에 문서 우선순위와 충돌 해결 기준을 고정했다. 현재 상태는 코드·Drizzle schema·migration journal·테스트·배포 근거로 판정하고, 문서는 의도와 운영 절차를 설명한다.
3. `README.md`와 `docs/STATUS.md`의 화면·API·테이블·migration·테스트·운영 상태를 현재 근거와 맞췄다. 이전 Kakao R5 문서의 운영 미반영 표기도 실제 Vercel 배포 상태와 일치시켰다.
4. `scripts/database/generate-erd.ts`가 Drizzle export metadata만 읽어 `docs/database/ERD.md`를 결정적으로 생성한다. DB 연결, 환경변수, 외부 호출은 사용하지 않는다.
5. `docs/frontend/COMPONENT_REUSE.md`에 공통 컴포넌트 50개와 모듈 UI 2개를 분류하고 승격·비승격·접근성·검증 기준을 기록했다.
6. 첫 저위험 추출로 비공개 자산 화면의 중복 탭을 기존 `AdminContentTabs` 재사용으로 교체했다. 큰 경기·계정·홈 화면은 한 번에 추상화하지 않고 실제 반복과 위험에 따라 다음 순서를 기록했다.
7. `docs/releases/registry.json`과 검증 스크립트로 feature ID, SemVer, Git tag, commit, migration head, QA, 패치 공지, Vercel 배포, 외부 설치 상태를 연결했다. Kakao R5를 첫 실제 원장 항목으로 역기록했다.
8. 로컬 PostgreSQL 18, 안전 가드가 있는 DB 테스트, CI PostgreSQL service로 현재 요구가 충족되어 Docker 파일은 추가하지 않았다. 도입 조건과 최소 안전 요건은 ADR `0007`에 기록했다.

## 검증 결과

- `npm run check`: PASS
  - ESLint: 오류 0건, 기존 경고 26건
  - TypeScript: PASS
  - ERD drift: 101개 테이블, 163개 외래 키, schema SHA-256 `55b03fc0f6b0797963b240fc723ebee2cb8b5c6187e43996a1d6eafbd3d04cd0`
  - 계약 테스트: 313/313 PASS
  - 단위 테스트: 619/619 PASS
  - 여성 챔피언 홈 아트: 68/68, 1672x940, SHA-256 중복 0건
  - Next.js production build: PASS, 정적 생성 92/92
- migration journal은 SQL 파일 35개와 정확히 일치하고 idx가 연속이며 timestamp가 엄격히 증가하는 회귀 테스트를 추가했다.
- 릴리스 원장 검증은 실제 로컬 tag/commit, migration head, QA·패치 문서 경로와 배포 필드를 확인한다.
- Drizzle schema와 migration 구조 검사는 운영 DB나 비밀값을 읽지 않는다.

## 운영 반영 상태와 남은 위험

- 기능 커밋과 태그 `project-governance-v1.0.0`을 원격에 게시했다. Vercel 배포 `dpl_GFtbYMGfu2dZVSUMVALUTpb9vxWg`는 `Ready`, immutable URL은 `https://k-lol-ekv491mea-tjdmswo11-3715s-projects.vercel.app`이다.
- 운영 별칭 `https://k-lol-gg.vercel.app/api/health`는 2026-09-10T17:07:30.124Z에 HTTP 200 `ready`를 반환했다. 이 route는 DB `select 1` 성공 뒤에만 `ready`를 반환한다.
- journal timestamp 역전은 정적 일관성 검사를 통과하도록 바로잡았지만, 이미 중간 migration까지만 적용된 익명화 DB 복제본의 전진 적용은 아직 실행하지 않았다.
- 현재 103개 화면 전체의 최신 데스크톱·태블릿·모바일 캡처 회귀는 이번 패치 범위에 포함하지 않았다.
- UI 변경은 중복 탭 한 곳뿐이다. 문서에 기록한 큰 화면의 점진 추출은 각 기능 회귀 테스트와 함께 별도 패치로 진행해야 한다.
- Docker 미도입은 현재 근거에 따른 결정이다. 신규 개발자 재현 실패나 운영과의 확장·timezone·다중 서비스 차이가 증명되면 ADR 조건으로 재검토한다.

## 다음 패치 추천

1. `BoundedPicker`를 동작 변경 없이 route-local 위치에서 관리자 공통 위치로 옮기고 키보드·원격 검색 회귀를 고정한다.
2. 운영 DB migration head를 값 노출 없이 확인하고 익명화 복제본에서 전진 migration과 복구 시간을 기록한다.
3. 현재 103개 화면을 데스크톱·태블릿·모바일로 다시 캡처해 이번 기준의 UI 회귀 근거를 만든다.
4. feature release 등록을 CI 필수 검사로 승격해 tag·commit·QA·배포 누락을 push 전에 차단한다.
5. 신규 개발자 한 명의 로컬 DB 설정 시간을 측정해 Docker 도입 조건 충족 여부를 데이터로 판단한다.

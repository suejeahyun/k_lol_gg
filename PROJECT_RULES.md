# K-LOL.GG 개발 규칙

이 문서는 `AGENTS.md`의 프로젝트 규칙을 구체화한다. 프로젝트 운영 방식이 바뀌면 개별 프롬프트보다 이 문서를 먼저 갱신한다.

## 1. 문서 우선순위와 역할

| 우선순위 | 위치 | 역할 |
|---:|---|---|
| 1 | `AGENTS.md` | 안전 경계, 작업 방식, 검증·완료 기준 |
| 2 | `PROJECT_RULES.md` | 저장소 전체 개발·재사용·릴리스 규칙 |
| 3 | `docs/contracts/`, 승인된 `docs/architecture/` | 외부 계약과 변경하기 어려운 구조 결정 |
| 4 | `docs/feature-catalog/`, `docs/parity/` | 기능·화면·API 인벤토리와 V1 동등성 |
| 5 | `docs/operations/` | 배포, 복구, 외부 연동 실행 절차 |
| 6 | `docs/STATUS.md`, `README.md` | 현재 확인 상태와 개발 진입점 |
| 7 | `docs/patch-notes/`, `docs/qa-evidence/` | 특정 변경의 공지와 시점별 증거 |

문서가 충돌하면 상위 문서를 적용한다. 단, 현재 구현 상태는 코드, Drizzle 스키마, `drizzle/meta/_journal.json`, 테스트 결과, Git SHA와 배포 로그로 판정한다. 하위 문서가 실제 상태와 다르면 상위 의도를 임의 변경하지 말고 해당 요약 문서를 함께 갱신한다.

## 2. 재사용 우선 개발

1. 작업 전 `rg`로 같은 이름, 역할, 스타일, API와 테스트를 검색한다.
2. 기존 public API를 확장할 수 있으면 새 구현을 만들지 않는다.
3. 공통화는 실제 반복이 두 곳 이상이고 동작·접근성 계약이 같을 때만 한다.
4. 단순히 모양이 비슷하지만 권한·데이터 수명주기가 다른 화면은 성급하게 합치지 않는다.
5. 추출은 작은 단위로 하고 기존 호출부 테스트를 유지한다. 대규모 일괄 재작성은 별도 결정 기록이 필요하다.
6. 미사용 호환 계층, 미래를 가정한 옵션, 동일 의미의 helper와 CSS token을 추가하지 않는다.

공통 컴포넌트의 현재 목록과 승격 기준은 `docs/frontend/COMPONENT_REUSE.md`를 기준으로 한다.

## 3. 데이터와 migration

- 원본: `src/platform/db/schema/index.ts`가 export하는 Drizzle 스키마.
- migration head: `drizzle/meta/_journal.json` 마지막 entry.
- 생성: 스키마 변경 뒤 `npm run db:generate`, diff와 제약·인덱스·데이터 보존을 사람이 검토한다.
- ERD: `npm run db:erd`로 생성하고 `npm run db:erd:check`로 드리프트를 검사한다.
- 적용: 운영 DB가 아닌 안전 가드를 통과한 일회성 PostgreSQL에서 fresh·upgrade·재실행을 검증한다.
- 복구: down migration을 즉석에서 만들지 않는다. 검증된 backup/PITR 또는 forward-fix를 사용한다.

Docker는 기본 전제에 넣지 않는다. 로컬 PostgreSQL 18 설치와 CI service로 재현이 가능하므로 현재는 도입하지 않는다. OS별 설치 차이 때문에 신규 기여자가 DB 검증을 재현하지 못한다는 증거가 생길 때만, 합성 데이터·loopback·일회성 volume·고정 major 버전 조건으로 별도 제안한다.

## 4. UI와 접근성

- 버튼, 입력, 카드, 배지는 `src/components/ui/`를 우선 사용한다.
- 사이트/관리자 shell, 상태 패널, 챔피언 초상화와 도메인 전용 폼은 기존 컴포넌트를 먼저 확장한다.
- 새 공통 컴포넌트는 키보드 탐색, focus, label/name, loading/empty/error, 모바일 overflow를 함께 정의한다.
- 큰 화면의 반복 UI는 한 패치에 한 패턴씩 추출한다. 시각 변경이 목적이 아니면 DOM 순서·문구·행동을 보존한다.
- CSS module과 디자인 token을 우선 재사용하며 페이지 안에 같은 색·간격 값을 반복해서 추가하지 않는다.

## 5. 테스트와 완료 판정

| 변경 | 최소 검사 |
|---|---|
| 문서·생성 스크립트 | 생성 재현, check 모드, `git diff --check` |
| UI·클라이언트 | 변경 테스트, lint, typecheck, 접근성·반응형 영향 확인 |
| 도메인·API | 단위·계약 테스트, 권한·DTO·멱등성 확인 |
| 스키마·migration | 위 검사 + 격리 PostgreSQL fresh/upgrade/재실행 |
| release 후보 | `npm run check`, 필요한 외부 경계 smoke, 비밀정보 검사 |

‘완료’는 요구 범위가 구현되고 요구 범위의 검사가 통과한 상태다. ‘운영 반영’은 해당 Git SHA를 가리키는 배포 ID·상태와 health/smoke 근거가 있을 때만 사용한다. 휴대폰 봇이나 외부 앱 코드는 실제 설치 확인을 별도로 기록한다.

## 6. 기능 단위 릴리스

- 기능 버전은 `<feature-id>@<semver>` 형식을 사용한다.
- Git tag는 `<feature-id>-v<semver>` 형식을 사용한다.
- 릴리스 항목은 tag, commit, migration head, QA evidence, 배포 ID/URL 또는 명시적 미배포 상태를 연결한다.
- 같은 tag의 근거는 수정하지 않는다. 정정은 patch 버전과 새 tag로 남긴다.
- 등록 형식과 검증 명령은 `docs/releases/README.md`를 따른다.

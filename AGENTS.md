<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# K-LOL.GG project rules

이 저장소의 작업자는 아래 순서로 지침을 적용한다.

1. 이 `AGENTS.md`
2. 루트의 `PROJECT_RULES.md`
3. `docs/contracts/`와 승인된 `docs/architecture/` 결정 기록
4. `docs/feature-catalog/`, `docs/parity/`, `docs/operations/`
5. `docs/STATUS.md`, `README.md`, 패치 노트와 QA 증거

상위 문서와 하위 문서가 충돌하면 상위 문서를 따른다. 코드·Drizzle 스키마·migration journal·테스트·배포 로그는 현재 상태를 판정하는 증거이며, 문서와 다르면 사실을 숨기지 말고 드리프트를 함께 수정한다. 세부 기준은 `PROJECT_RULES.md`에 둔다.

## 작업 원칙

- 새 변수·함수·컴포넌트·API·스키마를 만들기 전에 `rg`로 기존 구현과 호출부를 찾고 재사용하거나 확장한다.
- 아직 두 번째 사용처가 없는 추상화, 추측성 범용화, 화면 전체 재작성은 만들지 않는다. 필요한 최소 변경으로 기능 계약을 지킨다.
- V1은 사용자 동작과 문구를 확인하는 기준이며 V2 구현 코드를 복사하는 원본이 아니다.
- 도메인 규칙은 순수 도메인 코드, 권한은 서버 경계, 저장은 repository/transaction에 둔다. 페이지 컴포넌트에 이를 중복 구현하지 않는다.
- Drizzle TypeScript 스키마가 데이터 모델의 원본이다. SQL migration은 전진 전용이며 생성 후 반드시 사람이 검토한다. 운영 DB에 직접 `DROP`, `TRUNCATE`, 임의 DDL을 실행하지 않는다.
- 비밀값, 운영 데이터, 토큰, 원본 개인정보를 코드·문서·로그·fixture에 기록하지 않는다.
- UI는 `src/components/ui`와 기존 도메인 컴포넌트를 우선 재사용한다. 반복이 실제로 확인된 패턴만 공통 컴포넌트로 추출하고 접근성·모바일·키보드 동작을 보존한다.
- 변경 범위의 lint·타입·테스트를 먼저 실행하고, merge/release 전 `npm run check`를 실행한다. DB·권한·금액·집계·migration 변경은 focused DB/HTTP 검증을 추가한다.
- 실제 근거 없이 완료, 검증됨, 운영 반영이라고 쓰지 않는다. 소스 반영, 로컬 검증, Git push, Vercel 배포, 휴대폰 설치를 서로 구분한다.
- 기존 파일과 사용자 변경을 임의 삭제·되돌리지 않는다. 운영 배포, 데이터 삭제, 외부 시스템 변경은 명시된 범위와 복구 근거가 있을 때만 수행한다.

## 완료 산출물

- 기능 단위 버전, Git tag, 검증 문서, 배포 근거를 `docs/releases/` 규칙으로 연결한다.
- `README.md`는 진입점, `docs/STATUS.md`는 현재 확인 상태, migration head는 `drizzle/meta/_journal.json` 한 곳을 기준으로 유지한다.
- 기능 변경은 필요한 경우 `docs/qa-evidence/`의 재현 가능한 근거와 `docs/patch-notes/`의 한국어 공지를 함께 남긴다.

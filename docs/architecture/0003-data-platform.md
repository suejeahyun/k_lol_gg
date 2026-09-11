# ADR-0003: S01/S02 데이터 플랫폼

- 상태: 채택
- 조사 기준일: 2026-09-01
- 적용 범위: S01 인증·권한, S02 플레이어 등록부
- 배포 전제: V2 전용 Vercel 프로젝트 + V2 전용 PostgreSQL

## 1. 결정 요약

V2의 첫 영속성 계층은 아래 조합으로 고정한다.

- ORM/스키마: **Drizzle ORM 안정 채널**. 구현 시 `package-lock.json`으로 정확한 버전을 고정하고 `beta`, `rc`, `latest` 범위 지정은 사용하지 않는다.
- 마이그레이션: **Drizzle Kit의 code-first `generate` → SQL 검토 → `migrate`**. 생성된 SQL과 메타데이터를 저장소에 함께 보관한다.
- 런타임 드라이버: **`pg`(node-postgres)**. Next.js의 DB 접근 경로는 Node.js 런타임에서만 실행한다.
- 운영 PostgreSQL: Vercel Marketplace의 별도 PostgreSQL 리소스. 첫 후보는 Neon native integration이며 실제 리소스 생성·요금제·리전 선택은 운영 승인 단계에서 한다.
- 로컬/통합/E2E: **Testcontainers for Node.js의 실제 PostgreSQL 컨테이너**. 운영 DB와 PostgreSQL 메이저 버전을 맞추고 실행마다 새 DB를 만든다.
- 단위 테스트: DB가 없는 repository fake를 계속 사용한다. DB 계약 검증만 Testcontainer를 사용한다.

Drizzle은 TypeScript 스키마를 변경 원본으로 삼고 SQL migration을 생성·적용할 수 있다. 공식 문서는 `generate`가 스키마 차이를 SQL과 snapshot으로 만들고, `migrate`가 적용 이력을 DB에 기록한다고 설명한다. [Drizzle schema](https://orm.drizzle.team/docs/sql-schema-declaration), [Drizzle generate](https://orm.drizzle.team/docs/drizzle-kit-generate), [Drizzle migrate](https://orm.drizzle.team/docs/drizzle-kit-migrate)

Testcontainers의 PostgreSQL 모듈은 테스트 프로세스가 실제 PostgreSQL 컨테이너를 만들고 host, port, database, user, password를 런타임에 전달하는 방식을 공식 지원한다. [Testcontainers PostgreSQL](https://node.testcontainers.org/modules/postgresql/)

## 2. 선택지 비교

### 2.1 ORM과 migration

| 선택지 | 장점 | 이 프로젝트의 위험 | 판정 |
|---|---|---|---|
| Drizzle 안정 채널 + Drizzle Kit | Postgres 스키마를 TypeScript로 모듈별 선언, 생성 SQL을 사람이 검토 가능, `pg`와 직접 결합, repository 구현이 SQL 의미를 숨기지 않음 | 1.0 계열이 조사 시점에 pre-release이므로 무심코 `@rc`를 설치하면 변동성이 커짐 | **채택**. 안정 채널만 정확히 고정 |
| Prisma 8 + 새 migration workflow | 선언형 contract, offline migration plan, pre/post-check가 포함된 새 migration 모델 | 2026년 전환기에 CLI·contract·migration 방식과 런타임 요구가 크게 바뀌는 중이며 V1과 같은 이름이라도 새 도구 체계임 | 보류. S01/S02 도중 도구 전환 위험을 감수하지 않음 |
| Kysely + Kysely Migrator | 안정적인 type-safe SQL builder, migration 파일이 현재 앱 코드에 의존하지 않는 명시적 방식, DB lock 지원 | 선언형 스키마와 query type을 한 도구에서 함께 생성하지 않아 79개 V1 모델을 단계적으로 재설계할 때 수동 동기화 부담이 큼 | 보류. 특수 SQL이 필요한 repository의 참고 대안 |

Prisma 8 공식 문서는 migration planning이 DB 연결 없이 contract 차이를 파일로 만들고 `db migrate`가 적용한다고 설명한다. 기능은 매력적이지만 S01/S02에서 신규 migration 체계까지 동시에 도입하지 않는다. [Prisma 8 migration plan](https://docs.prisma.io/docs/cli/migration-plan), [Prisma 8 migrations](https://docs.prisma.io/docs/orm/migrations/how-migrations-work)

Kysely 공식 문서는 migration을 앱의 현재 코드와 독립된 “frozen in time” 파일로 유지하고 DB-level lock으로 직렬 적용한다고 설명한다. 이 원칙은 Drizzle migration 검토 규칙에도 그대로 적용한다. [Kysely migrations](https://www.kysely.dev/docs/migrations)

### 2.2 로컬/E2E PostgreSQL

| 선택지 | 장점 | 한계 | 판정 |
|---|---|---|---|
| Testcontainers PostgreSQL | 실제 Postgres protocol, 제약·transaction·index·`pg` pooling 동작까지 운영과 동일한 계열로 검증, 테스트별 폐기 가능 | Docker 필요, 기동 시간이 있음 | **통합/E2E 표준으로 채택** |
| PGlite in-memory | Docker 없이 빠르고 Drizzle 연결 지원 | WASM/embedded driver라 네트워크·pool·provider 동작이 다름 | 빠른 repository 실험에는 선택 사용 가능, 릴리스 판정 근거로 사용하지 않음 |
| 장기 실행 Docker Compose DB | 수동 개발 중 재사용이 쉬움 | 상태 누적, 테스트 간 간섭, 병렬 실행 충돌 | 수동 개발 보조만 허용, CI/E2E 표준 아님 |

PGlite는 in-memory 또는 파일 기반 WASM Postgres이므로 빠른 테스트에는 유용하지만 `pg`를 사용하는 Vercel 런타임과 동일한 연결 계층은 아니다. [Drizzle PGlite](https://orm.drizzle.team/docs/connect-pglite)

## 3. 데이터 경계

### 3.1 코드 경계

데이터 호출 방향은 ADR-0001을 따른다.

```text
page / route / server action
  → application service + 권한 정책
    → repository interface
      → Drizzle repository
        → platform DB transaction / pg driver
```

- 페이지, Route Handler, Server Action, middleware/proxy는 Drizzle·`pg`를 직접 import하지 않는다.
- `src/platform/db`만 연결 문자열과 DB client를 안다.
- 인증 모듈은 플레이어 테이블의 내부 구현을 알지 않고 UUID 계약만 사용한다.
- 플레이어 모듈은 세션 토큰을 해석하지 않고 application service가 전달한 actor/permission만 받는다.
- 관리자 mutation은 도메인 변경과 audit event 기록을 **같은 DB transaction**에서 완료한다.
- UI에서 버튼을 숨기는 것은 권한 검사가 아니다. 조회와 mutation 모두 application service에서 현재 계정 상태·역할을 다시 확인한다.
- V1 Prisma 스키마는 필드 의미와 기능 계약의 근거일 뿐이다. 모델명, relation, ID 전략, nullable 규칙을 복사하지 않는다.

### 3.2 PostgreSQL namespace

초기 migration에서 다음 schema를 만든다.

| PostgreSQL schema | 소유 데이터 |
|---|---|
| `auth` | 계정, 관리자 TOTP, 세션 |
| `registry` | 플레이어 등록부 |
| `audit` | 보안·관리 mutation 감사 이벤트 |
| `drizzle` | migration 적용 이력 |

테이블을 기능별 TypeScript 파일로 나누되 Drizzle Kit가 읽는 단일 export index에서 모두 내보낸다. 애플리케이션 SQL은 schema-qualified 테이블을 사용하고 임의 `search_path`에 의존하지 않는다.

### 3.3 데이터 최소화와 삭제

- public DTO에는 `member_name`, `password_hash`, TOTP 관련 값, 세션, 계정 상태 변경 이력을 절대 포함하지 않는다.
- 운영에서는 계정·플레이어를 일반 CRUD로 hard delete하지 않는다. `deleted_at` 또는 상태 변경, 세션 폐기, audit event를 사용한다.
- 실제 개인정보 삭제·익명화 정책은 S01 완료 전 별도 보존정책 ADR로 확정한다.
- hard delete와 schema reset은 이름이 `klol_v2_test_`로 시작하는 일회성 테스트 DB에서만 허용한다.

## 4. S01/S02 최소 스키마

아래는 구현을 시작할 수 있는 최소 계약이다. SQL 자료형과 constraint 이름은 첫 migration 리뷰에서 확정하되 의미를 축소하지 않는다.

### 4.1 enum

| enum | 값 |
|---|---|
| `auth.user_role` | `USER`, `ADMIN`, `SUPER_ADMIN` |
| `auth.account_status` | `PENDING`, `APPROVED`, `REJECTED`, `SUSPENDED` |
| `auth.session_kind` | `USER`, `E2E_FIXTURE` |
| `registry.player_status` | `ACTIVE`, `INACTIVE` |

### 4.2 `auth.user_accounts`

| column | 계약 |
|---|---|
| `id uuid PK` | 애플리케이션이 cryptographic random UUID를 생성 |
| `login_id text NOT NULL` | 사용자가 입력한 식별자, 길이 제한 적용 |
| `login_id_normalized text UNIQUE NOT NULL` | trim + Unicode normalization + 소문자화 결과. 중복 판정은 이 값만 사용 |
| `password_hash text NOT NULL` | algorithm/cost가 포함된 PHC 형식. 평문·복호화 가능 암호 금지 |
| `role auth.user_role NOT NULL DEFAULT USER` | 현재 권한의 단일 원본 |
| `status auth.account_status NOT NULL DEFAULT PENDING` | DB 기본값은 fail-closed다. 가입 transaction은 새 Riot ID와 신규 플레이어를 함께 만드는 USER만 `APPROVED`로 명시하며, 기존 플레이어 claim은 `PENDING`을 유지한다. `APPROVED`만 일반 사용자 기능 사용 가능 |
| `auth_version integer NOT NULL DEFAULT 0` | 0 이상. 전체 세션 폐기의 monotonic counter |
| `terms_accepted_at`, `privacy_accepted_at timestamptz NULL` | 동의 시점. boolean으로 대체하지 않음 |
| `created_at`, `updated_at timestamptz NOT NULL` | DB UTC 시각 |
| `deleted_at timestamptz NULL` | soft delete. 값이 있으면 인증 불가 |

필수 index는 `login_id_normalized UNIQUE`, `(status, role)`, `deleted_at`이다. 승인·거절·역할 변경·복구·비밀번호 재설정은 audit event와 함께 transaction으로 처리한다.

### 4.3 `auth.admin_totp_credentials`

| column | 계약 |
|---|---|
| `user_account_id uuid PK/FK` | `auth.user_accounts.id`; ADMIN/SUPER_ADMIN만 application policy로 허용 |
| `secret_ciphertext bytea NOT NULL` | AES-256-GCM ciphertext |
| `secret_iv bytea NOT NULL` | 매 암호화마다 새 12-byte random IV |
| `secret_auth_tag bytea NOT NULL` | 16-byte authentication tag |
| `key_version integer NOT NULL` | 복호화할 환경 키의 ID. 키 자체는 DB에 저장하지 않음 |
| `enabled_at timestamptz NULL` | NULL이면 등록 중, 값이 있으면 활성 |
| `last_used_step bigint NULL` | 같은 TOTP time-step 재사용 방지 |
| `created_at`, `updated_at timestamptz NOT NULL` | 감사 가능한 갱신 시각 |

IV와 tag 길이는 DB `CHECK`로도 검증한다. TOTP secret, otpauth URI, 복호화 결과는 로그·audit JSON·오류 응답·trace에 넣지 않는다.

### 4.4 `auth.sessions`

| column | 계약 |
|---|---|
| `id uuid PK` | 서명 토큰의 `jti` |
| `user_account_id uuid FK NOT NULL` | 계정 소유자 |
| `auth_version integer NOT NULL` | 발급 시점 snapshot |
| `role auth.user_role NOT NULL` | 발급 시점 snapshot; 요청 시 현재 DB 역할과도 대조 |
| `totp_verified_at timestamptz NULL` | 관리자 세션의 2FA 통과 근거 |
| `kind auth.session_kind NOT NULL DEFAULT USER` | 운영 세션과 로컬 E2E 세션 구분 |
| `fixture_id text NULL` | `E2E_FIXTURE`에서만 필수. production runtime은 해당 kind를 거부 |
| `issued_at`, `expires_at timestamptz NOT NULL` | 최대 30분 세션의 발급·만료 |
| `revoked_at timestamptz NULL` | 로그아웃·보안 변경에 의한 명시적 철회 |

필수 index는 `(user_account_id, revoked_at)`, `expires_at`이다. `kind = E2E_FIXTURE`와 `fixture_id`의 동반 여부를 `CHECK`로 강제한다. 만료 세션은 정기 cleanup 대상이지만 인증 판정은 cleanup 여부와 무관하게 `expires_at`을 직접 확인한다.

### 4.5 `registry.players`

| column | 계약 |
|---|---|
| `id uuid PK` | 애플리케이션 생성 UUID |
| `user_account_id uuid UNIQUE NULL FK` | 계정과 0..1 연결. 계정 soft delete 시 플레이어 기록은 유지 |
| `member_name text NOT NULL` | 운영자용 실명/회원명. public DTO 제외 |
| `member_name_normalized text NOT NULL` | 검색·중복 점검용 정규화 값 |
| `nickname text NOT NULL` | 공개 표시 이름 |
| `nickname_normalized text NOT NULL` | 검색·중복 판정용 정규화 값 |
| `tag_line text NOT NULL` | Riot 표기 tag와 같은 도메인 의미, 길이·허용문자 검증 |
| `tag_line_normalized text NOT NULL` | 대소문자·공백 차이 없는 중복 판정 |
| `peak_tier`, `current_tier text NULL` | S02 표시용 snapshot. Riot 연동 원본은 S12에서 별도 모델로 추가 |
| `status registry.player_status NOT NULL DEFAULT ACTIVE` | 목록 포함 여부의 명시적 상태 |
| `deactivated_at timestamptz NULL` | INACTIVE 전환 시각 |
| `revision bigint NOT NULL DEFAULT 0` | 관리자 동시 수정의 optimistic concurrency token |
| `created_at`, `updated_at timestamptz NOT NULL` | 생성·수정 시각 |

필수 constraint/index는 `(nickname_normalized, tag_line_normalized) UNIQUE`, `user_account_id UNIQUE`, `(status, updated_at)`, `nickname_normalized`, `member_name_normalized`다. 초기 검색은 exact/prefix 계약으로 시작한다. substring/fuzzy 검색이 실제 데이터 성능 기준을 넘을 때만 별도 migration으로 `pg_trgm`을 도입한다.

### 4.6 `audit.events`

| column | 계약 |
|---|---|
| `id bigint GENERATED ALWAYS AS IDENTITY PK` | append-only 순번 |
| `request_id uuid NOT NULL` | 한 요청의 DB 변경을 연결 |
| `actor_user_account_id uuid NULL FK` | 시스템 작업이면 NULL |
| `action text NOT NULL` | 예: `ACCOUNT_APPROVED`, `ADMIN_TOTP_ENABLED`, `PLAYER_UPDATED` |
| `target_type text NOT NULL`, `target_id text NOT NULL` | 대상 식별 |
| `before_json jsonb NULL`, `after_json jsonb NULL` | 허용 목록으로 정제한 변경 전후 값 |
| `metadata_json jsonb NULL` | 비밀정보가 없는 요청/결과 보조 정보 |
| `created_at timestamptz NOT NULL` | 생성 시각 |

`password_hash`, TOTP ciphertext/IV/tag, cookie/token, 복구코드, DB URL은 before/after/metadata의 허용 목록에 들어갈 수 없다. 앱 DB 역할은 이 테이블에 INSERT만 허용하고 UPDATE/DELETE는 허용하지 않는 방향으로 production grant를 분리한다.

## 5. 세션, `authVersion`, TOTP

### 5.1 세션 판정

브라우저 cookie에는 ADR-0002의 최소 claim(`sub`, `role`, `fixtureId`, `authVersion`, `iat`, `exp`)에 `jti`, issuer, audience를 더한 짧은 서명 토큰만 저장한다. cookie는 `HttpOnly`, `SameSite=Strict`, `Path=/`, HTTPS에서 `Secure`, 최대 30분을 유지한다.

각 보호 요청은 다음 순서로 판정한다.

1. 서명, 허용 algorithm, issuer, audience, `iat`/`exp`를 검증한다.
2. `jti`로 session row를 조회하고 `revoked_at IS NULL`, `expires_at > now()`를 확인한다.
3. 계정 row의 `deleted_at IS NULL`, `status = APPROVED`를 확인한다.
4. token/session/account의 `auth_version`과 role이 모두 일치하는지 확인한다.
5. 관리자 경로는 현재 role과 `totp_verified_at`을 추가 확인한다.
6. 페이지 허용 여부와 별개로 application service가 대상별 ADMIN/SUPER_ADMIN 정책을 다시 적용한다.

비밀번호·역할·승인 상태·TOTP 활성/비활성/재설정처럼 보안 경계를 바꾸는 transaction은 `auth_version = auth_version + 1`과 기존 session revoke를 함께 수행한다. 증가는 절대 되돌리지 않는다.

### 5.2 TOTP envelope encryption

TOTP secret은 검증을 위해 복호화가 필요하므로 password처럼 hash할 수 없다. 다음 envelope 규칙을 적용한다.

- algorithm: AES-256-GCM
- data key: `TOTP_ENCRYPTION_KEY_<version>` 환경 변수의 32-byte key
- nonce: 매 암호화마다 cryptographic random 12-byte IV
- authentication tag: 16 bytes
- AAD: `klol-v2:totp:<userAccountId>:<keyVersion>`
- key separation: session signing key, password pepper가 있다면 그 key, TOTP encryption key를 서로 재사용하지 않음
- key ring: 현재 쓰기 key와 복호화 가능한 이전 key를 함께 제공; 키 ID만 DB 저장
- rotation: 정상 TOTP 검증 또는 별도 maintenance에서 이전 keyVersion row를 현재 key로 재암호화. 전체 완료와 복구 검증 전 이전 key 폐기 금지

Node.js 구현은 인증 tag를 지원하는 authenticated encryption API를 사용한다. 오류는 “인증 실패” 하나로 수렴하고 ciphertext·key ID 이외의 비밀값을 출력하지 않는다. [Node.js Crypto](https://nodejs.org/api/crypto.html)

같은 TOTP code 재사용 방지는 검증과 `last_used_step` 갱신을 하나의 transaction에서 처리한다. `last_used_step IS NULL OR last_used_step < candidate_step` 조건부 UPDATE가 1행일 때만 성공으로 판정한다. 활성화·비활성화·관리자 reset은 `auth_version` 증가, session revoke, audit event를 같은 transaction에 포함한다.

## 6. migration 정책

### 6.1 저장소 구조

```text
src/platform/db/
├─ schema/
│  ├─ auth.ts
│  ├─ registry.ts
│  ├─ audit.ts
│  └─ index.ts
├─ client.ts
└─ transaction.ts
drizzle/
└─ <versioned migration SQL + metadata>
```

실제 파일 생성은 S01 구현에서 한다. 이 ADR은 위치와 책임만 고정한다.

### 6.2 변경 흐름

1. schema와 domain invariant를 함께 변경한다.
2. 안정 채널의 고정된 Drizzle Kit로 이름 있는 migration을 생성한다.
3. 생성 SQL을 직접 검토한다. rename이 drop/add로 바뀌지 않았는지, lock 범위·default·NULL backfill·index build가 안전한지 확인한다.
4. migration 파일은 생성 당시 코드에서 독립된 불변 이력으로 취급한다. 이미 main에 merge되었거나 어떤 공유 DB에 적용된 파일은 수정하지 않고 새 forward migration을 만든다.
5. 빈 Testcontainer에 전체 migration을 처음부터 적용하고 seed·repository·E2E를 실행한다.
6. 최소 한 단계 이전 schema/data fixture에도 새 migration을 적용해 upgrade path를 검증한다.
7. schema 변경, migration, 테스트를 같은 commit에 넣는다.

`drizzle-kit push`는 review 가능한 migration 이력을 우회하므로 공유 개발, Preview, Production에서 금지한다. 일회성 개인 scratch DB에서도 기본 경로로 사용하지 않는다.

### 6.3 Preview/Production 적용

- Next build, Vercel Function 시작, 사용자 요청 처리 중에는 migration을 실행하지 않는다.
- migration은 environment lock이 있는 단일 CI/운영 job이 `DATABASE_MIGRATION_URL`로 먼저 실행한다.
- job은 적용 전 migration 목록과 checksum을 기록하고, 성공 후 앱 배포를 허용한다.
- destructive 변경은 `expand → backfill → read/write 전환 → contract`의 여러 배포로 나눈다.
- schema와 이전 앱 버전이 동시에 동작할 수 없는 migration은 Production에 적용하지 않는다.
- 데이터 손실 가능 변경 전에는 backup 식별자와 복구 리허설 근거가 있어야 한다.

## 7. seed 정책

seed는 migration과 분리한다.

| seed | 대상 | 규칙 |
|---|---|---|
| `dev` | 개인 로컬 DB | 합성 한국어 플레이어와 일반/관리자 상태를 생성. 운영 데이터 복사 금지 |
| `e2e` | 매 실행의 Testcontainer | 고정 UUID와 상태 조합을 사용하되 password와 TOTP secret은 실행 시 난수 생성해 메모리로 test harness에만 전달 |
| `production` | 없음 | 자동 SUPER_ADMIN, 기본 비밀번호, 고정 TOTP를 만들지 않음 |

- fixture는 `empty`, `minimal`, `conflict`, `forbidden`, `inactive` dataset을 명시적으로 선택한다.
- seed는 secret·평문 password·otpauth URI를 stdout, trace, snapshot, artifact에 출력하지 않는다.
- 최초 Production SUPER_ADMIN bootstrap은 별도의 일회성 운영 명령과 감사 절차로 설계하고 S01 보안 검토를 통과한 뒤에만 실행한다.
- dev seed 갱신은 upsert 기반으로 제한한다. 기존 로컬 데이터를 자동 삭제하거나 reset하지 않는다.

## 8. 테스트 DB 수명주기

통합/E2E job의 표준 흐름은 다음과 같다.

```text
test process 시작
  → production과 같은 major의 고정 PostgreSQL image로 container 생성
  → random host port + klol_v2_test_<run-id> DB 준비
  → container가 제공한 URL을 현재 test child process에만 주입
  → 전체 migration을 0부터 적용
  → 선택한 합성 seed 적용
  → repository contract test
  → Next test server 기동
  → 실제 login/TOTP/session + 관리자/플레이어 E2E
  → connection 종료
  → finally에서 container/volume/network 폐기
```

안전 guard는 다음 네 조건을 모두 검사한다.

1. `NODE_ENV === "test"`
2. DB hostname이 loopback 또는 현재 Testcontainer가 발급한 host와 일치
3. database 이름이 `klol_v2_test_` prefix
4. `V2_TEST_AUTH_ENABLED === "true"`

하나라도 실패하면 seed/reset/fixture session 발급을 즉시 거부한다. E2E는 Vercel 환경 변수를 pull하지 않고, `.env`를 쓰지 않으며, 운영 URL을 fallback하지 않는다. Docker가 없으면 DB/E2E suite는 조용히 통과시키지 말고 실행 전제 실패로 명확히 종료한다. 단위 테스트는 독립적으로 계속 실행할 수 있다.

컨테이너 image의 `latest` tag는 금지한다. Production provider의 PostgreSQL major가 확정되면 같은 major의 patch tag 또는 digest를 CI와 로컬 설정에 고정하고 정기 업그레이드 PR에서만 변경한다.

## 9. backup과 restore

### 9.1 원칙

1. provider의 PITR/자동 backup을 주 복구 수단으로 사용하되 선택한 요금제의 실제 보존기간과 RPO/RTO를 운영 전 확인한다.
2. 별도 logical export는 migration 전 snapshot과 이관·감사용 보조 수단으로 사용한다.
3. PostgreSQL 공식 문서도 `pg_dump`가 일관된 단일 DB export를 만들지만 일반적인 정기 production backup의 유일한 수단으로는 적합하지 않다고 명시한다. [PostgreSQL `pg_dump`](https://www.postgresql.org/docs/current/app-pgdump.html)
4. logical backup은 `pg_dump -Fc` custom archive, checksum, 생성 DB version, migration head, 생성 시각을 함께 기록한다. custom format은 `pg_restore`로 선택·재정렬 복구할 수 있다. [PostgreSQL `pg_restore`](https://www.postgresql.org/docs/current/app-pgrestore.html)
5. backup 파일은 DB와 다른 보안 경계의 암호화 저장소에 두고 최소 권한·보존기간·삭제 정책을 적용한다.

### 9.2 TOTP와 key backup

DB backup에는 암호화된 TOTP secret만 들어 있다. 해당 ciphertext를 복구하려면 당시 `key_version`의 encryption key가 필요하므로 key backup/escrow는 DB archive와 **분리된** 비밀 저장소에 둔다. 키 복구가 확인되지 않은 상태에서 이전 key를 폐기하지 않는다.

### 9.3 복구 훈련

- Production dump를 개발자 PC나 일반 E2E에 복원하지 않는다.
- 운영 전 1회, 이후 정기적으로 격리된 restore DB에서 archive 복원 → migration 상태 확인 → row count/unique/FK 검사 → S01 로그인/TOTP → S02 검색/CRUD smoke를 실행한다.
- restore evidence에는 backup 식별자, checksum, 시작/종료 시각, 실제 RPO/RTO, 검증 결과를 남기되 사용자 데이터나 secret은 남기지 않는다.
- 복구가 실제로 성공한 근거가 없으면 “backup 완료”가 아니라 “archive 생성됨”으로만 보고한다.

## 10. Vercel 연결

Vercel의 자체 Vercel Postgres 상품은 종료되었고 신규 프로젝트는 Marketplace의 외부 Postgres integration을 사용해야 한다. Vercel 문서는 integration이 자격 증명과 환경 변수를 프로젝트에 주입한다고 설명한다. [Postgres on Vercel](https://vercel.com/docs/postgres)

### 10.1 리소스 분리

- V1 Vercel project, DB, Blob, 환경 변수와 V2를 공유하지 않는다.
- Production, Preview, Local에 서로 다른 DB와 key ring을 사용한다.
- Neon을 선택하면 Production branch와 Preview branch DB를 분리한다. Preview에 Production 데이터를 자동 복제하지 않고 합성 seed만 사용한다. Neon Vercel integration은 preview deployment별 DB branch 구성을 지원한다. [Neon on Vercel Marketplace](https://vercel.com/marketplace/neon)
- 리전은 Vercel Function과 DB 왕복 지연, 데이터 보관 요구를 확인한 뒤 같은 권역을 우선한다.

Vercel은 Production, Preview, Development 환경별로 서로 다른 변수를 설정할 수 있다. [Vercel environments](https://vercel.com/docs/deployments/environments), [Vercel environment variables](https://vercel.com/docs/environment-variables)

### 10.2 환경 변수 계약

| 변수 | 사용 위치 | 규칙 |
|---|---|---|
| `DATABASE_URL` | 앱 Node runtime | pooled runtime URL. server-only |
| `DATABASE_MIGRATION_URL` | 단일 migration/backup job | direct 또는 provider 권장 migration URL. 앱 runtime에 주입하지 않음 |
| `SESSION_SIGNING_KEYS` | 인증 platform | versioned signing key ring. server-only |
| `TOTP_ENCRYPTION_KEYS` | 인증 platform | versioned AES key ring. server-only |
| `V2_TEST_AUTH_ENABLED` | 로컬/E2E | Production에는 설정하지 않거나 `false` |

어떤 비밀 변수에도 `NEXT_PUBLIC_` prefix를 붙이지 않는다. URL·key를 build output, error message, analytics, audit JSON에 기록하지 않는다.

### 10.3 연결 방식

- DB 접근 Route Handler/Server Action은 Node.js runtime을 사용한다. Edge에서 DB transaction을 열지 않는다.
- Drizzle의 `node-postgres` adapter와 bounded `pg.Pool`을 모듈당 한 번 구성한다.
- Vercel에서는 provider의 pooled URL을 사용하고 connection timeout, statement timeout, pool 상한을 명시한다.
- migration/backup은 pooled runtime URL이 아니라 provider가 권장하는 direct URL을 사용한다.
- Neon을 최종 선택하더라도 로컬/E2E는 같은 `pg` adapter로 실제 PostgreSQL 컨테이너에 연결한다. Neon 전용 HTTP/WebSocket driver로 환경별 코드를 분기하지 않는다.

Neon은 serverless 환경에서 pooled connection string을 사용하도록 안내하며, Drizzle은 Neon에서 HTTP·WebSocket·node-postgres 연결을 지원한다. 이번 결정은 interactive transaction과 로컬 parity 때문에 node-postgres를 사용한다. [Neon connection pooling](https://neon.com/docs/connect/connection-pooling), [Drizzle with Neon](https://orm.drizzle.team/docs/connect-neon)

## 11. 전환 조건

### 11.1 이 ADR을 구현으로 전환하는 조건

S01 코드 작성 전 다음 spike가 모두 통과해야 한다.

- 안정 채널 Drizzle/Kit/`pg`/Testcontainers 정확한 버전이 lockfile에 고정됨
- 지원 Node.js 버전과 Vercel Node runtime 조합이 공식 지원 범위임
- 동일 schema가 Windows 로컬과 CI Testcontainer에서 0부터 migration 됨
- transaction rollback, unique/FK/check constraint, `auth_version` session 무효화, TOTP replay 방지가 실제 PostgreSQL에서 검증됨
- 최소 20회 반복 E2E에서 container/connection/volume 누수가 없음
- 선택한 Vercel Marketplace provider의 Preview/Production 환경 분리가 비운영 합성 데이터로 검증됨

하나라도 실패하면 provider/driver/도구 선택을 ADR 개정으로 다시 평가한다. 실패를 숨기기 위한 SQLite/PGlite fallback은 허용하지 않는다.

### 11.2 S01 완료 조건

- USER/ADMIN/SUPER_ADMIN, PENDING/APPROVED/REJECTED/SUSPENDED 조합의 로그인·거부가 권한 매트릭스와 일치
- 실제 TOTP 등록 → enable → 재로그인 → 재사용 거부 → disable/reset 흐름 통과
- 비밀번호·역할·상태·TOTP 변경 후 기존 session이 모두 무효
- production build에서 fixture session 발급 경로가 404이며 E2E secret이 없어도 fail-closed
- TOTP plaintext, token, password, DB URL이 로그·trace·audit·client bundle에서 0건
- 모든 민감 mutation이 audit event와 원자적으로 저장됨

### 11.3 S02 완료 조건

- 플레이어 검색/목록/상세/생성/수정/비활성화의 ready·empty·conflict·404·403·error 상태 통과
- `(nickname_normalized, tag_line_normalized)` 중복과 계정 1:1 연결 충돌이 DB와 application 양쪽에서 일관된 오류로 반환
- `revision` 기반 동시 수정 충돌이 마지막 저장 승리로 덮어쓰이지 않음
- public 응답에서 `member_name`과 계정 비공개 필드가 0건
- ADMIN/SUPER_ADMIN 대상별 정책과 직접 API 403 회귀 통과
- 검색 query plan과 응답시간 기준을 합성 대량 데이터에서 기록

### 11.4 V1 → V2 production 전환 조건

S01/S02 완료만으로 Vercel production을 V2로 바꾸지 않는다. 전환은 S14에서 아래가 모두 충족될 때만 한다.

1. V1 79개 모델 전체가 이관·재계산·통합·폐기 중 하나로 분류됨
2. 계정/플레이어 V1 read-only export → V2 staging import → row/unique/relation/상태 reconciliation 100% 통과
3. migration과 import를 빈 DB와 production 크기 rehearsal DB에서 반복 성공
4. provider PITR와 별도 archive의 실제 restore drill 통과
5. V2 전체 사용자·관리자 기능 동등성, 권한, 접근성, 성능, 모바일 QA 통과
6. cutover window, V1 read-only 전환, DNS/alias 전환, rollback 시점과 담당자가 기록됨
7. 전환 직전 backup ID·migration head·앱 commit SHA·환경 설정 검증 증거가 남음
8. V2 검증 실패 시 V1 blue-black production으로 되돌리는 절차가 리허설됨

그 전까지 V1은 운영 source of truth이고 V2 DB에는 운영 이중 쓰기를 하지 않는다.

## 12. 후속 구현 순서

1. S01-DB1: 고정 버전과 Testcontainer migration smoke
2. S01-DB2: `auth.user_accounts`, session, audit schema + repository
3. S01-DB3: password/session/`authVersion` 상태 전이
4. S01-DB4: TOTP envelope encryption·replay 방지·key rotation seam
5. S01-DB5: 역할별 실제 로그인 E2E와 production fixture fail-closed
6. S02-DB1: `registry.players` schema + 검색 read model
7. S02-DB2: 관리자 CRUD·optimistic concurrency·audit
8. S02-DB3: 대량 합성 데이터 query plan과 index 조정

각 단계는 migration, repository contract test, 권한 E2E, 운영 비반영 상태 보고를 한 묶음으로 완료한다.

## 13. 조사한 공식 1차 문서

- [Drizzle schema](https://orm.drizzle.team/docs/sql-schema-declaration)
- [Drizzle migration fundamentals](https://orm.drizzle.team/docs/migrations)
- [Drizzle Kit generate](https://orm.drizzle.team/docs/drizzle-kit-generate)
- [Drizzle Kit migrate](https://orm.drizzle.team/docs/drizzle-kit-migrate)
- [Drizzle with Neon](https://orm.drizzle.team/docs/connect-neon)
- [Prisma 8 migration plan](https://docs.prisma.io/docs/cli/migration-plan)
- [Prisma 8 migration lifecycle](https://docs.prisma.io/docs/orm/migrations/how-migrations-work)
- [Kysely migrations](https://www.kysely.dev/docs/migrations)
- [Testcontainers PostgreSQL](https://node.testcontainers.org/modules/postgresql/)
- [Vercel Postgres](https://vercel.com/docs/postgres)
- [Vercel environments](https://vercel.com/docs/deployments/environments)
- [Neon connection pooling](https://neon.com/docs/connect/connection-pooling)
- [PostgreSQL 18 `pg_dump`](https://www.postgresql.org/docs/current/app-pgdump.html)
- [PostgreSQL 18 `pg_restore`](https://www.postgresql.org/docs/current/app-pgrestore.html)
- [Node.js Crypto](https://nodejs.org/api/crypto.html)

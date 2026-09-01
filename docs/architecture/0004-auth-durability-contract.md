# ADR-0004: 인증 영속성 출시 게이트

- 상태: 채택
- 기준일: 2026-09-01
- 선행 결정: ADR-0002, ADR-0003

## 결정

운영 인증의 source는 `database` 하나다. 테스트 fixture가 신원을 만드는 경우에도 발급된 계정·TOTP·세션·rate-limit 상태는 격리 PostgreSQL의 같은 repository 계약을 통과한다. 메모리 fallback, 고정 관리자 cookie, 환경 변수만으로 성립하는 운영 세션은 허용하지 않는다.

`PostgresAuthRepository.source`는 literal `"database"`이며 다음 durable 계약을 제공한다.

- ID 또는 정규화 login ID로 현재 account의 role, status, `authVersion`, 삭제 상태를 조회한다.
- browser에는 raw bearer를 주더라도 DB에는 session `jti`와 32-byte SHA-256 token hash만 저장한다. raw token은 저장·로그하지 않는다.
- session은 서명 claim의 `jti`와 raw bearer의 hash를 함께 조회하고 expiry, `revokedAt`, 현재 account status/role/`authVersion`을 매번 대조한다.
- `token_hash`가 없던 초기 migration 상태에서 전진할 때 기존 session은 전부 revoke하고 UUID 기반 32-byte 전환 값으로 채운다. 과거 hash 없는 session을 유지하지 않는다.
- TOTP secret은 ciphertext, 12-byte nonce, 16-byte auth tag, key version으로만 저장한다.
- TOTP step 소비는 조건부 UPDATE 한 문장으로 수행해 같은 step 또는 더 오래된 step의 재사용을 원자적으로 거부한다.
- login rate-limit은 login ID hash, IP hash, global key hash 세 scope의 32-byte digest만 저장한다. raw login ID와 raw IP 컬럼은 존재하지 않는다.
- rate-limit counter는 `(scope, key_hash, window_started_at)` unique key에 대한 atomic upsert로 증가하므로 여러 Vercel instance가 같은 DB 상태를 공유한다.
- 만료 session과 rate-limit bucket cleanup은 transaction 하나로 처리한다.

## 호출 측 의무

- session token과 rate-limit key는 서로 다른 domain prefix를 붙인 뒤 SHA-256 한다.
- IP hash는 회전 가능한 server-side pepper/HMAC 정책을 S01 보안 구현에서 확정한다. 단순 IP SHA-256은 낮은 entropy 때문에 금지한다.
- login ID hash 역시 raw 정규화 값이 아니라 server-side pepper/HMAC 입력이어야 한다.
- repository에 전달하는 hash는 정확히 32 bytes여야 하며 그렇지 않으면 DB 호출 전에 거부한다.
- 성공 로그인 시 어떤 bucket을 완화/삭제할지는 별도 로그인 정책이 결정한다. repository는 호출자가 명시하지 않은 데이터를 임의 삭제하지 않는다.

## 격리 검증

DB 계약 테스트는 `NODE_ENV=test`, `V2_DB_TEST_MODE=true`, loopback host, `klol_v2_test_` DB 이름의 네 guard가 모두 맞을 때만 실행한다. 로컬에서는 workspace 아래 일회성 PostgreSQL 18 cluster를 만들고 종료 검증 후 해당 경로만 삭제한다. CI에서는 같은 guard를 통과하는 PostgreSQL service만 사용한다.

## 출시 차단 조건

아래 중 하나라도 남으면 운영 DB 인증 전환을 금지한다.

- application login/logout/TOTP route가 `PostgresAuthRepository` 대신 fixture 또는 메모리 저장소를 사용
- raw session token, login ID, IP가 session/rate-limit 테이블이나 로그에 기록됨
- account role/status/`authVersion` 변경 후 기존 session 조회가 성공함
- 같은 TOTP step의 동시 소비 중 둘 이상이 성공함
- 병렬 login attempt가 누락되어 DB counter보다 적게 기록됨
- cleanup job이 production guard와 audit/관측 계약 없이 실행됨
- 암호화 key ring과 HMAC pepper가 Vercel 환경별로 분리되지 않음

## 2026-09-01 구현 상태

현재 구현은 password 검증, cookie/JWS 발급, 고유 `jti`, domain-separated token hash, 매 요청 DB 재검증, logout revoke, AES-256-GCM TOTP 복호화, HMAC-peppered 영속 rate-limit을 실제 login/logout/session Route Handler에 연결했다. 격리 PostgreSQL 18에서 token 변조, revoke, expiry, `authVersion`·role·status 변경 무효화와 HTTP cookie 흐름을 검증한다.

다음 항목은 여전히 S01 출시 게이트다.

- 비운영 메모리 fixture를 격리 PostgreSQL fixture로 이전
- TOTP 등록 → 확인 → enable, disable/reset, 이전 key 정상 재암호화와 rotation 완료 증거
- 비밀번호·역할·상태·TOTP 보안 mutation의 `authVersion` 증가, 전체 session revoke, audit event를 한 transaction으로 연결
- 운영 migration job, 만료 session/rate bucket cleanup scheduler, 관측·경보
- 최초 SUPER_ADMIN bootstrap과 복구 코드 정책
- 환경별 keyring/pepper 분리, backup/restore와 이전 key escrow 복구 훈련

따라서 현재 상태는 운영형 인증 내구성 경로가 코드와 격리 DB에서 검증된 것이며, S01 전체 또는 운영 배포 완료를 뜻하지 않는다.

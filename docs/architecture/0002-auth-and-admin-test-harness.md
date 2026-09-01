# ADR 0002: 인증과 관리자 테스트 하네스

상태: 승인

## 문제

관리자 페이지는 인증과 권한 검사를 유지한 채 모든 역할·상태를 반복 검수할 수 있어야 한다. 운영 인증을 해제하거나 관리자 경로를 공개하면 검수 편의보다 보안 위험이 커진다.

## 결정

운영 인증과 테스트 인증은 같은 세션 검증·권한 계층을 통과한다. 차이는 사용자 신원을 제공하는 어댑터뿐이다.

- 운영: V2 전용 사용자·세션 저장소와 관리자 TOTP를 사용한다.
- 로컬 E2E: 격리된 합성 계정 저장소가 운영과 같은 비밀번호·TOTP 검증 흐름에 신원을 제공한다.
- 페이지, Server Action, Route Handler는 모두 데이터 접근 계층에서 역할을 다시 확인한다.
- 레이아웃이나 숨겨진 버튼만으로 권한을 보호하지 않는다.

## 로컬 fixture 활성화 조건

아래 조건이 모두 참일 때만 합성 계정 저장소가 동작한다.

1. `NODE_ENV !== "production"`
2. `V2_TEST_AUTH_ENABLED === "true"`
3. `VERCEL`, `VERCEL_ENV`, `VERCEL_URL`이 모두 비어 있어 Vercel Production/Preview가 아님
4. `V2_PUBLIC_ORIGIN` 또는 `NEXT_PUBLIC_SITE_URL`의 hostname이 `localhost`, `127.0.0.1`, `::1` 중 하나
5. 32바이트 이상의 `V2_TEST_AUTH_SECRET`이 런타임 환경에 존재
6. `V2_TEST_AUTH_FIXTURES_JSON`에 실행 때 생성한 합성 계정만 존재

하나라도 만족하지 않으면 로그인 API는 인증 저장소 미연결 상태를 반환한다. 비밀값과 실제 운영 계정은 저장소·fixture·로그에 넣지 않는다. 테스트 전용 세션 발급 API, 고정 쿠키, 특별 헤더 우회는 만들지 않는다.

## 세션 계약

- 최소 claim: `sub`, 고유 UUID `jti`, `role`, `source`, `authVersion`, `adminTotpVerified`, `iat`, `exp`
- 역할: `USER`, `ADMIN`, `SUPER_ADMIN`
- 개인 식별 정보, 이메일, 전화번호, 비밀번호, TOTP 비밀은 토큰에 포함하지 않는다.
- 쿠키: `HttpOnly`, `SameSite=Strict`, `Path=/`, HTTPS에서 `Secure`, 최대 30분
- 서명·만료·허용 역할·`authVersion`을 서버에서 검증한다.
- `iat`가 반드시 존재해야 하고 `exp - iat`는 30분을 넘을 수 없다.
- 권한 부족은 API `403`, 세션 없음·무효는 API `401`, 페이지는 안전한 로그인 화면으로 이동한다.

## 요청 방어와 운영 연결 게이트

- 로그인·로그아웃 변경 요청은 `V2_PUBLIC_ORIGIN`(없으면 `NEXT_PUBLIC_SITE_URL`)과 정확히 같은 `Origin`만 허용한다.
- 로그인 본문은 스트림을 읽는 중 2 KiB를 넘는 즉시 중단한다.
- 로컬 단일 프로세스 검수에는 로그인 ID·클라이언트·전역 제한과 scrypt 동시 작업 제한을 적용한다.
- 운영 DB 인증을 활성화하기 전에는 다중 인스턴스가 공유하는 영속 rate-limit 저장소, 원자적 TOTP step 소비, 서버 세션 ID 폐기를 반드시 연결한다. 이 세 조건이 없으면 운영 인증 저장소는 출시 불가 상태다.
- TOTP secret은 최소 160 bit를 요구하며 운영 저장소에서는 평문으로 보관하지 않는다.

## 2026-09-01 내구성 통합 근거

- 운영형 세션 발급은 JWT 원문에 도메인 prefix를 붙여 SHA-256한 32-byte digest와 `jti`를 PostgreSQL에 함께 저장한다. 원문 token은 DB·로그에 저장하지 않는다.
- 보호 요청은 JWS claim만 신뢰하지 않고 매번 `jti + token hash`로 session을 조회한 뒤 현재 account의 status, role, `authVersion`, 삭제 상태와 다시 대조한다.
- 로그아웃은 cookie 삭제 전에 해당 `jti`를 PostgreSQL에서 revoke하며, DB 폐기에 실패한 경우 성공으로 응답하지 않는다.
- DB 폐기가 불가능한 503 응답에서는 재시도할 raw cookie를 지우지 않는다. 비운영 fixture도 프로세스 수명 동안 폐기된 `jti`를 기억해 이전 cookie replay를 거부한다.
- 운영형 로그인 제한은 raw login ID·IP 대신 서로 다른 domain과 32-byte server-side HMAC pepper로 만든 digest만 영속 bucket에 기록한다.
- 운영형 TOTP는 `TOTP_ENCRYPTION_KEYS` keyring과 account ID/key version AAD를 사용하는 AES-256-GCM envelope만 복호화한다.
- `DATABASE_URL`, `SESSION_SIGNING_KEYS`, `TOTP_ENCRYPTION_KEYS`, `V2_AUTH_RATE_LIMIT_PEPPER` 중 하나라도 없거나 형식이 틀리면 운영형 인증 context가 생성되지 않는다.
- 비운영 fixture는 기존 수동·브라우저 QA 호환을 위해 메모리에 남아 있지만 `NODE_ENV !== production`과 명시적 test 환경 변수 조건을 계속 모두 요구한다.
- fixture는 Vercel 관련 환경 신호가 하나라도 있거나 public origin이 loopback이 아니면 비운영 build에서도 활성화되지 않는다.
- session JWT decode는 JOSE parser 진입 전에 UTF-8 8 KiB 상한을 적용하고, production cookie는 request protocol 추론과 무관하게 `Secure`를 강제한다.

## 2026-09-01 TOTP 수명주기 2차 근거

- DB 기반 status는 `NOT_CONFIGURED`, `SETUP_PENDING`, `ENABLED` 세 상태만 반환하고 secret·암호화 봉투는 반환하지 않는다.
- setup은 20-byte 난수 secret을 AES-256-GCM disabled credential로 저장한 뒤 생성 성공 응답에서만 수동 키와 `otpauth` URI를 한 번 반환한다. 이미 pending이면 기존 값을 교체하거나 다시 표시하지 않는다.
- 사용자가 secret 응답을 잃은 경우 별도 `DELETE setup`으로 pending 등록을 명시적으로 취소한 뒤 새 등록을 시작한다. 취소도 audit event와 같은 transaction에 기록한다.
- enable과 self-disable은 현재 계정·현재 DB session·role·`authVersion`·암호화 봉투 fingerprint·TOTP step을 transaction 안에서 재검증한다.
- enable/disable은 `authVersion + 1`, 해당 계정의 모든 미폐기 session revoke, 허용 목록 audit event를 같은 PostgreSQL transaction으로 처리한다. 성공 응답은 현재 cookie도 만료시키고 재로그인을 요구한다.
- lifecycle API의 대상은 request body가 아니라 검증된 `session.userId`로 고정된다. ADMIN과 SUPER_ADMIN의 자기 계정만 허용하며 SUPER_ADMIN의 타인 reset은 이 단계에 구현하지 않았다.

## 관리자 E2E 흐름

1. 실행 때마다 비밀번호와 TOTP secret을 새로 만들고 합성 계정 저장소를 구성한다.
2. 역할별로 실제 `/api/admin/login`에 비밀번호와 현재 TOTP 코드를 제출한다.
3. 응답의 HttpOnly 쿠키를 받은 같은 브라우저 컨텍스트에서 보호된 관리자 경로를 연다.
4. 로딩·빈 상태·성공·검증 오류·권한 부족·세션 만료를 확인한다.
5. 각 변경 동작은 해당 API나 Server Action에서도 다시 권한을 확인한다.
6. 테스트 종료 시 세션을 폐기하고 fixture 저장소를 초기 상태로 복구한다.

## 필수 회귀

- 비로그인 사용자는 관리자 UI와 관리자 API에 접근할 수 없다.
- `USER`는 관리자 UI와 API에서 거부된다.
- `ADMIN`은 허용된 운영 기능만 사용할 수 있다.
- `SUPER_ADMIN` 전용 설정은 `ADMIN`에게 노출되거나 실행되지 않는다.
- 변조·만료·알 수 없는 역할의 세션은 거부된다.
- production build에서는 합성 계정 저장소가 활성화되지 않는다.

## 결과

로그인 요구를 제거하지 않고도 관리자 전 페이지를 자동·수동 검수할 수 있다. 운영 인증 구현이 바뀌어도 관리자 페이지와 데이터 접근 계층의 권한 계약은 유지된다.

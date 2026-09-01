# V2 S01 운영형 인증 내구성 통합 QA

- 검증일: 2026-09-01 KST
- 브랜치: `feature/v2-auth-durable-integration`
- 기준 commit: `8bf9a3d00ee2749368110529413c38dff9aabea4`
- 운영 반영: 하지 않음
- 운영 DB/외부 시스템 접근: 없음

## 확인된 구현

- JWT에 발급마다 다른 UUID v4 `jti`가 필수이며 issuer, audience, HS256, `kid`, `iat`, `exp`, 최대 30분 계약을 검증한다.
- DB에는 raw JWT가 아니라 `klol-v2:session-token:v1` domain과 원문 token으로 만든 SHA-256 digest만 저장한다.
- 보호 요청은 `jti + token hash`로 session을 찾고 현재 account status, role, `authVersion`, 삭제 상태, TOTP 검증 시각, 발급·만료 시각을 재대조한다.
- 로그아웃은 PostgreSQL session을 revoke한 뒤 cookie를 지운다. revoke를 수행할 수 없으면 503과 함께 cookie를 보존해 재시도할 수 있다.
- 비운영 fixture도 폐기된 `jti`를 프로세스 내에서 기억해 로그아웃 이전 cookie replay를 401로 거부한다.
- 운영형 TOTP secret은 account ID와 key version을 AAD로 사용하는 AES-256-GCM envelope만 복호화한다.
- 로그인 ID, client IP, global scope는 서로 다른 domain과 32-byte HMAC pepper로 digest한 뒤 PostgreSQL atomic bucket에만 기록한다.
- fixture와 DB limiter 모두 login ID 기준 8회 요청을 처리하고 9회째 429로 차단한다.
- `DATABASE_URL`, `SESSION_SIGNING_KEYS`, `TOTP_ENCRYPTION_KEYS`, `V2_AUTH_RATE_LIMIT_PEPPER` 중 하나라도 빠지거나 형식이 틀리면 DB 인증은 fail closed 한다.
- Next.js Proxy는 `/admin` 요청의 실제 path/query를 내부 request header로 덮어써 전달한다. 관리자 layout과 개별 workspace/page의 DB 세션 검사는 유지되며, 외부 header 위조와 open redirect는 거부한다.

## 검증 증거

| 명령 | 결과 |
|---|---|
| `npm run check` | ESLint, TypeScript, contract 4건, unit 25건, Next.js 16.3.4 production build 통과 |
| `npm run test:db` | 격리 PostgreSQL 18 계약 8건 통과; DB HTTP 로그인·token hash·변조·계정 변경·logout revoke·8/9 limiter 통과 |
| `npm run verify:auth-http` | fixture password+TOTP, 보호된 관리자 10개 workspace, deep-link next 보존, logout replay 401, production fixture lockout, revoke 불가 cookie 보존 통과 |
| `npm audit --omit=dev` | runtime 취약점 0건 |
| `npm audit` | dev dependency `drizzle-kit` 하위 `esbuild` moderate 4건; 제안된 강제 수정은 `drizzle-kit@0.18.1` breaking downgrade라 적용하지 않음 |

PostgreSQL harness는 workspace 아래 임시 `klol-v2-pg-*` 경로와 loopback `klol_v2_test_*` DB만 허용했다. 검증 종료 후 서버 정지 상태를 확인하고 해당 임시 경로가 제거된 것을 확인했다.

## 아직 완료가 아닌 출시 게이트

- 비운영 메모리 fixture의 격리 PostgreSQL fixture 이전
- TOTP 등록, 확인, enable, disable/reset, 이전 key 재암호화와 rotation workflow
- 비밀번호·role·status·TOTP 변경의 `authVersion` 증가, 전체 session revoke, audit event 원자 transaction
- 만료 session/rate bucket 운영 cleanup scheduler와 관측·경보
- 최초 SUPER_ADMIN bootstrap, 복구 코드, 민감 mutation 감사 정책
- 환경별 keyring/pepper 분리 확인, migration 운영 job, backup/restore와 key escrow 복구 훈련

따라서 이 결과는 코드와 합성 격리 DB에서 운영형 세션 경로가 검증된 상태이며, S01 전체 완료·운영 반영·Vercel 전환을 뜻하지 않는다.

## 디스코드 복붙형 패치 공지

```text
[K-LOL.GG V2 개발 패치] 관리자 인증 내구성 기반

- 관리자 세션을 고유 ID(jti)와 DB token hash로 관리하도록 연결했습니다.
- 모든 보호 요청에서 현재 계정 상태·권한·인증 버전을 DB로 다시 확인합니다.
- 로그아웃 시 서버 세션을 즉시 폐기하며 이전 쿠키 재사용을 거부합니다.
- 관리자 TOTP는 AES-256-GCM 암호화 keyring으로만 복호화합니다.
- 로그인 시도 제한을 PostgreSQL 공유 bucket으로 연결해 여러 인스턴스에서도 같은 기준을 사용합니다.
- 깊은 관리자 주소에서 로그인해도 원래 작업 화면과 검색 조건으로 안전하게 돌아옵니다.

이번 변경은 격리 PostgreSQL 18과 합성 계정으로만 검증했으며 운영 서버에는 아직 반영하지 않았습니다.
```

## 다음 패치 권장 순서

1. 격리 PostgreSQL fixture seed와 역할·상태 전체 로그인 matrix를 E2E 표준으로 전환
2. TOTP 등록→확인→enable→재로그인→disable/reset과 key rotation 구현
3. account 보안 mutation + `authVersion` + 전체 session revoke + audit event 원자 transaction 구현
4. 만료 auth state cleanup job, 지표·경보와 장애 시나리오 검증
5. backup/restore 및 key escrow 복구 rehearsal 후 S01 출시 판정

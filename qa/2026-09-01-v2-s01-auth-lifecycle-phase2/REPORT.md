# V2 S01 관리자 인증 수명주기 2차 QA

- 기준: `f52f228a207df9c394b9fd8ce074412f478c79ab`
- 작업 브랜치: `feature/v2-auth-lifecycle-phase2`
- 운영 DB/실계정/외부 시스템: 접근하지 않음
- 운영 배포/Git push: 수행하지 않음

## 확인된 구현

- `/api/admin/security/totp`: DB 기반 `NOT_CONFIGURED`/`SETUP_PENDING`/`ENABLED`
- `/api/admin/security/totp/setup`: one-time secret 생성, pending 재호출 409, 명시적 pending 취소
- `/api/admin/security/totp/enable`: 현재 code 검증, envelope fingerprint, atomic step consume
- `/api/admin/security/totp/disable`: TOTP 검증 세션 + 새 code의 자기 계정 해제
- enable/disable: `authVersion + 1`, 모든 session revoke, audit event가 같은 transaction
- 성공 후 현재 cookie `Max-Age=0`, 변경 전 cookie의 보호 API 401
- ADMIN/SUPER_ADMIN 자기 계정만 허용, USER/익명 거부, body의 타인 account ID 거부
- production cookie `Secure`, JWT decode 8 KiB, Vercel/public origin fixture 차단

## 자동 검증 증거

- `npm run typecheck`: 통과
- `npm run lint`: 경고·오류 0
- `npm run test:unit`: 59/59 통과
- `npm run test:db`: PostgreSQL 18 계약 14/14 통과
  - concurrent enable/disable 단일 승자
  - audit insert 중간 실패 시 credential/authVersion/session revoke 전체 rollback
  - 실제 DB HTTP status → setup → concurrent enable → 이전 cookie 401 → 재로그인 → disable → 이전 cookie 401
  - 임시 cluster 정상 종료 및 workspace 임시 경로 제거
- `npm run verify:auth-http`: 기존 fixture 인증·production fixture lockout 회귀 통과
- `npm run build`: Next.js 16.3.4 production build 통과, 신규 보안 UI/API 동적 route 확인
- `npm run security:secrets`: 추적 tree와 전체 Git history의 고신뢰 비밀 패턴 0건
- `npm audit --omit=dev`: runtime 취약점 0건
- `npm audit`: 개발 전용 `drizzle-kit` 하위 esbuild moderate 4건. 자동 강제 수정은 `drizzle-kit@0.18.1`로 breaking downgrade하므로 적용하지 않음

## 브라우저 검수

- 격리 loopback 합성 계정으로 비밀번호 → TOTP → `/admin/security` 실제 이동 확인
- desktop CSS viewport: `1280`, document scroll width `1280`, 가로 overflow 없음
- mobile override: `390 × 844`, CSS client/scroll width `375/375`, 가로 overflow 없음
- 모바일에서 표시된 대시보드 링크 높이 `48px`
- desktop/mobile console warning·error `0`
- 브라우저 fixture는 DB lifecycle mutation을 의도적으로 사용할 수 없어 `저장소 연결 필요` 상태만 시각 확인했다. setup/enable/disable 폼의 DB-backed 시각 캡처는 통합 브랜치 전체 관리자 QA에서 다시 수행해야 한다.

## 비밀정보 점검

- application/audit에는 manual secret, raw code, password, raw session token을 기록하는 logging 코드가 없음
- DB 계약에서 audit JSON에 `secretCiphertext`, `manualSecret`, `tokenHash` key 0건 확인
- setup secret/otpauth URI는 `no-store` 생성 응답과 현재 client memory에만 존재하며 재조회 API에 포함되지 않음

## 정확한 미완료

- recovery code, 최초 SUPER_ADMIN bootstrap, key escrow는 미구현
- SUPER_ADMIN의 타인 TOTP reset은 정책 범위 미확정으로 미구현
- WAF/신뢰 IP는 애플리케이션 로컬 계약 범위 밖이며 운영 검증 전
- pending setup 만료와 영속 idempotency 저장소는 후속 migration 후보
- TOTP 이전 key 자동 재암호화·rotation/restore 훈련 미완료
- 운영 migration·cleanup scheduler·관측·backup restore 미완료

## 다음 권장 4개

1. 비밀번호·역할·상태 변경도 동일한 보안 mutation transaction template으로 통합
2. 메모리 fixture를 격리 PostgreSQL seed로 이전하고 USER/ADMIN/SUPER 전체 상태 matrix 반복
3. bootstrap/recovery/reset/key rotation ADR 확정 후 별도 고위험 수명주기 구현
4. 전체 관리자 통합 브랜치에서 DB-backed desktop/mobile 폼 시각·키보드·스크린리더 QA 재수행

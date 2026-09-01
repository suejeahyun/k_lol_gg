# V2 S01 관리자 TOTP 보안 후속 검증

- 통합 기준: `20e1220` 이후 보안 후속 변경
- 운영 DB·실계정·외부 시스템: 접근하지 않음
- 운영 배포·Git push: 수행하지 않음

## 해결한 독립 검토 지적

1. TOTP 활성화·자기 해제 코드의 온라인 추측 방어
   - DB 영속 rate-limit bucket을 로그인 제한과 분리된 domain으로 재사용한다.
   - session+account `8회/5분`, IP `24회/5분`, 전체 `120회/1분`을 동시에 적용한다.
   - 형식이 맞는 6자리 코드는 비밀키 검증 전에 시도 횟수를 기록한다.
   - 저장소 장애는 `503`으로 fail closed하고, 한도 초과는 `429 TOTP_ATTEMPTS_LIMITED`와 `Retry-After`를 반환한다.
2. 합성 fixture의 loopback 설정만으로는 실제 전용 검증 실행을 증명하지 못하던 문제
   - fixture는 정확히 `NODE_ENV=development`, 비-Vercel, loopback origin일 때만 후보가 된다.
   - 전용 HTTP verifier가 `.tmp/auth-http` 아래에 5분 만료 proof를 만들고 Next를 `127.0.0.1`에 직접 바인딩한다.
   - 애플리케이션은 canonical proof 경로·일반 파일·4 KiB 상한·origin·실행 중 PID·32바이트 임의 token·만료를 모두 확인한다.
   - proof 환경값은 verifier가 주입하고 서버 종료 뒤 proof 파일과 전용 디렉터리를 제거한다.
3. TOTP 활성화 성공 뒤 화면 이동 실패 시 등록 키가 React 상태에 남던 문제
   - 성공 응답 직후 `setupMaterial`을 먼저 비우고 재로그인 화면으로 이동한다.
4. 프록시 IP 헤더 신뢰 범위
   - Vercel이 아닌 실행에서는 요청 헤더의 IP를 신뢰하지 않고 하나의 보수적인 공유 bucket을 사용한다.
   - `VERCEL=1`에서만 Vercel의 spoofing 방지 헤더인 `x-vercel-forwarded-for`를 사용하며 IPv4/IPv6가 아니면 공유 unknown bucket으로 제한한다.
   - 근거: <https://vercel.com/docs/headers/request-headers#x-vercel-forwarded-for>
5. verifier 서버 생성 실패 정리
   - Next 자식 프로세스 생성이 동기·비동기로 실패해도 proof를 즉시 제거하도록 start failure를 `try/finally` 경로에 연결했다.

## 자동 검증 증거

- `npm run lint`: 통과
- `npm run typecheck`: 통과
- `npm run test:unit`: 70/70 통과
  - proof 누락·불일치·만료·죽은 runner·비-loopback·Vercel·production 차단 포함
  - 비-Vercel IP spoofing header 무시, Vercel IPv4/IPv6 및 invalid header fallback 포함
- `npm run test:db`: PostgreSQL 18 계약 14/14와 실제 DB HTTP 수명주기 통과
  - 별도 ADMIN 계정에서 잘못된 자기 해제 코드 1~8회는 `403`
  - 9번째는 `429 TOTP_ATTEMPTS_LIMITED`, 양의 `Retry-After`
  - credential·`authVersion`·세션은 유지되고 disable audit은 생성되지 않음
- `npm run build`: Next.js 16.3.4 production build 통과
- `npm run verify:auth-http`: 전용 개발 fixture 정상 동작과 production fixture `503` 잠금 통과
- `npm run security:secrets`: 추적 tree와 전체 V2 Git history 고신뢰 패턴 0건
- `npm audit --omit=dev`: 런타임 취약점 0건

초기 PID 직접 비교안은 Next 개발 서버의 내부 프로세스 구조에서 fixture를 잘못 차단해 HTTP 검증이 실패했다. 해당 실패를 숨기지 않고 전용 proof 수명주기로 교체했으며, 교체 뒤 같은 검증을 다시 통과했다.

## 현재 남은 인증 범위

- recovery code·최초 SUPER_ADMIN bootstrap·key escrow 정책/구현
- SUPER_ADMIN의 타인 TOTP reset 정책과 고위험 감사 흐름
- 비밀번호·역할·상태 변경의 원자 `authVersion` 증가·전체 세션 폐기·감사
- pending setup 만료, key rotation/재암호화·restore 훈련
- 운영 migration·cleanup scheduler·관측·WAF/신뢰 IP·backup/restore 검증
- DB 기반 `/admin/security` 활성화·해제 폼의 데스크톱/모바일 브라우저 캡처

따라서 이번 후속 패치는 두 보안 지적을 해결했지만, S01 전체 또는 V2 출시 완료를 의미하지 않는다.

# Kakao R13 canonical room authorization QA

## 결론

이번 변경은 **카카오톡 방 검증 전체 삭제가 아니다**. 정상 요청에서 Vercel `KAKAO_WEBHOOK_ALLOWED_ROOMS`와 로컬 fingerprint를 매번 정확히 비교하던 정적 의존성을 제거하고, PostgreSQL의 canonical room binding·상태·역할 권한으로 대체했다.

- 유지: raw-body HMAC, timestamp/nonce, 설치본 ID binding, bot-self 차단
- 유지: canonical room별 데이터 격리와 `ACTIVE`/`PAUSED`/`REVOKED`
- 유지: room member의 `MEMBER`/`MANAGER`/`ADMIN`, command receipt, audit, idempotency
- 변경: `authorize()`는 room/sender 환경변수를 읽지 않는다.
- 변경: 미등록 `(installation, local room fingerprint)`는 일반 명령을 실행하지 않고 `ROOM_BINDING_REQUIRED`로 거부한다.
- 허용: pairing 전 휴대폰 로컬 `/봇버전`, `/V2연동확인`, 도움말과 서명된 `/V2방연동 <8자리 코드>` 흐름
- 비상 이관: 구형 환경변수는 명시적 `bootstrapFromEnvironment()`에서만 읽고, 기존 canonical registry를 수정·병합·중지·회수·삭제하지 않는다.
- 장애 정책: DB registry를 읽을 수 없으면 `REGISTRY_UNAVAILABLE`/503으로 fail-closed한다.

## 변경 근거

- 정상 권한 경로: `PostgresKakaoRoomRegistry.authorize()` → installation 확인 → DB binding 조회 → canonical room 상태 조회 → sender member 조회/등록 → 역할 비교
- pairing 경로: SUPER 관리자가 10분·일회용 코드를 발급하고, 서명된 설치본이 실제 방에서 소비한다.
- 데이터 격리: 모집 aggregate의 `sourceRoomId`는 authorization이 해석한 canonical UUID이며 다른 canonical 방 접근은 404로 숨긴다.
- 모바일 R12의 `channelId` 기반 로컬 room fingerprint는 그대로 유지한다. 서버 R13 변경 때문에 휴대폰 번들을 다시 생성할 필요는 없다.

## 검증 결과

- TypeScript typecheck: 통과
- Kakao capability/static boundary: 3/3 통과
- HMAC·전환 집중 테스트: 7/7 통과
- 전체 source contract: 216/216 통과
- 전체 unit: 479/479 통과
- 격리 PostgreSQL recruiting 계약: 10/10 통과
  - 다른 installation key로 서명 material을 바꾸면 `INVALID_SIGNATURE`
  - 미등록 installation/room binding은 `ROOM_BINDING_REQUIRED`
  - 같은 canonical room의 복수 installation binding 성공
  - 같은 canonical room의 새 sender는 MEMBER 명령 성공, ADMIN 명령 거부
  - 환경변수와 registry가 불일치해도 기존 room status/binding 불변
  - 명시적 bootstrap만 구형 aggregate room 참조를 비파괴 이관
  - 다른 canonical room의 aggregate 조회·변경 차단
- ESLint: 오류 0, 기존 생성본·fixture 경고 18
- production build: 통과(정적 페이지 91개 생성)
- 인증 HTTP 검증: 통과(guard, limit, password+TOTP, cookie, role, header, logout, production fixture lockout)
- 비밀 유출 검사: tracked tree 및 전체 Git history 통과
- MessengerBot 명령 audit: 100개(CORE 20, INHOUSE 13, MANAGED 13, PARTY 33, SCRIM 21)
- `git diff --check`: 통과

## 운영 반영 상태

- 소스 반영: 완료
- migration 신규 추가: 없음 (`0031_brainy_taskmaster.sql` 선행 필요)
- 휴대폰 번들 변경: 없음(R12 그대로 사용)
- Vercel 배포: 미수행
- 운영 DB migration/pairing: 미수행
- 운영 환경변수 삭제: 미수행

운영 적용 시 `0031` → 서버 R13 → `/admin/kakao/rooms` pairing → 실제 방 member-safe 명령 순으로 확인한다. 정상 pairing과 회귀 확인 전에는 기존 env 값을 삭제하지 않는다. 새 서버에서 env 값은 정상 권한 판정에 영향을 주지 않으므로, 확인 후 bootstrap/롤백 보존 정책에 따라 별도로 정리한다.

## 남은 위험

- `0031` 미적용 또는 DB 장애면 모든 일반 명령이 503으로 안전하게 차단된다.
- R12 미만 휴대폰이나 MessengerBot R 0.7.34a 미만에서는 안정적인 `channelId` 방 fingerprint를 만들지 못할 수 있다.
- 동일 실제 방의 복수 설치본은 각 installation/local fingerprint를 같은 canonical 방에 한 번씩 pairing해야 한다.
- `REVOKED`는 삭제가 아니며 자동 복구하지 않는다. 운영자가 상태와 감사 로그를 확인해야 한다.

## 다음 패치 추천

1. SUPER 전용의 감사·멱등성 포함 일회성 bootstrap 실행 UI/CLI를 추가하고, 실행 뒤 env 제거 체크리스트를 자동 생성한다.
2. `/admin/kakao/rooms`에 installation `ACTIVE`/`REVOKED` 관리와 최근 사용 시각을 추가한다.
3. canonical room별 최근 거부 코드·pairing 만료·역할 변경 audit를 secret-free 대시보드로 제공한다.
4. 운영 스모크 테스트에 동일 방 3명 MEMBER 조회/생성, MANAGER lifecycle, 다른 방 404, PAUSED/REVOKED 403을 고정한다.

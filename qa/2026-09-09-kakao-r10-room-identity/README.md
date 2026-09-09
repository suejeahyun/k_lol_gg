# Kakao R10 방 식별·DB 바인딩 QA

## 범위와 판정

- 확인됨: HMAC은 MessengerBot 설치본 요청 무결성만 검증하며 방·사람 역할은 PostgreSQL에서 별도 판정한다.
- 확인됨: `kakao_bot_installations`, `kakao_rooms`, `kakao_room_bindings`, `kakao_room_members`, `kakao_room_pairings`가 migration `0031_brainy_taskmaster.sql`에 포함된다.
- 확인됨: 설치본 A/B의 서로 다른 로컬 방 fingerprint가 관리자 일회용 코드로 하나의 canonical room에 연결되며 양쪽 MEMBER 요청이 허용된다.
- 확인됨: 방 fingerprint HMAC 입력은 설치 identity secret과 정규화된 callback `room`뿐이며 `sender`는 포함하지 않는다. 발신자 fingerprint는 별도로 계산한다.
- 확인됨: 동일 설치본·동일 방·서로 다른 발신자 100명은 방 fingerprint 1개와 발신자 fingerprint 100개를 생성한다.
- 확인됨: NFKC와 zero-width 문자 제거로 전각/불가시 문자 차이를 정규화한다. 서로 다른 설치 identity secret은 같은 방에서도 서로 다른 로컬 fingerprint를 생성한다.
- 확인됨: 기존 `room-id` HMAC 도메인을 보존해 이미 정규 형태인 방의 기존 fingerprint와 DB binding은 바뀌지 않는다.
- 확인됨: `/봇버전`과 `/V2연동확인`이 설치 fingerprint를 함께 출력해 복수 실행본을 현장에서 구분한다.
- 확인됨: 미연결 설치본은 `ROOM_BINDING_REQUIRED`, 중지 방은 `ROOM_PAUSED`, 역할 부족은 `ROLE_FORBIDDEN`, 잘못된 양식은 `FORM_INVALID`, 충돌은 `CONFLICT`, 서명 실패는 `INVALID_SIGNATURE`로 응답한다.
- 확인됨: 환경변수 방·발신자는 최초 요청 시 BOOTSTRAP 행으로만 비파괴 삽입한다. 기존 DB 행을 덮어쓰거나 방 이름으로 합치지 않는다.
- 확인됨: 방 상태·멤버 역할·코드 발급은 SUPER 세션/TOTP 재검증, optimistic revision, 멱등성 영수증, 감사 로그를 사용한다.
- 미확인: 운영 DB migration, Vercel 배포, 휴대폰 MessengerBot 설치·Rhino 컴파일, 실제 카카오톡 송수신. 이 작업에서는 수행하지 않았다.
- 미확인: 17:31~17:32 실제 방에서 관측된 두 방 fingerprint의 직접 원인. 현재 소스는 sender 혼합을 배제하며, 콜백 문자열 차이와 서로 다른 설치 identity secret 중 어느 쪽인지는 R10 설치 지문을 현장에서 비교해야 확정된다.

## 검증 증거

| 검증 | 결과 |
| --- | --- |
| 계약 테스트 | 214/214 통과 |
| 단위 테스트 | 479/479 통과 |
| recruiting DB 계약 | 10/10 통과(신규 canonical 방 테스트 1 포함) |
| TypeScript | `tsc --noEmit` 통과 |
| production build | Next.js 빌드 통과, 신규 UI/API route 포함 |
| ESLint | 오류 0, 생성물·기존 테스트 중심 경고 18 |
| 비밀값 검사 | 추적 파일과 전체 Git 이력 통과 |
| 방 식별·진단 집중 테스트 | 7/7 통과(100명 동일 방 + 서로 다른 설치 secret 포함) |
| MessengerBot R 빌드 | ES5 생성 통과, LF 64,895자 / CRLF 보수 계산 65,263자 |

## 산출물

- 휴대폰 설치본: `integrations/messengerbot-r/KLOL_KAKAO_BOT_V41_MESSENGERBOT_R.js`
  - 버전: `KLOL_KAKAO_BOT_V41_V2_2026_09_09_R10_ROOM_IDENTITY`
  - SHA-256: `cc24c011752255c901bce1ed44e18b426cec2eb2b11aae5c014c776b137fd2cf`
- 검토용 전체본: `integrations/messengerbot-r/KLOL_KAKAO_BOT_V41_V2_COMPLETE.js`
  - SHA-256: `f4c8d483106edd46719a6fadc0b20edb1376d0f624f746136a18dec6ff989bd4`

## 운영 반영 전 순서

1. DB와 현재 운영 JAR/웹 산출물을 백업하고 maintenance 범위를 공지한다.
2. migration `0031_brainy_taskmaster.sql` 적용 후 신규 테이블·제약·인덱스를 확인한다.
3. 대응 서버 배포 후 `/api/health`, 기동 로그, 신규 관리자 화면을 확인한다.
4. R10 휴대폰 설치본을 전체 교체하고 두 사용자에게 `/봇버전`, `/V2연동확인`을 실행시켜 설치 지문과 방 지문을 비교한다.
5. `/admin/kakao/rooms`에서 canonical 방을 선택해 코드를 발급하고 실제 방에서 `/V2방연동 CODE`를 한 번 실행한다.
6. MEMBER 조회·생성, MANAGER 수정, ADMIN 강제 취소, PAUSED 거부를 실제로 점검한다.

## 근거 있는 다음 패치 추천

1. 설치본 REVOKED 전환 UI와 키 회전 runbook을 추가해 분실 휴대폰 차단 시간을 줄인다.
2. 사이트 계정↔카카오 sender 연결 승인 흐름을 추가해 ADMIN 승격 근거를 사람이 추적 가능하게 한다.
3. canonical room별 최근 오류·명령량 지표를 관리자 화면에 표시해 신규 연결 직후 이상을 빠르게 찾는다.
4. pairing code 재발급/폐기 UI와 rate limit을 추가해 코드 오입력·노출 대응을 강화한다.

# Kakao R9 DB 방 바인딩 QA

## 범위와 판정

- 확인됨: HMAC은 MessengerBot 설치본 요청 무결성만 검증하며 방·사람 역할은 PostgreSQL에서 별도 판정한다.
- 확인됨: `kakao_bot_installations`, `kakao_rooms`, `kakao_room_bindings`, `kakao_room_members`, `kakao_room_pairings`가 migration `0031_brainy_taskmaster.sql`에 포함된다.
- 확인됨: 설치본 A/B의 서로 다른 로컬 방 fingerprint가 관리자 일회용 코드로 하나의 canonical room에 연결되며 양쪽 MEMBER 요청이 허용된다.
- 확인됨: 미연결 설치본은 `ROOM_BINDING_REQUIRED`, 중지 방은 `ROOM_PAUSED`, 역할 부족은 `ROLE_FORBIDDEN`, 잘못된 양식은 `FORM_INVALID`, 충돌은 `CONFLICT`, 서명 실패는 `INVALID_SIGNATURE`로 응답한다.
- 확인됨: 환경변수 방·발신자는 최초 요청 시 BOOTSTRAP 행으로만 비파괴 삽입한다. 기존 DB 행을 덮어쓰거나 방 이름으로 합치지 않는다.
- 확인됨: 방 상태·멤버 역할·코드 발급은 SUPER 세션/TOTP 재검증, optimistic revision, 멱등성 영수증, 감사 로그를 사용한다.
- 미확인: 운영 DB migration, Vercel 배포, 휴대폰 MessengerBot 설치·Rhino 컴파일, 실제 카카오톡 송수신. 이 작업에서는 수행하지 않았다.

## 검증 증거

| 검증 | 결과 |
| --- | --- |
| 계약 테스트 | 211/211 통과 |
| 단위 테스트 | 479/479 통과 |
| recruiting DB 계약 | 10/10 통과(신규 canonical 방 테스트 1 포함) |
| TypeScript | `tsc --noEmit` 통과 |
| production build | Next.js 빌드 통과, 신규 UI/API route 포함 |
| ESLint | 오류 0, 기존 생성물 중심 경고 16 |
| MessengerBot R 빌드 | ES5 생성 통과, LF 64,688자 / CRLF 보수 계산 65,155자 |

## 산출물

- 휴대폰 설치본: `integrations/messengerbot-r/KLOL_KAKAO_BOT_V41_MESSENGERBOT_R.js`
  - 버전: `KLOL_KAKAO_BOT_V41_V2_2026_09_09_R9_DB_ROOM_BINDINGS`
  - SHA-256: `9717eff2280c58fcb10c65784f8227d3b4a8dc28504793a878804a980a856321`
- 검토용 전체본: `integrations/messengerbot-r/KLOL_KAKAO_BOT_V41_V2_COMPLETE.js`
  - SHA-256: `2de1e4e3d9d66a4387b311c5e6e403fae5b09dd4b871e558077577f638bfbd73`

## 운영 반영 전 순서

1. DB와 현재 운영 JAR/웹 산출물을 백업하고 maintenance 범위를 공지한다.
2. migration `0031_brainy_taskmaster.sql` 적용 후 신규 테이블·제약·인덱스를 확인한다.
3. R9 서버 배포 후 `/api/health`, 기동 로그, 신규 관리자 화면을 확인한다.
4. R9 휴대폰 설치본을 전체 교체하고 `/봇버전`, `/V2연동확인`을 확인한다.
5. `/admin/kakao/rooms`에서 canonical 방을 선택해 코드를 발급하고 실제 방에서 `/V2방연동 CODE`를 한 번 실행한다.
6. MEMBER 조회·생성, MANAGER 수정, ADMIN 강제 취소, PAUSED 거부를 실제로 점검한다.

## 근거 있는 다음 패치 추천

1. 설치본 REVOKED 전환 UI와 키 회전 runbook을 추가해 분실 휴대폰 차단 시간을 줄인다.
2. 사이트 계정↔카카오 sender 연결 승인 흐름을 추가해 ADMIN 승격 근거를 사람이 추적 가능하게 한다.
3. canonical room별 최근 오류·명령량 지표를 관리자 화면에 표시해 신규 연결 직후 이상을 빠르게 찾는다.
4. pairing code 재발급/폐기 UI와 rate limit을 추가해 코드 오입력·노출 대응을 강화한다.

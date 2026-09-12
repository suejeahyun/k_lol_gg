# S09 — Kakao integration boundary

상태: 로컬 코드와 격리 PostgreSQL 계약 검증 완료. 운영 자격 증명·외부 메시지 발송·배포는 별도다.

## 현재 V1 strict R8 / V4 경계

현재 휴대폰 운영본은 한 휴대폰·한 MessengerBot R 봇 프로필에서 구인방과 기능방을 함께 수신하고, 메시지 내용으로 `RECRUIT` 또는 `FEATURES` 프로필을 선택한다. `/api/integrations/kakao/v4/commands`는 raw room 이름·channel ID·room parser·canonical room registry를 사용하지 않고, 프로필에서 파생한 installation scope와 V4 전용 서명으로 요청을 검증한다. 아래 R14.2 canonical 방 registry 설명은 레거시 V2/V3 endpoint와 관리자 이관 화면에만 적용된다.

## R14.2 설치본 신뢰와 canonical 방 권한

- HMAC은 허용된 MessengerBot 설치본이 정확한 요청을 만들었다는 사실만 증명하며 사람 역할을 부여하지 않는다. V3 서명 material은 공개 `botInstallationId`, 키 ID, 메시지 전달 ID, 봇 버전, 설치본 scope·발신자 fingerprint, nonce, timestamp, body digest를 포함한다. 서버는 V1/V2 검증 호환을 유지하되 R14.2 휴대폰은 V3만 생성한다.
- 정상 요청은 `recruiting.kakao_bot_installations.canonical_room_id`로 canonical `recruiting.kakao_rooms.id`를 해석한다. MessengerBot callback의 `room`, `channelId`, `isGroupChat`과 legacy `kakao_room_bindings.local_room_fingerprint`는 권한·라우팅에 사용하지 않는다.
- 설치본 scope header는 `room-` + SHA-256(`klol-v2:kakao-installation-room-scope:v1\0` + installation ID)의 앞 32 hex다. 서버가 이 값을 다시 계산하고 외곽 V3 HMAC도 검증한다. signing key 회전과 callback parser 오동작은 scope를 바꾸지 않는다.
- 하나의 installation row에는 canonical room FK 하나만 존재한다. 최초 서명 요청은 설치본을 기록한 뒤 `ROOM_BINDING_REQUIRED`를 반환하고, SUPER 관리자가 발급한 만료·일회용·해시 저장 pairing code만 canonical room을 지정할 수 있다. 이미 다른 방에 연결된 설치본은 자동 병합하지 않는다.
- 환경변수 방·발신자 목록은 명시적으로 실행하는 비상·일회성 bootstrap과 초기 ADMIN 이관에만 남는다. 정상 요청과 raw-V2 권한 판정은 두 값을 읽거나 비교하지 않는다. raw-V2는 DB ADMIN 역할을 요구한다.
- **설치본 하나 = 실제 카카오톡 방 하나**를 운영 불변식으로 강제한다. 동일 identity secret/installer를 여러 실제 방에서 실행하면 서버가 구분할 수 없어 데이터·권한이 합쳐지므로, 실제 방마다 별도 installation identity와 봇 프로필을 발급한다.

## 수신 경계

- 모든 bot mutation은 JSON 파싱 전에 raw body HMAC, timestamp window, nonce, installation scope,
  sender ID와 bot-self 차단을 검증한다. nonce와 멱등 영수증은 같은 transaction에서 결합한다.
- 시즌 snapshot은 구조화된 allowlist만 받는다. 정확히 한 플레이어로 일치한 본 신청만 갱신하고,
  예비·미일치·동명이인은 pending으로 보존한다. snapshot에서 빠진 항목은 soft cancel한다.
- 비공개 이미지는 승인 계정 소유자가 match submission 또는 discipline task에 대해 만든 30분 세션이
  있어야만 받는다. 세션에는 room/sender의 SHA-256만 저장하고 원문 identifier는 저장하지 않는다.
  R14.2는 사이트에 표시한 installation ID, 서명된 installation scope, authorize된 canonical room을 호환 검증한다.
  bot body는 session UUID와 이미지 선언만 포함하며 public code나 owner ID로 대상을 바꿀 수 없다.
- 이미지는 MIME, 크기, 해상도, SHA와 중복을 확인한 뒤 `STAGED → READY`로 확정한다. 저장 또는
  finalize 실패 시 DB와 storage가 `DELETE_PENDING` 보상 경계로 수렴한다.

## 관리자 경계

- ADMIN은 `/api/admin/kakao/stats`, `/api/admin/kakao/recruit-health`,
  `/api/admin/kakao/settings`에서 secret-free 상태를 읽는다.
- ADMIN은 `/api/admin/season-kakao-pending` 목록·상세를 읽고, SUPER_ADMIN+TOTP만 수동 player 연결과
  취소를 실행한다. 같은 시즌·날짜·회차·player의 SITE 신청과 이미 검토된 결정은 Kakao 입력보다
  우선하며 source hash와 원문 식별자는 공개 DTO에 포함하지 않는다.
- 설정 변경과 만료 이미지 세션 복구는 SUPER_ADMIN의 ADMIN-purpose TOTP session을 transaction에서
  다시 확인하고 `If-Match`, `Idempotency-Key`, audit와 outbox를 요구한다.
- signing key 원문과 비상 bootstrap room/sender 원문은 환경 변수에만 두고 DB, API, 화면, 로그에 노출하지 않는다.
  DB 설정은 기능 enable/maintenance와 구조화 메시지 크기 상한만 관리한다.
- `/admin/kakao?tab=recruits|scrims|stats|settings|logs|health`가 canonical이며 기존 관리자 deep link는
  GET 308로만 연결한다. mutation redirect는 만들지 않는다.

## 운영 전 확인

- 운영 signing secret을 별도 채널에서 주입한다. 기존 room 목록을 이관할 때만 bootstrap room 값을 일시 주입하고, 명시적 import 후 제거한다. raw-V2 내부 호환 명령을 사용하지 않으면 sender 값도 bootstrap 뒤 제거한다. 값 자체가 아닌 configured boolean만 확인한다.
- migration head `0034_kakao_room_capability_profiles` 적용과 no-drift, signed request fixture, private storage adapter를 검증한다. 0033은 설치본별 기존 distinct canonical room이 둘 이상이면 자동 병합·삭제 없이 실패하고, 0034는 방과 pairing에 `RECRUIT | FEATURES` capability profile을 추가한다.
- 외부 Kakao 발송은 이 저장소의 책임 범위가 아니다. scheduled notice API는 safe DTO만 반환한다.

## 최종 브라우저 증거 조건

- SUPER_ADMIN + ADMIN-purpose TOTP session으로 `/admin/kakao?tab=settings`를 열어 secret-free 설정 폼과
  signing/room/sender의 configured boolean만 캡처한다. 키나 identifier 원문이 보이면 실패다.
- `/admin/kakao?tab=stats`와 `?tab=logs`는 격리 fixture의 시즌 pending, 이미지 세션, receipt를 실제
  행/집계로 표시해야 한다. 샘플 문구나 임의 숫자는 허용하지 않는다.
- `/admin/kakao?tab=health`는 만료된 ACTIVE 이미지 세션 fixture가 있는 상태에서 복구를 실행하고,
  성공 문구와 재조회된 활성 세션 수를 각각 증거로 남긴다.
- `/admin/kakao/settings`, `/admin/kakao/recruits/logs`, `/admin/kakao/recruits/settings`는 canonical tab으로
  308 이동해야 한다. 공통 capture plan에는 이 문서 조건을 통합 단계에서 한 번만 반영한다.

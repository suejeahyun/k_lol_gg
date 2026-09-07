# S09 — Kakao integration boundary

상태: 로컬 코드와 격리 PostgreSQL 계약 검증 완료. 운영 자격 증명·외부 메시지 발송·배포는 별도다.

## 수신 경계

- 모든 bot mutation은 JSON 파싱 전에 raw body HMAC, timestamp window, nonce, room ID,
  sender ID와 bot-self 차단을 검증한다. nonce와 멱등 영수증은 같은 transaction에서 결합한다.
- 시즌 snapshot은 구조화된 allowlist만 받는다. 정확히 한 플레이어로 일치한 본 신청만 갱신하고,
  예비·미일치·동명이인은 pending으로 보존한다. snapshot에서 빠진 항목은 soft cancel한다.
- 비공개 이미지는 승인 계정 소유자가 match submission 또는 discipline task에 대해 만든 30분 세션이
  있어야만 받는다. 세션에는 room/sender의 SHA-256만 저장하고 원문 identifier는 저장하지 않는다.
  bot body는 session UUID와 이미지 선언만 포함하며 public code나 owner ID로 대상을 바꿀 수 없다.
- 이미지는 MIME, 크기, 해상도, SHA와 중복을 확인한 뒤 `STAGED → READY`로 확정한다. 저장 또는
  finalize 실패 시 DB와 storage가 `DELETE_PENDING` 보상 경계로 수렴한다.

## 관리자 경계

- ADMIN은 `/api/admin/kakao/stats`, `/api/admin/kakao/recruit-health`,
  `/api/admin/kakao/settings`에서 secret-free 상태를 읽는다.
- 설정 변경과 만료 이미지 세션 복구는 SUPER_ADMIN의 ADMIN-purpose TOTP session을 transaction에서
  다시 확인하고 `If-Match`, `Idempotency-Key`, audit와 outbox를 요구한다.
- signing key와 허용 room/sender 원문은 환경 변수에만 두고 DB, API, 화면, 로그에 노출하지 않는다.
  DB 설정은 기능 enable/maintenance와 구조화 메시지 크기 상한만 관리한다.
- `/admin/kakao?tab=recruits|scrims|stats|settings|logs|health`가 canonical이며 기존 관리자 deep link는
  GET 308로만 연결한다. mutation redirect는 만들지 않는다.

## 운영 전 확인

- 운영 secret과 allowlist를 별도 채널에서 주입하고 값 자체가 아닌 configured boolean만 확인한다.
- 0018, 0019, 0022 migration 적용과 no-drift, signed request fixture, private storage adapter를 검증한다.
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

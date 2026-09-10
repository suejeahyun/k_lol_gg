# Kakao V4 Phase 3 최종 통합

검증일: 2026-09-10 (Asia/Seoul)

## 통합 범위

- INHOUSE: 협곡·칼바람·증바람 템플릿, 현황, 상세, authoritative 전체 snapshot.
- SCRIM: 초기 양식, 신규·수정 전체 양식, 현황, 상세, 단일 활성 대회 판별.
- OPERATIONS: 4종 typed 양식, 등록·내전 결과·징계 안내, 예약 공지, durable static receipt.
- Runtime: room registry, recruiting, Kakao assistant, operation forms dependency가 모두 있어야 V4 service가 생성되며 하나라도 없으면 fail-closed한다.
- 인증은 installation/profile 기준이며 room 이름, sender role, 사용자 allowlist에 의존하지 않는다.
- 같은 `eventId`와 같은 body는 replay하고, 같은 `eventId`의 다른 body는 HTTP 409 `REPLAY_CONFLICT`로 거절한다.
- 각 휴대폰 command는 server request를 정확히 한 번 보낸다. 네트워크 재시도만 같은 body와 `eventId`를 재사용한다.

## 확인된 통합 보정

- `canonical-command.ts`의 SEASON snapshot mode를 `RIFT | ARAM | AUGMENT_ARAM`으로 통일했다.
- 칼바람·증바람 이름 전용 행을 `ALL` position participant로 보존한다.
- INHOUSE/SCRIM과 OPERATIONS dispatcher dependency를 같은 runtime service에 함께 주입한다.
- V1 operation form의 기존 필수 필드 정책과 sender fallback을 유지한다.
- 잘못된 operation form은 mutation port 전에 정확한 V1 누락 안내를 반환한다.
- assistant DTO와 Postgres season snapshot이 세 내전 mode를 같은 모델로 처리한다.

## 운영 상태

- 소스·생성 산출물·자동 테스트·production build까지 확인했다.
- 실제 MessengerBot-R 기기 설치, 카카오방 callback, 배포 URL, 운영 DB durable replay는 수행하지 않았다.
- push, deploy, 운영 DB 변경, secret 변경은 수행하지 않았다.
- 운영 반영: 미적용.
- 실기기 검증: 미확인.

## 다음 패치 추천

1. 실기기 두 profile smoke test와 callback 로그 증거 자동 수집.
2. `PHOTO_STATUS`, preview confirm/cancel을 typed canonical command로 연결.
3. internal diagnostic/raw command를 별도 운영자 인증 endpoint로 분리.
4. 다중 인스턴스에서 local 안내 응답까지 durable receipt로 통일.


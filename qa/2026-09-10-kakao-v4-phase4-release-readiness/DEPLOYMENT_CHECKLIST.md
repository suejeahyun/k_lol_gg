# Staging → 실기기 → 운영 체크리스트

P0 installation-scope 인증은 RESOLVED다. 운영 DB·환경변수·실기기는 미확인이므로 각 단계는 앞 단계의 실제 증거가 있을 때만 진행한다.

## 1. Staging

1. Production과 분리된 staging DB·서명 키·identity key·MessengerBot 사본을 준비한다.
2. secret 값을 출력하지 않고 `DATABASE_URL`, `DATABASE_POOL_MAX`, `V2_PUBLIC_ORIGIN`, `KLOL_V2_KAKAO_IDENTITY_SECRET`, `KAKAO_WEBHOOK_SECRET_CURRENT`, `KAKAO_WEBHOOK_KEY_ID_CURRENT`의 configured 여부만 확인한다. 회전 중일 때만 previous secret/key ID를 둔다.
3. read-only query로 Drizzle head `0034_kakao_room_capability_profiles`와 `command_receipts`, `nonce_bindings`, `kakao_bot_installations`, `kakao_rooms`, `kakao_room_pairings`의 필수 컬럼·index·constraint를 확인한다.
4. `kakao_operation_settings` singleton이 존재하고 global/maintenance 및 사용할 기능 상태가 의도와 맞는지 확인한다.
5. 같은 identity secret으로 RECRUIT와 FEATURES가 서로 다른 deterministic installation ID를 만드는지 값 노출 없이 확인한다.
6. V4 route가 room registry나 pair-room 없이 두 installation/profile을 승인하는지 확인한다. V3/V41 pairing은 변경하지 않는다.
7. 서명 오류, 5분 초과 timestamp, 잘못된 profile과 installation ID가 fail-closed하는지 확인한다.
8. 읽기 명령부터 실행한 뒤 테스트 데이터로 create → status/detail → snapshot → finish를 확인한다.
9. 같은 event/body 재전송은 `Idempotency-Replayed: true`, 같은 event/다른 body는 HTTP 409 `REPLAY_CONFLICT`인지 확인한다.
10. receipt의 body digest와 response가 저장되며 원문 message·secret·식별자 전체가 로그에 노출되지 않는지 확인한다.

## 2. MessengerBot R 실기기

1. 기존 V41 소스와 private 설정을 안전한 비밀 보관소에 백업한다. 채팅·스크린샷·Git에는 secret을 남기지 않는다.
2. RECRUIT/FEATURES를 별도 봇 프로필로 만들고 각 프로필이 정확히 한 실제 방만 구독하게 한다.
3. 생성 파일 SHA-256과 버전 문자열을 이 QA의 확인값과 대조하고 저장·컴파일한다.
4. `/봇버전`에서 profile과 profile별로 서로 다른 installation ID를 확인한다.
5. `/봇버전`의 profile과 installation ID를 server-side deterministic 기대값과 대조한다. V4 pairing 명령은 실행하지 않는다.
6. slash 포함/미포함, 일반 발신자 두 명, 네트워크 1회 재시도, 긴 양식 줄바꿈을 확인한다.
7. RECRUIT에서 파티·스크림, FEATURES에서 내전·전적·운영 양식을 확인하고 교차 profile 명령은 `WRONG_PROFILE`인지 확인한다.
8. 같은 방의 V41은 중지된 상태여야 한다. V41과 V4가 동시에 답하면 즉시 V4를 중지한다.

## 3. 운영

1. 점검 시간을 공지하고 신규 모집·양식 변경을 잠시 중지한다.
2. 운영 DB를 백업하고 read-only preflight로 migration head와 다중 canonical-room 충돌이 없는지 확인한다.
3. additive migration을 `0034`까지 적용한다. 이미 적용됐으면 재적용하지 않는다.
4. Vercel Production 환경에 필수 변수 이름과 환경 범위만 확인하고 배포한다. Preview 키를 Production에 재사용하지 않는다.
5. 먼저 한 개 canary 방에서 V41을 중지하고 V4 한 profile만 시작한다.
6. 상태·조회 → 테스트 create → replay/conflict → 마감 순으로 확인한다.
7. 오류율, `WRONG_PROFILE`, `INVALID_SIGNATURE`, `SERVER_UNAVAILABLE`, 409 conflict를 관측한다.
8. canary가 안정된 뒤 나머지 방을 한 곳씩 같은 방식으로 전환한다.
9. 롤백 관측 기간이 끝나기 전에는 기존 V41 파일·설정·서버 V3 route·previous key를 삭제하지 않는다.

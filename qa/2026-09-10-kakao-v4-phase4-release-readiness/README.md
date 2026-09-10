# Kakao V4 Phase 4 release-readiness 감사

감사일: 2026-09-10 KST

기준 커밋: `924ebd187c0064274a403414881fbf7cd4a3b362`

통합 브랜치: `feat/kakao-v4-gateway-20260910`

## 결론

P0 판정은 **RESOLVED**다. V4는 DB room registry나 pairing 없이 identity secret에서 profile별 deterministic installation ID와 내부 scope를 만들고 current/previous HMAC으로 요청을 인증한다. 다만 운영 DB migration 적용 여부, Vercel 환경변수 구성 여부와 실기기 동작은 확인하지 않았으므로 실제 배포는 계속 보류한다.

## 확인됨

- `0009_s09_recruiting.sql`에 `recruiting.command_receipts`와 `recruiting.nonce_bindings`가 있다.
- receipt에는 `key_hash`, `request_hash`, `body_digest_hex`, `response_status`, `response_json`, `response_revision`이 있고 `(actor_principal_id, scope, key_hash)` unique index가 있다.
- nonce에는 `nonce_hash`, `binding_hash`, `key_id`가 있고 `(actor_principal_id, nonce_hash)` unique index가 있다.
- `0031`은 installation/room/member/pairing 테이블, `0032`는 installation key와 bot version, `0033`은 installation당 canonical room FK, `0034`는 `RECRUIT | FEATURES` capability profile을 추가한다. 모두 Drizzle journal에 순서대로 등록돼 있다.
- assistant read/static reply와 recruiting/operation-form mutation은 transaction 안에서 nonce·receipt·body digest·저장 응답 replay를 사용한다.
- V4 route와 기존 V3 `/api/integrations/kakao/*` route는 소스에서 함께 존재한다.
- V4 `RECRUIT`와 `FEATURES`는 같은 identity secret을 써도 profile ID를 HMAC material에 포함해 서로 다른 installation ID와 내부 room scope를 만든다.
- 두 profile은 서버 current/previous signing-key 집합으로 raw envelope를 검증하며 envelope profile과 deterministic installation ID가 일치해야 한다.
- V4 route에는 room registry와 pair-room 의존성이 없다. V3/V41 route와 pairing 동작은 변경하지 않았다.
- 생성된 휴대폰 파일의 최종 크기·해시는 release-candidate QA에서 다시 기록하며 설치 직전 동일한 줄바꿈으로 대조한다.

## 추정

- migrations가 `0034`까지 적용되고 필수 환경변수가 올바르게 설정된 별도 staging이라면 runtime service는 생성될 가능성이 높다. 실제 DB와 Vercel에 접근하지 않았으므로 확정하지 않는다.
- 기존 V3 서버 route를 유지한 채 휴대폰 봇만 한 방씩 V4로 전환하면 서버 측 dual intake는 가능하다. 같은 방에서 V41과 V4를 동시에 실행하면 중복 응답·중복 요청 가능성이 있어 안전한 dual-run으로 보지 않는다.

## 미확인

- 운영 Neon의 migration head, 테이블·컬럼·index·constraint 실제 상태
- Vercel Production/Preview 환경변수의 configured 여부와 환경 범위
- DB `kakao_operation_settings` singleton 및 기능별 enable 상태
- Production/Preview의 V4 identity secret과 current/previous signing key configured 상태
- MessengerBot R 컴파일, callback, 네트워크 재시도, 실제 카카오 줄바꿈·링크 동작
- 운영 로그의 replay/conflict/reject code와 실제 복구 시간

## 배포 전 항목

### P0 — RESOLVED: V4 installation-scope 인증

- V4 installation ID는 identity secret과 `KLOL_V4 + profileId` HMAC으로 결정되며 RECRUIT와 FEATURES가 분리된다.
- 서버는 같은 identity secret으로 installation/profile을 검증하고 installation ID에서 내부 scope를 결정한다.
- V4 휴대폰과 route는 pair-room이나 room registry를 사용하지 않는다.
- current/previous signing key, wrong installation/profile/signature, replay와 cross-sender 동작을 자동 테스트로 확인했다.
- 운영 환경변수 값과 실기기 동작은 별도 확인 전까지 미확인이다.

### P1 — 일부 응답은 durable receipt 바깥

- `V4상태`, `V4계약확인`, 도움말과 잘못된 운영 양식 안내는 application의 process-local `Map` 또는 직접 응답 경로를 사용한다.
- 주요 조회·mutation은 durable하지만, 모든 command가 재시작 후 동일 저장 응답을 보장하는 것은 아니다.
- 해제 조건: release 범위를 주요 데이터 명령으로 명시하거나 local/invalid 응답도 공통 durable receipt로 통일한다.

### P1 — 기존 운영 문서의 V4 정식 설치 절차 반영

- 현재 `MESSENGERBOT_R_INSTALL.md`의 V41 pairing 절차는 그대로 유지한다. V4 두 profile의 백업, identity 설정, canary, 전환, 해시 확인 절차는 release-candidate QA에 기록한다.
- 운영 적용 전에 V4 절차를 정식 설치 문서로 승격해야 한다.

## Migration 판정

새 migration은 필요하지 않다. 저장소 schema에 필요한 테이블·컬럼·unique/check/FK가 모두 있고 migration `0009`, `0031`~`0034`에 대응한다. 운영 DB 적용 여부는 미확인이므로 배포 전 read-only schema probe가 반드시 필요하다. 자동 down migration이나 데이터 변경은 권장하지 않는다.

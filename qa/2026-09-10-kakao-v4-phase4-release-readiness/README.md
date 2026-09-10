# Kakao V4 Phase 4 release-readiness 감사

감사일: 2026-09-10 KST

기준 커밋: `924ebd187c0064274a403414881fbf7cd4a3b362`

브랜치: `chore/kakao-v4-phase4-release-readiness-20260910`

## 결론

판정은 **배포 보류**다. V4 기능·생성 산출물·서버 route와 필요한 additive DB migration은 저장소에 존재하지만, 신규 V4 설치본이 canonical 방에 최초 pairing되는 지원 경로가 없다. 운영 DB migration 적용 여부, Vercel 환경변수 구성 여부, 실기기 동작도 이번 범위에서는 확인하지 않았다.

## 확인됨

- `0009_s09_recruiting.sql`에 `recruiting.command_receipts`와 `recruiting.nonce_bindings`가 있다.
- receipt에는 `key_hash`, `request_hash`, `body_digest_hex`, `response_status`, `response_json`, `response_revision`이 있고 `(actor_principal_id, scope, key_hash)` unique index가 있다.
- nonce에는 `nonce_hash`, `binding_hash`, `key_id`가 있고 `(actor_principal_id, nonce_hash)` unique index가 있다.
- `0031`은 installation/room/member/pairing 테이블, `0032`는 installation key와 bot version, `0033`은 installation당 canonical room FK, `0034`는 `RECRUIT | FEATURES` capability profile을 추가한다. 모두 Drizzle journal에 순서대로 등록돼 있다.
- assistant read/static reply와 recruiting/operation-form mutation은 transaction 안에서 nonce·receipt·body digest·저장 응답 replay를 사용한다.
- V4 route와 기존 V3 `/api/integrations/kakao/*` route는 소스에서 함께 존재한다.
- V4 `RECRUIT`와 `FEATURES`는 같은 identity secret을 써도 profile ID를 HMAC material에 포함해 서로 다른 installation ID를 만든다.
- 두 profile은 동일한 서버 current/previous signing-key 집합을 사용하고, DB installation의 `key_id`에 현재 공개 key ID가 결합된다. 방의 capability profile과 envelope profile이 같아야 한다.
- 생성된 휴대폰 파일은 각 219줄이다. `build-messengerbot:v4`가 만든 LF 바이트 기준 SHA-256은 다음과 같다. 전송 도구가 CRLF로 바꾸면 바이트 해시는 달라지므로 설치 직전 동일한 줄바꿈으로 다시 대조한다.
  - RECRUIT: `ad8293a0849a46e7726fe714b6ed5650305f4f9ba1023307dc2e169d93591c28`
  - FEATURES: `5c21f0f2edcdcb81dd75862c084dfee66a1d05fd92e84921b002c30931968744`

## 추정

- migrations가 `0034`까지 적용되고 필수 환경변수가 올바르게 설정된 별도 staging이라면 runtime service는 생성될 가능성이 높다. 실제 DB와 Vercel에 접근하지 않았으므로 확정하지 않는다.
- 기존 V3 서버 route를 유지한 채 휴대폰 봇만 한 방씩 V4로 전환하면 서버 측 dual intake는 가능하다. 같은 방에서 V41과 V4를 동시에 실행하면 중복 응답·중복 요청 가능성이 있어 안전한 dual-run으로 보지 않는다.

## 미확인

- 운영 Neon의 migration head, 테이블·컬럼·index·constraint 실제 상태
- Vercel Production/Preview 환경변수의 configured 여부와 환경 범위
- DB `kakao_operation_settings` singleton 및 기능별 enable 상태
- 실제 RECRUIT/FEATURES canonical room과 installation row의 pairing 상태
- MessengerBot R 컴파일, callback, 네트워크 재시도, 실제 카카오 줄바꿈·링크 동작
- 운영 로그의 replay/conflict/reject code와 실제 복구 시간

## 배포 전 차단 항목

### P0 — V4 최초 pairing 경로 없음

- V4 installation ID는 `KLOL_V4 + profileId`로 생성되어 기존 V41 installation ID와 다르다.
- V4 server service는 command 분류 전에 `authorizeProfile()`을 실행하므로 미연결 설치본은 `ROOM_BINDING_REQUIRED`로 끝난다.
- V4 휴대폰 shared/RECRUIT/FEATURES 코드에는 `/api/integrations/kakao/pair-room` 호출과 `/V2방연동 CODE` 처리가 없다.
- 따라서 DB 직접 조작 없이 신규 V4 설치본을 canonical 방에 연결할 지원 절차가 없다.
- 해제 조건: V4 전용 서명 pairing 명령을 추가하고, profile 일치·일회성 code·replay·잘못된 profile/room을 자동 테스트와 staging에서 검증한다.

### P1 — 일부 응답은 durable receipt 바깥

- `V4상태`, `V4계약확인`, 도움말과 잘못된 운영 양식 안내는 application의 process-local `Map` 또는 직접 응답 경로를 사용한다.
- 주요 조회·mutation은 durable하지만, 모든 command가 재시작 후 동일 저장 응답을 보장하는 것은 아니다.
- 해제 조건: release 범위를 주요 데이터 명령으로 명시하거나 local/invalid 응답도 공통 durable receipt로 통일한다.

### P1 — 기존 운영 문서의 V4 설치 절차 부재

- 현재 `MESSENGERBOT_R_INSTALL.md`는 V41 설치·롤백 절차다. V4 두 profile의 백업, pairing, canary, 전환, 해시 확인 절차는 이번 QA 체크리스트에만 있다.
- P0 해결 후 정식 설치 문서로 승격해야 한다.

## Migration 판정

새 migration은 필요하지 않다. 저장소 schema에 필요한 테이블·컬럼·unique/check/FK가 모두 있고 migration `0009`, `0031`~`0034`에 대응한다. 운영 DB 적용 여부는 미확인이므로 배포 전 read-only schema probe가 반드시 필요하다. 자동 down migration이나 데이터 변경은 권장하지 않는다.

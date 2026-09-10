# Kakao V4 Phase 4+5 release candidate

검증일: 2026-09-10 (Asia/Seoul)

통합 봇 재설계 및 운영 배포 기준 HEAD: `886f3a58bc090278e9ff10f1160121dd84ff35f7`

## 판정

- 소스 release candidate: 자동 검증 통과.
- P0 최초 pairing 차단: **RESOLVED**.
- V4 인증: deterministic `installationId + profile`과 current/previous HMAC 기반.
- V4 room registry/pair-room 의존성: 없음.
- V3/V41 pairing: 변경하지 않음.
- 서버 운영 반영: GitHub `main`과 Vercel Production 배포 확인. 자세한 근거는 `PRODUCTION_DEPLOYMENT.md`.
- 운영 DB 실제 schema 재조회와 MessengerBot-R 실기기: 미확인.
- V4 전용 identity·signing keyring은 Vercel Production에 값 노출 없이 등록했으며 V1/V41 keyring과 분리했다.
- 같은 keyring을 내장한 private one-paste 파일로 운영 서명 요청 HTTP 200을 확인했다.

## 공개 명령 폐쇄

- 모든 V1 PUBLIC alias는 local reply 또는 canonical dispatcher 경로를 가진다.
- PUBLIC alias의 501/`ROUTER_NOT_ENABLED` 응답은 0건이다.
- unknown과 direct internal/raw API 입력은 `INVALID_FORM`으로 fail-closed한다.
- 도움말·봇버전·구인 웹 도움말은 client local reply이며 server send는 0회다.
- internal/raw 명령은 public client transport에 진입하지 않는다.
- 사진 상태와 폐기된 내전 미리보기·확인 명령은 mutation 없이 명시적 안내를 반환한다.

## Installation-scope 보안

- 기준 토폴로지는 휴대폰 1대, MessengerBot R 통합 봇 프로필 1개, 카카오톡 방 2개다.
- 두 분리형 프로필이 두 방에 중복 응답한 실기기 증거를 반영해 통합 callback 하나가 명령 family를 분류한다.
- V4 전용 identity secret과 profile ID로 RECRUIT/FEATURES installation ID를 서로 다르게 결정한다.
- installation ID에서 DB 식별자를 노출하지 않는 내부 room scope를 결정한다.
- profile 교차 사용, 임의 installation ID와 잘못된 signature는 fail-closed한다.
- 파티·스크림은 RECRUIT, 내전·조회·운영은 FEATURES로 분류되어 명령당 서버 전송은 정확히 한 번이다.
- 방 이름·room·channel은 분류나 인증에 사용하지 않는다.
- 두 방의 서로 다른 봇 표시명은 RECRUIT/FEATURES self-echo 이름 설정으로 모두 차단한다.
- 일반 sender 두 명이 같은 installation scope에서 생성·교차 수정·종료할 수 있다.
- 같은 `eventId`와 body는 replay하고 다른 body는 HTTP 409 `REPLAY_CONFLICT`다.

## 남은 확인

- 운영 DB migration head와 receipt/nonce schema 실제 상태.
- 실기기 Rhino 컴파일, callback, 줄바꿈, 링크, 5초 timeout·무재시도 동작.
- MessengerBot R log ID가 두 방 전체에서 유일한지 여부와 같은 family 충돌 가능성.
- 운영 로그와 DB에서 durable replay/conflict가 실제로 한 번만 반영되는지 여부.

## 다음 패치 추천

1. 분리된 staging에서 환경변수 이름·범위와 DB schema를 read-only preflight한다.
2. 통합 봇의 두 방 명령 family 실기기 canary 증거를 자동 수집한다.
3. local reply의 server/client 단일 source 생성을 도입해 문구 drift를 차단한다.
4. local 안내 응답까지 durable receipt가 필요한지 운영 기준을 확정한다.

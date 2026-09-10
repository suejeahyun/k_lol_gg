# Kakao V4 R5 양식 기본값 패치 QA

상태: 소스와 unified MessengerBot R 산출물에 반영하고 로컬 검증을 완료했다. 커밋 `e2a618a4b5b9aec8a706f97cb690b82740d8d021`은 Vercel Production 배포 `dpl_BDynzkQKWpJEvko2SFxT5erTHCEB`에서 Ready와 health/DB `select 1`을 확인했다. 운영 DB 변경, 휴대폰 MessengerBot R 설치·교체, 실제 Kakao 메시지 송수신은 수행하지 않았다.

## 수정 내용

- V1 사용자 표시 계약을 유지했다. 파티 양식은 기존 숫자 모집번호(`#N`)를 사용하고 시작시간·게임정보 줄을 새로 노출하지 않으며, 생성 시 DRAFT 예약 흐름도 유지한다.
- 사용자가 생성된 양식을 그대로 복사해 제출해도 게임정보 누락을 허용한다. DRAFT가 제출로 활성화될 때 게임정보가 없으면 `미입력`, 시작시간이 없으면 DRAFT 생성시각이 아닌 제출 당시 KST 시각을 저장한다.
- 시작시간·게임정보 줄이 제출 본문에 있으면 입력값을 우선하며, 이미 진행 중인 모집의 동기화에서는 저장된 기본값을 불필요하게 다시 덮어쓰지 않는다.
- MessengerBot R의 `INVALID_FORM` 응답은 서버가 제공한 공개 상세 사유를 보존하고, 상세가 없을 때만 기존 일반 안내 문구를 사용한다.
- unified 코드 버전을 `KLOL_KAKAO_BOT_V4_UNIFIED_2026_09_11_R5_FORM_DEFAULTS`로 올리고 단일 붙여넣기 산출물을 다시 생성했다. deprecated split profile은 변경하지 않았다.

## 검증 결과

- `npm run check`: PASS
  - lint: 오류 0건, 기존 경고 26건
  - typecheck: PASS
  - 계약 테스트: 312/312 PASS
  - 단위 테스트: 619/619 PASS
  - 여성 챔피언 이미지: 68/68 PASS
  - Next production build: 92 pages PASS
- Kakao unified 클라이언트·산출물·공개 계약·private installer 관련 테스트: 32/32 PASS
- 최종 산출물 재생성 후 클라이언트·산출물·공개 계약 테스트: 31/31 PASS
- `/봇버전`: R5 문자열을 로컬에서 한 번 응답하고 서버 transport를 호출하지 않는 회귀 테스트 PASS
- V1 숫자 양식을 `/` 유무와 관계없이 복사 제출하며 시작시간·게임정보 줄이 없는 dispatcher/domain 회귀 테스트 PASS
- 생성 산출물: `integrations/messengerbot-r/v4/KLOL_KAKAO_BOT_V4_UNIFIED_MESSENGERBOT_R.js`, 15,056자
- 생성 산출물 SHA-256: `5F350836FECC477699EEE0C1EA9481C8107AC76D5EBCD0A10D9A58318D87BDB0`

## 운영 반영 상태와 남은 위험

- 운영 서버에는 반영됐지만 휴대폰 설치본은 미확인이다. 산출물을 실제 교체한 뒤 `/봇버전`이 위 R5 문자열을 반환하는지 확인해야 실기기 설치 완료로 판정할 수 있다.
- 정확한 생성 문자열의 `/` 유무 제출은 로컬 fixture로 검증했다. 실제 Kakao/MessengerBot R 환경에서 생기는 추가 줄바꿈·끝 공백 변형과 네트워크 재시도는 실기기 송수신으로 확인하지 않았다.
- 제출 기본 시각은 서버가 받은 시각과 KST 변환에 의존하므로 운영 서버 시계 동기화가 필요하다.
- `INVALID_FORM`은 서버가 공개 응답으로 선택한 상세만 전달하지만, 새 파서 사유를 추가할 때 내부 값이나 비밀정보를 포함하지 않는지 계속 검토해야 한다.
- DRAFT 번호 예약과 장기 미제출 DRAFT 정리 정책은 기존 동작을 보존했으며 이번 패치에서 변경하지 않았다.

## 다음 패치 추천

1. 실제 휴대폰에서 생성한 V1 양식의 줄바꿈·끝 공백 fixture를 익명화해 `/` 유무 제출 회귀에 추가한다.
2. 파서 거절 사유를 비밀정보가 없는 고정 공개 코드와 문구로 정리하고, `INVALID_FORM` 발생률만 집계해 경계 회귀를 관측한다.
3. KST 자정 전후와 제출 재시도에서 시작시간 기본값·idempotency 결과가 유지되는 계약 테스트를 추가한다.
4. 설치 전 산출물 SHA-256 확인, 설치 후 `/봇버전` R5 확인, 실패 시 이전 설치본 복구를 한 체크리스트로 고정한다.

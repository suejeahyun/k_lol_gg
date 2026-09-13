# 카카오 V1 strict R11 private 설치본 정합성 QA

## 판정

- 확인됨: 운영 서버가 반환한 주최자 전용 파티 양식은 R9 휴대폰 설치본에서 참가행이 없어 `isPartyRecruitFormMessage=false`가 되고, 서버 요청과 봇 응답 없이 종료된다.
- 확인됨: 추적 중인 공개 생성 기준 파일은 R11이었지만 설치 안내가 가리키는 로컬 `.private` 한 번 붙여넣기 파일과 안내 문서는 R9에 머물러 있었다.
- 확인됨: 기존 private 설정 4개를 값 노출 없이 보존해 R11 한 번 붙여넣기 파일을 다시 생성했다.
- 확인됨: 실제 제보 문자열은 R11에서 `isPartyMetadataActivationForm` → `isPartyRecruitFormMessage` → `isRecruitCommand` → `handlePartyRecruitSync` 순으로 분류되어 RECRUIT 요청 1회와 응답 1회로 이어진다.
- 미확인: 실제 휴대폰 MessengerBot R 교체·컴파일과 실제 카카오방 송수신.

## 수정과 생성 근거

- private 생성기는 공개 검토 파일의 런타임 미사용 provenance 배열만 휴대폰 산출물에서 제외한다. 실행 로직과 기존 private 설정은 유지하며 LF·CRLF 모두 65,535자 미만으로 검사한다.
- 설치 안내는 `.private/KLOL_KAKAO_BOT_V1_STRICT_PRIVATE_MESSENGERBOT_R.js`만 휴대폰 설치 대상으로 지정하고 공개 검토 파일과 R9 설치를 금지한다.
- 버전: `KLOL_KAKAO_BOT_V40_SITE_FIRST_NO_CODES_R11_2026_09_13_ALL_MODE_DRAFT`
- LF 문자: `61,135`
- CRLF 문자: `62,912`
- SHA-256: `fb21ea0aeb65f7f878b080edea8b099bc7409b3a3042551af5e72a021c0516bf`
- 기존 private 설정 일치 검사: 4/4, 값 출력 없음

## 검증 결과

- `npm run bot:kakao:v1-strict`: 통과, 공개 R11 LF 63,517 / CRLF 65,371
- `npm run bot:kakao:v1-strict:private`: 통과, private R11 LF 61,135 / CRLF 62,912
- `node --test tests/kakao-v1-strict-messengerbot.test.mjs tests/kakao-v1-exact-v4-adapter-architecture.test.mjs`: 26/26 통과
- `npx tsx --test tests/kakao-party-snapshot-parser-p0.test.ts`: 9/9 통과
- 대상 ESLint와 `git diff --check`: 통과

## 운영 반영 상태와 남은 위험

서버 R11 기능의 기존 Vercel 운영 배포와 별개로, 이번 private 재생성 파일은 로컬 ignored 산출물이다. 실제 휴대폰에는 아직 설치하지 않았으므로 카카오 운영 반영 완료로 판정하지 않는다. 설치 전 기존 휴대폰 코드를 백업하고 파일 전체 교체 후 `봇버전`, 컴파일, 실제 양식 왕복을 확인해야 한다.

## 다음 패치 추천

1. private 생성과 설치 문서의 버전·해시 드리프트를 CI 또는 릴리스 검사에서 차단한다.
2. 휴대폰에서 `봇버전`과 설치 파일 SHA-256을 기록하는 체크리스트를 완료한다.
3. 실제 방에서 파티 생성→주최자 양식 활성화→상세 추가·삭제→현황을 한 회차 검증한다.
4. 휴대폰에서 분류되지 않은 구조화 양식 수를 비밀값·본문 없이 관측할 수 있는 안전한 진단 경로를 검토한다.

# MessengerBot R V1-strict

이 디렉터리는 사용자가 제공한 V1/V40 원본의 `response()` 순서, 명령 판정, 로컬 문구, 무응답과 echo 방지를 그대로 유지하면서 전송 경계만 현재 V4 HMAC 명령 API로 교체한다.

- 원본: Git `4f84e84aa0a4ee986c2aad2c7377d8e3bcf2e097:KLOL_KAKAO_BOT_V40_GUIDED_HUB.js`
- Git LF blob SHA-256: `0514eb3c26862ffedfc132dbe1b258db25d30657aaf8455429467a151bfb18a2`
- 사용자 제공 CRLF 파일 SHA-256: `c91a56a289a762fe7e08143e8fd4b55c9695c4df68ebfcb6689613dcb73776b7`
- 빌드: `node scripts/build-messengerbot-v1-strict.mjs`
- 테스트: `node --test tests/kakao-v1-strict-messengerbot.test.mjs`
- 공개 검토 파일: `KLOL_KAKAO_BOT_V1_STRICT_MESSENGERBOT_R.js`
- 휴대폰 한 번 붙여넣기 파일: `.private/KLOL_KAKAO_BOT_V1_STRICT_PRIVATE_MESSENGERBOT_R.js`

휴대폰 DataBase에는 기존 V4와 같은 `KLOL_V2_BASE_URL`, `KLOL_V4_KAKAO_WEBHOOK_SECRET_CURRENT`, `KLOL_V4_KAKAO_WEBHOOK_KEY_ID_CURRENT`, `KLOL_V4_KAKAO_IDENTITY_SECRET` 값이 필요하다. Git에 추적하는 공개 파일에는 비밀값이 없고, `.private`의 로컬 한 번 붙여넣기 파일에만 안전하게 포함한다.

공개 생성본과 비공개 한 번 붙여넣기 생성본은 LF뿐 아니라 CRLF로 저장해도 65,535자 미만인지 빌드 시 확인한다. V1 원본 실행·주석 줄을 보존하면서 빈 spacer 줄만 제거한다. 한 대의 휴대폰에서 봇 프로필 하나가 두 실제 방을 구독하고, 메시지 계열에 따라 `RECRUIT`/`FEATURES` 서버 프로필을 선택한다. 자세한 설치 순서는 상위 `MESSENGERBOT_R_INSTALL.md`를 따른다.

V40 R2의 실제 활성 흐름은 관리 명령을 `handleSiteFirstManagedWorkflow`에서 사이트 링크로 끝낸다. `handleManagedWorkflowMessage`와 `rememberManagedUploadCode`는 해당 `response()`에서 호출되지 않으므로 새 사진 세션이 생성되지 않는다. 정상 설치 설정이 있고 저장된 사진 세션이 없는 clean 상태에서 `imageDB` 입력은 응답과 HTTP 요청 없이 끝난다. V1 exact 범위에서는 이를 그대로 유지하며, V1에 없던 UUID 사진 세션 명령이나 image API 확장을 추가하지 않는다.

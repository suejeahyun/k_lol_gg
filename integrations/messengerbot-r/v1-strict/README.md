# MessengerBot R V1-strict

이 디렉터리는 사용자가 제공한 V1/V40 원본을 기준으로 전송 경계를 V4 HMAC 명령 API에 연결한다. 원본 fixture는 불변이며, 승인된 [ADR0011 파티 편집](../../../docs/architecture/0011-kakao-party-editable-copy-flow.md)·[ADR0012 내전 편집](../../../docs/architecture/0012-kakao-inhouse-editable-copy-flow.md)의 제품 동작을 현재 생성본에 반영한다. 승인 범위 밖의 `response()` 순서, 로컬 명령, 무응답과 echo 방지는 원본 계약을 유지한다.

현재 공개 생성본은 `KLOL_KAKAO_BOT_V40_R32_2026_10_28`다. R32는 공통 원본 알림 모듈로 카카오 패키지·Android 사용자·사전 등록한 플랫폼 대화방 `shortcutId` 문자열을 확인한 뒤 기존 처리기에 연결한다. SDK의 잘못된 방 이름을 받은 공개 `response`는 비활성화한다. NEXUS 일반 봇도 독립 R32로 갱신한다. `/sdcard/msgbot/global_modules/KAKAO_ROOM_ROUTER.js`와 네 방이 모두 등록된 공통 `KAKAO_ROOM_BINDINGS_V1`이 필수다. 설치·교체는 [공통 모듈과 네 방 등록 안내](../MESSENGERBOT_R_INSTALL.md)를 따른다. 서버의 양식 호환과 휴대폰 설치는 별개다. 사용자 확인 앱 버전 **MessengerBot R 0.7.29a**는 봇 JS 버전과 다르다. 사이트 충원 알림은 일반 봇과 분리된 [기본 OFF companion](../site-notices/README.md)으로 설치한다.

- 원본: Git `4f84e84aa0a4ee986c2aad2c7377d8e3bcf2e097:KLOL_KAKAO_BOT_V40_GUIDED_HUB.js`
- Git LF blob SHA-256: `0514eb3c26862ffedfc132dbe1b258db25d30657aaf8455429467a151bfb18a2`
- 사용자 제공 CRLF 파일 SHA-256: `c91a56a289a762fe7e08143e8fd4b55c9695c4df68ebfcb6689613dcb73776b7`
- 빌드: `node scripts/build-messengerbot-v1-strict.mjs`
- 테스트: `node --test tests/kakao-v1-strict-messengerbot.test.mjs`
- 공개 검토 파일: `KLOL_KAKAO_BOT_V1_STRICT_MESSENGERBOT_R.js`
- 휴대폰 한 번 붙여넣기 파일: `.private/KLOL_KAKAO_BOT_V1_STRICT_PRIVATE_MESSENGERBOT_R.js`

휴대폰 DataBase에는 기존 V4와 같은 `KLOL_V2_BASE_URL`, `KLOL_V4_KAKAO_WEBHOOK_SECRET_CURRENT`, `KLOL_V4_KAKAO_WEBHOOK_KEY_ID_CURRENT`, `KLOL_V4_KAKAO_IDENTITY_SECRET` 값이 필요하다. Git에 추적하는 공개 파일에는 비밀값이 없고, `.private`의 로컬 한 번 붙여넣기 파일에만 안전하게 포함한다.

공개 생성본과 비공개 한 번 붙여넣기 생성본은 LF뿐 아니라 CRLF로 저장해도 65,535자 미만인지 빌드 시 확인한다. V1 원본 실행 줄은 보존하며 주석과 빈 줄을 제거한다. 유지보수하는 전송·어댑터 코드만 토큰 단위로 구분자·연산자 주변 공백을 줄인다. 문자열·정규식은 보존하며 줄바꿈은 명시적 세미콜론과 닫는 블록 사이, 여는 중괄호 바로 뒤에서 추가로 줄인다. 한 대의 휴대폰에서 봇 프로필 하나가 두 실제 방을 구독하고, 메시지 계열에 따라 `RECRUIT`/`FEATURES` 서버 프로필을 선택한다. 재컴파일은 이전 router를 먼저 중지해 이전 실행 컨텍스트가 새 알림에 응답하지 않게 한다. 자세한 설치 순서는 상위 `MESSENGERBOT_R_INSTALL.md`를 따른다.

V40 R2의 실제 활성 흐름은 관리 명령을 `handleSiteFirstManagedWorkflow`에서 사이트 링크로 끝낸다. `handleManagedWorkflowMessage`와 `rememberManagedUploadCode`는 해당 `response()`에서 호출되지 않으므로 새 사진 세션이 생성되지 않는다. 정상 설치 설정이 있고 저장된 사진 세션이 없는 clean 상태에서 `imageDB` 입력은 응답과 HTTP 요청 없이 끝난다. V1 exact 범위에서는 이를 그대로 유지하며, V1에 없던 UUID 사진 세션 명령이나 image API 확장을 추가하지 않는다.

R26은 글자 알림에서 이미지 API 호출을 생략한다. V1 원본 함수는 보존하고 진입부에서 사진·빈 메시지에만 imageDB를 전달한다. 봇속도는 최근 서버 요청의 처리/왕복 ms만 표시하며 비밀값·메시지·회원정보를 출력하지 않는다. 휴대폰 65,535자 제한을 지키기 위해 전송 모듈의 내부 변수명을 축약했다.

R27 진단 명령은 원래 Replier로 직접 응답하며 서버 요청 상태를 읽거나 초기화하지 않는다. 봇버전에도 마지막 측정을 표시한다. 고정 진단 로그로 SDK 호출 결과를 확인하며 서버·명단·사이트 알림 코드는 바꾸지 않는다.

R28은 `구인상세 모집코드`, `상세 모집코드 추가/삭제 이름`, `구인마감 모집코드`, `모집코드ㅉ`를 서버에 원문 그대로 한 번 전송한다. 숫자 명령은 현재 운영일을 대상으로 유지한다. 새 `모집코드`·`명단버전` 전체 양식은 기존 compact copy 전달과도 호환되지만 코드로 직접 조회·마감하는 명령은 R28 설치가 필요하다.

R29는 답장 거부·예외와 일시적 HTTP 오류를 전달 완료로 기록하지 않는다. 같은 알림이 다시 들어오면 기존 서명 요청을 유지하면서 성공 결과를 다시 전달하고, 정상 전달한 성공 답장은 중복 출력하지 않는다. 내전 마감은 `내전 7쫑`·`내전 7마감`·`내전 7종료`·`내전 #7ㅉ`와 전각 입력도 처리한다. 자동 네트워크 재시도는 추가하지 않는다.

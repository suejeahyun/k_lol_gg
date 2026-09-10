# 사용 중단된 분리형 V4 산출물

이 폴더의 RECRUIT/FEATURES 파일은 과거 자동 검증 재현용이며 운영 설치 대상이 아니다.

한 휴대폰에서 두 봇 프로필을 실행하면 MessengerBot R이 두 카카오톡 방의 알림을 두 프로필 모두에 전달할 수 있어 중복 응답이 발생한다. 운영에는 상위 `KLOL_KAKAO_BOT_V4_UNIFIED_MESSENGERBOT_R.js` 한 파일만 사용한다.

- 두 분리형 파일을 동시에 설치하지 않는다.
- 이미 설치했다면 두 분리형 봇 프로필을 모두 중지한 뒤 통합 파일로 새 봇 프로필 하나를 구성한다.
- 이 파일들은 `scripts/build-messengerbot-v4.mjs`가 더 이상 생성하거나 갱신하지 않는다.

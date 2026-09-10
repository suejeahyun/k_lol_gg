# 환경변수 이름

값은 이 문서와 Git에 기록하지 않는다.

## Server 필수 이름

- `DATABASE_URL`
- `DATABASE_POOL_MAX`
- `V2_PUBLIC_ORIGIN`
- `KLOL_V2_KAKAO_IDENTITY_SECRET`
- `KAKAO_WEBHOOK_SECRET_CURRENT`
- `KAKAO_WEBHOOK_KEY_ID_CURRENT`

## Server 회전 기간에만 사용하는 이름

- `KAKAO_WEBHOOK_SECRET_PREVIOUS`
- `KAKAO_WEBHOOK_KEY_ID_PREVIOUS`

## MessengerBot-R private DataBase 이름

- `KLOL_V2_BASE_URL`
- `KLOL_V2_KAKAO_IDENTITY_SECRET`
- `KLOL_V2_KAKAO_WEBHOOK_SECRET_CURRENT`
- `KLOL_V2_KAKAO_WEBHOOK_KEY_ID_CURRENT`

## MessengerBot-R self echo 이름

- `KLOL_V4_BOT_SELF_NAME_RECRUIT`: 구인 관련방에 표시되는 봇 이름
- `KLOL_V4_BOT_SELF_NAME_FEATURES`: 기능방에 표시되는 봇 이름
- `KLOL_V4_BOT_SELF_NAME_UNIFIED`: 두 방에서 동일한 통합 봇 이름을 쓸 때만 선택적으로 설정

V4 기준 구성은 휴대폰 1대의 MessengerBot R 통합 봇 프로필 1개다. 위 네 DataBase 설정은 같은 휴대폰에서 한 번 저장한다. identity secret은 server와 통합 봇에서 같아야 하며 signing secret과 재사용하지 않는다. 통합 봇은 같은 identity secret을 사용하되 명령 family에서 선택한 RECRUIT/FEATURES profile ID를 HMAC material에 포함해 서로 다른 installation ID를 만든다.

두 카카오톡 방에서 봇 표시명이 다르면 위 RECRUIT/FEATURES self echo 이름 두 값을 모두 저장한다. 이 값은 echo 방지용일 뿐 방 인증이나 사용자 권한에 사용하지 않는다.

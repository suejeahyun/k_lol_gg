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

V4 기준 구성은 휴대폰 1대의 MessengerBot R 봇 프로필 2개다. 위 네 DataBase 설정은 같은 휴대폰에서 한 번 저장하고 RECRUIT/FEATURES 프로필이 공동으로 읽는다. identity secret은 server와 두 봇 프로필에서 같아야 하며 signing secret과 재사용하지 않는다. RECRUIT와 FEATURES는 같은 identity secret을 공유해도 profile ID가 HMAC material에 포함되어 서로 다른 installation ID를 만든다. 휴대폰 2대는 필요하지 않다.

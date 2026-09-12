# MessengerBot R V1 strict R8 설치 안내

## 현재 설치본

운영 휴대폰에는 아래 **비공개 한 파일만** 전체 복사해 설치한다.

`.private/KLOL_KAKAO_BOT_V1_STRICT_PRIVATE_MESSENGERBOT_R.js`

이 설치본은 사용자가 제공한 V1/V40의 명령 판정, 양식, 정상 응답과 무응답 동작을 유지하고 HTTP 전송 경계만 현재 V4 서명 API로 연결한다. `TRANSPORT`, `ADAPTER`, V41 또는 V4 파일을 함께 붙이지 않는다.

한 대의 휴대폰에서 MessengerBot R 봇 프로필 하나가 구인구직방과 기능방 두 곳을 구독한다. 메시지 내용에 따라 서버 프로필을 자동 선택한다.

- 파티·구인·스크림 계열: `RECRUIT`
- 내전·전적·랭킹·운영 양식 계열: `FEATURES`

카카오 알림 parser의 방 이름은 인증이나 라우팅에 쓰지 않는다. 따라서 잘못된 방에서 명령을 보내도 명령 종류가 맞으면 실행될 수 있다. 물리적인 두 방 분리는 MessengerBot R의 구독 대상과 운영 안내로 유지한다.

## 한 번에 교체하는 순서

1. 휴대폰 MessengerBot R에서 기존 K-LOL 봇을 중지한다.
2. 기존 소스를 휴대폰 밖의 안전한 장소에 백업한다.
3. 소스 편집기의 내용을 전체 선택해 완전히 지운다.
4. `.private/KLOL_KAKAO_BOT_V1_STRICT_PRIVATE_MESSENGERBOT_R.js`의 첫 글자부터 마지막 글자까지 한 번에 붙여 넣는다.
5. 파일 안에서 `KLOL_KAKAO_BOT_V40_SITE_FIRST_NO_CODES_R8_2026_09_12`를 검색한다.
6. 마지막 줄이 `response.__kakaoBotEntryPoint = true;`인지 확인한다.
7. 저장·컴파일 후 봇을 다시 시작한다.
8. 같은 봇 프로필의 응답 대상에 구인구직방과 기능방 두 곳만 활성화한다.
9. 두 방에서 각각 `봇버전`과 `/봇버전`을 확인한다.

휴대폰에 붙일 비공개 파일에는 필요한 네 설정을 먼저 `DataBase`에 기록하는 초기화 코드가 포함되어 있다. 값을 채팅이나 Git에 복사하지 않는다. 공개 설치본은 비밀값이 없으므로 휴대폰 `DataBase`에 설정이 이미 존재할 때만 단독으로 동작한다.

## 현재 파일 검증값

| 용도 | 파일 | LF 문자 | CRLF 문자 | 물리 줄 | SHA-256 |
| --- | --- | ---: | ---: | ---: | --- |
| 공개·비밀값 없음 | `integrations/messengerbot-r/v1-strict/KLOL_KAKAO_BOT_V1_STRICT_MESSENGERBOT_R.js` | 62,037 | 63,829 | 1,793 | `a9e83edad5deadf49d782ad606ef7784bd40aa50809884fe61dca3d62dabc725` |
| 휴대폰 한 번 붙여넣기 | `.private/KLOL_KAKAO_BOT_V1_STRICT_PRIVATE_MESSENGERBOT_R.js` | 62,545 | 64,345 | 1,801 | `6ef9a734ee10ed9e79f1494a5ec2a8bd7bcecfaa74a145416c08d83ad604e5fc` |

두 파일 모두 LF와 CRLF에서 MessengerBot R의 65,535자 제한보다 작다. 빌드가 두 줄바꿈 형식과 ES5 parser, Rhino `CODE_HAS_NO_SIDE_EFFECTS` 후보를 모두 검사한다. V1 원본의 실행·주석 줄은 유지하고 의미 없는 빈 줄만 제거했다.

해시나 끝 표시가 다르면 일부만 복사됐거나 다른 버전이 섞인 것이다. 오류 행에 임의로 `}`나 따옴표를 추가하지 말고 전체 파일을 다시 교체한다.

## 서버 연결 확인

비공개 설치본의 설정은 다음 네 항목이다.

- `KLOL_V2_BASE_URL`
- `KLOL_V4_KAKAO_WEBHOOK_SECRET_CURRENT`
- `KLOL_V4_KAKAO_WEBHOOK_KEY_ID_CURRENT`
- `KLOL_V4_KAKAO_IDENTITY_SECRET`

공개 저장소나 문서에는 실제 값이 없어야 한다. 서버와 휴대폰 서명 키·키 ID가 글자 하나까지 같아야 하며 identity secret은 서명 키와 다른 32바이트 이상 값이어야 한다.

로컬 비공개 설정을 이용한 운영 읽기 전용 smoke는 `RECRUIT`와 `FEATURES` 두 프로필 모두 HTTP 200 및 command gateway 정상 응답을 확인한다.

```powershell
npm run bot:kakao:v1-strict
npm run bot:kakao:v1-strict:private
node scripts/verify-private-messengerbot-v1-strict-live.mjs
```

이 검사는 비밀값을 출력하지 않는다. 실제 휴대폰 컴파일과 카카오 송수신은 휴대폰 설치 후 별도로 확인해야 한다.

## 기능 확인 순서

구인구직방:

1. `5인파티` → 양식만 출력되고 사용자에게 보이는 구인은 아직 시작되지 않음
2. 출력 양식에 참가자를 넣어 다시 전송 → 저장 후 최신 구인현황 표시
3. `구인현황`, `상세 번호`, 다른 사용자가 만든 `번호ㅉ`
4. `스크림구인`, `스크림현황`

기능방:

1. `내전구인`, `내전현황`
2. 전체 내전 양식의 참가자 추가·수정·빈칸 취소
3. `전적 RiotID#태그`, `최근 RiotID#태그`, `랭킹`
4. 외출·지인·건의·모임 양식

모든 명령은 맨 앞 `/`가 있거나 없어도 같게 처리한다. 구인 운영일은 KST 오전 6시에 바뀌며 이전 운영일의 파티·스크림은 새 현황에서 보이지 않는다.

## 판정 기준

- 소스 빌드·ES5/Rhino·서명 smoke 통과: 코드와 서버 연결 확인
- 휴대폰 컴파일 성공: 설치 파일 무결성 확인
- 실제 두 방에서 위 기능 확인: 외부 설치 완료

앞의 두 단계만 통과한 상태를 휴대폰 운영 완료라고 기록하지 않는다.

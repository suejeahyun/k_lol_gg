# MessengerBot R V41 설치 안내

## 휴대폰 제한 대응본을 우선 사용

MessengerBot R에는 아래 **한 파일만** 설치한다.

`KLOL_KAKAO_BOT_V41_MESSENGERBOT_R.js`

이 파일은 모든 기능을 포함하면서 MessengerBot R의 65,535자 제한 아래로 생성한 설치 코드다. 세미콜론을 보존하고 충분한 줄바꿈을 넣어 Rhino strict 경고 없이 읽을 수 있게 했다. `TRANSPORT`, `V1_COMPAT`, `ROUTER` 파일을 따로 붙이거나 기존 `response()` 함수 안에 넣지 않는다.

`KLOL_KAKAO_BOT_V41_V2_COMPLETE.js`는 개발·검토용 전체본이며 휴대폰 편집기에는 넣지 않는다. 비공개 설정이 포함된 소유자용 설치 산출물은 Git에서 제외된 `.tmp/KLOL_KAKAO_BOT_V41_V2_PHONE_WARNINGFREE_PRIVATE.js`다. 소유자는 별도 설정 입력이 필요 없는 이 비공개 파일을 설치한다.

## 완전 교체 순서

1. MessengerBot R에서 해당 봇을 중지한다.
2. 필요하면 기존 소스를 휴대폰 밖의 안전한 위치에 백업한다. 비밀 설정값은 소스에 넣지 않는다.
3. 소스 편집기의 기존 내용을 전체 선택해 지운다.
4. 설치용 파일 전체를 첫 글자부터 마지막 글자까지 붙여 넣는다.
5. 설치본 안에 `KLOL_KAKAO_BOT_V41_V2_2026_09_09_R6_V1_EXACT`가 있는지 검색한다.
6. 끝부분에 `response.__kakaoBotEntryPoint=!0;`가 있는지 확인한다. `!0`은 압축된 `true`다. 휴대폰 설치본은 용량 절약을 위해 개발용 START/END 변수를 포함하지 않는다.
7. 저장 후 컴파일하고 봇을 다시 시작한다.
8. 카카오톡 방에서 `/봇버전`을 보내 `KLOL_KAKAO_BOT_V41_V2_2026_09_09_R6_V1_EXACT`가 출력되는지 확인한다.

편집기의 자동 줄바꿈은 화면에 보이는 줄 수를 늘릴 수 있다. 가능하면 파일 관리자나 전송 도구에서 바이트와 SHA-256을 확인한다.

## 1567행 `missing }` 진단

과거 오류는 설치 코드가 약 65,535자에서 잘려 문자열과 함수가 닫히지 않으면서 발생했다.

```javascript
function v41JsonAfter(text, prefix) {
  var parsed = JSON.parse(v41Trim(String(text).substring(prefix.length)));
  if (!parsed || typeof parsed !== "object" || v41IsArray(parsed)) throw new Error("JSON 객체 형식을 확인해 주세요.");
  return parsed;
}
```

R6 설치본은 65,535자 미만이며 Rhino 1.7.7/1.7.13/1.7.14 strict 검사에서 경고 0개로 컴파일된다.

따라서 오류 행에 `}`만 추가하지 않는다. 파일 마지막에 END 표식이 없거나 전체 줄 수·해시가 다르면 기존 내용을 완전히 지우고 전체본 파일을 다시 전송한다.

| 확인 결과 | 판정 |
| --- | --- |
| 1,445줄 + R6 버전 + 아래 SHA-256 일치 | 공개 설정 분리형 휴대폰 설치본 |
| 1,446줄 + R6 버전 + 소유자에게 전달한 비공개 파일 해시 일치 | 비공개 설정 포함 휴대폰 설치본 |
| 약 1,567줄에서 끝나고 `response.__kakaoBotEntryPoint=!0;`가 없음 | 붙여 넣기/저장 중 잘린 파일일 가능성이 매우 높음 |
| 2,548줄 + R6 START/END 표식 | 개발·검토용 전체본. 휴대폰에는 설치하지 않음 |
| 줄 수가 다르고 버전 또는 해시도 다름 | 이전 버전, 혼합 붙여 넣기 또는 내용 변형 |

## 비공개 설정

서명 키를 소스에 직접 적지 않는다. MessengerBot R의 `DataBase`에 다음 값을 별도로 저장한다.

- `KLOL_V2_BASE_URL`
- `KLOL_V2_KAKAO_WEBHOOK_SECRET_CURRENT`
- `KLOL_V2_KAKAO_IDENTITY_SECRET`
- `KLOL_V2_ACTIVE_SEASON_ID` (내전 현황·전체 신청 양식을 사용할 때 현재 시즌 UUID)

두 secret은 각각 UTF-8 기준 32바이트 이상이어야 한다. 실제 값은 채팅, 스크린샷, Git, QA 문서에 남기지 않는다.
`KLOL_V2_BASE_URL`도 필수다. 검증한 HTTPS origin만 넣으며 소스에는 운영 주소 기본값이 없다. 설정하지 않으면 링크 안내에는 설정 필요 문구가 표시되고 API 요청은 전송되지 않는다.

서명 값은 서버의 `KAKAO_WEBHOOK_SECRET_CURRENT`와 글자 하나까지 같아야 한다. 익명 식별 값은 서버로 복사하지 않으며 서명 값과도 달라야 한다. 기존 V1의 `KAKAO_RECRUIT_SECRET`, `KAKAO_SEARCH_PLAYER_SECRET`, `KAKAO_OPENCHAT_SECRET` 또는 대응하는 `KLOL_KAKAO_*` 값을 어느 V2 항목에도 재사용하지 않는다.

## 현재 재생성본 확인값

| 용도 | 파일 | 버전 | 물리 줄 수 | 크기 | SHA-256 |
| --- | --- | --- | ---: | ---: | --- |
| 소유자 휴대폰 설치 우선 | `.tmp/KLOL_KAKAO_BOT_V41_V2_PHONE_WARNINGFREE_PRIVATE.js` | `KLOL_KAKAO_BOT_V41_V2_2026_09_09_R6_V1_EXACT` | 1,446 | 72,788 bytes / 62,307자 | `5e1db9451635f56160b010abbc2106279d20d89b1cf1f17d129e21c3d13681df` |
| MessengerBot R 설정 분리형 | `KLOL_KAKAO_BOT_V41_MESSENGERBOT_R.js` | `KLOL_KAKAO_BOT_V41_V2_2026_09_09_R6_V1_EXACT` | 1,445 | 72,420 bytes / 61,939자 | `a66a7aca336d9133e7a50cc7e40e64217fa074ccfe59bd1419fe35ff05073c1d` |
| 개발·검토용 | `KLOL_KAKAO_BOT_V41_V2_COMPLETE.js` | `KLOL_KAKAO_BOT_V41_V2_2026_09_09_R6_V1_EXACT` | 2,548 | 119,686 bytes / 109,071자 | `bc1ac04e6087cb8e19ca8ba88f74f91da133e96c6f52861d75fa43d27e3db57a` |

해시, 크기 또는 끝 표시가 다르면 다른 버전이거나 전송 과정에서 변형된 파일이다.

## 첫 동작 확인

컴파일 성공 뒤 다음 순서로 확인한다.

1. `/봇버전`
2. `/V2연동확인`
3. `/도움말`
4. `5인파티`
5. `구인현황`
6. `내전구인`
7. `스크림구인`
8. `랭킹`

서버 설정이나 서명 키가 아직 없거나 현재 Vercel 배포가 새 환경변수를 읽지 못하면 컴파일은 성공하지만 서버 요청은 안전한 실패 안내를 반환한다.

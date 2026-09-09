# MessengerBot R V41 설치 안내

## 휴대폰 제한 대응본을 우선 사용

MessengerBot R에는 아래 **한 파일만** 설치한다.

`KLOL_KAKAO_BOT_V41_MESSENGERBOT_R.js`

이 파일은 모든 기능을 포함하면서 MessengerBot R의 65,535자 제한 아래로 생성한 설치 코드다. 세미콜론을 보존하고 충분한 줄바꿈을 넣어 Rhino strict 경고 없이 읽을 수 있게 했다. `TRANSPORT`, `V1_COMPAT`, `ROUTER` 파일을 따로 붙이거나 기존 `response()` 함수 안에 넣지 않는다.

`KLOL_KAKAO_BOT_V41_V2_COMPLETE.js`는 개발·검토용 전체본이며 휴대폰 편집기에는 넣지 않는다. 비밀값이 들어간 별도 설치 파일은 만들지 않는다.

## 완전 교체 순서

1. MessengerBot R에서 해당 봇을 중지한다.
2. 필요하면 기존 소스를 휴대폰 밖의 안전한 위치에 백업한다. 비밀 설정값은 소스에 넣지 않는다.
3. 소스 편집기의 기존 내용을 전체 선택해 지운다.
4. 설치용 파일 전체를 첫 글자부터 마지막 글자까지 붙여 넣는다.
5. 설치본 안에 `KLOL_KAKAO_BOT_V41_V2_2026_09_09_R7_SLASH_PARITY`가 있는지 검색한다.
6. 끝부분에 `response.__kakaoBotEntryPoint=!0;`가 있는지 확인한다. `!0`은 압축된 `true`다. 휴대폰 설치본은 용량 절약을 위해 개발용 START/END 변수를 포함하지 않는다.
7. 저장 후 컴파일하고 봇을 다시 시작한다.
8. 카카오톡 방에서 `/봇버전`과 `봇버전`을 각각 보내 `KLOL_KAKAO_BOT_V41_V2_2026_09_09_R7_SLASH_PARITY`가 출력되는지 확인한다.

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

R7 설치본은 65,535자 미만이며 빌드 시 ES5 파서 검사를 통과한다. 실제 Rhino 기기 컴파일은 설치 시 별도 확인한다.

따라서 오류 행에 `}`만 추가하지 않는다. 파일 마지막에 END 표식이 없거나 전체 줄 수·해시가 다르면 기존 내용을 완전히 지우고 전체본 파일을 다시 전송한다.

| 확인 결과 | 판정 |
| --- | --- |
| 1,454줄 + R7 버전 + 아래 SHA-256 일치 | 설정 분리형 휴대폰 설치본 |
| 약 1,567줄에서 끝나고 `response.__kakaoBotEntryPoint=!0;`가 없음 | 붙여 넣기/저장 중 잘린 파일일 가능성이 매우 높음 |
| 2,569줄 + R7 START/END 표식 | 개발·검토용 전체본. 휴대폰에는 설치하지 않음 |
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
| MessengerBot R 설정 분리형 | `KLOL_KAKAO_BOT_V41_MESSENGERBOT_R.js` | `KLOL_KAKAO_BOT_V41_V2_2026_09_09_R7_SLASH_PARITY` | 1,454 | 73,087 bytes / 62,570자 | `fdf7d5b83705cd352abf13cc8f0daae8f640129c5e540f3a3f7b45f85c85b70f` |
| 개발·검토용 | `KLOL_KAKAO_BOT_V41_V2_COMPLETE.js` | `KLOL_KAKAO_BOT_V41_V2_2026_09_09_R7_SLASH_PARITY` | 2,569 | 120,929 bytes / 110,278자 | `38f85591f608de18499f571a383107f882ed16f6894d4394762782e6baef637d` |

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

공개 명령은 같은 허용 방에서 sender allowlist 없이 동작하지만, 내전 신청·관리 양식·예약 공지·이미지 접수는 별도의 trusted sender capability가 필요하다. `/` 유무는 이 권한 판정에 영향을 주지 않는다.

서버 설정이나 서명 키가 아직 없거나 현재 Vercel 배포가 새 환경변수를 읽지 못하면 컴파일은 성공하지만 서버 요청은 안전한 실패 안내를 반환한다.

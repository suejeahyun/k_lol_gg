# MessengerBot R V41 설치 안내

## 휴대폰 제한 대응본을 우선 사용

MessengerBot R에는 아래 **한 파일만** 설치한다.

`KLOL_KAKAO_BOT_V41_MESSENGERBOT_R.js`

이 파일은 모든 기능을 포함하면서 MessengerBot R의 65,535자 제한 아래로 생성한 설치 코드다. 세미콜론을 보존하고 충분한 줄바꿈을 넣어 Rhino strict 경고 없이 읽을 수 있게 했다. `TRANSPORT`, `V1_COMPAT`, `ROUTER` 파일을 따로 붙이거나 기존 `response()` 함수 안에 넣지 않는다.

`KLOL_KAKAO_BOT_V41_V2_COMPLETE.js`는 개발·검토용 전체본이며 휴대폰 편집기에는 넣지 않는다. Git의 두 파일은 모두 비밀값이 없는 공개 소스다. 운영 인계용 private installer는 승인된 비밀 보관소에서 별도로 만들고 Git에는 커밋하지 않는다.

## 완전 교체 순서

1. MessengerBot R에서 해당 봇을 중지한다.
2. 필요하면 기존 소스를 휴대폰 밖의 안전한 위치에 백업한다. 비밀 설정값은 소스에 넣지 않는다.
3. 소스 편집기의 기존 내용을 전체 선택해 지운다.
4. 설치용 파일 전체를 첫 글자부터 마지막 글자까지 붙여 넣는다.
5. 설치본 안에 `KLOL_KAKAO_BOT_V41_V3_2026_09_09_R14_2_INSTALLATION_SCOPE`가 있는지 검색한다.
6. 끝부분에 `response.__kakaoBotEntryPoint=!0;`가 있는지 확인한다. `!0`은 압축된 `true`다. 휴대폰 설치본은 용량 절약을 위해 개발용 START/END 변수를 포함하지 않는다.
7. 저장 후 컴파일하고 봇을 다시 시작한다.
8. 이 설치본이 구독하는 실제 카카오톡 방을 하나만 남긴다. 같은 방의 중복 봇뿐 아니라 동일 설치본으로 다른 방을 함께 구독해서도 안 된다.
9. 카카오톡 방에서 `/봇버전`과 `봇버전`을 각각 보내 `KLOL_KAKAO_BOT_V41_V3_2026_09_09_R14_2_INSTALLATION_SCOPE`, 설치본 ID, 키 ID가 동일하게 출력되는지 확인한다.

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

R14 설치본은 65,535자 미만이며 빌드 시 ES5 파서 검사를 통과한다. 실제 Rhino 기기 컴파일은 설치 시 별도 확인한다.

따라서 오류 행에 `}`만 추가하지 않는다. 파일 마지막에 END 표식이 없거나 전체 줄 수·해시가 다르면 기존 내용을 완전히 지우고 전체본 파일을 다시 전송한다.

| 확인 결과 | 판정 |
| --- | --- |
| 아래 줄 수 + R14.2 버전 + 아래 SHA-256 일치 | 설정 분리형 휴대폰 설치본 |
| 약 1,567줄에서 끝나고 `response.__kakaoBotEntryPoint=!0;`가 없음 | 붙여 넣기/저장 중 잘린 파일일 가능성이 매우 높음 |
| 2,777줄 + R14 START/END 표식 | 개발·검토용 전체본. 휴대폰에는 설치하지 않음 |
| 줄 수가 다르고 버전 또는 해시도 다름 | 이전 버전, 혼합 붙여 넣기 또는 내용 변형 |

## 비공개 설정

서명 키를 소스에 직접 적지 않는다. MessengerBot R의 `DataBase`에 다음 값을 별도로 저장한다.

- `KLOL_V2_BASE_URL`
- `KLOL_V2_KAKAO_WEBHOOK_SECRET_CURRENT`
- `KLOL_V2_KAKAO_WEBHOOK_KEY_ID_CURRENT` (서버 `KAKAO_WEBHOOK_KEY_ID_CURRENT`와 동일한 공개 식별자)
- `KLOL_V2_KAKAO_IDENTITY_SECRET`
- `KLOL_V2_ACTIVE_SEASON_ID` (내전 현황·전체 신청 양식을 사용할 때 현재 시즌 UUID)

두 secret은 각각 UTF-8 기준 32바이트 이상이어야 한다. 실제 값은 채팅, 스크린샷, Git, QA 문서에 남기지 않는다.
`KLOL_V2_BASE_URL`도 필수다. 검증한 HTTPS origin만 넣으며 소스에는 운영 주소 기본값이 없다. 설정하지 않으면 링크 안내에는 설정 필요 문구가 표시되고 API 요청은 전송되지 않는다.

서명 값은 서버의 `KAKAO_WEBHOOK_SECRET_CURRENT`와 글자 하나까지 같아야 한다. 익명 식별 값은 서버로 복사하지 않으며 서명 값과도 달라야 한다. 기존 V1의 `KAKAO_RECRUIT_SECRET`, `KAKAO_SEARCH_PLAYER_SECRET`, `KAKAO_OPENCHAT_SECRET` 또는 대응하는 `KLOL_KAKAO_*` 값을 어느 V2 항목에도 재사용하지 않는다.

## 현재 재생성본 확인값

| 용도 | 파일 | 버전 | 물리 줄 수 | 크기 | SHA-256 |
| --- | --- | --- | ---: | ---: | --- |
| MessengerBot R 설정 분리형 | `KLOL_KAKAO_BOT_V41_MESSENGERBOT_R.js` | `KLOL_KAKAO_BOT_V41_V3_2026_09_09_R14_2_INSTALLATION_SCOPE` | 92 | 76,189 bytes / 64,566자 | `4dc1746c625103478dcf1cd1f3c1d98063b240425c0e969fd49ab6a88ac84bf9` |
| 개발·검토용 | `KLOL_KAKAO_BOT_V41_V2_COMPLETE.js` | `KLOL_KAKAO_BOT_V41_V3_2026_09_09_R14_2_INSTALLATION_SCOPE` | 2,780 | 133,998 bytes / 122,237자 | `128f5f29bd35076488b3675c767beac6ab279c7bd48206f2475f5c6e227de33f` |

해시, 크기 또는 끝 표시가 다르면 다른 버전이거나 전송 과정에서 변형된 파일이다.

설치본의 LF가 모두 CRLF로 변환되는 보수적 계산은 64,657자로 65,535자 이하다. 전송 도구가 다른 문자를 추가하지 않게 파일 자체를 그대로 설치한다.

## 첫 동작 확인

컴파일 성공 뒤 다음 순서로 확인한다.

1. `/봇버전`
2. `/V2연동확인`
3. 사이트 SUPER 관리자가 `/admin/kakao/rooms`에서 새 방 또는 기존 canonical 방 연결 코드를 발급
4. 해당 실제 방에서 `/V2방연동 8자리코드`
5. `/도움말`
6. `5인파티`
7. `구인현황`
8. `내전구인`
9. `스크림구인`
10. `랭킹`

서명 키는 설치본 신뢰만 증명하며 사람 권한을 부여하지 않는다. DB에 연결된 ACTIVE canonical 방의 미등록 발신자는 MEMBER로 자동 기록된다. 조회·생성·참가·양식 제출은 MEMBER, 모집 동기화·종료·확정·완료는 생성자 또는 MANAGER 이상, 강제 취소·재개는 ADMIN, 방·역할·설정 관리는 SUPER 권한이다. `/` 유무는 판정에 영향을 주지 않는다.

`ROOM_BINDING_REQUIRED`이면 sender나 환경변수를 추가하지 말고 `/V2연동확인` 결과 전체를 관리자에게 전달한다. R14.2는 MessengerBot callback의 `room`, `channelId`, `isGroupChat`을 인증·라우팅에 전혀 사용하지 않는다. `room=sender`처럼 손상된 알림 callback도 동일한 설치본 ID로 동작한다. 관리자는 일회용 코드로 그 설치본을 canonical 방 하나에 연결한다.

중요한 운영 불변식은 **봇 설치본 하나 = 실제 카카오톡 방 하나**다. 같은 identity secret이 들어간 동일 installer를 여러 실제 방에서 실행하면 서버는 두 방을 구분할 수 없고 데이터와 권한이 합쳐진다. 이 상태는 room parser를 의도적으로 제거했기 때문에 코드로 탐지할 수 없다. 실제 방마다 별도 identity secret과 별도 설치본 ID를 발급하고 별도 MessengerBot 봇 프로필로 실행한다.

R14.2 휴대폰 설치본은 `/봇버전`과 `/V2연동확인`에 공개 설치본 ID와 키 ID, opaque 발신자 ID를 표시한다. V3 서명은 이 값들과 봇 버전·설치본 기반 scope·메시지 전달 ID를 함께 묶는다. scope는 installation ID에서 SHA-256으로 파생하므로 signing key 교체 뒤에도 유지된다. 같은 카카오 메시지 재전송은 설치본+발신자+logId+본문 delivery ID로 멱등 처리한다. 키 교체 시 서버의 current/previous ID를 먼저 설정한 뒤 휴대폰 키와 ID를 current로 바꾸며, 이전 키 ID로 고정된 설치본은 새 current ID로 한 번 승격된 뒤 되돌아갈 수 없다.

migration `0031_brainy_taskmaster.sql`, `0032_bent_ultimates.sql`, `0033_tan_sprite.sql`, 대응 서버, R14.2 휴대폰 설치본을 하나의 점검 시간에 적용하고 혼용 중에는 모집 변경을 중지한다. 0033은 기존 설치본 하나가 서로 다른 canonical 방 둘 이상에 연결돼 있으면 `KAKAO_INSTALLATION_MULTIPLE_ROOMS`로 중단하며 자동 병합하거나 삭제하지 않는다. 운영자가 충돌을 명시적으로 정리한 뒤 다시 적용한다. 정상 요청은 Vercel `KAKAO_WEBHOOK_ALLOWED_ROOMS`/`KAKAO_WEBHOOK_ALLOWED_SENDERS`를 권한 판정에 사용하지 않으며, 미등록 설치본은 `ROOM_BINDING_REQUIRED` 후 DB pairing만 사용한다.

R14.2로 바꾸면 휴대폰 `DataBase`의 모집 revision·내전 미리보기·사진 세션 key가 기존 room fingerprint에서 installation scope로 바뀐다. 전환 전에 진행 중인 양식을 완료하거나 취소하고, 전환 뒤 미리보기·사진 세션을 새로 시작한다. 기존 서버 데이터는 삭제하지 않는다.

서버 설정이나 서명 키가 아직 없거나 현재 Vercel 배포가 새 환경변수를 읽지 못하면 컴파일은 성공하지만 서버 요청은 안전한 실패 안내를 반환한다.

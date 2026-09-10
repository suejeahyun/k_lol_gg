# 카카오봇 V1_STRICT 기준과 확장 경계

기준일: 2026-09-11

## 목적

카카오봇을 변경할 때 V1 사용자 경험을 추측으로 다시 만들지 않는다. 실제 V1 단일 파일을 실행 가능한 golden fixture로 보존하고, V1에 없던 기능은 `APPROVED_EXTENSIONS`로 분리한다.

## 변경 불가 기준

| 항목 | 값 |
|---|---|
| 외부 기준 파일 | `E:\k-LOL.GG\6.k_lol_gg_v1_blueblack_baseline\KLOL_KAKAO_BOT_V40_GUIDED_HUB.js` |
| 저장소 fixture | `tests/fixtures/kakao/v1/KLOL_KAKAO_BOT_V40_GUIDED_HUB.js` |
| 코드 버전 | `KLOL_KAKAO_BOT_V40_SITE_FIRST_NO_CODES_R2_2026_08_31` |
| 원본 CRLF SHA-256 | `c91a56a289a762fe7e08143e8fd4b55c9695c4df68ebfcb6689613dcb73776b7` |
| LF 정규화 SHA-256 | `0514eb3c26862ffedfc132dbe1b258db25d30657aaf8455429467a151bfb18a2` |

Git checkout의 줄바꿈 정책이 Windows와 Linux에서 달라도 같은 원본인지 확인할 수 있도록 테스트는 LF 해시와 CRLF로 복원한 원본 해시를 모두 검증한다.

fixture는 기능 구현 파일이 아니다. 기존 동작과 문구를 비교하는 기준이므로 직접 수정하지 않는다. V1 기준을 교체해야 한다면 새 버전 파일을 추가하고 별도 승인 근거와 새 해시를 기록한다.

## 경계

### V1_STRICT

다음은 golden fixture의 실제 `response()` 실행 결과를 기준으로 한다.

- 명령어 판정과 무응답 조건
- 선행 ASCII `/` 유무
- 사용자에게 보이는 제목, 문장, 줄바꿈, 링크
- 파티·내전·스크림·운영 양식의 판정과 파싱 방식
- 봇 echo, 입장·퇴장 메시지 처리
- 비밀값을 코드가 아닌 MessengerBot R `DataBase`에서 읽는 방식

### APPROVED_EXTENSIONS

다음은 V1에 없으므로 V1과 같은 기능이라고 부르지 않는다.

- `내전모집`, `내전신청`과 칼바람·증바람 내전 확장
- `스크림참가`, `스크림확정`, `스크림취소`, `스크림마감`, `스크림종료` 안내
- `사진상태`, `자동공지`, `공지생성`
- `V2도움말`, `V2진단`, `V2연동확인`, raw JSON 운영 명령
- HMAC V4 서명, nonce, event ID, installation scope, 5초 단일 전송

확장은 별도 테스트에서 검증하며 V1_STRICT 명령의 분류와 정확 응답을 바꿀 수 없다. 확장 명령이 V1 명령과 충돌하면 V1_STRICT를 우선한다.

## 안전하게 가져오는 범위

V1의 사용자 계층은 재사용하되 전송 계층은 그대로 복사하지 않는다.

- 재사용: 명령·양식 파서, 사용자 응답, 무응답·echo 규칙
- 현행 유지: V4 서명과 재전송 방지, 현재 서버 API, 비밀값 관리, 요청 1회와 5초 timeout
- 복사 금지: 구형 bearer/body secret 전달, raw 방·발신자 문자열을 권한 근거로 사용하는 방식, 20초·90초 timeout

서버 내부 구현이 달라도 동일 입력과 동일 서버 결과에 대한 사용자 관찰 가능 출력은 V1_STRICT와 일치해야 한다.

오류는 예외다. 기능별 V1 오류 제목과 사용자가 취할 행동은 유지하지만, 원본이 출력하던 명령 원문·서버 raw body·`String(error)`는 비밀값과 내부 정보 노출 위험 때문에 복원하지 않는다. V4 서버가 명시적으로 반환한 공개 `reply`만 그대로 표시하고, 그 외 오류는 상태 코드와 고정된 재시도 또는 권한 안내만 표시한다.

이미지는 V40 R2의 clean-install 제어 흐름을 기준으로 한다. 이 버전의 활성 라우터는 새 이미지 세션을 만들지 않으므로 `handleManagedImage`와 `replyManagedImageFallback`은 무응답·무전송이다. 이전 V39 설치본에만 남아 있는 로컬 세션 승계는 V1_STRICT 범위가 아니다.

## 기존 수기 호환 계약과의 관계

`tests/fixtures/kakao-v4-v1-compatibility-contract.json`은 삭제하거나 수정하지 않는다. 이 파일은 V40/V41 호환 요구와 승인된 V4 동작을 함께 설명하는 파생 계약이다. 실제 V1 여부를 판정할 때는 이 파생 계약보다 변경 불가 V1_STRICT fixture와 oracle 테스트를 우선한다.

## 검증

```powershell
node --test tests/kakao-v1-strict-oracle.test.mjs
node scripts/audit-messengerbot-rhino-static.mjs tests/fixtures/kakao/v1/KLOL_KAKAO_BOT_V40_GUIDED_HUB.js
```

oracle은 원본 해시, 비밀값 하드코딩 부재, ES5/Rhino 정적 호환성, 실제 `response()`의 버전·도움말 응답, V1과 확장 명령의 경계를 검증한다.

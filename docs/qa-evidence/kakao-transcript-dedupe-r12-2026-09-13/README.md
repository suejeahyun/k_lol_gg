# 카카오 제보 회귀 QA — R12 transcript dedupe

검토일: 2026-09-13 KST  
대상: MessengerBot R V1 strict 공개/비공개 산출물과 V4 command gateway  
판정: 소스·생성물·focused 자동 테스트 반영 완료, 운영 휴대폰 설치와 실방 송수신은 미확인

## 제보 재현과 기대 동작

| 순서 | 입력/이벤트 | 기대 동작 | 자동 근거 | 판정 |
| ---: | --- | --- | --- | --- |
| 1 | 사용자 `/내전구인` | `FEATURES` 요청 1회, 내전 종목 선택 안내 1회 | `kakao-v1-strict-messengerbot`, V4 phase3/golden | 통과 |
| 2 | `오픈채팅봇`의 `내전구인 양식 불러오는 중…` 또는 `...` | 정상 외부 안내는 그대로 보이고 KLOL은 HTTP·답장하지 않음 | 신규 MessengerBot 회귀 | 통과 |
| 3 | 같은 카카오 callback/logId 재수신 | 서버 요청은 같은 event ID로 재생될 수 있으나, 같은 런타임에서 이미 성공적으로 보낸 가시 답장은 재전송하지 않음 | 신규 MessengerBot replay 회귀 | 통과 |
| 4 | 서로 다른 logId의 실제 명령 | 앞선 dedupe에 막히지 않고 각각 요청·답장 | 신규 MessengerBot replay 회귀 | 통과 |
| 5 | `/내전구인 증바람` | 증바람/AUGMENT_ARAM, 이름 전용 10명 양식과 `내전상세 번호 추가/삭제 이름` 안내 | all-mode chat surface·phase3·compat 계약 | 통과 |
| 6 | `내전상세 2 추가 은지` | `FEATURES`의 INHOUSE member ADD로 1회 전달, 현재 운영일 #2 갱신과 최신 명단 응답 | 신규 MessengerBot + all-mode chat surface | 통과 |
| 7 | `2 추가 은지` | 모집 도메인이 불명확하므로 `UNKNOWN`, HTTP·답장 없음 | 신규 MessengerBot + 안전 파서 | 통과 |
| 8 | `5인파티` | #11 등 실제 번호를 DRAFT로 예약하고 metadata-only 양식 응답; 현황에는 아직 숨김 | dispatcher all-mode DRAFT 테스트 | 통과 |
| 9 | 제보의 #11 전체 양식(`시작시간/gameInfo/주최자=test`) | 동일 운영일 #11 `PARTY_SYNC`, 참가자 0명 허용, DRAFT 또는 IN_PROGRESS 대상 1회 활성화 | 신규 exact #11 parser/canonical 회귀 + dispatcher lifecycle 회귀 | 통과 |
| 10 | 활성화 직후 `구인현황` | #11을 IN_PROGRESS로 노출하고 모집 현황을 mutation 응답에도 붙임 | dispatcher status projection/after-mutation 회귀 | 통과(번호 독립 harness) |

`2 추가 은지`를 계속 무응답으로 두는 이유는 파티·내전·스크림 중 어느 모집인지 알 수 없고, 일반 대화와 충돌할 수 있기 때문이다. `내전상세 2 추가 은지`처럼 도메인과 번호를 명시한 형태만 지원한다.

## 변경 근거

- 외부 봇 안내 필터는 발신자에 `오픈채팅봇`이 포함되고 본문이 정확히 `내전구인 양식 불러오는 중…`/`...`일 때만 동작한다. 같은 문구를 일반 사용자가 보내거나 외부 봇이 `/내전구인 증바람`을 보내는 경우까지 광범위하게 차단하지 않는다.
- 중복 가시 응답은 서버의 `Idempotency-Replayed`만 보고 무조건 숨기지 않는다. 현재 MessengerBot 런타임의 해당 logId 캐시에서 이전 `replier.reply`가 실제로 반환된 경우에만 숨긴다. 첫 응답 전송이 실패했거나 앱이 재시작된 뒤 서버가 replay를 반환하는 경우에는 확인 답장을 다시 보낼 수 있게 한 안전장치다.
- 휴대폰 설치 여부 식별을 위해 `BOT_CODE_VERSION`을 `KLOL_KAKAO_BOT_V40_SITE_FIRST_NO_CODES_R12_2026_09_13_TRANSCRIPT_DEDUPE`로 올렸다.

## 실행한 자동 검증

```text
npx tsx --test tests/kakao-party-snapshot-parser-p0.test.ts tests/kakao-v4-dispatcher.test.ts tests/kakao-v4-all-mode-chat-surface.test.ts
41 pass / 0 fail

node --test tests/kakao-v1-strict-messengerbot.test.mjs tests/kakao-v1-exact-v4-adapter-architecture.test.mjs tests/kakao-v4-v1-compatibility-contract.test.mjs tests/kakao-private-installer-generator.test.mjs tests/kakao-v41-v1-inhouse-golden.test.mjs
54 pass / 0 fail

npm run test:contracts
394 pass / 0 fail

npm run test:unit
774 pass / 1 skip / 0 fail

npm run check
계약 394 pass, 일반 774 pass / 1 intentional skip, static generation 93/93

npm run test:db
격리 PostgreSQL 18 전체 계약·HTTP·브라우저 검증 통과, migration head 0039

node scripts/check-secrets.mjs --tree-only
통과
```

공개 생성물은 LF 63,537자, CRLF 65,350자로 MessengerBot R 65,535자 제한 안이다. SHA-256은 `e061d81a56e1f4a6801ea0035b030730a320a3a29a9839b03e23b7ef3485d00e`다.

비공개 설치본은 LF 61,368자, CRLF 63,173자이며 SHA-256은 `646b04dbbc101656b0d4a9e87b4068bab2eb32c6611d0ad62b9068c774d8a9c4`다. 비밀값은 출력하거나 저장소에 추가하지 않았다.

## 현재 공백과 남은 위험

- 자동 테스트는 Android MessengerBot R의 실제 알림 parser, 카카오 재수신 타이밍, 실제 `replier.reply`를 실행하지 않는다.
- 휴대폰에 KLOL 봇 프로필이 둘 이상 활성화되어 있으면 각 런타임 캐시가 독립이므로 다른 프로필이 각각 답할 수 있다. 이번 dedupe는 동일 프로필/런타임의 동일 callback 중복만 해결한다.
- 휴대폰의 R12 설치는 수행하지 않았다. 운영 DB의 실제 #11이 DRAFT로 남았는지, 이미 종료됐는지는 이 소스 QA만으로 판정할 수 없다.
- `/내전구인`만 입력하면 오류 문구 없이 종목 선택 안내를 내고, 실제 미지원 인자(`/내전구인 양식` 등)에만 입력값을 포함한 오류를 낸다.
- 전체 DB 검증에서 신규 operations fixture가 합성 ACTIVE 시즌을 남겨 후속 season HTTP 검증을 오염시키는 누락을 발견했다. fixture 종료 정리를 추가한 뒤 새 격리 PostgreSQL 18에서 전체 `npm run test:db`가 통과했다. 운영 DB 변경은 없다.

## 배포 전 필수 검증

1. 서버가 R12 호환 코드와 동일 commit으로 배포됐고 `/api/integrations/kakao/v4/commands` health가 정상인지 확인한다.
2. 휴대폰 기존 소스를 백업한 뒤 비공개 R12 한 파일만 전체 교체하고, 위 SHA와 마지막 entry marker를 대조한다.
3. MessengerBot R에서 KLOL 응답 봇 프로필이 정확히 하나인지, 구인구직방·기능방 두 곳만 구독하는지 확인한다.
4. `/봇버전`이 R12 문자열을 반환하는지 두 방에서 확인한다.
5. 새 테스트 번호로 `/내전구인` → 외부 로딩 안내 1회 유지 → KLOL 선택 안내 1회, `/내전구인 증바람` → 양식 1회를 확인한다.
6. `내전상세 번호 추가 QA이름`은 1회 반영되고 bare `번호 추가 QA이름`은 무응답인지 확인한 뒤 QA 이름을 삭제한다.
7. `5인파티`로 새 DRAFT를 만들고 주최자를 채운 전체 양식을 보내 활성화한 다음, 같은 번호가 즉시 `구인현황`에 보이는지 확인한다. 테스트 모집은 정상 마감한다.
8. 동일 알림 callback을 재현할 수 있으면 같은 logId에서 답장 1회, 다른 새 명령에서 답장 1회를 확인한다.

## 다음 패치 추천

1. Android 실기기 smoke 결과에 logId·bot version·서버 trace ID를 비밀값 없이 남기는 체크리스트를 자동화한다.
2. 동일 휴대폰에서 중복 KLOL 봇 프로필을 탐지할 수 있는 운영 진단 안내를 추가한다.
3. callback cache 256건 퇴출과 앱 재시작 경계의 dedupe 관찰 지표를 서버 로그에 추가한다.
4. 공유 DB 계약 fixture가 후속 HTTP 검증에 상태를 남기지 않는지 CI에서 별도 격리 검사를 추가한다.

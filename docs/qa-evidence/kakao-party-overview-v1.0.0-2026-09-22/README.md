# 카카오 파티 전체 목록·직접 상세 후속 구현 QA

- 일자: 2026-09-22
- 기준: `feat/kakao-v4-gateway-20260910`, 시작 HEAD `04fee42` 이후 작업 트리
- 기능 후보: `kakao-party-overview@1.0.0` (통합 담당의 릴리스·tag 등록 전)
- 최종 통합: source `c5cbbcd8`로 운영 반영. 전체 DB139·105페이지/339화면·운영 읽기 PASS. 아래 담당별 기록은 당시 집중 검사이며, 최종 배포 ID·범위·생략 항목은 [통합 QA](../operational-readiness-v1.0.0-2026-09-22/README.md)를 따른다.
- 결정: [ADR 0011](../../architecture/0011-kakao-party-editable-copy-flow.md)

## 변경

1. 파티 현황의 20건 제한을 제거했다. 번호순으로 요약·상세 명령을 반환하며, 모바시·정원 충원 상태 때문에 목록에서 임의 제거하지 않는다. 목록에는 참가자 전체 이름과 양식코드를 출력하지 않는다.
2. 상세는 인증된 논리 방 scope·서명 시각의 운영일·번호로 직접 조회한다. 진행 중 파티와 작성 중 DRAFT를 조회하며, 번호가 모호하면 실패로 처리한다. 현황 조회는 양식코드를 발급하지 않고 상세에서만 해당 코드 한 개를 발급한다.
3. 첫 공개 등록에는 이름 한 명 이상이 필요하다. DRAFT의 `Nㅉ`는 CANCELED 상태로 전이하고 기록·감사를 유지한다. 재전송은 기존 멱등 경로를 사용한다.
4. 번호형 생성·상세 양식은 코드 상단, 빈 시작 시간·게임 종류, 번호 슬롯과 예비 칸을 사용한다. 구분선 제거와 CRLF 입력을 허용한다. 라인형·구형 양식의 기존 제한은 유지한다.
5. 저장·마감 뒤에는 결과 한 줄과 현재 목록을 표시한다. 최초 등록은 저장 결과의 이름을 최대 세 명까지 짧게 표시한다. 목록 조회 실패는 저장 성공과 구분해 구인현황 재조회를 안내한다. 두 공개 도움말도 저장→목록→구인상세→복사 흐름으로 맞췄다.

## 로컬 검사

| 검사 | 결과 | 근거 |
|---|---|---|
| 파티·snapshot·dispatcher·domain/application·입력·gateway 집중 검사 | 233건 중 232 PASS, DB 전용 1 skip, 0 fail | `focused-tests.log` |
| R24 phone/oracle/compatibility 및 공개 도움말 경계 | 58 PASS, 0 fail | `phone-and-help-tests.log` |
| 변경 범위 ESLint | exit 0 | `lint.log` |
| `npx tsc --noEmit` | exit 0 | `typecheck.log` |
| 99개 파티 각각 예비 98명·정원 99명으로 강화한 목록 재검사 | 2 PASS, 0 fail | `overview-final.log` |

집중 검사는 99개 번호 전부의 정렬·상세 명령, 긴 Unicode 요약의 정상 문자열·12,000 UTF-16 미만, DRAFT 목록 제외, 저장값·상세의 긴 메타정보 보존, 빈 양식 CRLF 왕복, 초안 취소·같은 event 재전송, 기존 복사 병합·충돌·SITE 보호·범위 계약을 포함한다. 로그는 합성 데이터 기반이며 운영 명단·토큰은 담지 않는다.

재현 명령:

```powershell
npx tsx --test tests/party-copy-snapshot.test.ts tests/kakao-party-overview.test.ts tests/kakao-party-detail-snapshot-p1.test.ts tests/kakao-v4-dispatcher.test.ts tests/kakao-v1-strict-server-replies.test.ts tests/recruiting-domain.test.ts tests/recruiting-application.test.ts tests/kakao-party-snapshot-parser-p0.test.ts tests/kakao-prefixed-finish-contract.test.ts tests/kakao-v4-command-gateway.test.ts tests/kakao-v4-input-tolerance-p0.test.ts
node --test tests/site-feature-boundary.test.mjs tests/kakao-v1-strict-messengerbot.test.mjs tests/kakao-v1-strict-oracle.test.mjs tests/kakao-v4-v1-compatibility-contract.test.mjs
npx tsc --noEmit
```

## 통합·운영 확인 잔여

- `tests/database/kakao-party-overview.contract.test.ts`: 안전 가드가 있는 일회성 DB용 계약을 추가했다. 활성 23개+초안 1개, #23 직접 상세, 목록 코드 미발급, 상세 재전송, 다른 scope·운영일 차단, 중복 reset 식별자 거부를 검사한다. **이 담당 범위에서는 DB를 실행하지 않았다.** 통합 담당의 runner 등록·실행 결과로 갱신한다.
- 전체 `npm run check`, 빌드, 배포 Git SHA/ID·health·사이트 동기화는 통합 담당 결과가 필요하다.
- 공개 R24 설치본 코드는 이 변경에서 수정하지 않았다. 기존 phone harness 통과는 실제 기기 송수신 확인을 대신하지 않는다. 최대 목록의 전송 가독성·5초 HTTP 응답 시간, 새 양식 실제 복사→저장→상세, 설치된 비공개본과 public SHA 일치 여부는 실제 기기 QA로 확인한다.
- 공개 도움말은 정적 문구·기존 DOM만 변경했다. 실제 브라우저 접근성·좁은 화면 육안 검사는 이번 담당 범위에서 실행하지 않았다.

## 다음 추천

1. 통합 담당: 신규 DB 계약과 전체 check/build를 실행하고 같은 SHA의 배포·health 근거를 연결한다.
2. 기기 QA 담당: 합성 방에서 21개 이상 목록, 빈 초안 취소, 충돌 안내, 06시 운영일 경계와 5초 제한을 실제 R24 기기로 확인한다.
3. 운영 담당: 배포 후 익명 요청 ID별 조회 지연·실패율을 관찰하고, 긴 목록이 실제 전송 한계에 닿을 때 누락 없는 분할 표시를 판단한다.

한국어 공지 초안: [DISCORD_NOTICE.md](DISCORD_NOTICE.md). 배포·기기 검증이 끝난 범위만 확정 공지에 사용한다.

## 통합 DB에서 발견한 마감 대상 선택 회귀 수정

전체 QA의 `tests/kakao-v4-input-tolerance-p0.test.ts:569` 실패를 `kakao-v4` 격리 scope에서도 재현했다. 같은 방·운영일·번호에 진행 중 원본과 높은 resetSequence의 종료·초안 행이 공존하는 fixture에서, FINISH 허용 상태를 `[DRAFT, IN_PROGRESS]`로 함께 조회하면서 기존 `resetSequence DESC LIMIT 1`이 높은 초안을 먼저 골랐다. 그 결과 원본 revision은 1에 남고 잘못 선택한 초안이 취소됐다. 목록 길이·코드 발급 기대값이나 fixture 전체 건수 문제는 아니었다.

FINISH만 진행 중 원본을 먼저 조회하고, 없을 때 DRAFT를 별도로 조회하도록 최소 수정했다. 기존 완료 행·다른 scope·운영일 거부와 직접 상세의 모호한 활성 행 거부는 변경하지 않았다. 기존 DB assertion을 유지한 채, 진행 중 원본 마감 후 남은 초안 취소와 다른 event의 중복 취소까지 추가했다. 원본 FINISHED/revision 2, 초안 CANCELED/revision 1, 초안 감사 1회만 기록됨을 검증했다.

| 확인 | 결과 | 근거 |
|---|---|---|
| 수정 전 같은 DB 실패 재현 | actual 1 / expected 2, 실패 재현 | `finish-regression-reproduced.log` |
| 수정 후 `V2_DB_CONTRACT_SCOPE=kakao-v4` | 33 PASS, 0 fail, 격리 cluster 정상 종료·제거 | `finish-fixed-database.log` |
| Dispatcher·application·domain·finish 회귀 | 97 PASS, 0 fail | `finish-fixed-focused.log` |
| 변경 범위 ESLint·diff check | exit 0 | `finish-fixed-lint.log` |

```powershell
$env:PG_BIN_DIR='C:\Program Files\PostgreSQL\18\bin'
$env:V2_DB_CONTRACT_SCOPE='kakao-v4'
npm run test:db
npx tsx --test tests/kakao-v4-dispatcher.test.ts tests/recruiting-application.test.ts tests/recruiting-domain.test.ts tests/kakao-prefixed-finish-contract.test.ts
```

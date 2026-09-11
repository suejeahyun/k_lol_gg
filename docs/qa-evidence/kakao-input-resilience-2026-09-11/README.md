# 카카오 입력 내결함성 패치 QA 근거

- 검증일: 2026-09-11
- 검증 대상: 현재 작업 트리의 카카오 V1 strict 입력 파서·서버 명령 처리·휴대폰 설치본
- 서버 코드 커밋: `4114ef08` (Vercel 빌드 로그 표기 `4114ef0`)
- 릴리스 태그: `kakao-v1-input-resilience-v1.0.0`
- 운영 서버 배포: 완료
- 문서 상태: 현재 작업 트리에서 갱신, 커밋 전
- 휴대폰 설치: 미확인

## 판정 요약

### 확인됨

- 파티 양식은 슬롯과 메타데이터를 `값 있음(PRESENT_VALUE)`, `명시적으로 비움(PRESENT_EMPTY)`, `행 없음(ABSENT)`으로 구분한다.
- 파티 행 순서, 전각 문자, 카카오 이스케이프, 여러 줄 메타데이터를 정규화해 읽으며, 서로 다른 값이 들어간 중복 라벨·중복 슬롯과 합쳐진 슬롯 행은 자동으로 덮어쓰지 않고 진단한다.
- 기존 파티 수정에서는 카카오 양식에 적힌 제목과 정원이 DB의 파티 유형·제목·정원을 덮어쓰지 않는다. 슬롯 변경은 DB에 저장된 유형과 정원을 기준으로 적용한다.
- 의미가 같은 파티 양식을 다시 보내면 revision, aggregate 저장, audit, outbox를 추가하지 않는다. 요청 receipt는 완료해 같은 요청의 처리 결과를 남긴다.
- 고객센터 `지인·디스코드`, `건의`, `모임`, `외출` 4종은 필드 순서와 전각·이스케이프 표기에 독립적으로 값을 읽는다.
- 고객센터 양식 후보가 필수값을 빠뜨려도 서버까지 전달되어 정확한 누락 필드 안내를 만들 수 있다. 일반 대화나 단순 라벨 언급은 양식으로 분류하지 않는다.
- 고객센터 제목 래퍼(`<지인>`, `<건의>`, `<모임>`/`<정모>`, `<외출>` 및 HTML entity 표기)는 공백과 기존 허용 범위의 번호·불릿을 제외하고 한 행 전체를 차지할 때만 양식 후보가 된다. 문장 중간에 래퍼를 인용한 일반 대화는 서버에서 `UNKNOWN`, 휴대폰에서 무전송으로 남는다.
- 안내·주의·예시·감사 꼬리말은 마지막 입력값에서 분리한다. 같은 값의 중복 필드는 한 값으로 정리하고, 서로 다른 중복값은 제출을 막고 해당 필드를 진단한다.
- V1 사용자 문구와 기존 사용 순서를 유지하며, 휴대폰에서 서버로 보내는 텍스트 요청은 한 번의 5초 제한 HTTP 요청을 사용한다.
- 집중 테스트 97건은 `pass 96`, `todo 1`, `fail 0`이다.
- `npm run check` 전체 검사는 통과했다.
- 최종 독립 P1 뒤 서버 집중 테스트 16/16, 휴대폰 V1 strict 테스트 17/17, 전체 계약 테스트 344/344와 TypeScript·대상 ESLint·Rhino ES5 정적 검사가 통과했다.
- 현재 트리만 검사한 비밀정보 검사는 통과했다.
- 서버 코드 커밋 `4114ef08`의 Vercel 배포가 2026-09-11 11:27 KST에 Ready가 됐고 운영 alias에 연결됐다.
- 운영 `GET /api/health`는 HTTP 200과 `status=ready`를 반환했다.

### 추가 확인 필요

- 집중 테스트의 TODO 1건인 PostgreSQL 실계약 기반 `같은 방의 다른 사용자 수정·마감 / 다른 방 변경 차단`은 실행되지 않았다.
- MessengerBot R이 설치된 실제 휴대폰에 R4 파일을 교체하고 `/봇버전`으로 확인하지 않았다.
- 실제 휴대폰에서 R4 설치본을 MessengerBot R로 컴파일하지 않았다.
- 구인구직방과 고객센터방에서 실제 카카오 송수신 E2E를 진행하지 않았다.

## 운영 배포 증거

| 항목 | 확인값 |
|---|---|
| 코드 커밋 | `4114ef08` |
| 릴리스 태그 | `kakao-v1-input-resilience-v1.0.0` |
| Vercel deployment ID | `dpl_7Ta7UZqwYwF45GJ4XkdgL6oLyMkd` |
| Deployment URL | `https://k-lol-r86i5mgqs-tjdmswo11-3715s-projects.vercel.app` |
| 운영 alias | `https://k-lol-gg.vercel.app` |
| Ready 시각 | 2026-09-11 11:27 KST |
| Vercel 빌드 로그 | Branch `main`, Commit `4114ef0` |
| 운영 health | `GET /api/health` → HTTP 200, `status=ready` |
| health checkedAt | `2026-09-11T02:27:57.646Z` |

위 증거는 서버 코드의 운영 배포 완료를 뜻한다. 휴대폰 R4 설치본 복사·MessengerBot R 컴파일·두 카카오방 실송수신까지 확인됐다는 뜻은 아니다.

## 휴대폰 설치본 식별 정보

실제 생성 파일을 직접 읽고 기록했다.

| 항목 | 값 |
|---|---|
| 파일 | `integrations/messengerbot-r/v1-strict/KLOL_KAKAO_BOT_V1_STRICT_MESSENGERBOT_R.js` |
| BOT 코드 버전 | `KLOL_KAKAO_BOT_V40_SITE_FIRST_NO_CODES_R4_2026_09_11` |
| 설치본 SHA-256 | `6B991CE28AD00FE4216419F2EA38FFB69E9C064AD00722139AEA2839A8A2FFB0` |
| 어댑터 SHA-256 | `DA762EBC90C5B79F66324BFE73B119069B989B5D3149A64FC2B0B7897FBC38BF` |
| 설치 상태 | 미확인 |

SHA-256은 R4 설치 후보 파일의 식별값이다. 이후 파일을 다시 생성하거나 수정하면 달라질 수 있으므로 휴대폰에 복사하기 직전에 다시 계산해야 한다.

## 변경 기능과 코드 근거

| 기능 | 근거 | 사용자·운영 영향 | 예상 부작용·남은 위험 |
|---|---|---|---|
| 파티 tri-state | `src/modules/recruiting/kakao-v4/party-snapshot-parser.ts`, `src/modules/recruiting/domain/recruiting.ts` | 행이 없는 것과 사용자가 빈칸으로 만든 것을 구분해, 일부 행 누락으로 기존 참가자가 의도치 않게 삭제되는 위험을 낮춘다. | 실제 카카오가 만드는 새로운 붙여넣기 변형은 추가 fixture가 필요할 수 있다. |
| 순서·전각·이스케이프·다중 줄 허용 | `party-snapshot-parser.ts`, `operation-form-parser.ts` | 모바일 입력과 복사·붙여넣기 차이로 정상 양식이 거절되는 경우를 줄인다. | 허용 범위가 넓어진 만큼 일반 대화 오분류율을 함께 관측해야 한다. |
| 중복 진단 | `party-snapshot-parser.ts`, `operation-form.ts` | 서로 다른 중복값을 임의로 마지막 값으로 덮어쓰지 않아 잘못된 저장을 막는다. | 사용자는 중복 행을 직접 고쳐 다시 보내야 한다. |
| DB authoritative 제목·정원 | `canonical-command.ts`, `dispatcher.ts`, `command-handler.ts` | 수정 양식의 제목·정원이 기존 모집의 유형·정원을 바꾸지 않는다. | 잘못된 모집번호를 입력한 경우 다른 모집을 바꾸지 않는지 실 E2E 확인이 필요하다. |
| 의미상 no-op 억제 | `recruiting.ts`, `command-handler.ts` | 같은 내용을 다시 보내도 revision·저장·audit·outbox가 불필요하게 늘지 않는다. receipt는 완료돼 재시도 결과는 유지된다. | 운영 DB에서 audit·outbox 증가량이 실제로 줄었는지는 배포 뒤 지표로 확인해야 한다. |
| 고객센터 후보 누락 전달 | `classifier.ts`, V1 strict 어댑터·설치본 | 불완전한 양식도 서버가 유형과 누락 필드를 구분해 안내할 수 있다. | 공개방에서 원문이나 개인정보를 오류에 재노출하지 않는지 실기기 응답 확인이 필요하다. |
| 고객센터 제목 행 경계 | `operation-form-parser.ts`, V1 strict 어댑터·설치본 | 독립 제목 행과 번호·불릿이 붙은 실제 제목은 유지하면서, 문장 중간의 래퍼 인용은 양식으로 오분류하지 않는다. | 실기기에서 카카오가 추가하는 미확인 특수 불릿은 별도 fixture가 필요할 수 있다. |
| 꼬리말 격리 | `operation-form-parser.ts` | 안내·예시 문장이 마지막 필드 값에 섞이는 문제를 줄인다. | 새로운 꼬리말 문구가 추가되면 격리 규칙도 보강해야 할 수 있다. |
| V1 문구·단일 5초 HTTP 유지 | `KLOL_KAKAO_BOT_V1_STRICT_ADAPTER.js`, `scripts/build-messengerbot-v1-strict.mjs` | 익숙한 사용 순서를 바꾸지 않고 입력 허용 범위만 넓힌다. 연결 지연이 길게 휴대폰 봇을 붙잡지 않는다. | 네트워크가 5초 안에 응답하지 않으면 사용자는 연결 오류 안내를 받는다. |

## 집중 테스트

실행 명령:

```text
npx tsx --test tests/kakao-v4-dispatcher.test.ts tests/kakao-v4-followup-parser-integration.test.ts tests/kakao-v4-input-tolerance-p0.test.ts tests/kakao-v4-operation-form-parser.test.ts tests/recruiting-application.test.ts tests/recruiting-domain.test.ts
```

결과:

```text
tests 97
pass 96
fail 0
todo 1
```

TODO 1건은 실제 PostgreSQL 계약을 요구하는 다중 사용자·다중 방 경계 테스트다. 건너뛴 테스트가 있으므로 해당 DB 경계까지 모두 검증됐다고 판정하지 않는다.

최종 독립 P1의 제목 래퍼 경계를 수정한 뒤 다음 검사를 별도로 재실행했다.

```text
npx tsx --test tests/kakao-v4-operation-form-parser.test.ts tests/kakao-v4-phase3-operations.test.ts
tests 16, pass 16, fail 0

node --test tests/kakao-v1-strict-operation-form-candidate.test.mjs tests/kakao-v1-strict-messengerbot.test.mjs
tests 17, pass 17, fail 0
```

## 전체 검사

실행 명령:

```text
npm run check
```

최종 R4 작업 트리에서 통과했다.

- ESLint: warning 31, error 0
- TypeScript typecheck: 통과
- Drizzle ERD: 101 tables, 163 foreign keys, drift 없음
- `npm test`: 692건 중 pass 691, todo 1, fail 0
- 여성 안내 이미지: 68/68, SHA-256 중복 0
- Next production build: 92 pages 생성

R4 재생성 직후에는 BOT 버전 계약 기대값이 R3로 남아 1건 실패했지만, support 담당이 기대값을 R4로 갱신한 뒤 전체 검사를 다시 실행해 통과했다. 이 문서의 최종 판정은 갱신 뒤 결과를 기준으로 한다.

최종 제목 행 경계 변경 뒤에는 요청 범위인 전체 계약·ES5 검사를 다시 실행했다.

- `npm run test:contracts`: 344/344 PASS
- `npx tsc --noEmit --pretty false`: PASS
- 변경 대상 ESLint: PASS
- Rhino ES5 정적 감사: PASS (`warningCandidates=0`, `unsafeSequenceOperands=0`, `voidExpressions=0`, `bareAssignmentConditions=0`, 60,168자)

## 비밀정보·문서 검사

실행 명령과 결과:

```text
node scripts/check-secrets.mjs --tree-only
[secret-scan] passed: tracked and untracked current tree contains no high-confidence secret patterns.

git diff --check
PASS
```

`--tree-only` 검사는 현재 tracked·untracked 파일만 대상으로 한다. 전체 Git 이력 검사나 운영 환경 변수 검사는 이번 근거에 포함하지 않는다.

## KPI와 배포 후 판정 기준

수집 시 원문 양식, 이름, 닉네임 등 개인정보를 저장하지 않고 결과 코드와 처리시간만 집계한다.

- 파티 양식 결과 비율: `EXACT`, `RECOVERABLE`, `AMBIGUOUS`, `REJECT`, `IGNORE`
- 고객센터 유형별 필수 필드 누락·중복 충돌 비율
- 파티 수정 요청 중 의미상 no-op 비율과 revision 증가 억제 건수
- 카카오 텍스트 요청 성공률, timeout 비율, 처리시간 p50·p95
- 잘못된 방·잘못된 프로필 차단 건수
- 배포 전후 양식 재전송률과 고객센터 재문의율

성공 판정은 정상 양식 성공률이 유지되거나 높아지고, `INVALID_FORM`·timeout·재전송률이 감소하며, 오분류 저장·다른 방 변경·중복 mutation이 0건일 때 가능하다. 목표 수치는 현재 운영 기준선이 없어 임의로 정하지 않았다.

## 테스트·배포·롤백 방법

1. TODO PostgreSQL 계약 테스트를 격리 DB에서 실행한다.
2. 실제 휴대폰에 위 SHA-256의 R4 설치본을 넣고 `/봇버전` 결과를 대조한다.
3. 구인구직방에서 파티 생성 → 순서·문장부호 변형 양식 수정 → 현황·상세 → 마감 순서를 확인한다.
4. 고객센터방에서 4종 정상 양식, 필드 누락, 서로 다른 중복값, 꼬리말 포함 양식을 확인한다.
5. 이미 배포된 서버의 health를 다시 확인하고 카카오 요청 지표를 관찰한다.

이번 변경에는 DB migration이나 데이터 일괄 변경이 없다. 이상이 생기면 서버는 직전 확인된 릴리스로 되돌리고, 휴대폰은 직전 확인된 설치본으로 교체한다. rollback 뒤 동일한 정상 양식·오류 양식 smoke를 다시 실행하며, 이미 생성된 receipt와 모집 데이터는 임의 삭제하지 않는다.

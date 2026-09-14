# 카카오 R17 내전 종목별 양식 QA

검토일: 2026-09-14 KST

대상: 내전 종목별 양식, 양식 활성화, 협곡 빠른 상세 추가, 기존 파티 회귀, MessengerBot R V1 strict 공개·비공개 설치본

판정: 소스 수정, 전체 앱 검사, 격리 PostgreSQL 계약, 프로덕션 빌드, Rhino 정적 검사, Vercel 운영 배포와 라이브 서명 검증을 통과했다. 휴대폰 실기기 설치와 실제 카카오톡 송수신은 사용자 설치 후 확인 대상이다.

## 확정 동작

1. 파티 구인 흐름은 변경하지 않는다.
2. 협곡은 티어·라인 10칸, 칼바람·증바람은 이름 10칸 전체 양식을 반환한다.
3. 양식 생성 시에는 DRAFT로만 번호를 예약하고 작성한 전체 양식을 전송해야 `IN_PROGRESS`가 된다.
4. 칼바람·증바람의 참가자 칸이 비어 있으면 주최자가 1번 참가자가 된다.
5. 협곡은 `내전상세 N 추가 이름`과 `내전상세 N 추가 이름/현티어/최고티어/주라인/부라인`을 모두 처리한다.
6. 이름만 추가하면 `ALL`, 상세 추가하면 주·부 포지션을 정규화해 저장한다. 입력한 티어 문자는 플레이어 원장의 현재·최고 티어를 임의 변경하지 않는다.
7. 같은 설치·방의 일반 사용자는 전체 양식 수정, 빠른 추가·삭제, 번호 마감을 사용할 수 있다.
8. 기존 R16 메타데이터 전용 양식은 서버 하위 호환으로만 계속 허용하고 R17에서는 새로 생성하지 않는다.

## 생성물

| 파일 | LF 문자 | CRLF 문자 | SHA-256 | Rhino 경고 후보 | 혼합 return | 주석 | 버전 선언 | response 함수 |
| --- | ---: | ---: | --- | ---: | ---: | ---: | ---: | ---: |
| 공개 검토본 `KLOL_KAKAO_BOT_V1_STRICT_MESSENGERBOT_R.js` | 63,112 | 64,915 | `5b5a5d0cc490016ab1c3dd04e6ca25e65b448d8a55993d79890059b7683ffc30` | 0 | 0 | 0 | 1 | 1 |
| private 전체 복붙 파일 | 61,326 | 63,126 | `b8f7577e84ca6f3a45e98b981f88ec74f12648824ec13c94dbe217229275cd8f` | 0 | 0 | 0 | 1 | 1 |

두 파일 모두 MessengerBot R CRLF 65,535자 제한 이내다. private 설정값은 보존했으며 문서나 Git에 노출하지 않는다.

## 검증 결과

```text
node --test tests/kakao-v1-strict-messengerbot.test.mjs tests/kakao-v4-v1-compatibility-contract.test.mjs
PASS — 39/39

npx tsx --test tests/kakao-v4-all-mode-chat-surface.test.ts tests/kakao-v4-command-classifier.test.ts tests/kakao-v4-phase3-acceptance.test.ts tests/kakao-v4-phase3-inhouse-scrim.test.ts
PASS — 63/63

npm run check
PASS — lint 오류 0, 타입 검사, 일반 테스트 779 PASS·1 intentional skip,
       ERD 102 tables/165 FK, 홈 여성 챔피언 가이드 68장, 프로덕션 빌드 93 pages

npm run test:db
PASS — PostgreSQL 18 격리 클러스터, migration 40개,
       내전 생성·활성화·수정·추가·삭제·마감·다중 사용자·방 격리 계약 포함 전체 통과

node scripts/audit-messengerbot-rhino-static.mjs <public>
node scripts/audit-messengerbot-rhino-static.mjs <private>
PASS — ES5, warning candidate 0, mixed return 0, 주석 0, 버전 선언 1, response 함수 1
```

## 운영 반영 상태와 남은 확인

- 기능 커밋: `0bc6d9552a3dbe8ce4c842ea0f8ed021b327b794`
- 릴리스 tag: `kakao-r17-mode-forms-v1.0.0`
- Vercel 운영 배포: `dpl_E4BS9JnU8cdxR4cb2343EBQp25zK` · Ready · Production
- 운영 URL: `https://k-lol-fn0awjv8i-tjdmswo11-3715s-projects.vercel.app`
- 운영 별칭: `https://k-lol-gg.vercel.app`
- 운영 검증: 2026-09-14T07:32:07.022Z · `/api/health` HTTP 200 · `status: ready`
- private 서명 검증: RECRUIT HTTP 200, FEATURES HTTP 200, command gateway 정상, 자격증명 출력 없음
- DB migration·운영 데이터 직접 변경·삭제: 없음
- 실제 휴대폰 컴파일, `/봇버전`, 협곡·칼바람·증바람 각각의 활성화→추가→삭제→마감 확인은 사용자 실기기 설치 후 남는다.

## 다음 패치 추천

1. 휴대폰 실기기 전사를 개인정보 제거 후 회귀 fixture로 누적한다.
2. 빠른 상세 추가의 티어 표기를 원장 변경이 아닌 검토용 스냅샷으로 별도 보존할지 제품 정책을 정한다.
3. 전체폭 슬래시·쉼표와 모바일 자동 들여쓰기를 종목별 허용 행렬에 추가한다.
4. 오래 남은 DRAFT 수와 활성화 실패 사유를 비밀값 없이 운영 통계로 집계한다.

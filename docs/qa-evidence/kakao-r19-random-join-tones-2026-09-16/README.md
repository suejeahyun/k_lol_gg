# 카카오 R19 랜덤 입장 안내 톤 QA

검토일: 2026-09-16 KST

대상: `입장시 할 일` 로컬 트리거, 네 가지 안내 톤, V1 strict 회귀, 공개·비공개 전체 복붙 설치본

판정: 구현, 집중 자동 검증, 전체 앱 검사, Rhino 정적 검사와 Vercel 운영 배포를 통과했다. 휴대폰 실기기 설치와 실제 카카오톡 수신은 사용자 설치 후 확인 대상이다.

## 릴리스 증거

- 기능 커밋: `a0310333d9ee7ff048944bef63495bebdd05c8e8`
- 릴리스 tag: `kakao-r19-random-join-tones-v1.0.0`
- Vercel deployment: `dpl_8fzzJakpYoprXoNsUUBmP3RVNdxS`
- immutable URL: `https://k-lol-fvbbulkfx-tjdmswo11-3715s-projects.vercel.app`
- 운영 alias: `https://k-lol-gg.vercel.app`
- Vercel UI: Ready · Latest · Production, source commit `a0310333d9ee7ff048944bef63495bebdd05c8e8`
- 운영 alias `/api/health`: 2026-09-16T05:05:08.661Z, HTTP 200, `status=ready`
- immutable URL 직접 요청은 Vercel Deployment Protection 로그인 화면으로 보호되므로 운영 health 판정은 alias 응답과 Vercel UI 상태를 함께 사용했다.

## 확정 동작

1. `오픈채팅봇`의 `입장시 할 일` 문구에서만 안내 한 건을 생성한다.
2. 환영형·공지형·게임형·가벼운 퀘스트형 중 하나를 `Math.random()` 한 번으로 선택한다.
3. 네 결과 모두 닉네임, 구인구직방, 디스코드 필수 정보를 같은 본문으로 포함한다.
4. 원시 입장 시스템 문구, 일반 사용자 복붙, 유사하지만 다른 문구는 응답하지 않는다.
5. 안내 생성 과정의 HTTP 요청은 0건이다.
6. frozen V1 fixture는 수정하지 않고 strict wrapper의 승인된 확장으로만 적용했다.

## 자동 검증 기준

- `Math.random()`을 `0`, `0.25`, `0.5`, `0.75`, `0.999999`로 고정해 네 톤과 마지막 경계를 결정론적으로 확인
- 승인된 전체 문자열과 정확 일치, 랜덤 호출 1회, 답장 1회, HTTP 0회
- 비트리거는 랜덤 호출 0회, 답장 0회, HTTP 0회
- 공개·비공개 설치본 모두 ES5, Rhino 경고 후보·혼합 return·주석 0건, `response()` 1개
- LF·CRLF 모두 MessengerBot R 65,535자 제한 미만

## 생성물

| 파일 | LF 문자 | CRLF 문자 | SHA-256 | Rhino 경고 후보 | 혼합 return | 주석 | 버전 선언 | response 함수 |
| --- | ---: | ---: | --- | ---: | ---: | ---: | ---: | ---: |
| 공개 검토본 `KLOL_KAKAO_BOT_V1_STRICT_MESSENGERBOT_R.js` | 63,671 | 65,480 | `e4fbfba2695b89d2972d72ee0192c7c0dc9d3d0bfddc190a08c47e4f6442b48a` | 0 | 0 | 0 | 1 | 1 |
| private 전체 복붙 파일 | 61,957 | 63,764 | `8f742076c8c7aa179e033805471cd97caa84382cc79379500baf548fdfefa61d` | 0 | 0 | 0 | 1 | 1 |

```text
node --test tests/kakao-v1-strict-messengerbot.test.mjs tests/kakao-v4-v1-compatibility-contract.test.mjs tests/kakao-v1-exact-v4-adapter-architecture.test.mjs
PASS — 47/47

npm run check
PASS — 일반 779/779, intentional skip 1, 여성 챔피언 가이드 68장, production build 93/93 pages

node scripts/audit-messengerbot-rhino-static.mjs <public>
node scripts/audit-messengerbot-rhino-static.mjs <private>
PASS — ES5, warning candidate 0, mixed return 0
```

## 운영 반영 상태와 남은 확인

- 휴대폰 버전: `KLOL_KAKAO_BOT_V40_R19_2026_09_16`
- DB migration·운영 데이터 직접 변경·삭제: 없음
- 서버 배포: 완료
- 남음: 휴대폰 MessengerBot R 전체 교체·컴파일과 실제 카카오톡 수신 확인
- 외부 확인: 실제 휴대폰 전체 교체·컴파일, `/봇버전`, 실제 입장 시 허용된 안내 한 건과 gateway 요청 0건

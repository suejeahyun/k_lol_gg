# 카카오 R20 내전 빠른 라인 입력 QA

검토일: 2026-09-16 KST

대상: 협곡 내전 빠른 추가 축약형, ALL 부라인 확장, 기존 참가자 라인 수정, V1 전체 형식 회귀, 공개·비공개 전체 복붙 설치본

판정: 구현, 집중 자동 검증, 격리 PostgreSQL 계약, 전체 앱 검사, Rhino 정적 검사와 Vercel 운영 배포를 통과했다. 휴대폰 실기기 설치와 실제 카카오톡 수신은 사용자 설치 후 확인 대상이다.

## 릴리스 증거

- 기능 커밋: `97ed27cfdadc09bf2e260987dce37e7364d4a57c`
- 릴리스 tag: `kakao-r20-inhouse-quick-positions-v1.0.0`
- Vercel deployment: `dpl_CmmJdtGvYaZJKZtBVHRJrjbkNK5V`
- immutable URL: `https://k-lol-5zug11ush-tjdmswo11-3715s-projects.vercel.app`
- 운영 alias: `https://k-lol-gg.vercel.app`
- Vercel UI: Ready · Production, source commit `97ed27cfdadc09bf2e260987dce37e7364d4a57c`
- 운영 alias `/api/health`: 2026-09-16T06:55:22.191Z, HTTP 200, `status=ready`
- 운영 비공개 smoke: RECRUIT HTTP 200, FEATURES HTTP 200, command gateway OK, 비밀값 미출력

## 확정 동작

1. `이름/주라인/부라인들`과 `이름/주라인,부라인들`을 모두 해석한다.
2. 첫 라인은 주라인, 나머지는 부라인으로 저장하며 대소문자와 중복 라인을 정규화한다.
3. 부라인 `ALL`은 고정 순서 TOP·JGL·MID·ADC·SUP에서 주라인을 제외한 네 라인으로 확장한다.
4. 같은 방·운영일·회차의 카카오 미검토 참가자는 슬롯을 유지한 채 라인만 수정한다.
5. 이름만 다시 추가하면 기존 라인을 ALL로 지우지 않는다.
6. SITE 신청, 확정 및 검토 완료 신청은 빠른 명령으로 덮어쓰지 않는다.
7. 기존 `이름/현티어/최고티어/주라인/부라인`과 칼바람·증바람 이름 전용 동작은 유지한다.
8. 알 수 없는 라인, `ALL` 주라인과 다른 부라인의 혼합, 삭제 명령 뒤 라인은 서버 호출 전에 거부한다.

## 자동 검증

```text
npx tsx --test tests/kakao-v4-all-mode-chat-surface.test.ts
PASS — 7/7

node --test tests/kakao-v1-strict-messengerbot.test.mjs
PASS — 28/28

V2_DB_CONTRACT_SCOPE=recruiting npm run test:db
PASS — 51/51, 격리 PostgreSQL 18

npm run check
PASS — 일반 779/779, intentional skip 1, 여성 챔피언 가이드 68장, production build 93/93 pages

node scripts/audit-messengerbot-rhino-static.mjs <public>
node scripts/audit-messengerbot-rhino-static.mjs <private>
PASS — ES5, warning candidate 0, mixed return 0
```

## 생성물

| 파일 | LF 문자 | CRLF 문자 | SHA-256 | Rhino 경고 후보 | 혼합 return | 주석 | 버전 선언 | response 함수 |
| --- | ---: | ---: | --- | ---: | ---: | ---: | ---: | ---: |
| 공개 검토본 `KLOL_KAKAO_BOT_V1_STRICT_MESSENGERBOT_R.js` | 63,690 | 65,496 | `240615cd3d09b9fde5c64cfd1dc51bc4c9675228b38e41441226b2239448f30c` | 0 | 0 | 0 | 1 | 1 |
| private 전체 복붙 파일 | 61,979 | 63,786 | `e1c09efd76630f228becdc34bcc7f89fd1c658613e76ac7886d4a9c64aa7f649` | 0 | 0 | 0 | 1 | 1 |

## 운영 반영 상태와 남은 확인

- 서버 배포: 완료
- DB migration·운영 데이터 직접 변경·삭제: 없음
- 휴대폰 버전: `KLOL_KAKAO_BOT_V40_R20_2026_09_16`
- 남음: 휴대폰 MessengerBot R에서 R20 private 파일 전체 교체·컴파일
- 실기기 확인 명령: `봇버전`, `내전상세 1 추가 민혁/mid/ad`, `내전상세 1 추가 민혁/mid,all`, `내전상세 1`

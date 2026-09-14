# 카카오 V1 strict R15 내전 전체 양식 QA

검토일: 2026-09-14 KST

대상: MessengerBot R V1 strict 생성기, 공개 검토본, private 휴대폰 설치본, 카카오 V4 내전 분류기

판정: 소스 수정·전체 앱 검사·격리 PostgreSQL·Vercel 운영 배포·private 게이트웨이 검증 통과, 휴대폰 실기기 설치와 실제 카카오톡 응답만 사용자 설치 후 확인 대상이다.

## 증상·원인·수정

- 증상: `내전구인 증바람`으로 받은 #4 양식에 `게임정보 : 증바람`, `주최자 : 민서`, `1. 민서`를 채워 전송해도 봇 응답이 없었다.
- 원인: V1 strict 후보 분류기가 `게임정보` 문구만 보고 파티 양식으로 판정한 뒤, 내전 전체 양식 여부를 확인하기 전에 요청을 중단했다.
- 수정: 파티 유사 문구가 있더라도 내전 전체 양식 외형이면 내전 완성도 검사를 계속하고 `FEATURES` 게이트웨이로 전달한다.
- 보존 경계: 10개 참가행이 없는 잘린 양식과 일반 대화는 전송하지 않으며, 완전한 빈 양식은 기존 취소 동기화를 위해 전송한다.

## 생성물

| 파일 | LF 문자 | CRLF 문자 | 물리 줄 | SHA-256 | Rhino 경고 후보 | 혼합 return |
| --- | ---: | ---: | ---: | --- | ---: | ---: |
| 공개 검토본 `KLOL_KAKAO_BOT_V1_STRICT_MESSENGERBOT_R.js` | 62,951 | 64,753 | 1,803 | `8d8ceb0583d55dc1c5f7c9641ea4e29445be4f1c985e676571053c66bfd8debc` | 0 | 0 |
| private 전체 복붙 파일 | 61,165 | 62,964 | 1,800 | `06106d007879cc9f29451ed1960414219d8c11628e8ec3aa6f4f3a1c6b0b16b7` | 0 | 0 |

두 파일 모두 MessengerBot R CRLF 65,535자 제한 이내다. private 설정값은 보존했으며 문서나 Git에 추가하지 않는다.

## 회귀 검증

```text
제보 그대로의 증바람 #4 완성 양식
PASS — 내전 외형 true, 후보 true, FEATURES HTTP 1회, 가시 응답 1회, 원문 보존

불완전 빈 양식 차단
PASS — 10개 참가행이 없는 잘린 양식과 일반 대화는 HTTP 0회

서버 분류·파싱
PASS — INHOUSE_SNAPSHOT, mode AUGMENT_ARAM, #4, 2026-09-14 21:00,
       gameInfo 증바람, organizer 민서, participant 민서

npm run check
PASS — lint 오류 0, 타입 검사, 계약·단위 테스트, 프로덕션 빌드

npm run test:db
PASS — 전체 격리 PostgreSQL 계약, migration 40개, head 0039_massive_arachne

node scripts/audit-messengerbot-rhino-static.mjs <public> <private>
PASS — ES5, warning candidate 0, mixed return 0

node scripts/verify-private-messengerbot-v1-strict-live.mjs
PASS — RECRUIT HTTP 200, FEATURES HTTP 200, 응답 본문·비밀값 비노출
```

## 운영 반영 상태와 남은 확인

- 기능 커밋: `6e2195c7d6e3f1f4c19f10a01d274d922d519275`
- 릴리스 tag: `kakao-r15-all-mode-snapshot-v1.0.0`
- Vercel 운영 배포: `HHi9vL5Ynji5fMZWQ1WqN2FVcGHq`
- 운영 URL: `https://k-lol-m00yikghu-tjdmswo11-3715s-projects.vercel.app`
- 운영 별칭: `https://k-lol-gg.vercel.app`
- 운영 확인: 2026-09-14 15:01:01 KST · `/api/health` HTTP 200 · `status: ready`
- R15 운영 배포 후 private 설치본의 RECRUIT·FEATURES 게이트웨이도 각각 HTTP 200을 재확인했다.
- DB migration·운영 데이터 직접 변경·삭제: 없음
- 휴대폰에서는 기존 스크립트를 모두 지운 뒤 R15 private 파일 전체를 한 번만 붙여넣어야 한다.
- 실제 휴대폰 컴파일, `/봇버전`, 제보한 증바람 #4 양식의 응답 확인은 사용자 실기기 설치 후 남는다.

## 다음 패치 추천

1. 휴대폰에서 전송 직전 분류 결과만 확인하는 비밀값 없는 로컬 진단 명령을 추가한다.
2. 협곡·칼바람·증바람의 생성→수정→삭제→마감 전사를 고정 회귀 fixture로 관리한다.
3. Android Rhino 실엔진 컴파일을 배포 전 자동 검사에 연결한다.
4. CRLF 65,535자 한계의 남은 여유를 릴리스마다 경고 지표로 남긴다.

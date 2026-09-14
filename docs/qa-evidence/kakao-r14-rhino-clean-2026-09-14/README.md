# 카카오 V1 strict R14 Rhino 정리 QA

검토일: 2026-09-14 KST

대상: MessengerBot R V1 strict 생성기, 공개 검토본, private 휴대폰 설치본

판정: 소스·전체 테스트·빌드·격리 PostgreSQL·Vercel 운영 배포·라이브 API 검증 통과, 휴대폰 설치만 사용자 실기기 확인 대기

## 원인과 수정

- 원인: 최종 `response` 함수가 `return handlePartyRecruitApi(...)`와 `return;`을 함께 사용해 Rhino #1798을 발생시켰다.
- 수정: 서버 호출을 별도 실행한 뒤 bare `return;`만 사용하도록 반환 방식을 통일했다.
- 재발 방지: 정적 검사에서 한 함수 안의 값 반환과 bare return 혼용을 차단한다.
- 주석 제거: Acorn의 주석 범위를 이용해 실제 주석만 삭제하고 개행·문자열·URL·정규식 리터럴은 보존한다.

## 생성물

| 파일 | LF 문자 | CRLF 문자 | 물리 줄 | SHA-256 | 주석 | 혼합 return |
| --- | ---: | ---: | ---: | --- | ---: | ---: |
| 공개 검토본 `KLOL_KAKAO_BOT_V1_STRICT_MESSENGERBOT_R.js` | 62,905 | 64,707 | 1,803 | `b4306e9425246e0253d9c6a46094b351a1cec2e0e5cb1839e92cf186c867a8cb` | 0 | 0 |
| private 전체 복붙 파일 | 61,119 | 62,918 | 1,800 | `17bd22219237a8d821fe354e05cbab65f542a7828ba6e519273ff59767b90caf` | 0 | 0 |

두 파일 모두 MessengerBot R CRLF 65,535자 제한 이내다. private 설정값은 보존했으며 출력하거나 Git에 추가하지 않았다.

## 검증 근거

```text
npm run check
PASS — 일반 779개 중 778 PASS, DB 전용 1 skip, build static generation 93/93

npm run test:db
PASS — 전체 격리 PostgreSQL 계약, migration 40개, head 0039_massive_arachne

node scripts/audit-messengerbot-rhino-static.mjs <public> <private>
PASS — ES5, CODE_HAS_NO_SIDE_EFFECTS 후보 0, mixed return 0

focused MessengerBot R / V1 compatibility tests
48 PASS / 0 FAIL

node scripts/check-secrets.mjs --tree-only
PASS
```

## 운영 반영 상태와 남은 확인

- 기능 커밋: `c12683c1794eb6f9d61fc950b113ad30328eb8d6`
- 릴리스 tag: `kakao-r14-rhino-clean-v1.0.0`
- Vercel 운영 배포: `AdxpFyJ2Jbi7VA7vL4ssQi2RMXho`
- 운영 URL: `https://k-lol-6zdv6s72b-tjdmswo11-3715s-projects.vercel.app`
- 운영 별칭: `https://k-lol-gg.vercel.app`
- 운영 확인: 2026-09-14 14:21:15 KST · `/api/health` HTTP 200 · `status: ready`
- private 설치본의 RECRUIT·FEATURES 게이트웨이도 운영 도메인에서 각각 HTTP 200을 확인했다.
- 실제 휴대폰의 기존 코드 백업, R14 private 전체 교체, 컴파일, `/봇버전`, 두 방 실사용 확인은 사용자 휴대폰에서 진행해야 한다.
- DB migration·운영 데이터 직접 변경·삭제는 없다.

## 다음 패치 추천

1. 휴대폰 컴파일러의 warning 목록을 자동 전사할 수 있는 최소 진단 명령을 추가한다.
2. private 생성본을 배포 전 동일 Rhino 엔진에서 컴파일하는 Android 실기기 테스트 경로를 만든다.
3. 현재 2,617자인 CRLF 여유를 다음 기능 추가 전 더 확보한다.
4. 내전 정상 마감과 취소를 DB 상태에서 분리한다.

# 카카오 R21 내전 일반·예비 명단 이중 입력 QA

검토일: 2026-09-17 KST

대상: 내전 일반·예비 명단의 채팅 명령 및 전체 양식 동기화, 협곡 라인 단축형, 옛 양식 호환, 공개·비공개 전체 복붙 설치본

판정: 구현, 집중 자동 검증, 전체 단위·계약 검사, 격리 PostgreSQL 계약, 프로덕션 빌드, Rhino 정적 검사, Vercel 운영 배포와 라이브 서명 검증을 통과했다. 휴대폰 실기기 설치와 실제 카카오톡 수신은 사용자 설치 후 확인 대상이다.

## 릴리스 증거

- 기능 커밋: `b6ead14aef8a8991bb519805ffdcd2f6c72ac699`
- 릴리스 tag: `kakao-r21-inhouse-reserve-dual-input-v1.0.0`
- Vercel deployment: `dpl_CzikbQKinnSZeDWJW9ovjdRKWfht`
- immutable URL: `https://k-lol-53bugwtpf-tjdmswo11-3715s-projects.vercel.app`
- 운영 alias: `https://k-lol-gg.vercel.app`
- Vercel 상태: Ready · Production
- 운영 alias `/api/health`: 2026-09-17T06:24:26.090Z, HTTP 200, `status=ready`
- 운영 비공개 smoke: RECRUIT HTTP 200, FEATURES HTTP 200, command gateway OK, 비밀값 미출력

## 확정 동작

1. 일반 참가자는 `내전상세 번호 추가 이름/주라인/부라인`과 `내전상세 번호 삭제 이름`으로 관리한다.
2. 예비 참가자는 `예비추가`, `예비삭제`와 공백 별칭 `예비 추가`, `예비 삭제`, `대기 추가`, `대기 삭제`로 관리한다.
3. 협곡 전체 양식의 `예비 1. 정민/all`을 읽고 예비 슬롯으로 저장한다.
4. 전체 양식에 예비 줄이 있으면 그 영역이 권위 있는 스냅샷이 되어 추가·수정·삭제를 반영한다.
5. 예비 줄이 없는 구버전 복붙 양식은 기존 예비 참가자를 보존한다.
6. 일반 참가 슬롯과 예비 슬롯은 내부에서 분리되고 각각 정원을 검사한다.
7. 협곡은 단축 라인 형식과 기존 티어 포함 형식을 모두 유지하며, 칼바람·증바람은 이름 전용이다.
8. 출력 안내의 잘못 섞였던 예비 추가 문구를 `내전상세 번호 예비추가 이름/라인`으로 고쳤다.

## 자동 검증

```text
npx tsx --test tests/kakao-v4-all-mode-chat-surface.test.ts
PASS — 8/8

node --test tests/kakao-v1-strict-messengerbot.test.mjs
PASS — 28/28

npm run check
PASS — 일반 780 PASS, intentional skip 1, 계약 401/401, 여성 챔피언 가이드 68/68, production build 93/93 pages

npm run test:db
PASS — 전체 격리 PostgreSQL 계약 및 HTTP/browser 계약

node scripts/audit-messengerbot-rhino-static.mjs <public> <private>
PASS — ES5, warning candidate 0, mixed return 0
```

## 생성물

| 파일 | LF 문자 | CRLF 문자 | SHA-256 | Rhino 경고 후보 | 혼합 return | 주석 | 버전 선언 | response 함수 |
| --- | ---: | ---: | --- | ---: | ---: | ---: | ---: | ---: |
| 공개 검토본 `KLOL_KAKAO_BOT_V1_STRICT_MESSENGERBOT_R.js` | 63,681 | 65,487 | `5bce4e91ef38067d3206768407b599c9e16417d350dbbc26ca0de545ccb5cd43` | 0 | 0 | 0 | 1 | 1 |
| private 전체 복붙 파일 | 61,970 | 63,777 | `aefe5a336a353bb397c57cbfc7ca036ce3a207a76ef8fe44206a7e4fb724b66e` | 0 | 0 | 0 | 1 | 1 |

## 운영 반영 상태와 남은 확인

- 서버 배포: 완료
- DB migration·운영 데이터 직접 변경·삭제: 없음
- 휴대폰 버전: `KLOL_KAKAO_BOT_V40_R21_2026_09_17`
- 남음: 휴대폰 MessengerBot R에서 private 파일 전체 교체·컴파일
- 실기기 확인: `봇버전`, `내전상세 1 예비추가 정민/all`, `내전상세 1 예비삭제 정민`, 예비 행을 포함한 전체 양식 재전송

## 롤백

서버 문제가 확인되면 Vercel을 직전 확인 배포로 되돌리고 휴대폰 코드는 R20 백업본으로 복원한다. 이번 변경은 migration이 없으므로 운영 데이터를 삭제하거나 DB를 역변경하지 않는다.

# 카카오 R22 간결 명단·미등록 회원가입 안내 QA

검토일: 2026-09-18 KST

대상: 내전 참가자 수정 별칭, 간결 명단, 본명·닉네임 표시, 미등록 회원가입 안내, 일반 응답 도움말 제거, 공개·비공개 전체 복붙 설치본

판정: 구현, 집중 자동 검증, 전체 단위·계약 검사, 격리 PostgreSQL 계약, 프로덕션 빌드, Rhino 정적 검사와 Vercel 운영 배포를 통과했다. 휴대폰 실기기 설치와 실제 카카오톡 수신은 사용자 설치 후 확인 대상이다.

## 릴리스 증거

- 기능 커밋: `4482bc071d4806946f1f78f23b763122b988a5a8`
- 릴리스 tag: `kakao-r22-compact-roster-signup-v1.0.0`
- Vercel deployment: `dpl_3GkXwSrViAMGtQUTQcHtLuSdFbBA`
- immutable URL: `https://k-lol-6il0rhr1d-tjdmswo11-3715s-projects.vercel.app`
- 운영 alias: `https://k-lol-gg.vercel.app`
- Vercel 상태: Ready · Production
- 운영 alias `/api/health`: 2026-09-18T06:19:19.615Z, HTTP 200, `status=ready`

## 확정 동작

1. `내전상세 1 수정 02정민/mid/ad`는 기존 참가자의 주라인·부라인을 갱신하며 중복 슬롯을 만들지 않는다.
2. 내전 명단은 `본명 / 닉네임`으로 표시한다.
3. 닉네임이 9자를 넘으면 유니코드 문자 기준 9자와 `...`으로 줄인다.
4. 명단 제목, 처리 결과, 현재 일반·예비 인원은 첫 줄에 모아 출력한다.
5. 미등록 이름은 저장하지 않고 회원가입 주소와 재시도 안내를 출력한다.
6. 파티·내전·스크림의 일반 양식·상세·변경 응답에서는 빠른 명령과 기능 설명을 반복하지 않는다.
7. 파티·내전·스크림 사용법은 `/구인도움말`에만 모아 출력한다.
8. 과거 안내 문구가 들어간 복사본도 입력 파서가 계속 허용한다.

## 자동 검증

```text
focused server/phone/compatibility
PASS — 44/44

MessengerBot + compatibility
PASS — 41/41

scrim regression
PASS — 7/7

npm run test:db
PASS — 전체 격리 PostgreSQL 계약 및 HTTP/browser 계약

npm run check
PASS — 일반 782 PASS, intentional skip 1, 계약 401/401, 여성 챔피언 가이드 68/68, production build 93/93 pages

Rhino static audit (public/private)
PASS — ES5, warning candidate 0, unsafe sequence operand 0, void expression 0, bare assignment condition 0, mixed return 0
```

## 생성물

| 파일 | LF 문자 | CRLF 문자 | SHA-256 | Rhino 경고 후보 | 혼합 return | 주석 | 버전 선언 | response 함수 |
| --- | ---: | ---: | --- | ---: | ---: | ---: | ---: | ---: |
| 공개 검토본 `KLOL_KAKAO_BOT_V1_STRICT_MESSENGERBOT_R.js` | 63,720 | 65,528 | `283c758142df12ba015cd6eed2ba33f08310997834a2364888ed76f3919d3465` | 0 | 0 | 0 | 1 | 1 |
| private 전체 복붙 파일 | 62,009 | 63,818 | `7725ab9aa7ce9d8f97b0e1e0120c895e3743d3bdfa154ce6911fc2833cffe90d` | 0 | 0 | 0 | 1 | 1 |

## 운영 반영 상태와 남은 확인

- 서버 배포: 완료
- DB migration·운영 데이터 직접 변경·삭제: 없음
- 휴대폰 버전: `KLOL_KAKAO_BOT_V40_R22_2026_09_18`
- 남음: 휴대폰 MessengerBot R에서 private 파일 전체 교체·컴파일
- 실기기 확인: `봇버전`, `내전상세 1 수정 02정민/mid/ad`, 등록 회원 추가, 미등록 이름 추가, `/구인도움말`

## 롤백

서버 문제가 확인되면 Vercel을 직전 확인 배포로 되돌리고 휴대폰 코드는 R21 백업본으로 복원한다. 이번 변경은 migration이 없으므로 운영 데이터를 삭제하거나 DB를 역변경하지 않는다.

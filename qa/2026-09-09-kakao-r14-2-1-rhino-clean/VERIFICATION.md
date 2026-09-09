# R14.2.1 검증 증거

검증일: 2026-09-09 KST

| 검증 | 결과 |
| --- | --- |
| `npm run bot:kakao:v41` | public mobile 64,845자, CRLF 64,943자, 생성 성공 |
| private generator | 설정 4개 exact equal, 65,237자, CRLF 65,336자, 여유 199자 |
| 실제 Rhino 1.7.13 `-version 180 -w -strict -fatal-warnings` public/private | stdout·stderr 경고 0, exit 0 |
| Rhino 규칙 전체 AST audit public/private | statement 0, unsafe comma operand 0, void 0, bare assignment condition 0 |
| `node --check` public/private | 통과 |
| `npm run bot:kakao:audit` | 101개 (`CORE 21`, `INHOUSE 13`, `MANAGED 13`, `PARTY 33`, `SCRIM 21`) |
| `npm run typecheck` | 통과 |
| `npm run test:contracts` | 217 통과, 0 실패 |
| `npm run test:unit` | 481 통과, 0 실패 |
| relevant ESLint + `no-unused-expressions:error` | 오류 0 |
| focused staged-diff secret scan | high-confidence key/token/private-key/literal-secret finding 0 |

Rhino jar SHA-256: `931dda33789d8e004ff5b5478ee3d6d224305de330c48266df7c3e49d52fc606`

실제 휴대폰 MessengerBot R의 저장·컴파일 및 카카오톡 실명령 smoke는 운영자 설치 뒤 수행할 항목이다. 서버/API/DB 계약은 R14.2와 동일하며 이번 패치에는 migration과 Production 배포가 없다.

저장소 전체 과거 Git history 검사는 장시간 소요로 중단했고 이번 변경의 완료 근거로 사용하지 않았다. 이번 staged diff와 생성된 공개 산출물만 고신뢰 규칙으로 검사했다.

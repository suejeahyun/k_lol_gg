# 멸망전 1.2.0 · 주장 지원 접수

**운영 반영 완료**: source `efbdb777a7a5af574de21403561af21cd3d19af7`, tag `destruction-modes-v1.2.0`, Vercel `dpl_EhLEUrZd3afJ1mVNakdnw2zUf8Gb` READY. 2026-09-25T13:02:48.284Z health ready·공개 조회·관리자 인증 경계·효과음 정상. [후보 확인](./candidate-smoke.json), [운영 확인](./production-smoke.json).

## 변경 계약

- 세 모드의 본인 신청 PUT은 선택 필드 captainVolunteer(boolean)를 받는다. 문자열·숫자·null·객체·배열은 거절한다. 값은 멱등성 fingerprint에 포함된다.
- 기존 요청의 필드 생략은 저장된 지원 여부를 보존하며, 기존 신청에 값이 없으면 일반 선수(false)로 읽는다. 기존 키의 fingerprint 호환을 위해 생략 필드를 명령에 추가하지 않는다.
- 기존 aggregate JSON 신청 항목에 저장한다. 본인 조회는 같은 쿼리에서 신청 인덱스와 aggregate를 읽고 소유자·신청 ID에 맞는 값만 반환한다. SQL 스키마/migration 변경 없이 head 0046_overconfident_robbie_robertson 유지.
- 신청서 역할 선택, 모집 심사 역할 열, 모집 종료 후 주장 선택 목록의 지원 표시를 연결했다. 지원만으로 주장·팀을 자동 배정하지 않는다. 일반 선수도 운영자가 주장으로 선정할 수 있다.
- 기존 권한·확정 신청 변경 제한·포지션 규칙·revision·행별 심사 큐 유지. 브라우저 전송은 X-Destruction-Revision을 계속 사용한다.

## 검증

- [전체 검사](./check.txt): lint 오류 0(기존/로컬 제외 경고 58), 타입·ERD·계약445·단위1010 PASS/1 SKIP·이미지 검사·운영 빌드 통과.
- [인증 HTTP](./auth-http.txt), [현재 트리 비밀정보](./secrets.txt) 검사 통과.
- 격리 PostgreSQL 계약은 세 모드의 저장·본인 조회·지원 철회·생략 요청 보존·모집 종료 후 지원 기록 유지 및 주장 미자동배정을 검증한다.
- 브라우저 재현: PG_BIN_DIR을 PostgreSQL18 bin으로 지정하고 npx tsx scripts/test-db/run-destruction-browser-qa.ts 실행. 세 모드 신청 저장·reload·관리자 표시·역변경, 기존 연속 심사/오류 복구, 카드·효과음과 접근성을 검증한다.

- [브라우저 결과](../../qa/destruction-captain-signup-2026-09-25/interactions.json): 74화면·18개 상호작용 PASS, axe 위반·브라우저 예외 0. 세 모드의 주장 지원 저장·새로고침·관리자 표시·일반 선수 변경을 실제 HTTP로 확인했다. 주장 선정 목록의 지원 표시도 확인했다.
- [전송 검사](../../qa/destruction-captain-signup-2026-09-25/edge-transport.json): 전용 revision 헤더 저장25건, 기존 If-Match 전송·중계 응답 치환 0건.

## 복구·검증 범위

운영 신청이나 심사 상태를 테스트로 수정하지 않는다. 실제 쓰기는 격리 DB와 운영용 빌드에서 확인하고 운영은 공개 조회·인증 경계·배포 상태로 확인한다. 문제 발생 시 기존 revision 헤더 수정(1.1.2)을 유지한 forward-fix를 적용하며, 추가 JSON 필드 삭제나 스키마 복구는 필요하지 않다.

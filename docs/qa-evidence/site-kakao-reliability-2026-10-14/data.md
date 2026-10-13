# 모집 데이터·업무 시각·재전송 검증

2026-10-14 재점검 항목 1, 3, 6의 구현 및 검증 기록이다. 운영 데이터 쓰기, 실제 카카오 발송, 브라우저 실행은 이 검증에서 수행하지 않았다. 스키마 변경은 없다.

## 변경 및 회귀 범위

- 공개 모집 DTO가 모집일과 해당 방·실제 모집 UUID에 연결된 고정 코드를 제공한다. 카드의 복사 명령은 고정 코드를 사용한다. 코드가 없는 기존 모집은 숫자 명령 복사를 제공하지 않는다. 공개 목록 조회 전후 registry/snapshot 값이 동일함을 실제 DB에서 확인했다.
- V4 서비스에서 한 번 캡처한 서버 시각으로 운영일과 양식 발급·만료를 판단한다. 기존 openchat 진입점과 assistant 기본 시각도 서버 시각을 사용한다. 서명 timestamp는 서명·유효시간 검증과 감사용 값으로 유지한다.
- 같은 event의 번호·고정 코드 참가/삭제/마감 재전송은 원본 digest, 주체, V4 event scope/key, 만료, 응답 aggregate 및 방을 검증한 durable receipt에서 원래 모집 UUID를 찾는다. 날짜 경계 뒤 같은 번호가 존재해도 원래 모집 응답을 재생한다. 최신 양식의 유효시간은 현재 서버 시각으로 계산한다.
- 첫 receipt 조회 때 원요청이 아직 커밋되지 않았다가 명령 처리 단계에서 replay가 반환되는 경합은 커밋된 receipt를 다시 검증해 원래 UUID로 응답 양식을 조회한다. 서로 다른 aggregate를 안전하게 연결하지 못하면 응답을 생성하지 않는다. 이 정확한 호출 순서는 dispatcher 단위 회귀로 검증했다.
- CREATE 응답은 receipt에 저장된 모집일을 우선한다. 새 receipt에 모집일을 저장하며, 06시 이후 fresh service 재전송에서도 원래 모집 한 건과 같은 응답을 유지한다.
- 명시적 예비 추가 의도를 숫자와 고정 코드 경로에서 canonical command, application validator, 도메인 저장까지 보존한다. 메인 자리의 빈칸이 있어도 예비 칸으로 추가하며 중복 참가, 예비 칸 제한 및 전체 인원 제한을 적용한다.

## 최종 실행 결과

| 실행 | 결과 | 범위 |
| --- | --- | --- |
| `V2_DB_CONTRACT_SCOPE=recruiting npm run test:db` | **112/112 PASS**, 실패 0, skip 0, exit 0 | 11개 파일, PostgreSQL 18 실제 계약 |
| `npx tsx --test tests/kakao-v4-dispatcher.test.ts tests/recruiting-application.test.ts` | **78/78 PASS** | 마지막 미커밋→커밋 replay 경합 포함 |
| `node --test tests/first-visit-interactions.test.mjs tests/recruits-matches-competitions-ui.test.mjs` | **7/7 PASS** | 서로 다른 고정 코드 복사, 코드 없는 기존 모집의 안전 안내 |
| `npx tsc --noEmit --pretty false` | **PASS** | 최종 runtime 수정 후 타입 검사 |

DB 112건에는 공개 목록·경계·예비·fresh service replay 통합 2건, 시즌 계약 25건, Kakao 입력 허용·같은 방 다중 사용자 계약 33건이 포함되어 있다. 별도 합계로 중복 가산하지 않는다. 이 scope는 DB 및 서비스/dispatcher 계약이며 실제 HTTP 서명 진입점이나 휴대폰 실기기 검증을 뜻하지 않는다. 전체 `npm run check` 및 HTTP·브라우저 결과는 [상위 검증 기록](README.md)을 따른다.

실제 DB 통합 회귀는 서로 다른 날짜의 동일 번호 모집과 코드 없는 행, 다른 scope의 registry를 합성했다. 서버 05:56/클라이언트 06:00의 +240초 차이에도 이전 운영일 원본이 유효함을 확인했다. 서버 05:59:59→06:00:01에서 매번 새 서비스 인스턴스로 CREATE, 번호 ADD, FINISH를 재전송하여 중복 생성과 다른 날짜 모집 변경이 없음을 확인했다. 원본 digest 변경, 다른 주체/방, 만료 receipt의 거부도 확인했다.

## 격리와 정리

기존 `scripts/test-db/run-data-contracts.ts`가 허용한 환경 변수만 전달하고 임의 loopback 포트의 일회용 PostgreSQL 18을 시작했다. 최종 로그의 시작은 `isolated PostgreSQL 18 cluster started`, 종료는 `cluster stopped and disposable workspace path removed`다. 운영 연결 문자열이나 비밀 설정을 읽거나 출력하지 않았다. [최종 DB 로그](data-contracts-final.log)에 11개 파일의 결과와 정리를 보존했다.

작성 중 DTO 기대값, 명시적 예비 payload validator, 합성 감사 UUID, receipt 스키마 필드 및 과거 날짜 fixture의 서버 clock 누락을 검사에서 발견해 수정했다. 최종 112/112는 이 수정 후 전체 scope를 다시 실행한 결과이며 이전 실패 실행을 PASS로 합산하지 않았다.

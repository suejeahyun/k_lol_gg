# 회원 경기 접수·팀 저장 실제 HTTP 업무 검증

검증일: 2026-10-06 KST. 기준 HEAD는 `bae10999`이며 아래 API 수정이 포함된 작업 트리에서 실행했다. 최종 커밋·운영 배포 기록은 통합 릴리스 근거에 연결한다. 이 문서는 운영 데이터를 쓰는 검증을 포함하지 않는다.

## 기존 근거와 실제 검증 공백

[전체 기능 원장](../2026-10-05-service-completion/feature-inventory.md), 이전 [브라우저 조작 기록](../2026-10-05-service-completion/browser-observations.md), `tests/match-submit-continuation.test.mjs`, `tests/team-tools-retry.test.mjs`, `tests/database/match-snapshot.contract.test.ts`, `tests/database/team-balance-draft.contract.test.ts`, 기존 `scripts/test-db/verify-match-public-http.ts`를 함께 확인했다.

| 기능군 | 기존 근거의 한계 | 이번에 수행한 검증 |
| --- | --- | --- |
| 회원 경기 접수 | 클라이언트 폼/handler 회귀와 repository 계약은 있었지만 실제 회원 로그인으로 생성 후 수정·업로드·취소까지 이어지는 HTTP 검증은 빠져 있었다 | 실제 비밀번호 로그인·ACCOUNT cookie → 생성 → 동시 수정 → 최신 조회 후 복구 → 이미지 → 취소 |
| 이미지 제출 | 기존 HTTP는 관리자 import 이미지 1장이 중심이었다 | 회원 이미지 오류 후 복구, 성공 요청 재전송, 같은 파일을 다른 게임으로 제출 시 충돌, 다른 정상 이미지로 복구·검토 대기 전환 |
| 접수 종결 | 종결 UI의 실행 렌더와 저장소 계약은 있었으나 동일 회원 접수의 실제 API 상태 전환과 연결 검증은 없었다 | 취소 후 새 접수, 반려 사유, 재개 시 사유 정리, 검토 결과 저장·승인·공개 경기·승인 링크 |
| 팀 초안 | 키 저장소를 사용하는 클라이언트 회귀와 DB 계약은 있었으나 인증 HTTP에서 동시 저장/재평가/재시도 검증이 없었다 | 생성·저장·재평가 replay, 동시 저장 200/412, 다른 회원 조회·변경 거절, 해당 팀을 이용한 접수 및 경기 승인 |
| 세션·잘못된 주소 | 생성/관리자 경계와 잘못된 조회 ID는 검사했지만 회원 후속 변경·동적 mutation scope는 검사하지 않았다 | 승인 대기/익명 생성 거절, 다른 회원 접근 거절, 세션 폐기 후 조회·변경 거절, 잘못된 변경 주소의 구조화된 400/404 |

단순 페이지 응답 검사를 전체 업무 검증으로 확대 해석하지 않았다. 기존 테스트 수를 늘리는 목적이 아니라 위 연결 구간의 실제 실행이 목적이다.

## 발견한 제품 문제

**P1 — 정상 접수 생성 뒤 수정·이미지 첨부·취소를 완료할 수 없음.** 정상 공개 접수 코드는 `MR2...` 대문자 형식이다. 회원 후속 API가 이 코드를 `me:match-submissions:${code}:...`의 요청 scope에 그대로 삽입했다. 공통 `idempotencyHashMaterial`은 소문자 식별자만 허용하므로 도메인 저장에 도달하기 전에 `TypeError: idempotency scope must be a stable lower-case identifier`가 발생했다. 수정·취소는 500, try/catch 안의 이미지 첨부는 503으로 반환되는 동일 원인이다. Kakao 접수 이미지 세션 생성/폐기도 같은 보간을 사용했다.

- [수정 전 실제 HTTP 실패](before-diagnostics.log): 생성 성공 후 두 수정 요청 모두 500. 기대한 결과는 저장 200과 이전 revision 충돌 412였다.
- 후속 실패 진단 실행의 stack: `idempotency.ts:26 → match-http.ts:185 commandContext → match-http.ts:226 mutationHeaderGuard → match-http.ts:237 prepareMatchJsonMutation → [code]/route.ts:44 PATCH`.
- 수정: 기존 `canonicalSubmissionPublicCode`로 대상 코드를 검증하고 **scope에만** 소문자 형식을 적용했다. 서비스에 전달하는 대문자 공개 코드, 사용자 URL, DB 형식은 유지한다. 이미지 경로는 기존 코드 검증을 그대로 사용한다. 잘못된 소유자 접수 코드에는 404를 반환한다.
- 이전 uppercase scope는 해시 생성 전에 예외가 발생했고, lowercase 공개 코드는 기존 도메인에서 유효하지 않았다. 이 수정으로 변경되는 기존 유효 receipt 해시는 없다. 생성 API scope·관리자 정상 UUID scope·DB schema 변경도 없다.

**P2 — 잘못된 변경 주소가 입력 오류 대신 서버 오류 발생.** 관리자 경기 변경 API의 동적 UUID scope에 한글·대문자·과도한 길이 값을 넣으면 동일한 예외가 발생할 수 있었다. 공통 플랫폼 predicate를 기존 hash 검사와 경기 mutation header guard에서 재사용해 구조화된 `INVALID_INPUT` 400을 반환한다. 소문자 규칙을 넓히거나 잘못된 대상을 유효한 것으로 바꾸지 않았다. 실제 호출부를 확인한 결과 다른 기능군의 해당 scope는 고정 식별자이므로 그 모듈들까지 변경하지 않았다.

## 실제 실행 결과

[최종 격리 HTTP·DB 원본 로그](http-and-contracts.log)는 exit 0으로 끝났으며 PostgreSQL 종료와 일회성 경로 삭제를 확인했다.

| 실행 과업 | 관측 결과 |
| --- | --- |
| 익명/승인 대기 계정의 생성 | 각각 401/403, 저장 불가 |
| 회원 생성과 같은 요청 재전송 | 201/201, `Idempotency-Replayed: true`, 동일 접수 ID |
| 소유자 외 조회 | 404 |
| 같은 revision의 서로 다른 수정 요청 동시 전송 | 정확히 200 하나와 412 하나, revision 한 번 증가, 저장한 제목 확인 |
| 최신 상태 조회 후 수정·재전송 | 200, 같은 요청 replay, 저장한 제목 확인 |
| 잘못된 이미지 → 정상 이미지 | 400 후 revision 보존, 정상 첨부 201 |
| 같은 이미지 요청 재전송 | 201 replay, 게임 번호 중복 없음 |
| 이미지 1장을 제출한 접수 취소·재전송 | 200 replay, `CANCELLED`; 추가 이미지와 수정은 409, SSR 취소 안내 확인 |
| 팀 생성 재전송 / 다른 소유자 접근 | 201 replay·같은 초안 ID / 조회 및 저장 404 |
| 팀 동시 저장 → 재평가 → 최신 저장 | 200/412, SAVED revision 1, 재평가·저장 replay 및 최종 SAVED 확인 |
| 취소 후 별도 접수 및 저장 팀 연결 | 새 publicCode, 팀 초안 ID 유지 |
| 게임 1 이미지 재사용을 게임 2로 제출 | 409, revision 보존; 다른 게임 2 이미지 201 이후 PENDING_REVIEW와 `[1, 2]` 확인 |
| 관리자 반려 → 회원 확인 → 재개 | REJECTED와 공개 사유 API/SSR 확인; 재개 후 PENDING_REVIEW와 사유 null |
| 팀 배치를 유지한 검토 저장 → 승인 → replay | 저장 200, 승인 201 replay, APPROVED, 승인 경기 ID 일치, 공개 경기 GET 200 및 SSR 링크 |
| 승인 접수 취소 / 회원 세션 폐기 후 조회·변경 | 종결 취소 409 / 팀 조회·저장 및 접수 취소 401 |
| 한글/대문자/130자 ID의 관리자 publish 주소 | 구조화된 `INVALID_INPUT` 400, 저장 호출 전 거절 |

관리자 import 생성/이미지, 익명·폐기 관리자 세션 차단, 공개 경기 10명 KDA 보존과 이미지 fallback, 누락 경기 404, 서비스 없음 503은 기존 동일 harness 검증도 함께 통과했다. DB의 스냅샷·이력과 현재 세션 경계 계약도 함께 실행했다.

`tests/match-mutation-scope.test.ts`는 실제 Kakao owner route를 실행하고 실제 공통 hash 함수를 사용한다. 같은 요청 scope 재시도, 생성과 폐기 분리, 다른 접수 분리, 대문자 target 보존, 잘못된 코드 404를 검증했다. 같은 파일에서 실제 경기 JSON/이미지 header guard의 잘못된 scope 400과 정상 scope 해시 불변도 확인했다. Kakao 서비스 자체는 이 테스트에서 격리한 대역이며 외부 메신저 수신 성공을 뜻하지 않는다.

변경 후 다음 검사를 통과했다.

```powershell
$env:PG_BIN_DIR='C:/Program Files/PostgreSQL/18/bin'
$env:V2_DB_CONTRACT_SCOPE='matches'
npm run test:db
npx tsx --test tests/match-mutation-scope.test.ts tests/http-mutation-foundation.test.ts
npx tsc --noEmit --incremental false
```

변경 파일의 ESLint 및 `git diff --check`도 통과했다. 통합 full check·브라우저 후속 조작·운영 배포 검증은 통합 담당 기록을 따른다.

## 안전 범위와 남은 조건

기존 `run-data-contracts.ts`의 PostgreSQL 18 일회성 loopback cluster·`klol_v2_test_` DB와 `assertSafeTestDatabase`를 사용했다. 실제 제품 Next dev/API/DB/인증을 거쳤으며 임시 합성 계정·선수·경기만 변경했다. 비밀번호·세션/서명키·운영 데이터는 근거에 남기지 않았다. 서버 실패 진단 버퍼에도 합성 비밀번호·서명키·암호화키·DB URL을 치환한다.

이미지는 sharp로 만든 합성 PNG이며 비공개 스토리지/OCR는 기존 `V2_FAKE_PRIVATE_ASSETS=1` 경계다. 실제 Blob 저장, 외부 OCR의 정확도·비용·장애, Kakao 설치 앱의 이미지 전달은 이 검증이 확인하지 않는다. 재전송은 같은 HTTP 요청을 재전송해 receipt와 상태를 확인한 것이며 실제 통신망 패킷 손실을 발생시킨 것은 아니다. 브라우저 버튼·확인창·파일 선택은 root의 별도 CUA 검증 범위다.

실패한 중간 실행 중 게임 1/2에 같은 합성 이미지 사용으로 발생한 409, 리뷰 DTO에 팀 평가의 추가 필드를 함께 넣어 발생한 400은 제품이 계약대로 잘못된 fixture를 거절한 결과였다. 각 fixture를 서로 다른 이미지 및 허용된 team/position 필드만 사용하도록 고치고 전체 체인을 다시 통과시켰다. 테스트 기대값을 제품 오류에 맞춰 낮추지 않았다.

팀 검증에서 기존 pg 8.23.0의 같은 연결 중첩 query deprecation 경고도 관측했다. 동작·정합성 실패는 없었으며 이번 변경과 무관한 pg 9 호환성 준비이므로 추측성 repository 재작성은 하지 않았다. 현재 버전의 실제 동시 저장/재시도 결과는 위와 같다.

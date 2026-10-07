# 이벤트 설정 수정 연결 — 2026-10-07

## 발견과 필요성

기존 `REPLACE_SETTINGS` API·도메인 명령이 있지만 `EventAdminActions`는 그 명령을 호출하지 않았고, 관리 상세에 제목·모집 기간 등의 수정 입력도 없었다. 잘못 입력해 생성한 이벤트를 바로잡는 과업이 막힌 P2 기능 공백이다. 새 API·DB 필드 대신 기존 명령을 관리 상세에 연결했다.

도메인의 허용 조건은 **PLANNED이며 참가자 기록이 0명**이다. 활성 참가자만 0명인 조건으로 넓히지 않았으며 취소된 참가자 기록이 있어도 입력을 표시하지 않는다. 모집 중 이후의 설정 변경이나 참가자 삭제·데이터 우회 수정은 추가하지 않았다.

## 소유 변경

- `src/app/(admin)/admin/progress/event/[eventId]/event-admin-actions.tsx`: 제목·설명·방식·모집 시작/마감·대진 방식 수정 폼. 기존 형식 표시 함수, CSS form/fieldset, `ClientMutationKeyStore` 재사용. 모집 시간은 한국 시간으로 명시하고 UTC와 왕복하며 기존 초·밀리초도 보존한다.
- 같은 컴포넌트의 기존 command 경로: 즉시 ref 잠금, 요청 중/서버 refresh 중 다른 작업 잠금, 15초 제한, 동일 body/revision의 재시도 키 유지. 412는 입력을 보존하고 명시적인 최신 내용 불러오기, 401은 같은 이벤트로 돌아오는 관리자 로그인 링크를 제공한다. 알 수 없는 전송 결과를 성공으로 표시하지 않는다.
- `src/app/(admin)/admin/progress/event/[eventId]/page.tsx`: event ID/revision에 관리 입력 상태를 묶어, 최신 서버 데이터를 불러왔을 때 이전 제목·일정이 남지 않게 한다.
- `src/app/(admin)/admin/progress/event/event-admin.module.css`: 새 설정 폼에 한정해 넓은 화면 2열/520px 이하 1열 및 저장 버튼 최소 44px를 적용한다. 생성 폼과 다른 액션 폼의 스타일 규칙은 바꾸지 않았다.
- `tests/event-settings-edit.test.mjs`: 실제 TSX를 로드해 JSX/SSR과 실제 submit handler, 상세 페이지의 서버 렌더를 실행한다. 네트워크 응답·React hook/transition은 제어 가능한 테스트 대역이다.

API·도메인 정책·저장소·스키마·생성 폼은 이 변경에서 수정하지 않았다.

## 재현과 확인

| 근거 | 결과와 범위 |
|---|---|
| [event-settings-before.log](event-settings-before.log) | 수정 전 신규 8검사 실패. 실제 입력 미노출과 revision별 component key 부재를 확인했다. 서로 독립적인 8개 제품 결함이라는 뜻은 아니다. |
| [event-settings-after.log](event-settings-after.log) | 독립 검토 후 성공 응답 확인 회귀를 추가하여 신규 9검사와 기존 이벤트 화면 계약 3검사, 최종 총 12 PASS. |
| [event-settings-regression.log](event-settings-regression.log) | `TZ=America/Los_Angeles`에서도 동일 12 PASS. KST 자정 전후/초·밀리초와 변경한 시각의 UTC payload 일치를 실행했다. |
| [event-settings-lint.log](event-settings-lint.log) | 두 TSX와 신규 테스트에 focused ESLint exit0. 성공 시 출력 없음. |
| `git diff --check` | 12:22:55 KST exit0. 줄바꿈 경고만 있었고 whitespace 오류 없음. |

실행한 동작은 허용/금지 단계와 취소 참가자, 최초 입력값, 날짜 역전/누락, 정상 PATCH payload/If-Match, 유실 응답·503·읽을 수 없는 성공 응답의 같은 키 재시도, 같은 tick 중복 submit, 성공 후 refresh 동안 모집 시작 차단, 412 입력 보존/명시적 초기화, 401 로그인 후 복귀 경로, 확정 거부 후 입력 정정, 최신 revision에서 다시 저장이다.

이미 존재하는 실제 격리 DB 계약 `tests/database/event-competition.contract.test.ts`와 HTTP 실행기 `scripts/test-db/verify-admin-service-write-http.ts`에는 설정 동시 저장의 1건 성공/1건 revision 충돌 및 최종 제목 조회가 포함된다. 이 문서 작성 과정에서 해당 DB/HTTP 경로를 다시 실행하지 않았으며 과거 PASS를 새 실행으로 합산하지 않는다.

## 통합 확인 경계

독립 검토에서 HTTP200의 빈 객체를 성공으로 취급하는 P2가 추가 발견됐다. [독립 재현](event-settings-independent-before.log) 이후 성공 응답을 non-null object, 같은 eventId/commandType, 현재보다 증가한 안전한 정수 revision으로 검증한 뒤에만 키를 완료하도록 수정했다. 불명확한 응답은 실패 안내와 동일 요청 키를 유지한다. 작성자 회귀에는 null/빈 객체/배열/다른 이벤트/다른 명령/stale·소수 revision을 추가했고, [별도 검토자 재실행](event-settings-independent-after.log)도 통과했다. [독립 검토 문서](visual-independent-review.md)에 작성자 검사와 분리된 결과가 있다.

소스 안정 시각은 **2026-10-07 12:22:55 KST**다. 담당자가 로컬 브라우저/새 빌드 서버를 별도로 띄우지 않았고, 운영 이벤트·계정·신청 데이터를 변경하지 않았다. 통합 전체 검사, 새 빌드의 실제 브라우저 폼 조작·320/390px 레이아웃, 별도 담당자의 독립 검토, 배포 후 확인은 root 통합 근거에 연결해야 한다. hook 대역의 PASS를 실제 브라우저 키보드·실기기 확인으로 표시하지 않는다.

별도 읽기 전용 운영·외부 연동의 현재 확인과 실제 권한 조건은 [external-runtime.md](external-runtime.md)에 기록했다.

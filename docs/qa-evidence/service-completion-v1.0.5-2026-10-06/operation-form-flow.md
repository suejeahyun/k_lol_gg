# 문의·운영 신청 검토 흐름 보완

## 발견과 원인

root가 격리 브라우저에서 사이트 문의를 만든 후 관리자 상세의 상태/메모 저장을 실행하자 `If-Match 값이 올바르지 않습니다.`를 확인했다. 기존 서버 HTTP 검증은 올바른 숫자 ETag를 직접 보내므로 UI 결합 오류를 잡지 못했다.

실제 `AdminOperationFormActions` onClick을 실행하고 실제 `readIfMatchRevision` 파서에 요청 헤더를 전달한 [before 로그](./operation-form-actions-before.log)는 `"rev-3" !== "3"`로 실패했다. 서버 계약은 `src/platform/http/README.md`와 `concurrency.ts`의 숫자 strong ETag이며, PATCH와 DELETE가 같은 잘못된 헤더를 사용했다. P2: 운영자가 문의 검토 상태·메모 저장과 삭제를 완료할 수 없는 과업 방해였다.

같은 컴포넌트에서 네트워크 예외 catch가 없고, 즉시 재클릭 가드가 없으며, 매 요청마다 새 키를 만들고, router.refresh 완료 전에 잠금을 해제하는 후속 문제도 확인했다. 상세 page는 useState 초기값을 가진 폼을 revision 변경 시 초기화하지 않았다.

## 수정 범위

- `admin-operation-form-actions.tsx`: 기존 `formatRevisionEtag` 사용, `ClientMutationKeyStore` 재사용. 같은 body/revision/method 재시도 키를 유지하고 입력 변경은 새 키로 분리한다. 서버 파서·정책·DB·Kakao API는 수정하지 않았다.
- 요청 중 ref/state 가드, 성공 후 transition refresh 동안 조작 잠금, 네트워크/JSON 실패의 복구 메시지를 추가했다. 실패한 입력은 보존한다.
- 412에서 자동으로 입력을 버리지 않는다. 기존 메모를 화면에 남기고 `입력 버리고 최신 내용 불러오기`를 제공한다. 명시적 클릭 시 입력/오류를 서버 props로 초기화한 뒤 refresh한다. 서버가 상태 전환 거절에도 412를 사용하므로 revision이 그대로인 경우에도 이 명시적 초기화로 복구된다. 401에는 같은 상세로 돌아오는 관리자 로그인 링크를 제공한다.
- 상세 Actions의 key를 formType/id/revision으로 지정해 성공 또는 명시적 최신 조회 후 서버 값을 반영한다. 삭제 성공은 다시 조회하면 없는 상세 대신 해당 유형 목록으로 이동하고 이동 완료까지 재요청을 막는다.
- 관리자 전용 `ADMIN_OPERATION_FORM_LABELS`를 메뉴와 목록/상세가 재사용하여 `suggestions`를 `문의·건의`로 표시한다. 원래 도메인의 `건의사항` 명칭과 formType/Kakao 저장 콘텐츠는 보존한다. 유형 매핑을 장문으로 설명하던 목록 문장을 제거했고 상세 연락 필드는 `닉네임 / 직접 답변할 연락처`로 표시하여 수동 답변 수단을 유지했다.

## 실제 검증

- [operation-form-actions-after.log](./operation-form-actions-after.log): 실제 컴포넌트 handler 7 PASS. 숫자 ETag PATCH/DELETE, 네트워크·503·성공 JSON 중단 동일 키/내용 재시도, 수정 payload 분리, 동시 클릭 1요청, refresh 잠금, 412 입력 보존/명시적 재조회, 401 복귀 URL, 삭제 후 잠금/목록 이동, 실제 async detail Page의 revision key 실행을 확인했다.
- [operation-form-actions-focused.log](./operation-form-actions-focused.log): 위 7과 기존 API/서명/관리자 경계 3, 총 10 PASS.
- [operation-form-domain-focused.log](./operation-form-domain-focused.log): 기존 IA 5와 도메인 4, 총 9 PASS. 관리 UI label 기대를 `문의·건의`로 바꾸었으며 기존 경로·권한·서명·soft-delete 검사 기대는 유지했다.
- 테스트 harness 변수 이름을 lint에 맞추는 과정에서 참조 한 곳을 놓친 테스트 코드 오류가 있었다. [harness-rename-error 로그](./operation-form-actions-harness-rename-error.log)에 남겼고 참조를 수정한 뒤 최신 after 로그 7 PASS로 확인했다. 제품 회귀로 분류하지 않는다.
- 변경 소스/테스트 ESLint: 오류 0, 경고 0. `npx tsc --noEmit --incremental false` exit 0. 전체 필수 check/build는 root가 수행한다.

이 문서의 실행은 격리 VM 컴포넌트/서버 파서 및 domain 테스트다. 실제 Next 전환·관리자 인증·DB write·운영 배포 통과 근거를 대신하지 않는다. root가 기존 합성 문의로 저장/새로고침/목록 상태/삭제 후 이동을 실제 브라우저와 격리 DB에서 재확인한다. 운영 문의나 실제 회원 데이터를 수정하지 않았다.

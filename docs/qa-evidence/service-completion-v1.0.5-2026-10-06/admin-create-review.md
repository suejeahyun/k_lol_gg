# 관리자 생성 요청 복구 감사

기준: `ca242292` 이후 v1.0.5 통합 작업. 제품의 실제 TSX 제출 함수를 컴파일하여 실행했고 fetch·router·React hooks를 격리했다. 운영 데이터, 계정, 파일 저장소를 변경하지 않았다. 브라우저·실제 DB 검증은 root 통합 범위다.

## 발견과 원인

| 대상 | 재현된 문제 | 원인 | 처리 |
|---|---|---|---|
| 이벤트전 | 첫 응답 유실 후 401/403/429를 거쳐 재시도하면 새 이벤트 ID/키 생성 | 인증·제한 응답이 이전 커밋 여부를 증명하지 않는데 pending 요청을 삭제 | root 제품 수정, 후속 실행 회귀 3개 추가. 현재 기존 포함 7/7 PASS |
| 징계 기록 | 동시 제출·응답 유실 재시도·잘린 JSON·저장 완료 후 재제출에서 중복 또는 복구 실패 | 클릭마다 새 키, 즉시 ref guard 및 예외 복구 없음 | 기존 `ClientMutationKeyStore` 재사용. 동일 body/key, 즉시 잠금, 불확실 결과 재확인, 성공 이동 잠금 |
| 하이라이트·갤러리 초안 | 생성 응답 유실 후 다시 실행하면 새 키로 새 초안 생성 가능. 동시 제출/완료 후 재제출도 가능 | 공통 mutation 호출이 매번 새 키를 만들고 생성 요청 상태를 보존하지 않음 | 생성 payload/key/선택 파일 스냅샷 보존, 확정된 생성 ID로만 편집 이동. 부분 업로드와 READY 자산 재연결 흐름 유지 |
| 관리자 재로그인 | 미확정 생성 상태에서 인증 실패를 복구할 직접 경로 부재 | 폼을 떠나 로그인하면 메모리의 pending 요청을 잃을 수 있음 | 401/403에 `관리자 로그인 (새 창)` 제공. 원래 창의 요청/입력 유지 |
| 멸망전 | loss→401/403/429→success에서 서로 다른 키 2개, success 후 재제출도 2회 요청 | pending 무조건 제거 / finally에서 성공 후에도 submitting ref 해제 | 독립 실행 4/4 FAIL 확인 후 승인된 동일 Event 패턴 적용. 정식 실행 회귀 12/12 PASS |

확정된 첫 400 입력 거절은 입력을 다시 고칠 수 있게 잠금을 푼다. 반대로 네트워크/시간초과/5xx/읽을 수 없거나 불완전한 성공 응답은 같은 요청을 보존한다. 이미 미확정인 요청에서 401/403/408/429가 발생해도 그 요청을 버리지 않는다. 성공 응답이 확인된 뒤에는 이동 동안 추가 생성이 실행되지 않는다.

## 변경 범위

- `src/components/discipline/admin-discipline-create-form.tsx`: 요청 스냅샷, busy ref, 오류 복구, disabled fieldset, alert, 재확인 버튼과 새 창 로그인.
- `src/components/admin/media/admin-media-form.tsx`: 신규 생성에만 request-key store 사용. 기존 편집은 revision 검사/기존 PATCH 동작 유지. 공통 JSON mutation에 15초 제한과 5xx 예외 처리가 적용된다.
- `admin-operations.module.css`, `admin-media.module.css`: 기존 grid 간격을 보존하는 중립적 `.createFields` 두 규칙. 한 열 `minmax(0,1fr)`, min-width 0, 기본 fieldset 여백/테두리 제거.
- `tests/admin-create-recovery.test.mjs`: 실제 핸들러 실행 회귀 26개. 이벤트 회귀에는 root 소유 기존 4개 뒤 인증·제한 재시도 3개만 추가했다.
- `tests/media-private-assets.test.ts`: 기존 즉석 payload 호출 assertion을 보존된 payload/key 경로로 갱신했다. 신규 실행 회귀가 빈 초안→업로드→연결의 실제 요청 순서와 결과를 별도로 검사한다.
- `src/app/(admin)/admin/progress/destruction/new/destruction-create-form.tsx`: 기존 pending 요청을 유지하면서 Event와 같은 uncertain/auth recovery/확정 성공 잠금을 적용했다. `workspace.module.css`에는 중립 `.createFields` 한 규칙만 추가했다. 게임모드별 모집/포지션/예선 규칙은 보존한다.
- `tests/destruction-create-recovery.test.mjs`: 진단 실행을 정식 회귀로 옮기고 실제 domain 구성·표시 helper를 읽어 8개 방식의 서로 다른 표시와 3개 게임모드의 유효 제출을 검사한다.

## 검증 근거

- 초기 하니스의 `node:crypto` 모듈 연결 실패는 [환경 오류](admin-create-harness-initial.log)이며 제품 결함으로 세지 않았다.
- 이를 고친 동일 하니스의 [수정 전](admin-create-before.log): 15개 중 **12 FAIL / 3 PASS**. 동일 키/본문, 동시 요청, JSON/5xx 복구, 성공 잠금의 실제 실패다.
- 로그인 복구와 부분 업로드 검사를 추가한 [확장 전](admin-create-expanded-before.log): **6 FAIL / 20 PASS**, 실패는 새 창 로그인 경로가 없는 401/403 상태다.
- [수정 후 26개](admin-create-after.log): **26 PASS**. loss/503/JSON 파손/불완전 성공, 400 수정, 401/403/429 재시도, 동시 제출, 성공 이동 잠금 검증. 갤러리는 기존 파일 2개 중 1개 업로드 실패, 연결 성공/실패 각각의 결과와 저장된 보고를 검사했다. 미확정 중 파일 선택 값이 바뀌더라도 원래 파일로 진행한다.
- [최종 focused 계약](admin-create-focused-contracts.log): **40 PASS** (위 26개 + 이벤트 7개 + 징계 UI/미디어 실패 상태).
- [관련 unit](admin-create-focused-unit.log): **23 PASS** (업로드 제한/계획, 비공개 자산 HTTP 사전검사, 징계 domain/application/input).
- [ESLint](admin-create-eslint.log) exit 0, [TypeScript](admin-create-typecheck.log) exit 0. CSS 두 개 PostCSS parse PASS, `git diff --check` PASS.
- [멸망전 수정 전](destruction-create-audit.log): 유효한 합성 4팀/포지션별 모집8/BO3 값의 실제 함수에서 4개 실패. 진단을 `tests/destruction-create-recovery.test.mjs`로 정식화했다.
- [멸망전 수정 후](destruction-create-after.log): **12 PASS**. 인증·제한·408 보존/동시 제출/JSON·5xx/확정400 수정/성공잠금, 실제 8개 방식과 CLASSIC·ARAM·ARAM_MAYHEM 총 24조합을 기존 domain validator로 검증했다.
- [멸망전 관련 focused](destruction-create-focused.log): **48 PASS** (생성 회귀 세 파일 + 기존 멸망전 UI). [멸망전 ESLint](destruction-create-eslint.log) exit 0, CSS parse와 diff-check PASS. 앞선 TypeScript 기록은 징계·미디어 단계이며 멸망전 포함 최종 타입검사는 root 통합 검사 범위다.

## 독립 읽기 검토와 경계

- 이벤트 폼의 busy/uncertain 구분, disabled fieldset과 외부 재확인 버튼, label/legend 유지, 한 열 createFields를 확인했다. API의 인증은 receipt 재생보다 먼저이므로 인증 실패만으로 이전 요청의 미실행을 단정할 수 없다.
- 다른 생성 화면에서 기존 요청 키 저장소·플레이어 fingerprint·멸망전 pending 구현을 비교했다. 이미 요청을 보존하는 구조를 일괄 교체하지 않았다. 확인되지 않은 날짜/레이아웃 가능성은 결함으로 집계하지 않았다.
- 부분 업로드 테스트는 메모리의 합성 File 바이트/응답을 사용한다. 실제 이미지 저장소 성능·실기기·보조공학 검증을 의미하지 않는다.
- 요청 보존은 현재 열려 있는 폼의 생명주기 안에서 적용한다. 새로고침 후 자동 복원을 새로 추가하지 않았다. 기존 운영 생성 데이터로 재시도 시험하지 않았다.
- 전체 check/build/DB/배포/운영 확인은 root 통합 단계에서 수행한다. 이 문서는 해당 절차의 완료를 대신하지 않는다.

## 별도 재검토 후속: 미디어 연결 확인

- journey 독립 검토에서 갤러리 생성·이미지 업로드 후 연결 PATCH가 HTTP 200이지만 JSON을 읽을 수 없는 경우 `linked:1` 성공 보고로 진행하는 P2를 확인했다. [독립 재현](admin-media-review-before.log)과 [재현 스크립트](admin-media-review-repro.mjs)를 보존한다.
- 원인은 `requestMutation`이 JSON 파싱 실패를 null로 바꾼 뒤에도 `ok:true`를 반환한 것이었다. 실제 API의 모든 미디어 mutation은 저장된 revision을 반환하므로, 성공 분기도 응답의 비음수 정수 revision을 확인하게 했다. JSON 파손뿐 아니라 null/빈 객체/잘못된 revision을 성공으로 표시하지 않는다.
- 정식 실제 핸들러 검사 4개를 `tests/admin-create-recovery.test.mjs`에 추가했다. [수정 전](admin-media-confirmation-before.log) 기존26 PASS·추가4 FAIL → [수정 후](admin-media-confirmation-after.log) 생성 회귀30+이미지 실패 상태1 **31 PASS**.
- 추가 네 경우 모두 이미 확인된 업로드1개를 유지하고, 연결 완료 수는0·확인 불가 오류를 보고하며 기존 초안 편집 화면으로 이동한다. 새 초안을 만들거나 성공한 파일을 재업로드하지 않는다. 실제 연결 상태는 편집 화면의 서버 조회에서 확인한다.
- [관련 업로드/비공개 자산 unit](admin-media-confirmation-unit.log) **8 PASS**, [ESLint](admin-media-confirmation-eslint.log) exit0. 제품 변경은 미디어 폼의 성공 응답 guard 두 줄이며 다른 관리자 파일은 변경하지 않았다. root 최종 통합 검사·배포 확인은 별도다.

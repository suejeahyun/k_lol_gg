# 사용자 흐름·관리자 폼 소스 점검 — 2026-10-13

- 대상: `E:\k-LOL.GG\worktrees\ux-discoverability-20261002`
- 작업: 읽기 전용 소스 검토. 이 보고서 외 제품 파일 변경, 운영 API 호출, 데이터 변경, 배포 없음.
- 지침: 루트 `AGENTS.md`, `PROJECT_RULES.md` 확인. 예전 QA의 완료 문구를 현재 구현 근거로 사용하지 않음.
- 범위: 홈·메뉴·기능/플레이어 검색, 계정·가입·로그인·복구, 내전·파티·대회 신청, 팀 도구, 미디어·문의, 관리자 계정·플레이어·시즌·운영 신청·미디어 폼.
- 사용자 확인 완료인 카카오 실기기 검증·방 선택은 미완료 항목에서 제외.
- 심각도: P2는 정상 사용 중 작업 실패·입력 손실·조회 누락을 일으키는 수정 대상, P3는 사용자 안내와 접근 경로 개선. P0/P1 결함을 이 담당 범위에서 확인했다는 뜻은 아님.

## 확인한 수정 대상

### UX-01 · P2 · 정원이 찬 회차에서도 신규 신청의 기본값이 본 참가

- 조건: 기존 신청이 없는 사용자가 본 참가 10/10인 회차에 진입하고 주라인 선택 후 바로 참가 신청.
- 근거: [신청 상태 초기화](<E:/k-LOL.GG/worktrees/ux-discoverability-20261002/src/app/(public)/(applications)/applications/application-actions.tsx:57>)는 `reserve=false`; [마감 판정](<E:/k-LOL.GG/worktrees/ux-discoverability-20261002/src/app/(public)/(applications)/applications/application-actions.tsx:61>); [본 참가 라디오](<E:/k-LOL.GG/worktrees/ux-discoverability-20261002/src/app/(public)/(applications)/applications/application-actions.tsx:143>)는 checked인 채 disabled; [제출 버튼](<E:/k-LOL.GG/worktrees/ux-discoverability-20261002/src/app/(public)/(applications)/applications/application-actions.tsx:199>)은 pending이 아니면 활성. [요청](<E:/k-LOL.GG/worktrees/ux-discoverability-20261002/src/app/(public)/(applications)/applications/application-actions.tsx:92>)은 그대로 `reserve:false`를 전송.
- 영향: 화면상 비활성화된 선택값으로 제출하여 서버 [정원 검사](<E:/k-LOL.GG/worktrees/ux-discoverability-20261002/src/modules/seasons/domain/inhouse-enrollment.ts:11>)에서 `RECRUIT_FULL` 거절. 사용자는 실패한 뒤 예비를 다시 선택해야 함.
- 제안: 예비 참가 의사를 명시적으로 선택하도록 하고 선택 전 제출을 막기. 선택 후 버튼도 `예비 참가 신청`으로 표시. 본 참가 사용자를 묵시적으로 예비 전환하지 않기.
- 검증: 합성 입력으로 실제 순수 도메인 함수를 실행하여 `full:true`, `newApplicantReserve:false`, `seatResult:RECRUIT_FULL` 확인. 브라우저 클릭 재현은 미실행.

### UX-02 · P2 · 관리자 시즌 폼은 요청 실패 시에도 입력을 초기화

- 조건: 시즌 이름·일정을 입력하거나 신청 검토 메모를 작성한 뒤 네트워크 오류, 400/409/412 등으로 저장 실패.
- 근거: [CreateSeasonForm catch](<E:/k-LOL.GG/worktrees/ux-discoverability-20261002/src/app/(admin)/admin/seasons/season-admin-actions.tsx:63>)는 오류를 표시하고 정상 반환하며, [폼](<E:/k-LOL.GG/worktrees/ux-discoverability-20261002/src/app/(admin)/admin/seasons/season-admin-actions.tsx:71>)은 함수 `action`과 uncontrolled input을 사용. 동일 패턴이 [시즌 편집](<E:/k-LOL.GG/worktrees/ux-discoverability-20261002/src/app/(admin)/admin/seasons/season-admin-actions.tsx:113>), [검토 폼](<E:/k-LOL.GG/worktrees/ux-discoverability-20261002/src/app/(admin)/admin/seasons/season-admin-actions.tsx:176>), [보류 신청 연결](<E:/k-LOL.GG/worktrees/ux-discoverability-20261002/src/app/(admin)/admin/seasons/kakao-pending/pending-actions.tsx:34>)에도 존재.
- React 근거: 설치된 Next 번들 React DOM의 [host action](<E:/k-LOL.GG/worktrees/ux-discoverability-20261002/node_modules/next/dist/compiled/react-dom/cjs/react-dom-client.development.js:9285>)이 form reset을 예약하고 [commit reset](<E:/k-LOL.GG/worktrees/ux-discoverability-20261002/node_modules/next/dist/compiled/react-dom/cjs/react-dom-client.development.js:16265>)이 DOM `reset()`을 실행. catch에서 정상 완료되므로 실패 입력도 기본값으로 되돌아가는 경로.
- 영향: 생성 폼은 이름·일정이 빈값으로, 편집·검토 폼은 기존 값으로 돌아감. 재입력 비용뿐 아니라 같은 내용 재시도라는 멱등성 흐름도 약해짐.
- 제안: `onSubmit`에서 기본 제출을 막고 성공했을 때만 명시적으로 reset하거나, 함수 action을 유지하되 입력을 controlled state로 보존.
- 검증: 제품 코드와 실제 설치된 React 구현을 함께 추적한 소스 확인. 브라우저에서 실패 응답을 주입해 재현하지는 않음.

### UX-03 · P2 · 플레이어 편집 충돌을 알리자마자 폼 재마운트로 작성값·안내 소실

- 조건: 사용자 또는 관리자가 플레이어 폼을 열어 수정하는 동안 다른 탭·관리자가 같은 플레이어를 먼저 저장. 원래 폼 저장이 412로 실패.
- 근거: [사용자 412 처리](<E:/k-LOL.GG/worktrees/ux-discoverability-20261002/src/components/accounts/account-player-form.tsx:142>)는 컴포넌트 상태에 안내를 넣고 `router.refresh()`. 부모 [AccountPlayerForm key](<E:/k-LOL.GG/worktrees/ux-discoverability-20261002/src/app/(public)/account/page.tsx:83>)는 `player.revision`이라 최신 버전 수신 시 폼 전체가 재마운트. 관리자도 [412 처리](<E:/k-LOL.GG/worktrees/ux-discoverability-20261002/src/components/admin/players/admin-player-form.tsx:111>)와 [revision key](<E:/k-LOL.GG/worktrees/ux-discoverability-20261002/src/app/(admin)/admin/players/[playerId]/page.tsx:96>) 조합이 동일.
- 영향: 사용자가 입력한 이름·Riot ID·티어와 충돌 메시지가 사라져 무엇이 저장됐는지 혼동할 수 있음. 서버의 덮어쓰기 방지는 작동하나 화면의 복구 흐름이 부족.
- 제안: 작성본과 서버 최신값을 별도로 유지하고 충돌 안내를 revision key 바깥에 두기. `내 입력 유지 후 비교`/`입력 버리고 최신값`을 명시적으로 제공.
- 검증: 412→refresh→변경 key→재마운트 경로 소스 확인. 다중 탭 실제 요청 미실행.

### UX-04 · P2 · 운영 신청 목록은 같은 조건 100건 초과 시 이전 접수에 접근할 수 없음

- 조건: 같은 유형·상태의 미삭제 신청이 101건 이상 존재.
- 근거: [repository list](<E:/k-LOL.GG/worktrees/ux-discoverability-20261002/src/modules/recruiting/operation-forms/postgres-operation-forms.ts:287>)는 유형·상태·limit만 받으며 [쿼리](<E:/k-LOL.GG/worktrees/ux-discoverability-20261002/src/modules/recruiting/operation-forms/postgres-operation-forms.ts:292>)는 최신순 최대 100건. [반환](<E:/k-LOL.GG/worktrees/ux-discoverability-20261002/src/modules/recruiting/operation-forms/postgres-operation-forms.ts:296>)에 cursor/hasMore가 없음. [관리 목록](<E:/k-LOL.GG/worktrees/ux-discoverability-20261002/src/components/operation-forms/admin-operation-form-list.tsx:19>)은 조회 후 유형·상태 필터와 현재 100건 테이블만 표시하고 다음 페이지·검색·오래된 순 정렬이 없음.
- 영향: 오래된 대기 문의·신청이 화면에서 누락되며 상세 ID를 별도로 알지 못하면 찾기 어려움. 전체 건수는 더 크지만 현재 조건이 잘렸다는 이유도 안내하지 않음.
- 제안: `submittedAt + id` 기반 cursor 또는 명시적 페이지를 추가하고 조건별 전체 건수·다음 페이지를 표시. 업무 큐에는 오래된 미처리순도 제공.
- 검증: repository→DTO→목록 화면의 조회 경로 확인. 실제 운영 접수량이 100건을 넘는지 확인하지 않았고, DB 조회·합성 데이터 삽입도 실행하지 않음.

### UX-05 · P3 · 신규 자동 승인과 기존 플레이어 연결 대기라는 가입 결과가 로그인 화면에 남지 않음

- 조건: 기존 플레이어 Riot ID로 가입하여 수동 연결 검토 대기가 되거나 신규 플레이어 자동 승인으로 가입 성공.
- 근거: [서버 결과](<E:/k-LOL.GG/worktrees/ux-discoverability-20261002/src/modules/accounts/infrastructure/postgres-account-repository.ts:1258>)는 두 결과를 구분. [SignupForm](<E:/k-LOL.GG/worktrees/ux-discoverability-20261002/src/components/accounts/account-auth-forms.tsx:135>)은 메시지를 설정한 직후 폼을 reset하고 `/login`으로 push. [LoginPage](<E:/k-LOL.GG/worktrees/ux-discoverability-20261002/src/app/(public)/login/page.tsx:10>)는 next만 받고 가입 결과를 표시하지 않음.
- 영향: 가입 결과가 잠깐 표시되더라도 화면 이동 후 사라짐. 기존 플레이어가 로그인 뒤 참가 제한을 만난 이유와 다음 행동을 다시 찾아야 함.
- 제안: 로그인 화면까지 결과 배너를 유지하거나 가입 완료 화면에서 `승인 완료·로그인 후 참가 계속` / `연결 검토 대기·계정 상태 확인`을 구분.
- 검증: 서버 응답 분기와 라우팅 소스 확인. 가입 요청 미실행.

### UX-06 · P3 · 가입 입력 오류가 어느 필드인지 식별되지 않음

- 조건: 동의 체크 누락, Riot ID의 #태그 누락, 비밀번호 규칙 위반 등.
- 근거: [가입 폼](<E:/k-LOL.GG/worktrees/ux-discoverability-20261002/src/components/accounts/account-auth-forms.tsx:146>)의 `noValidate`가 브라우저 필수값 검증을 끄며 대체 필드 검증은 없음. [파서](<E:/k-LOL.GG/worktrees/ux-discoverability-20261002/src/modules/accounts/domain/account-contracts.ts:242>)는 실패 필드 정보 없이 `{ok:false}` 반환. [route](<E:/k-LOL.GG/worktrees/ux-discoverability-20261002/src/app/api/auth/signup/route.ts:43>)와 [public problem](<E:/k-LOL.GG/worktrees/ux-discoverability-20261002/src/modules/accounts/application/account-http-problems.ts:9>)은 모든 입력 실패에 `필수 항목과 허용된 형식을 확인`이라는 같은 안내를 반환.
- 영향: 사용자는 어떤 값을 고쳐야 하는지 추측해야 하며 필드 강조·오류 위치 이동도 없음. 여러 입력 오류가 섞이면 반복 제출이 필요.
- 제안: 브라우저 required/minLength 검증을 사용하고 Riot ID·비밀번호 형식은 해당 필드에 구체적 안내. 서버에서도 안전한 field error 코드를 반환하고 첫 오류로 포커스 이동.
- 검증: 합성 입력으로 실제 `parseSignupInput` 실행. 정상 입력은 `ok:true`; 동의 누락·태그 누락·약한 비밀번호 세 경우가 모두 `{ok:false}`로 동일하게 반환됨. HTTP/브라우저 검증은 미실행.

## 개선 제안 — 결함으로 단정하지 않음

### UX-S1 · 모집·신청 정보의 최신성 표시와 탭 복귀 갱신

- [파티 목록](<E:/k-LOL.GG/worktrees/ux-discoverability-20261002/src/app/(public)/(recruiting)/recruits/page.tsx:30>)은 최초 서버 조회로 남은 자리를 표시. [신청 액션](<E:/k-LOL.GG/worktrees/ux-discoverability-20261002/src/app/(public)/(applications)/applications/application-actions.tsx:95>)은 본인 저장/취소 뒤에만 refresh.
- 해당 흐름에서 타인의 참가·취소·관리자 확정을 반영하는 polling/탭 복귀 갱신, 정상 상태의 새로고침 버튼·조회 시각은 확인하지 못함.
- 제안: 먼저 수동 갱신·마지막 조회 시각·탭 복귀 갱신. 운영 빈도에 따라 보이는 탭에서만 주기 갱신 검토. 외부 동기화 지연이 실제 얼마나 되는지는 별도 측정 필요.

## 검토했으나 별도 수정 대상으로 확정하지 않은 범위

| 범위 | 확인한 구현 | 남은 검증 한계 |
|---|---|---|
| 홈·메뉴·전체 검색 | 로그인/계정 조회 실패 분리, 검색 label, native dialog, 검색 결과 키보드 상하 이동, 내부 next 정규화 | 실제 모바일·키보드·스크린리더 동작은 상위 브라우저 점검 담당 |
| 공개 플레이어 검색 | 검색/티어 URL 유지, 이전/다음 페이지, 빈 결과/오류 분리, 공개 표시 정책 문구 | 실제 데이터의 페이지 경계·시각적 overflow 미확인 |
| 로그인·비밀번호 변경·복구 | next 이어가기, 비밀번호 강제 변경 경로, 복구 시 계정 존재 비공개, 비밀번호 412 시 최신 revision 조회, 재로그인 CTA | 실제 복구 전달·기기별 세션 만료 미실행 |
| 내전·이벤트·멸망전 | 비로그인·승인·활성 플레이어 구분, 신청/취소 상태, 이벤트 412 갱신, 멸망전 불확실 요청의 동일 snapshot 재시도·중복 실행 잠금 | 외부 카카오·실제 대회 상태 전환 미실행 |
| 팀 균형·랜덤 팀·코인 토스 | 플레이어 검색 AbortController, 10명/중복 검사, 초안 멱등키/If-Match, 수동 배치 키보드 대안, 결과 복사 실패 안내, 코인 재생 오류·reduced motion 대체 | 팀 계산 API·다중 탭 실제 경쟁 조건 미실행 |
| 공개 미디어 | 커서 기반 다음 목록, 이미지 fallback, carousel 버튼·키보드·상태 안내 | 갤러리 세로 휠 제스처 사용성·모든 이미지 시각 검증 미실행 |
| 사이트 문의 | native required, 작성값 유지, 본문별 안정 멱등키, 접수번호와 응답 채널 안내, 성공 시 포커스 이동 | 문의 전송·실제 답변 전달 미실행 |
| 관리자 계정·운영 신청 | 계정 대상/역할 제한 안내, 일회성 비밀번호 화면 이탈 제거, 운영 신청 412 후 명시적 최신 내용 복구, busy/ref 중복 실행 잠금 | 민감 작업·권한 변경·비밀번호 발급 미실행 |
| 관리자 미디어 | 생성 결과 불확실 시 snapshot 유지·재확인, 일부 업로드 실패 보고·성공 자산 유지, 파일 수/형식/크기 제한 | 업로드·게시·보관·복구 미실행 |

## 실행 검증 기록과 해석

1. 파일 탐색 및 위 컴포넌트/호출부/도메인/설치 React 코드 읽기 완료.
2. `node --import tsx --input-type=module` stdin으로 순수 함수 두 개만 호출. DB·네트워크·파일 저장 없는 합성 입력 검증 결과:

```json
{"full":true,"newApplicantReserve":false,"seatResult":"RECRUIT_FULL","validSignup":true,"missingConsent":{"ok":false},"missingTag":{"ok":false},"weakPassword":{"ok":false}}
```

3. 최초 `tsx.cmd -e` 실행은 Windows 인자 quoting으로 변환 오류 발생. 검증 대상 함수가 실행되기 전에 실패했으며 위 stdin 방식으로 수정해 성공. 제품 테스트 실패로 분류하지 않음.
4. 브라우저 자동화, 사용자/관리자 HTTP mutation, 운영 DB 조회, `npm run check`는 이 담당 에이전트가 실행하지 않음. 전체 check는 상위 에이전트 담당.
5. `UX-01`의 서버 정원 거절과 `UX-06`의 입력 파서 실패는 실행 확인. 나머지 사용자 화면 결과는 구체적 호출·상태 전환을 추적한 소스 판정이며 실제 브라우저 재현 완료라고 표현하지 않음.


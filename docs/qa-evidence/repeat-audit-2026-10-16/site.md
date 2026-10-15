# 사이트 사용자 흐름 반복 점검

확인일: 2026-10-16 (Asia/Seoul). 운영 계정·신청·경기·팀 초안을 생성하거나 수정하지 않았다. 아래 검증은 저장소의 실제 React 컴포넌트와 합성 응답을 사용한다.

## 발견 및 수정

### 경기 신규 접수·수정 저장 중 입력 손실

- 재현: 요청을 보내고 응답을 지연시키면 저장 버튼만 잠기고 제목·메모·게임 수 등 입력은 계속 편집할 수 있었다. 성공 응답은 신규 폼을 이미지 화면으로 전환하거나 수정 폼을 닫아 요청 이후 입력을 버렸다.
- 수정: 두 폼의 입력과 제출 버튼을 `fieldset`으로 묶어 진행 중에는 잠근다. 실패하면 같은 폼의 입력을 다시 허용한다. 기존 두 열/모바일 한 열 배치와 필드 라벨을 유지한다.
- 변경: `src/app/(public)/(matches)/matches/submit/submission-form.tsx`, `submit.module.css`.
- 회귀: 신규/수정 × 성공/실패의 지연 응답 네 가지 조합에서 모든 편집 필드가 잠기는지, 추가 제출이 차단되는지, 요청 본문이 유지되는지, 실패 후 잠금이 풀리는지 검사했다. 수정 전 첫 필드 잠금 검사에서 실패했고 수정 후 통과했다.

### 팀 초안 변경 충돌 후 반복 실패

- 재현: 다른 작업이 초안 revision을 바꾼 상태에서 수동 배치를 적용하면 412가 반환된다. 기존 화면은 오류 문구만 보여주고 최신 조회·상태 비교 없이 같은 revision으로 다시 요청했다. 수정 전 회귀에서 412 뒤 최신 GET이 발생하지 않는 것을 확인했다.
- 수정: 412 뒤 동일 권한 경로의 GET으로 최신 전체 초안을 읽는다. 로컬 수동 배치를 유지하면서 적용·저장·재평가·복사·경기 접수 이동을 차단하고 최신 적용 팀을 비교할 수 있게 한다. 자동 화면 갱신으로 입력을 버리지 않는다.
- 선택: `수동 변경 버리고 최신값 사용`은 명시적으로 최신 배치를 받아들인다. `내 수동 배치 유지`는 참가자 집합이 같고 최신 참가자 정보로 도메인 검사가 통과할 때만 노출한다. 보관된 초안이나 참가자·허용 포지션이 달라진 배치는 유지할 수 없다. 유지 뒤 실제 적용은 새 revision으로 서버에 다시 평가 요청한다.
- 조회 실패: 수동 배치는 남고 변경 작업은 잠긴 상태에서 최신 조회를 재시도할 수 있다. 비교 중 더 최신 서버 props가 도착하면 다시 읽으며, 동일 revision의 일관된 최신 응답은 받아들인다.
- 변경: `src/app/(public)/(tools)/tools/team-balance/drafts/[draftId]/team-balance-draft-workspace.tsx`.
- 회귀: OWNER/ADMIN, 최신 조회 실패와 재시도, 보관된 초안, 참가자 교체, 허용 포지션 변경, 비교 중 props revision 갱신을 검사했다. 입력을 유지한 후에는 최신 revision과 새 멱등 키로 원래 수동 배치가 전송되는지 확인했다.

## 검증 결과

```text
node --test tests/audit-user-flow-recovery.test.mjs tests/team-tools-retry.test.mjs tests/match-submit-team-balance-ui.test.mjs tests/team-tools-ui.test.mjs
43 tests / 43 pass / 0 fail

npx eslint <두 TSX 변경 파일> tests/audit-user-flow-recovery.test.mjs tests/team-tools-retry.test.mjs
PASS
```

실행 로그는 로컬 `.tmp/repeat-site-focused.log`에 있다. 전체 타입·통합 검사 및 운영 배포 근거는 이 디렉터리의 릴리스 기록을 따른다. 실제 브라우저 확인용 합성 서버는 `.tmp/repeat-site-browser`에 준비했으며 브라우저 실행 결과는 별도 증거로 구분한다.

루트가 실제 브라우저로 신규/수정 요청을 지연시켜 각각 8개 입력의 잠금, 503 이후 입력 유지·재편집, 이후 성공 시 정상 화면 전환을 확인했다. 320px에서 document width 305px로 가로 넘침이 없었다. [브라우저 범위](browser.json), [합성 화면](match-mobile.png). 임시 탭을 닫고 viewport를 원복했으며 담당 fixture 프로세스의 명령행을 대조해 종료하고 포트가 닫힌 것을 확인했다.

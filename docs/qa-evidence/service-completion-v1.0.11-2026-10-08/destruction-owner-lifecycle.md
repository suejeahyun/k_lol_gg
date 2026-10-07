# 멸망전 신청·투표 상태와 로그인 목적 정합성

## 발견과 원인

- 중요도: P2. 루트가 1.0.10 운영 완료 대회에서 `참가 신청 / 로그인 필요 / 로그인`, `MVP 투표 / 로그인 필요`를 실제로 확인했다. 이 문서 작성자는 운영 브라우저나 운영 쓰기를 실행하지 않았다.
- `DestructionOwnerActions`의 비로그인·승인 대기 조기 반환이 대회 상태 분기보다 먼저 실행되어, 불가능한 새 신청과 투표에 로그인·승인을 요구했다. 승인 로그인 후에는 `참가 신청 기간 아님`과 `MVP 투표 종료`로 바뀌었다.
- 서버 계약은 새 신청·취소를 `RECRUITING`에서만 허용한다. `CAST_MVP_VOTE`는 `PRELIMINARY` 또는 `TOURNAMENT`에서만 가능하다. 완료 후 투표를 허용하는 정책이 아니다.
- 본인 신청 조회는 별도로 유효하다. `getOwnApplication`은 대회 상태와 무관하게 본인 계정으로 저장된 신청·확정·취소 상태와 본인 기재 승패를 읽고, 공개 상세 페이지는 승인 계정의 이 정보를 계속 조회한다. 따라서 종료 시 전체 컴포넌트를 제거하는 방식은 적용하지 않았다.
- 예선·본선의 기존 비로그인 MVP 영역에는 자체 로그인 링크가 없었다. 유일한 로그인 링크는 참가 신청 위치인 `?action=apply`로 돌아갔다.

읽은 근거: `AGENTS.md`, `PROJECT_RULES.md`, 로컬 Next Server and Client Components 가이드, `docs/feature-catalog/ADMIN_ROUTE_MAP.md`, `destruction-command-handler.ts`의 `UPSERT_OWN_APPLICATION`·`CANCEL_OWN_APPLICATION`·`CAST_MVP_VOTE`, `http-contract.ts`의 본인 조회 DTO, `postgres-destruction-adapter.ts`의 본인 조회, 공개 상세 페이지의 세션/조회/포커스 전달.

## 최소 변경

제품 파일은 `src/app/(public)/(competitions)/competitions/destruction/[tournamentId]/destruction-owner-actions.tsx` 하나다.

| 상태 | 신청 영역 | MVP 영역 |
| --- | --- | --- |
| 준비 | 참가 신청 대기. 신청 로그인 유도 없음 | MVP 투표 대기 |
| 모집 | 기존 신청 폼 또는 로그인/승인 안내 | MVP 투표 대기 |
| 주장·팀 구성 및 경매 | 신청 마감, 내 신청 확인 | MVP 투표 대기 |
| 예선·본선 | 신청 마감, 내 신청 확인 | 기존 투표 폼 또는 로그인/승인 안내 |
| 완료·취소 | 신청 종료, 내 신청 확인 | MVP 투표 종료. 투표 로그인/승인 유도 없음 |

- 모집 이후 비로그인 링크는 `로그인하고 내 신청 확인`으로 읽기 목적을 명시하며 기존 `?action=apply` 복귀와 포커스 위치를 유지한다.
- 예선·본선의 MVP 로그인은 `?tab=mvp`로 복귀한다. 승인 대기 상태는 기존 계정 상태 확인 화면으로 연결한다.
- 승인 계정의 기존 신청 상태, 직접 기재 승패, 신청 없음 상태를 보존한다. 완료·취소의 확정 참가자에게 불가능한 변경을 문의하도록 안내하지 않는다.
- 칼바람·증바람 확정 참가자의 팀 확정 전 승패 수정은 기존 `canEditModeRecord` DTO 예외를 그대로 사용한다. 서버 정책을 다시 정의하지 않았다.
- API·DB·도메인·집계·DTO·mutation hook·CSS는 변경하지 않았다. 1.0.10 태그와 근거도 수정하지 않았다.

## 실행 검증

추가한 `tests/destruction-owner-lifecycle.test.mjs`는 실제 TSX를 실행한다. 기존 도메인 표시 모듈을 읽으며, 세션 props·mutation hook·FormData·포커스 노드만 격리한 합성 환경이다. 실제 JSX, 링크 복귀 주소, 핸들러 payload, 오류 복구와 포커스 호출을 검증한다. CSS 문자열 검사나 테스트 기대값 완화로 대체하지 않았다.

| 검사 | 결과 | 근거 |
| --- | --- | --- |
| 제품 수정 전 새 회귀 9개 | 5 FAIL / 4 PASS | [owner-lifecycle-before.log](owner-lifecycle-before.log) |
| 수정 후 새 회귀 9개 + 기존 UI 경계 3개 | 12 PASS | [owner-lifecycle-after.log](owner-lifecycle-after.log) |
| 변경 TSX와 새 테스트 ESLint | exit 0 | [owner-lifecycle-lint.log](owner-lifecycle-lint.log) |
| `npx tsc --noEmit --incremental false` | exit 0 | [owner-lifecycle-typecheck.log](owner-lifecycle-typecheck.log) |
| `git diff --check` | exit 0 | 로컬 실행 |

원본 실패는 종료·취소 비로그인 및 승인 대기 상태, 모집 이전 투표 안내, 투표별 로그인 복귀, 종료 참가자의 기록 목적 표시에서 재현되었다. 기존 신청 PUT/취소 DELETE/투표 POST payload, DTO가 허용한 승패 수정, deep link 포커스, 읽기 실패·미확정 요청 재시도는 수정 전후 모두 통과했다.

회귀에는 완료·취소 각각의 확정/취소/예비 신청자와 본인 기재 `17승 9패`, 투표가 닫힌 상태에 남아 있는 합성 ballot, 모집·예선·본선·종료의 비로그인/승인 대기/승인 계정 조합을 포함했다. 실제 운영 정보는 fixture에 사용하지 않았다.

재현 명령:

```powershell
node --test tests/destruction-owner-lifecycle.test.mjs tests/destruction-ui-contract.test.mjs
npx eslint 'src/app/(public)/(competitions)/competitions/destruction/[tournamentId]/destruction-owner-actions.tsx' tests/destruction-owner-lifecycle.test.mjs
npx tsc --noEmit --incremental false
git diff --check
```

## 독립 검토와 남은 단계

릴리스 담당 에이전트가 서버 계약·실제 JSX·변경 diff·원본 실패 및 수정 후 로그를 읽기 교차검토했고, 새로운 차단 문제를 발견하지 않았다. 추가 브라우저나 테스트 실행으로 주장하지 않는다.

이 문서의 결과는 격리 컴포넌트·핸들러 검사다. 전체 릴리스 검사, 새 최적화 빌드의 실제 브라우저 렌더·로그인 복귀·화면 폭 확인과 운영 배포는 루트 담당이며 작성 시점에는 이 개별 문서에서 완료로 주장하지 않는다. 브라우저 확인 시 완료/취소의 신청 영역 제목과 링크 목적, 종료 MVP 영역에 로그인 유도 없음, 모집 `?action=apply` 및 예선·본선 `?tab=mvp` 복귀를 확인해야 한다. 실제 회원 신청·투표를 변경할 필요는 없다.

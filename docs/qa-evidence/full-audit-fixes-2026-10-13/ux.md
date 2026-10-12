# 사용자 흐름 감사 수정 근거 — 2026-10-13

작업 checkout: `E:\k-LOL.GG\worktrees\full-audit-fixes-20261013`. 원본 감사의 UX-01·02·03·05·06, UX-S1, B1을 담당했다. UX-04 문의 목록 페이지 처리는 별도 담당이다. 운영 DB 쓰기·배포·커밋·브라우저 실행은 이 담당에서 수행하지 않았다.

## 수정

| 항목 | 수정와 재현 조건 | 주요 소스 |
| --- | --- | --- |
| UX-01 | 정원이 찬 모집에서 본 참가 라디오의 허위 선택을 해제하고, 예비 참가를 명시적으로 선택하기 전 신청을 막는다. 기존 본 참가자는 그대로 수정할 수 있다. 서버 정원 검사는 유지한다. | `E:\k-LOL.GG\worktrees\full-audit-fixes-20261013\src\app\(public)\(applications)\applications\application-actions.tsx:61` |
| UX-02 | 시즌 생성·편집·심사와 카카오 대기 연결을 React 함수 action에서 명시적 submit 처리로 변경했다. HTTP 실패가 함수 정상 반환으로 끝나 입력이 자동 초기화되는 경로를 제거했다. 시즌 생성은 성공 응답 후에만 초기화한다. | `E:\k-LOL.GG\worktrees\full-audit-fixes-20261013\src\app\(admin)\admin\seasons\season-admin-actions.tsx:76`, `E:\k-LOL.GG\worktrees\full-audit-fixes-20261013\src\app\(admin)\admin\seasons\kakao-pending\pending-actions.tsx:55` |
| UX-03 | 사용자·관리자 플레이어 폼을 player ID로 유지한다. 412 이후 입력·오류를 보존하고 최신 저장값을 비교 표시한다. 사용자가 입력 유지/버리기를 선택할 때만 새 revision을 수락하며 비교 전 재저장을 막는다. 사용자 폼의 입력 초기화는 명시적인 버리기에서만 발생한다. | `E:\k-LOL.GG\worktrees\full-audit-fixes-20261013\src\components\accounts\account-player-form.tsx:115`, `E:\k-LOL.GG\worktrees\full-audit-fixes-20261013\src\components\admin\players\admin-player-form.tsx:65` |
| UX-05 | 가입 성공 후 결과 화면에 실제 서버 승인/연결 검토 메시지를 유지하고 초점을 이동한다. 로그인 계속하기를 선택하면 기존 next 경로로 이어진다. 비밀번호가 들어간 기존 fingerprint는 즉시 비운다. | `E:\k-LOL.GG\worktrees\full-audit-fixes-20261013\src\components\accounts\account-auth-forms.tsx:151` |
| UX-06 | 가입의 native required/길이 검증을 활성화하고 아이디 pattern, 기존 도메인 함수 기반 비밀번호·Riot ID field validity를 추가했다. 첫 유효하지 않은 입력을 aria-invalid와 오류 메시지로 표시한다. 서버 검증은 유지한다. | `E:\k-LOL.GG\worktrees\full-audit-fixes-20261013\src\components\accounts\account-auth-forms.tsx:160` |
| UX-S1 | 모집·참가 현황에 마지막 조회 시각과 수동 새로고침을 표시한다. 보이는 탭으로 돌아올 때 최소 30초 간격으로 갱신하며 계속 polling하지 않는다. 두 실제 사용처에서 기존 Button·시간 포맷·task-status 스타일을 재사용한다. 참가 신청 draft는 조회 결과의 revision을 자동 수락하지 않으며, 다른 곳의 수정/412를 만나면 최신 주라인·부라인·참가 구분을 비교하고 입력 유지/버리기 선택 전 저장·취소를 막는다. | `E:\k-LOL.GG\worktrees\full-audit-fixes-20261013\src\components\navigation\live-view-refresh.tsx:8`, `E:\k-LOL.GG\worktrees\full-audit-fixes-20261013\src\app\(public)\(applications)\applications\application-actions.tsx:65` |
| B1 | `.profile-recent a`의 flex 우선순위를 이기는 grid selector와 부모 minmax(0,1fr)/min-width를 추가하여 긴 최근 경기 링크가 320px 레이아웃을 밀어내지 않도록 한다. | `E:\k-LOL.GG\worktrees\full-audit-fixes-20261013\src\app\(public)\(registry)\players\[playerId]\player-champions.module.css:30`, `E:\k-LOL.GG\worktrees\full-audit-fixes-20261013\src\app\globals.css:2443` |

## 실행한 검증

아래 명령은 해당 checkout에서 실행했다.

```powershell
node --test tests/audit-user-flow-recovery.test.mjs tests/application-navigation.test.mjs tests/account-player-route.test.mjs tests/season-kakao-pending-http-ui.test.mjs tests/user-shell.test.mjs
npm run typecheck
```

- 42/42 테스트 통과. 신규 11개는 실제 TSX를 로드하고 React element를 렌더링하며 요청·state·명시적 선택을 확인한다. 브라우저 DOM 대신 외부 경계(fetch/router/FormData)와 hooks 실행을 통제하므로 실제 브라우저의 focus/HTML validation/CSS 검증을 대체하지 않는다.
- 신규 테스트 범위: 정원 마감에서 예비 선택 전 무전송/선택 후 reserve 전송; 실패한 시즌 입력 유지/성공 후 초기화; 가입 검토 결과 유지와 next 보존; 비밀번호/Riot ID custom validity; 관리자 412 draft 유지와 새 revision 재시도; 사용자 412 입력 유지 및 버리기의 별도 동작; focus/visibility 갱신 throttle와 수동 갱신·listener 정리.
- 통합 검토 후 참가 신청 동시 수정 회귀 3개 추가: refresh 도착 후 draft 유지/자동 revision 수락 금지와 저장·취소 무전송, 412 후 주라인·부라인·예비값 비교/명시적 버리기, 미존재 신청이 revision 0으로 새로 조회된 경우의 identity 비교. 본인 성공 응답에서는 revision을 갱신하여 다음 정상 저장을 막지 않는 것도 확인했다.
- 변경 TSX, 신규 harness, 신규 테스트에 focused ESLint 실행: 오류·경고 없음.
- `npm run typecheck`: 통과. 이전 병렬 작업 도중 발생한 다른 담당 테스트 타입 오류는 마지막 실행에서 해결됨.
- `git diff --check`: 통과(일부 다른 담당 파일의 Git LF/CRLF 안내만 존재).

## 브라우저용 격리 fixture

재현 스크립트: `E:\k-LOL.GG\worktrees\full-audit-fixes-20261013\scripts\test-db\run-full-audit-fixes-qa.ts`.

```powershell
npx tsx scripts/test-db/run-full-audit-fixes-qa.ts
# 빌드된 결과를 사용할 때만 --production 추가
```

기존 `startEphemeralCluster`, `applyMigrations`, `childTestEnvironment`를 재사용한다. `.env.example` 외 dotenv 파일이 있으면 중단하고, 부모 환경의 운영 연결값을 서버에 전달하지 않는다. 일회성 PostgreSQL 18과 Next 서버는 loopback으로만 열린다. 로그인 비밀번호·DB 접속값은 매 실행마다 생성하며 gitignored `.tmp/full-audit-fixes-qa/<run-id>/private.json`에만 저장한다. 해당 실행 폴더의 `stop` 파일을 만들면 앱을 종료하고 검증된 일회성 DB 경로를 정리한다.

합성 데이터는 승인 회원/관리자, 회원에 연결된 revision 1 플레이어, 가입 연결 검토용 미연결 플레이어, 본 참가 10/10 회차, 파티 모집, 문의 105개, 긴 제목 최근 경기 5개다. 모집 날짜는 기존 `recruitingOperatingDateKey`의 06:00 KST 경계를 사용한다. 최초 fixture의 달력 날짜 사용을 발견한 뒤 스크립트를 고쳤고, 진행 중인 격리 DB에서도 안전 guard와 시즌 조건을 통과한 10개 신청·1개 회차만 수정했다. 시즌 생성에서 기존 시즌명 사용은 서버 거절 뒤 입력 보존을 확인한다. 서로 다른 탭에서 같은 플레이어를 저장하면 사용자·관리자 충돌 비교를 재현할 수 있다.

실제 실행하여 health 응답으로 준비 완료를 확인했다. 회원 신청·플레이어 상세·모집 페이지 HTTP GET은 모두 200이고 모집/신청에는 갱신 버튼, 플레이어 상세에는 최근 경기 링크가 렌더링됐다. 브라우저의 폼 입력·스크린샷·320px 측정은 root 담당이며 이 문서 작성 시점에는 그 결과를 주장하지 않는다. 외부 Kakao 실기기/모집방 선택은 사용자 확인 완료 사항으로 다시 미완료로 분류하지 않았다.

### 최종 브라우저 검증 환경 변경

개발 서버에서 이전 코드로 보이는 신청 폼 동작을 root가 관찰했다. DB revision 증가와 개발 서버의 최신 컴파일 코드는 확인했으나 브라우저 캐시의 실제 내용까지 확인한 것은 아니다. 개발 모드에서도 등록되는 service worker와 URL이 유지되는 Turbopack chunk의 조합이 원인 후보다. 이 상태를 통과로 판정하지 않았다. 개발 harness를 stop 파일로 정상 종료(exit 0)하여 앱·DB listener 종료를 확인한 뒤, root의 최종 `npm run check`/production build 통과 후 `--production`과 새로운 loopback origin·DB로 검증 환경을 교체했다. 최종 실제 브라우저 결과는 root의 통합 근거를 따른다.

최종 production build의 두 탭 검증은 root가 실제 브라우저로 통과 확인했다. 한 탭에서 작성 중인 입력을 두고 다른 탭에서 저장한 뒤 현황을 갱신하면 최신값 비교가 표시되고 저장·취소가 모두 비활성화된다. 입력 유지 후 draft 저장, 입력 버리기 후 최신값 복원도 통과했다. 근거: [신청 충돌 화면](./application-conflict.png), [통합 브라우저 검증](./browser.md). 개발 서버에서 관찰한 이전 결과와 의심한 SW 캐시 원인은 최종 합격 근거에서 제외한다.

브라우저 검증 종료 후 production harness도 stop 파일로 정상 종료(exit 0)했다. 기존 안전 경로 검증을 사용하는 `stopAndRemoveCluster`가 완료되었으며 앱과 합성 DB의 loopback listener가 모두 닫혔음을 별도 확인했다. 실행 중인 QA 서버/DB는 남겨 두지 않았다.

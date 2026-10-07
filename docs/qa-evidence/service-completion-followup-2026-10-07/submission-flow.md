# 경기 접수·검토 흐름 재감사

기준: 2026-10-07, HEAD `5c51fe51`, 운영 소스 `c9431b9e`. AGENTS/PROJECT_RULES, ADR-S04, S04 parity, 실제 public/admin TSX, handler/API/service/repository, 기존 격리 HTTP runner를 읽었다. Next의 bundled `use-router.md`에서 refresh의 client state 보존과 서버 재조회를 확인했다. 이 작업자는 별도 서버나 운영 mutation을 실행하지 않았다. root가 새 격리 DB/최적화 브라우저를 관리한다.

## 실제 발견과 수정

| 중요도 | 재현 | 원인 | 최소 수정 |
|---|---|---|---|
| P2 | 검토안에 킬1 저장 요청 후 응답 전 화면을 킬99로 바꾸면, 화면99인 채 승인 가능해지고 실제 저장/승인 대상은1 | 검토 입력은 요청 중에도 살아 있고 응답이 무조건 draftSaved=true를 설정 | 검토 입력 fieldset 잠금, 즉시 ref 가드, refresh 완료까지 transition 잠금. 이후 편집은 다시 저장하도록 기존 흐름 유지 |
| P2 | 같은 검토안의 응답 유실 후 같은 revision/body로 재시도해도 다른 key 사용 | 관리자 검토 command가 매번 임의 key 생성 | 기존 ClientMatchMutationKeyStore를 사용하여 action/revision/body별 미확정 key 유지. 확인된 응답 후 완료 처리 |
| P2 | HTTP200이지만 접수/revision이 없는 응답을 저장 성공으로 처리하거나 OCR 이미지 revision을 잃음 | HTTP 성공만으로 key를 완료하고 확인하지 않은 JSON을 상태에 적용 | 실제 API 성공 DTO의 대상 ID·증가 정수 revision·상태를 확인한 뒤 완료. 미확정 결과는 기존 key/revision으로 재시도 |

[원본 실제 handler 검사](./submission-review-before.log)는 두 경우 모두 FAIL. [수정 직후](./submission-review-after.log)는 같은 두 경우 PASS. [확장 focused](./submission-review-focused.log)는 새 handler 6 + 기존 관리자 UX 6 + 접수 continuation 8 = 20 PASS다. 신규 실행 회귀는 같은 tick의 중복 저장 1요청, 응답과 refresh 중 조작 잠금, 후속 편집의 재저장 필요, 확정400 후 수정/new key, 412의 로컬 입력 보존·서버 검토안 명시적 불러오기, 승인 응답 유실/replay identity와 종결 상태도 확인한다.

초기 변경 파일은 관리자 `submission-review.tsx`, 같은 경기 관리자 CSS의 중립적 `.reviewFields` 한 규칙, `tests/match-submission-review-handlers.test.mjs`다. 아래 실제 UI 후속 발견에 따라 상세 Page·상태 label 공용화·명시적 팀 불러오기도 추가했다. 기존 conflict 비교와 입력 보존을 위해 부모 Page key는 추가하지 않았다. 거절 사유 dialog의 이유/포커스/취소, 상태별 권한, 서버 parser, DB/집계 정책은 바꾸지 않았다. OCR 재시도도 동일한 기존 key store 및 busy 가드를 사용한다. native confirm은 도구 편의를 이유로 교체하지 않았다.

변경 TSX/test ESLint exit0, `npx tsc --noEmit --incremental false` exit0. 전체 check/build/격리 DB/최종 실제 UI는 root 검증과 연결해야 한다. handler의 window.confirm은 합성 응답으로 격리했으므로 실제 OS/browser dialog 조작 통과가 아니다.

## 정책상 경로 구분

- WEB 접수는 `AWAITING_UPLOAD`에서 경기 정보 수정 가능, 전체 이미지 등록 후 `PENDING_REVIEW`가 된다. 게임 수는 첫 이미지 등록 뒤 변경할 수 없다.
- owner 취소는 AWAITING_UPLOAD/PENDING_REVIEW에서 가능하며 CANCELLED는 종결 상태다. 다시 제출하려면 새 접수를 만든다.
- REJECTED owner는 직접 편집/이미지 추가를 할 수 없다. 공개 거절 사유와 문의 경로, 새 접수 링크를 제공한다. 새 점수판을 보내야 한다면 새 접수로 보완 제출하는 기존 정책이다.
- 관리자 `검토 재개`는 REJECTED→PENDING_REVIEW이며 이전 이미지/검토안을 다시 확인하는 경로다. owner를 이미지 수정 상태로 돌리는 작업이 아니다. live 공개 사유는 null로 지우되 거절/재개 감사 snapshot은 보존한다.
- 승인에는 존재하고 RETIRED가 아닌 시즌과 게임별 10명의 활성 플레이어/챔피언, 5대5·포지션 각1, KDA 0~999, 원본 대조 확인과 저장된 검토안이 필요하다. WEB는 2/3게임, 관리자 직접 가져오기는 별도 source로 1게임 허용이다.

정책을 임의로 늘려 owner의 반려 접수를 다시 열거나 기존 이미지를 교체하는 새 API는 추가하지 않았다. 기존 HTTP runner `verify-match-public-http.ts`는 생성/두 이미지/거절/재개/승인/공개 링크/종결 및 세션 권한까지 검증하지만 실제 버튼·native dialog 조작은 별도다.

## 실제 UI 후속 발견과 현재 팀 연결

root가 기존 최적화 fixture에서 팀 초안을 연결한 접수의 검토 화면을 열었으나 2게임20행의 플레이어가 모두 비어 있음을 확인했다. 원인은 WEB 접수가 현재 선택 배치의 정합성을 검사한 뒤 `teamBalanceDraftId`만 저장하고, 검토 UI는 저장된 reviewedResult 또는 OCR 후보로만 초기화하기 때문이다. S04의 기존 연결 계약은 초안 ID의 provenance 전달이며 접수 당시 팀 snapshot을 저장하는 계약이 아니다. OCR 닉네임의 임의 자동연결 금지와, 관리자가 명시적으로 현재 팀 ID를 선택하는 동작은 구별된다.

이 공백은 새 API/DB snapshot 없이 기존 읽기 기능으로 연결했다.

- 상세 Page에서 ADMIN 권한을 먼저 확인한다. 연결된 미검토 PENDING_REVIEW에만 기존 `getDraft`를 ADMIN viewer로 읽는다.
- 선택 signature/source/evaluationRound, 소유자, 보관 여부를 확인하고 기존 `validTeamBalanceSubmissionAssignments`로 현재 참가자와 정확한 10명·5대5·포지션을 검증한다. 기존 `getAdminEditorCatalog(includePlayerIds)`로 첫40명 밖의 선수도 포함하고, 10명이 모두 활성일 때만 최소한의 player/team/position을 UI로 전달한다.
- `현재 팀 배치 불러오기`는 모든 플레이어 칸이 비어 있을 때만 제공한다. 현재 초안 제목과 변경 버전을 표시하며 당시 배치라는 주장은 하지 않는다. 클릭하면 playerId만 팀/포지션에 맞춰 채우고 KDA·챔피언·승패는 유지한다. 20/30행 전부 미확인, 검토안 미저장 상태로 돌아가 원본 대조 및 명시적 저장을 계속 요구한다.
- 기존 입력·저장된 검토안·종결 상태를 덮어쓰지 않는다. 초안 unavailable/archived/정합성 실패/선수 비활성은 기존 수동 검토 경로를 유지한다. 선택 초안 자체를 쓰거나 match provenance를 변경하지 않는다.
- 공개 신규 접수의 `참가자·팀 구성 연결` 문구는 실제 저장 수준에 맞춰 `팀 초안 연결`로 정리했다.

[실제 버튼 미제공 2 FAIL](./submission-linked-team-before.log) → [같은 handler 2 PASS](./submission-linked-team-after.log). 현재 두 게임의 명단·원본 KDA/챔피언 유지, 자동 저장/요청 없음, 전원 미확인, 기존 수동 선택 보존과 종결 잠금을 확인했다. [실제 상세 Page 및 기존 순수 배치 검증](./submission-linked-team-page.log)은 6 PASS이며 ADMIN 조회 순서, 정확한10명 catalog 포함, 잘못된 현재 배치·원본 검토 존재·비활성 선수·서비스 실패 경로를 검증했다. DB 서비스는 이 테스트에서 합성 응답으로 격리했으므로 실제 DB 통과로 세지 않는다.

영어 PENDING_REVIEW/SUCCEEDED/revision과 중복 정적 OCR 경고도 root가 실제 화면에서 확인했다. 관리자 목록의 기존 상태 map을 `submission-labels.ts`로 추출해 목록·상세·검토가 공유하고, OCR 상태·변경 버전을 직접 한국어로 표시한다. 업무 판단에 불필요한 SHA 요약은 숨기며 원본 URL/비공개 조건·용량·후보수와 실제 OCR 오류는 유지한다. 자동 계정 연결 금지 및 원본 대조 필수 안내는 검토안 한 곳에 유지하고, 오류가 없는 정적 `OCR 확인 경고` 상자는 제거했다.

최종 [focused 실행](./submission-review-focused.log)은 handler12 + 관리자 UX6 + import5 + continuation8 + provenance4 = 35 PASS다. 앞서 기록한20개는 초기 mutation 수정 단계이며 중간32개/최종35개와 별도로 더하지 않는다. 추가 서버 Page5 + 기존 배치검증1의6개는 별도 로그다. 변경 범위 ESLint exit0. 최종 실제 UI는 root 새 최적화 빌드에서 불러오기→20행 원본 대조→검토안 저장→공개 순서로 확인해야 한다.

## 독립 리뷰 후 성공 응답 확인 보완

release 담당의 [독립 handler 재현](./submission-response-independent-before.log)에서 성공 HTTP의 `{}`를 검토 저장 성공으로 처리하고 요청 key를 소모하는 문제가 확인됐다. 이는 외부 시스템에서 실제 발생했다는 주장과 구별하며, 실제 TSX handler에 잘못된 성공 응답을 주입해 복구 실패를 재현한 근거다. 같은 원인을 OCR handler까지 조사했다.

정상 성공 DTO는 기존 repository에서 확인했다. 검토 command는 `submissionId`, 증가한 정수 `revision`, action별 예상 `status`를 반환하고 승인은 UUID `matchId`도 반환한다. OCR은 `submissionId/imageId`, 이미지의 증가한 정수 revision, SUCCEEDED+null 오류 또는 FAILED+오류 코드를 반환한다. 이 값이 확인된 뒤에만 key를 완료하고 UI를 갱신한다. 서버 parser/DTO/실패 정책을 넓히지 않았다.

[추가 실제 handler 원본2 FAIL](./submission-response-before.log) → [같은2 PASS](./submission-response-after.log). 최종 focused에는 정상 OCR 성공과 외부 OCR 실패의 정상 응답이 모두 이미지 revision만 갱신하고 재대조를 요구하는 경로도 포함한다. 불완전한 성공 응답은 새 요청을 만들거나 승인 가능 상태로 오인하지 않으며, 같은 key/revision을 유지하고 명시적 재시도를 제공한다.

최종 source TypeScript 검사에서 OCR의 검증된 revision을 state callback에 넘길 때 타입 narrowing이 사라지는 TS2345 한 건을 발견해, 검증된 숫자를 지역 상수로 고정했다. 이후 `npx tsc --noEmit --incremental false` exit0, 영향을 받는 OCR 실제 handler3 PASS를 확인했다. 제품 동작은 동일하며 전체 check/build/DB/HTTP/배포 결과는 root의 별도 기록을 따른다. scoped `git diff --check`도 공백 오류 없이 종료했다.

## root가 실행할 격리 UI 순서

자격·ID는 현재 hold runner가 private ready JSON에 제공한 값만 사용한다. 암호·cookie·토큰을 QA 문서에 복사하지 않는다. base origin은 loopback인지 확인한다. ACCOUNT와 ADMIN 세션은 별도 cookie 목적이므로 같은 합성 관리자 계정이어도 `/login`과 `/admin/login` 경로를 구분한다. 운영 주소에는 이 시나리오를 실행하지 않는다.

| 순서 | 경로/행동 | 필수 입력·선행 조건 | 실제 확인할 결과 |
|---:|---|---|---|
| 1 | `/matches/submit` 신규 접수 | 제목 `합성 QA 1007 경기 접수`, 주최자 `격리 QA`, 경기 날짜 `2026-10-07`, 회차1, 2게임. 시즌/시작시간/메모는 선택 | AWAITING_UPLOAD, MR2 코드, URL code 유지, 두 게임 이미지 입력 |
| 2 | `접수 정보 수정`→제목 수정→`수정 저장` | 아직 이미지 등록 전, 선택 항목은 빈 값도 가능 | 수정 제목·revision 정상, 새로고침/코드 이어하기 후 동일 접수 |
| 3 | 게임1/게임2 이미지 선택 | 합성 PNG/JPEG/WebP, 각12B 이상~4MiB 이하, decode 가능한 실제 파일. 서로 다른 바이트/SHA의 2장 필요 | 각 게임 등록 완료, 두 장 후 PENDING_REVIEW. 동일 파일을 다른 게임에 쓰면409인 기존 중복 방지와 구별 |
| 4 | `/admin/matches?view=submissions`→해당 합성 제목 상세 | 현재 session ADMIN/TOTP, 실제 생성한 submissionId | 올바른 제목·코드·원본 이미지·검토 대기 상태 |
| 5 | `거절`→앱 내부 dialog→사유 기록 | 사유 `합성 검증: 점수판과 참가자 확인이 필요합니다.` (3~500자) | 공개 사유 저장, dialog 닫힘, REJECTED. Esc/취소는 mutation 없음 |
| 6 | owner `/matches/submit?code=<현재 코드>` | 같은 owner ACCOUNT | 공개 사유 표시, 불가능한 수정/업로드 버튼 없음, 기존 비공개 경계 유지 |
| 7a | owner `새 결과 접수`로 보완 제출 | 신규 제목에 `보완` 표시, 같은 필수 입력, 새 이미지2장 | 새 code/신규 상태, 기존 거절 기록 보존. 원래 접수 재편집으로 오인하지 않음 |
| 7b | 또는 admin 원래 상세에서 `검토 재개` | REJECTED 접수, native confirm 없음 | PENDING_REVIEW, 공개 거절 사유 제거. owner 이미지 변경 단계로 돌아가지 않음 |
| 8 | `연결 시즌`/각 게임 roster/원본 대조 | fixture의 실제 활성 시즌1, 플레이어10, 챔피언10. BLUE/RED 각5와 5포지션 유지. 같은 플레이어/챔피언은 한 게임 내 중복 불가. 게임2는 동일10명 가능 | 미확인 행/중복/비활성 오류 해결, 각 행 `원본 대조 확인` 후 검토안 저장 가능 |
| 9 | `검토안 저장` | 모든 게임20/30행 확인 완료 | 요청 및 새로고침 중 입력 잠금, 저장 revision 갱신, 이후 편집하면 승인 잠김/재저장 필요 |
| 10 | `승인·경기 공개` | 저장한 검토안. **native confirm 단계는 뒤로 미룸** | 승인 후 APPROVED, 공개 경기 ID, owner의 `승인된 공개 경기 보기`, 실제 공개 상세의 2/3게임·팀·승패 |
| 11 | 별도 신규 draft의 `접수 취소` 또는 `검토 요청 취소` | 승인·거절 검증 레코드와 분리. **native confirm 있음** | CANCELLED, 이미지 입력/수정 제거, 새 접수 가능. 원본 정리/비공개는 기존 계약 유지 |

현재 browser hold runner의 `sourceIds.submissionId`는 이미지가 있는 가장 최근 fixture 행을 선택할 뿐 status/owner/게임 수를 보장하지 않는다. 이 ID를 PENDING_REVIEW라고 가정하지 말고 상세 상태를 먼저 확인한다. 같은 runner가 제공하는 private 이미지 한 장은 표시용 합성 fixture이므로 신규 WEB 접수의 서로 다른2장 시험을 대신하지 않는다. 이미 승인된 fixture를 재검토용으로 임의 상태 변경하지 않는다.

승인·사용자 취소·관리자 import 취소에는 window.confirm이 남아 있다. 반려는 이미 앱 내부 modal이다. native dialog 도구가 다시 멈추면 해당 클릭을 완료로 기록하지 않고, 앞서 실행한 페이지/handler/HTTP와 분리해 남긴다. dialog를 우회하거나 실제 운영 데이터를 쓰는 대체 검증은 하지 않는다.

## 남은 확인

위 표의 실제 신규 이미지 업로드·관리자 클릭·네이티브 확인·최종 공개 상세는 root 새 fixture 결과로 채운다. 외부 OCR이 중단된 환경에서는 수동 검토 경로를 확인하되 외부 OCR 성공으로 보고하지 않는다. 최종 키보드/모바일 fieldset 배치와 실제 refresh 잠금은 최적화 브라우저에서 확인한다. 단위 handler 수와 실제 업무 완료를 합쳐 세지 않는다.

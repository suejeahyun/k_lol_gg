# 남은 실제 UI 확인 준비 · 2026-10-08

기준 HEAD `a0be73beb14617aac471958f2a285220cd27280c`, 운영 1.0.8 source `653023b0f8dd1640b42afebf5e1fa3e2c7a3bee6`. 최초 조사는 제품 수정 없이 수행했고, 이후 재현된 MMR 모달만 root가 수정 범위에 포함했다. 서버/DB 시작·공유 브라우저 조작은 이 담당자가 하지 않았다. root가 새 격리 하니스를 준비하고 실제 UI를 확인한다. 운영 MMR 전환은 root의 별도 실제 권한·백업·영향 확인 절차이며, 아래 합성 조작과 혼합하지 않는다.

## 이미 확인한 범위와 남은 범위

[1.0.8 통합·배포](../service-completion-v1.0.8-2026-10-07/production.md)는 계약·단위·DB·HTTP·운영 읽기 검증을 기록한다. 변경 빌드의 실제 관리자 폼·모바일·포커스 조작은 native confirm 도구 제한 때문에 아직 완료로 기록되지 않았다.

[10/07 실제 조작](../service-completion-interactions-2026-10-07/browser-journeys.md)은 **1.0.7 빌드**였다. 미디어 이전/다음·필터·공개 링크, 이벤트 설정·한국시간·취소/복구, owner 이미지10장→관리자 과제 승인, 현재 팀 불러오기→20행 대조→검토안 저장·재저장은 완료됐다. 이를 반복하는 대신 이번에는 변경된 MMR/이벤트 표시와 마지막 확인창 뒤 동작에 집중한다. 이전 합성 DB는 정상 종료·제거됐으므로 저장한 접수 ID를 새 환경에서 재사용할 수 없다.

## 실행 순서

새 하니스는 원래 loopback/일회성 DB 가드를 유지하고 `V2_SEASON_BROWSER_QA_HOLD=true`, `V2_SERVICE_BROWSER_QA=true`로 실행한다. ready·TOTP·raw stderr는 ignored private 로그에만 보관한다. `code`는 합성 관리자 TOTP, `stop`은 종료 명령이다. 운영 주소를 테스트 원점으로 사용하지 않는다. ready의 합성 SUPER_ADMIN과 ACCOUNT는 목적에 맞춰 각각 로그인한다.

| 순서 | 실제 경로와 조작 | 완료/취소 조건 |
|---|---|---|
| 1 | 합성 SUPER_ADMIN `/admin/balance-ai` → `MMR 수동 조정 플레이어` 검색/선택 → 포지션 종합 → 조정값 `1` → 사유 코드 `LOCAL_QA` → 공개 설명 `격리 합성 UI 확인` → `조정 원장 추가` | 요청 중 버튼·fieldset 잠금, 완료 안내 뒤 실제 계산 버전 +1, 선택·입력 초기화, 새로고침 후 결과 유지. 숫자/설명은 합성 원장에만 사용 |
| 2 | `전체 원장 재계산` → `취소`; 다시 열기 → `확인 후 재계산` | 취소는 요청·generation 변화 없음. 확인은 한번 실행, 새 generation 표시까지 잠금. 401/412/유실 응답은 기존 handler·DB 근거와 구분하며 정상 조작만으로 실패 복구 통과를 주장하지 않음 |
| 3 | `/admin/progress/event/{eventId}`의 참가자가 있는 합성 이벤트 상세 | 방식·진행 단계 한국어, 현재 단계 강조. 참가자 이름·포지션·직접 신청/명단 가져오기/관리자 등록·참가/취소 구분. sourceIds.eventId는 최신 행이며 참가자/단계를 보장하지 않으므로 현재 상태를 먼저 확인 |
| 4 | `ready.fixtures.sourceIds.draftId`로 `/tools/team-balance/drafts/{id}` → `이 팀으로 경기 결과 접수` → 합성 제목·주최자·경기일·2게임 → 서로 다른 이미지2장 → 관리자 해당 접수 | 승인할 새 합성 접수 준비. 현재 팀 배치 불러오기, 연결 시즌, 각 게임10종 챔피언·합성 KDA·승패·20행 대조·저장을 수행해야 승인 가능. 이전 빌드의 이 중간 과정 성공과 이번 준비를 구별 |
| 5 | 오늘 `/applications` 1회차 `내 신청 취소` → 확인창 취소 후 상태 유지 → 다시 열고 승인 → `다시 참가 신청` | 취소 시 mutation 없음. 승인 시 취소 상태와 인원, 재신청 후 주/부 라인·참가 상태와 인원·새로고침 유지. 다른 회차 상태와 혼합하지 않음 |
| 6 | 승인 시험과 별개 신규 `/matches/submit` 접수 → `접수 취소` 또는 `검토 요청 취소` → native confirm | 거절 시 동일 코드/상태 유지. 승인 시 CANCELLED, 수정/이미지 입력 제거, 새 접수 가능. 승인할 접수를 취소하지 않음 |
| 7 | 4번 관리자 접수의 `승인·경기 공개` → native confirm | 취소는 저장 검토안·revision 유지. 승인 후 APPROVED와 공개 경기 ID, owner 코드 화면의 공개 링크, 공개 상세2게임·팀·승패 확인 |

MMR의 앱 내부 확인창은 아래 결함 검토 후 키보드 확인 범위를 정한다. native confirm 5~7은 또다시 동일 도구 고장으로 세션 전체를 막을 수 있으므로 마지막에 모은다. 도구에서 dialog 제어가 다시 응답하지 않으면 동일 호출을 반복하지 않고 미완료 상태와 사용자 확인창 해제 필요를 기록한다. 확인 결과를 임의 응답으로 대체하거나 API로 우회한 결과를 실제 클릭으로 기록하지 않는다.

게임 원본이 단색 합성 이미지면 이 검사는 접수·검토·승인 수명주기만 증명한다. 실제 경기 사실 확인이나 OCR 정확도를 증명하지 않는다. `sourceIds.submissionId`는 이미지가 있는 최신 행일 뿐 PENDING_REVIEW/owner/미승인 상태를 보장하지 않아 승인 시험에 그대로 사용하지 않는다.

## 확인 UI 조사

현재 `src/components/ui`는 Button/Input/Card/Badge만 제공한다. 공통 Dialog/Confirm 컴포넌트는 없다. 실제 공통 컴포넌트 원장과 `rg` 호출부를 대조했다.

- 경기 거절 `submission-review.tsx` 및 무효화 `match-editor.tsx`는 도메인 소유 모달이다. Escape 취소·Tab/Shift+Tab 경계 순환·초기 초점·닫은 뒤 trigger 복원·스크롤 잠금이 구현돼 있다. 사용처가 실제로 존재하는 재사용 후보는 이 동작 패턴이다.
- MMR 재계산은 `section role="alertdialog" aria-modal="true"`와 overlay를 가진 별도 구현이다. 확인 버튼에 autoFocus가 있지만 Escape/Tab 처리, trigger 복원, 배경 inert 처리는 없다.
- Riot 확인 모달도 별도 구현이므로 공통으로 검증된 Dialog가 이미 존재한다고 가정하지 않는다. 최초 조사는 읽기만 했고, 같은 결함을 재현한 뒤 root가 후속 수정을 배정했다. [Riot 수정과 근거](riot-modal-recovery.md)에 별도로 기록한다.

### 대상 native confirm 3흐름

| 호출부 | 현재 확인 내용·보호 | 판단 |
|---|---|---|
| `(applications)/applications/application-actions.tsx:104` | 본인의 오늘 참가 신청 취소. false이면 DELETE 전에 반환 | 오늘/회차가 주변 UI에 표시된다. 회차를 문구에 넣을 여지는 있으나 현재의 실제 오취소를 재현하지 않았으며 교체 근거로 삼지 않음 |
| `(matches)/matches/submit/submission-form.tsx:255` | 해당 접수 취소 및 다시 수정할 수 없음을 안내. false이면 POST 전에 반환 | 되돌릴 수 없는 상태를 알리고 명시 확인을 요구함. native 키보드/포커스가 잘못 동작했다는 제품 증거 없음 |
| `admin/matches/submissions/[submissionId]/submission-review.tsx:442` | 저장 검토안으로 공개 경기 생성 및 플레이어·챔피언·승패 재확인. 저장 전/취소는 요청하지 않음 | 검토·저장·승인 경계를 유지한다. 브라우저 도구 hang만으로 앱 내부 dialog로 바꿀 근거 없음 |

같은 검토 컴포넌트의 `cancel-import` 및 다른 관리자 import·경기 공개 등에도 native confirm이 있지만, 이번 세 과업과 구분한다. native 확인은 브라우저가 표시·키보드·포커스를 담당하므로 현재 code review로 IAB 도구의 멈춤을 서비스 결함으로 판정할 수 없다. **자동화 편의만을 위한 세 native confirm 교체는 권장하지 않는다.**

## 별도 제품 결함 후보: MMR 앱 내부 모달

실제 TSX를 기존 MMR handler 하니스에서 읽어 `.tmp/mmr-modal-review.test.mjs`로 두 조건만 독립 실행했다. 제품·공식 테스트 파일은 수정하지 않았다. [실행 로그](mmr-modal-review-before.log)는 2 FAIL이다.

1. 실제 JSX 모달 및 조상 경로에 Escape를 전달해도 모달이 남는다. `section`은 native dialog가 아니며 연결된 키보드 handler도 없다.
2. 모달이 열린 상태에서 배경의 선수 선택/수동 조정 handler를 실행하면 POST가1건 발생한다. confirming 상태가 `locked` 또는 submit guard에 포함되지 않는다. JSX의 배경 필드도 disabled/inert가 아니며 Tab 순환 처리가 없다.

이는 실제 브라우저 Tab 이동이나 스크린리더를 실행한 증거는 아니다. source·실제 handler 결과가 일치하는 접근성 결함 근거이며, [WAI-ARIA modal dialog 지침](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/)의 모달 안 Tab 순환·Escape 닫기·배경 조작 차단·닫은 뒤 초점 복원과 대조했다. 확인 버튼 초기 초점보다 취소를 우선하는 것도 검토할 수 있지만, 초기 초점 선택만으로 결함을 단정하지 않았다.

최소 제안은 기존 경기 거절 모달의 동작 패턴을 MMR 확인창에 적용하는 것이다. Escape 취소, Tab/Shift+Tab 순환, 취소 버튼 초기 초점과 trigger 복원, 열린 동안 배경 수동 조정 입력/handler 차단을 추가한다. 요청 key/generation·권한·서버 계약은 바꿀 필요가 없다. 신규 Dialog 라이브러리나 세 native confirm의 일괄 교체는 필요하지 않다. 수정 여부와 파일 소유권은 root에 전달했으며, 이 조사 단계에서 제품 수정은 하지 않았다.

## MMR 수정 전 실제 UI와 후속 구현

root가 배포 1.0.8의 실제 브라우저에서도 별도로 재현했다고 보고했다. `전체 원장 재계산`을 누르면 초기 초점이 확인 버튼으로 이동하고, Escape 후에도 모달이 유지됐다. 확인 버튼에서 Tab을 누르자 activeElement가 모달 바깥 INPUT이 됐으며, 보이는 취소 버튼으로 닫은 뒤 초점은 WebArea였다. 이 과정에서 실제 재계산 요청은 실행하지 않았다. 이 실제 UI 관측은 위 합성 handler와 별개의 근거이며, root의 최종 실제 수정 후 확인으로 이어져야 한다.

허용된 후속 제품 변경은 `mmr-admin-actions.tsx` 하나다. 기존 거절 모달 패턴으로 취소 초기 초점·Escape·양방향 Tab 경계·스크롤 잠금/복원·닫은 뒤 trigger 복원을 추가했다. 확인을 눌러 trigger가 처리 중 비활성화된 경우에는 작업 section으로 초점을 옮긴다. 열린 동안 배경 fieldset을 비활성화하고 즉시 ref guard로 렌더 전의 배경 submit도 차단한다. 확인 요청의 기존 성공 검증·동일 키 재시도·새 계산 버전/refresh 잠금은 유지한다.

`tests/mmr-admin-recovery.test.mjs`의 기존 실제 TSX 하니스에 effect/ref/초점 대역과 다음4조건을 추가했다.

- 취소 초기 초점 → Escape 닫기 → trigger 초점 및 스크롤 복원, 요청0건.
- 직접 확인 링크로 시작한 모달의 초기 초점·Tab/Shift+Tab 순환·취소 복원.
- 열기와 같은 tick의 오래된 배경 submit 및 새 handler 모두0건, 취소 뒤 선수 입력 보존.
- 확인 더블 클릭1건, 모달 닫힘, 처리 중 작업 영역 초점, 새 generation 도착 전 잠금 유지.

[정식 회귀 수정 전](mmr-modal-focused-before.log)은4 FAIL, [수정 후](mmr-modal-focused-after.log)는 새4조건과 기존 MMR 복구·계약을 포함해17 PASS다. 기존 복구 검사의 초기 props는 ‘처음부터 확인창 열림’에서 실제 기본 닫힘으로 수정했다. 이제 열린 모달의 배경 조정을 의도적으로 금지하므로 일반 조정 회귀가 열린 확인창을 전제로 하면 안 된다. 직접 확인 링크는 새 회귀에서 별도로 유지한다.

첫 수정 후 실행에서는 ref 대역이 form에 연결되면서 기존 선택 초기화의 `form.reset()` 대역 누락이 드러났다. [하니스 오류 로그](mmr-modal-harness-initial.log)를 보존하고 대역을 보완한 뒤 같은 제품·검사를 재실행했다. 이를 새 제품 결함이나 통과 결과로 세지 않는다. [변경 파일 ESLint](mmr-modal-lint.log)와 [전체 타입 검사](mmr-modal-typecheck.log)는 exit0이고 scoped diff 공백 검사도 통과했다. 관련 다른 모달 조사·실제 최종 브라우저·통합 검사·배포 결과는 이후 확정하며, 이17개를 실제 DOM 키보드·실기기 검증으로 확대하지 않는다.

## 같은 원인의 실제 사용처 대조

| 실제 호출부 | 최초 조사 | 이번 처리 |
|---|---|---|
| MMR 재계산 `mmr-admin-actions.tsx` | Escape/Tab/복원/배경 잠금 누락, 실제 운영·handler 재현 | 위 최소 수정·17 focused PASS |
| Riot 선택 일괄 동기화 `riot-admin-actions.tsx` | Tab/복원/배경 잠금 누락, 실제 운영·handler 재현 | [두 모달 수정](riot-modal-recovery.md), 관련19 focused PASS |
| Riot 일괄 연결 같은 파일 | Tab/복원 누락, pending Escape와 취소 정책 불일치, 오류가 모달 밖에만 표시 | 같은 파일에서 보완; 실제 외부 연결 실행 아님 |
| 관리자 경기 거절 `submission-review.tsx` | Escape/Tab/초점·scroll 복원 기존 구현 | 읽기 대조만; 재작성하지 않음 |
| 관리자 경기 무효화 `match-editor.tsx` | Escape/Tab/초점·scroll 복원 기존 구현 | 읽기 대조만; 재작성하지 않음 |
| 공개 멸망전 이미지 확대 `[tournamentId]/page.tsx` | server aside가 modal을 선언하지만 해당 키보드/초점 동작 없음 | 독립 검토 후 root가 release_inventory에 별도 수정 배정 |
| 사이트 AI 도우미 `site-ai-assistant.tsx` | `aria-modal=false`; 입력 초점/닫은 뒤 trigger 복원 있음 | 비모달의 배경·Tab 허용을 결함으로 분류하지 않음 |

root가 전체 통합 check/build를 시작하므로 담당 제품 소스를 고정한다. 이후 실제 UI·모바일·최종 배포 결과는 통합 근거로 확인한다.

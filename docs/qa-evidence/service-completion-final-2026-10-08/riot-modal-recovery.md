# Riot 확인창 키보드·복구 보완

운영 1.0.8 source `653023b0f8dd1640b42afebf5e1fa3e2c7a3bee6`의 MMR 모달 결함을 조사한 뒤 같은 `aria-modal=true` 사용처를 대조했다. root가 Riot 두 모달의 최소 수정을 후속 범위에 포함했다. 이 담당자는 브라우저·서버·운영 Riot 연결/동기화·DB를 실행하지 않았다.

## 확인한 원인

`RiotAdminGlobalActions`의 선택 일괄 동기화와 `RiotAdminBulkLink`의 연결 확인은 취소 초기 초점·Escape 닫기는 이미 제공하지만 Tab 순환·닫은 뒤 opener 초점 복원·배경 조작 차단이 없었다. 독립 검토자의 실제 TSX 실행은 두 모달의 Tab 경계와 bulk-link의 pending Escape를 [3 FAIL](riot-modal-independent-before.log)로 확인했다.

root는 운영 1.0.8에서 일괄 동기화 미리보기를 실제 열어 **초기 취소 초점은 정상**, 취소에서 Shift+Tab 뒤 `modal.contains(activeElement)=false`, 보이는 취소 버튼으로 닫은 뒤 BODY 초점을 관측했다. 선택 대상은 운영 확인창의 표시 확인에만 사용했고 등록·전체 동기화·연결 실행 요청은 하지 않았다. 이 actual-before와 아래 격리 회귀는 다른 검증 층위다.

bulk-link는 처리 중 취소 버튼을 막지만 Escape는 닫을 수 있어 정책이 불일치했다. 닫아도 기존 Promise와 화면 바깥 결과 메시지가 살아 있으므로 데이터나 오류가 유실됐다고 단정하지 않는다. 다만 모달을 유지하는 정상 실패 경로에서는 오류가 `aria-modal=true` 바깥에만 표시되어 확인창 안에서 실패 이유를 읽기 어려웠다.

## 최소 변경

제품 변경은 `src/components/riot/riot-admin-actions.tsx` 한 파일이다. 새 라이브러리·공통 Dialog 추상화·CSS·API·동기화 범위·요청 키 정책은 추가하거나 변경하지 않았다.

- 기존 거절 모달 패턴으로 취소 초기 초점, 양방향 Tab 경계, Escape 취소, 닫은 뒤 trigger/작업 영역 초점 복원과 본문 스크롤 복원을 적용했다.
- 선택 동기화 미리보기 동안 두 배경 form은 inert이며, 즉시 ref로 이전 렌더의 submit/전체 동기화도 막는다. 선택 체크박스 변경을 막아 확인한 명단과 요청을 일치시킨다. 명시적 등록 확인 뒤 기존 요청을 한 번 실행한다.
- bulk-link 처리 중 Escape는 기존 비활성화 취소 버튼과 같은 정책으로 막는다. 버튼이 모두 비활성화되면 모달에 초점을 유지하고 Tab이 배경으로 나가지 않게 한다. 실패 이유는 모달 안의 alert로 표시하고 취소 버튼으로 초점을 되돌려 재실행/취소를 선택할 수 있다. 성공 후 기존 결과 집계·닫힘·trigger 복원을 유지한다.
- 이미 정상인 경기 거절/무효화 모달, 비모달 AI 도우미, 세 native confirm은 수정하지 않았다. 멸망전 이미지 확대는 별도 담당의 범위다.

## 실행 결과와 경계

`tests/riot-modal-accessibility.test.mjs`는 실제 두 TSX 컴포넌트를 실행한다. React state/effect/ref, DOM focus/scroll와 HTTP는 합성 대역이며 공유 브라우저를 사용하지 않는다.

- 담당 첫 before 하니스가 기존 cancel autoFocus를 재현하지 않은 문제를 발견해 [초기 하니스 로그](riot-modal-harness-before-initial.log)를 분리했다. 이를 제품의 초기 초점 결함으로 세지 않는다.
- DOM 대역에 기존 autoFocus 의미를 반영한 뒤, 운영 1.0.8 원본 파일을 `git show`로 ignored `.tmp`에 읽어 같은 검사로 다시 실행했다. 제품 작업 트리는 되돌리지 않았다. [정확한 before](riot-modal-focused-before.log)는4 FAIL이며, 두 초점 검사의 초기 취소 초점은 통과하고 실제 Tab 경계에서 실패한다.
- [최종 focused](riot-modal-focused-after.log)는 새4조건과 기존 페이지·picker·UI 계약을 포함해19 PASS다. 양방향 Tab/Escape/복원/요청0건, 같은 tick의 배경 요청 차단, 선택 명단 유지·확인1건, pending 닫힘 차단, 실패 alert·초점·재시도·성공 결과를 확인했다.
- [ESLint](riot-modal-lint.log) exit0, [타입 검사](riot-modal-typecheck.log) exit0, scoped diff 공백 검사 통과. 최종 하니스의 autoFocus 반영은 실행 의미 보완이며 제품 소스는 lint·타입 검사 시점과 동일하다.

실제 제공자 응답·외부 Riot 연결 성공·실기기·수정 후 브라우저 키보드·통합 build/check·배포는 이 담당자 검사로 통과 처리하지 않는다. root의 새 격리 최적화 서버에서 확인해야 한다.

# 독립 교차검토 — 이벤트 설정

2026-10-07, `visual_quality_audit`. 작성자가 아닌 이벤트 설정 변경을 실제 소스·도메인·응답 계약과 대조했다. 이 담당의 미디어/과제 수정 검증은 [별도 기록](admin-ui-followup.md)이며 여기서 자신의 변경을 독립 검토로 세지 않는다. 공유 브라우저·새 서버·운영 데이터는 사용하지 않았다.

## 계약과 구현 대조

- `EventAdminActions`의 설정 노출 조건은 PLANNED와 `participants.length === 0`이다. `replaceEventSettings`의 두 조건과 일치하며 취소 참가자도 기록이 있으면 수정하지 못한다. 서버 권한·트랜잭션의 재검사와 revision 충돌 검사는 그대로다.
- 상세 페이지의 ADMIN 권한 경계는 유지되고, 관리 컴포넌트 key는 ID/revision이다. 412 복구로 서버 revision이 바뀌면 이전 draft가 남지 않고 새 설정으로 remount한다. 권한이나 취소 참가자 기록을 UI에서 우회하지 않는다.
- 시간 입력은 UTC에 9시간을 더한 문자열에서 Z만 제거하고, 제출 시 명시적인 `+09:00`으로 UTC를 복원한다. 한국시간 label과 `step="0.001"`이 초·밀리초를 보존한다. 기기 시간대에 의존하는 local Date getter를 사용하지 않는다. 담당자의 두 시간대 handler 근거는 [이벤트 설정 기록](event-settings.md)에 있다.
- 전송 전 즉시 ref 잠금과 refresh transition 잠금이 중복 전송을 차단한다. 같은 type/revision/body는 기존 `ClientMutationKeyStore` 키를 재사용한다. 412는 명시적 재조회, 401은 같은 이벤트로 돌아오는 로그인 경로다. 새 설정 입력은 label 안에 있고 fieldset/legend 및 실제 busy 상태를 유지한다. 새 CSS는 설정 폼에 한정된 2열/520px 이하 1열이며 실측 반응형 통과로 간주하지 않는다.

## 확인된 후속 문제

**P2: 유효한 JSON이지만 저장 확인 계약이 없는 HTTP200 응답을 성공 처리한다.**

서버 `event-command-handler.ts`의 `mutationBody`는 eventId/revision/commandType을 반환한다. 최초 수정의 command handler는 JSON 파싱만 성공하면 키를 완료하고 성공 문구·refresh를 실행해 `{}`도 완료로 표시했다. root가 같은 소스 원인을 제시했고, 이 담당은 실제 TSX handler를 실행해 별도로 확인했다.

- 재현: 담당자의 실제 handler 하니스를 ignored `.tmp/event-settings-independent-review.test.mjs`에 복사하고, 누락/다른 eventId/이전 revision/다른 commandType 응답 조건을 추가했다. 기존 테스트·제품 코드는 수정하지 않았다.
- [수정 전 실행](event-settings-independent-before.log): 첫 `{}` 응답에서 예상치 않은 refresh가 발생해 1 FAIL. 나머지 조건은 첫 실패로 실행되지 않았으므로 당시 모두 재현됐다고 세지 않는다.
- 수정 후: 작성 담당자가 키 완료 전에 현재 eventId·commandType 및 증가한 안전한 정수 revision을 확인하고, 불명확한 응답은 오류로 표시하며 같은 키를 보존하도록 보강했다. 담당자의 정상 응답 fixture도 실제 세 필드를 포함한다. 공식 `tests/event-settings-edit.test.mjs`에 누락/null/배열/다른 ID·명령/과거·분수 revision 등 7응답 회귀를 추가했다.
- [독립 재확인](event-settings-independent-after.log): 원래 동일한 독립 testcase **1 PASS**, 내부 5응답 조건 모두 실행됐다. 각 불명확 응답에서 성공 문구·refresh가 없고 같은 본문을 다시 제출할 때 같은 키를 사용하는지 확인했다. 담당자의 전체12검사는 이 독립1검사와 구분한다.

이 보강 후 검토한 이벤트 설정 범위에서 새 중대 결함이나 명확한 과업 차단은 발견하지 못했다. 추가 제품 편집 없이 검토를 마쳤고 `git diff --check` exit0을 확인했다. 이 판정은 아래 미확인 경계를 포함한 서비스 전체 완료 선언이 아니다.

## 확인 경계

이 문서는 실제 브라우저 설정 저장·새로고침·320px/390px 레이아웃, 새 DB 실행, 운영 배포 확인을 대체하지 않는다. 설정 수정 이외 기존 이벤트 전체 수명주기와 외부 Riot/파일 저장소도 별도 범위다.

# 관리자 생성 흐름 독립 재검토

검토자 journey. 다른 담당자가 수정한 `admin-discipline-create-form.tsx`, `admin-media-form.tsx`, `admin-media-upload.ts`, `tests/admin-create-recovery.test.mjs`와 해당 API/저장소 경계를 읽었다. 이 교차 검토에서는 제품 소스와 담당자의 테스트를 수정하지 않았다. root가 요청한 생성/미확정 결과/인증/부분 업로드 경계에 한정했다.

## 확인한 점

- 신규 징계/하이라이트/갤러리 생성은 원래 payload와 키를 요청 스냅샷으로 유지한다. 갤러리 파일/선택 실패 기록도 함께 유지하므로 재시도 과정에 다른 선택이 들어와도 원래 생성에 적용된다.
- 미확정 결과에서 입력 fieldset을 잠그고 재확인 버튼은 밖에 둔다. 즉시 ref guard가 React 상태 반영 전 재클릭을 막고, 생성 ID 확인 후에는 이동이 끝날 때까지 재생성을 허용하지 않는다.
- 처음부터 명확한 400 거절은 입력 수정을 허용한다. 이전 요청이 미확정인 상태의 인증/권한/timeout/rate-limit 응답은 원래 요청이 실행되지 않았다는 증거가 아니므로 원래 키를 유지한다. 기존 창을 남기는 새 창 로그인 링크가 이에 맞는다.
- 서버 미디어/징계 저장소는 트랜잭션에서 관리자 세션을 다시 검사하고 기존 receipt를 재생한다. UI 잠금만을 권한·정합성 보장으로 취급하지 않았다.
- 생성 성공 후 일부 업로드 실패는 이미 만들어진 초안 편집으로 이동하며 성공 자산을 보존한다. 세션 저장소 실패는 숫자 query 보고로 복구한다. 이미지 파일 제한·5장 상한은 기존 helper를 유지한다.

담당자 로그 [admin-create-focused-contracts.log](./admin-create-focused-contracts.log)와 [admin-create-focused-unit.log](./admin-create-focused-unit.log)의 범위를 소스와 대조했다. 해당 검사 수를 별도 독립 실행 수로 합산하지 않았다.

## 추가 발견과 해소

P2: 연결 PATCH가 HTTP 200이지만 JSON이 중단되면 `requestMutation`이 payload:null을 ok:true로 취급했고, 갤러리 연결 수를 성공 1로 보고했다. 기존 부분 업로드 검사는 정상 JSON 또는 실패 HTTP를 다뤘으므로 이 사례가 빠져 있었다.

기존 handler harness를 분리해 [독립 재현](./admin-media-review-repro.mjs)을 실행했다. [수정 전 1 FAIL](./admin-media-review-before.log)은 연결 확인이 없는데 linked가 1인 실제 결과다. 제품 담당자가 공통 성공 응답의 비음수 정수 revision 확인을 추가했다. API의 생성/수정/보관 응답 계약이 revision을 제공하는 점을 함께 확인했다.

수정 후 같은 독립 재현을 변경 없이 실행한 [after 로그](./admin-media-review-after.log)는 1 PASS다. 정식 회귀는 담당자가 잘린 JSON/null/빈 객체/잘못된 revision 네 경우로 확대했고 [admin-media-confirmation-after.log](./admin-media-confirmation-after.log)에 결과를 기록했다. 업로드가 확인된 자산은 유지하면서 연결 확인만 실패로 표시하고 기존 초안으로 이동하므로 신규 초안 중복 생성이나 재업로드를 강요하지 않는다.

## 미확인 범위

이 검토와 재현은 네트워크 응답을 격리한 실제 컴포넌트 handler 실행이다. 실제 Blob 전송 지연, 다른 창의 관리자 인증 완료, 실기기, 저장소 quota/브라우저 탭 종료 후 복원은 실행하지 않았다. 열린 폼의 생명주기 밖에 pending 요청을 지속하는 새 기능은 추가하지 않았다. 최종 Next 빌드/브라우저·DB 통합/배포는 root 검증 기록을 기준으로 한다. 위 추가 결함 수정 후 이 생성 흐름 범위에서 새로운 명확한 중대 결함은 발견하지 않았다.

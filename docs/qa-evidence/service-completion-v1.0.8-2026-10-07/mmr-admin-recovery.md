# MMR 관리자 요청 완료 확인과 복구

기준 소스는 `0716a60bf09654118cc40493481839d75269b3f7`이며, 이 문서는 그 이후 1.0.8 후보의 클라이언트 수정 근거다. 운영 MMR 공식 전환이나 운영 데이터 변경을 실행한 기록이 아니다.

## 원인 확인

실제 `MmrAdminActions` TSX의 이벤트 핸들러를 실행한 최초 독립 재현은 5건 중 4 FAIL / 1 PASS였다. 당시 코드는 매번 새 요청 키를 만들고, HTTP 성공 상태만 확인하며, `router.refresh()` 직후 버튼 잠금을 해제했다. 아래 P2 문제를 확인했다.

- HTTP 200 `{}`만 받아도 게시 결과 확인 없이 재계산 완료 안내와 refresh를 실행했다.
- 첫 조정 요청의 응답이 유실되면 같은 입력·계산 버전의 재시도에도 새 키가 발급됐다. 기존 영수증 복구 대신 서버의 generation 충돌 응답으로 이어질 수 있었다.
- 같은 tick에 전달된 submit 두 건이 두 개의 POST를 보냈다.
- 성공 직후 새 generation을 받기 전에도 폼이 활성화돼 이전 버전으로 다시 요청할 수 있었다.

원본 로그는 `mmr-admin-recovery-before.log`에 보존했다. 이전 interactions 폴더의 원본도 유지했다. 서버는 전역 잠금 아래 generation을 확인한 뒤 조정을 삽입하므로, 위 중복 요청이 중복 DB 원장 생성으로 이어졌다는 결론은 내리지 않았다.

## 최소 수정

- 기존 `ClientMutationKeyStore`를 사용하고, 미확정 요청의 body·generation·key를 보존한다. 일반 입력은 잠그고 `같은 요청 다시 확인`으로 원래 요청만 재확인한다.
- 즉시 ref guard로 중복 요청을 차단한다. 30초 응답 제한을 넘겨도 서버 처리 취소나 실패로 단정하지 않고 같은 키로 완료 여부를 확인한다.
- 성공 body가 객체이며 안전한 정수 generation이 요청한 버전의 정확히 다음 버전이고 revision과 같은지 확인한다. 재계산은 유효한 consumedEventCount, 조정은 원래 playerId 일치까지 확인한다. 잘린 JSON이나 형식이 다른 성공 응답은 완료로 표시하지 않는다.
- 성공 후 transition과 게시 generation을 함께 확인한다. refresh가 이전 결과를 반환한 경우 작업 잠금을 유지하고 결과 새로고침을 제공한다. 완료한 조정의 플레이어 선택·입력은 초기화한다.
- 401/403은 요청을 유지한 채 새 창에서 관리자 로그인을 연결한다. 412는 최신 결과를 명시적으로 불러와 재검토하게 한다. 입력 오류는 서버 거절 내용을 표시하고 수정할 수 있다.
- 기존 폼에 disabled fieldset을 적용하고 CSS grid를 유지했다. 서버 권한, API, 공식, DB 스키마는 변경하지 않았다.

## 실행 검증

| 검사 | 결과 | 범위 |
| --- | --- | --- |
| `node --test tests/mmr-admin-recovery.test.mjs tests/mmr-persistence-ui.test.mjs` | 13 PASS | 이전 개별 단계: 신규 실제 핸들러 10 + 기존 UI 계약 3. 이후 선택·잠금 회귀 보강은 아래 통합 로그로 구분 |
| 응답 오류 행렬 | PASS | 재계산/조정의 null·배열·누락·불일치/소수 generation·잘못된 작업별 값; unreadable JSON; 408/429/503; 401/403; 412; 400 |
| 사용자 복구·중복 방지 | PASS | 동일 요청 키/본문/If-Match 재사용, 즉시 중복 차단, 성공 refresh 및 새 generation 잠금, ADMIN 폼 비노출 |
| focused ESLint | 담당자 실행 exit 0 보고 | 변경 TSX와 신규 테스트. 별도 로그 파일은 남지 않았으며 최종 통합 lint 결과로 함께 확인 |
| `npm run typecheck` | exit 0 | 통합 작업 공간의 현재 타입 검사 |
| 최종 `npm run check` | PASS | 보강한 선수 선택·처리 중 actual handler와 picker 계약 포함 613 계약 PASS, 1068 단위 PASS·조건부 skip 1, lint 0 오류·58 경고, 타입·ERD·생성 이미지 68개·최적화 빌드 통과 |

실행 로그: [이전 개별 단계 13 PASS](mmr-admin-recovery-after.log), [타입 검사](mmr-admin-recovery-typecheck.log), [최종 통합 검사](check-final.log). `mmr-admin-recovery-lint.log`는 존재하지 않으므로 빈 로그를 새로 만들어 실행 증거로 제시하지 않는다. 별도 파일이 없는 focused 실행은 담당자 보고와 구분한다.

독립 재검토에서 요청 버전 3에 응답 버전 5처럼 서버가 발행할 수 없는 응답도 최초 수정이 수용하는 P2를 실제 핸들러로 재현했다([수정 전](mmr-independent-before.log)). 서버는 일치하는 expectedGeneration에서 정확히 1을 더해 게시하므로 성공 검증을 정확한 다음 버전으로 좁히고, 두 작업의 corrupt-success 행렬에 해당 응답을 추가했다. 보완 후 동일 13개 focused 검사와 lint·타입 검사를 다시 실행했다. 원래 독립 재현도 변경 없이 [1 PASS](mmr-independent-after.log)했으며, 범위는 [독립 검토](independent-review.md)에 분리한다.

첫 통합 check의 [612 PASS·1 FAIL](check-first.log)은 picker 계약의 `busy || !playerId` 문자열 기대였다. 제품은 더 넓은 잠금 조건인 `locked`를 사용한다. 문자열 기대를 다른 변수명으로 바꾸는 대신 실제 핸들러 회귀를 확장해 미선택 전송 0건, 선택 후 제출 가능, 요청 중 버튼·fieldset 잠금 및 같은 tick 전송 1건을 검증했다. 기존 picker 구성·원격 endpoint·raw UUID 입력 금지 검사는 유지했다. 최종 [check-final.log](check-final.log)에서 해당 핸들러와 picker 검사가 모두 통과했다. 후속 focused 실행 보고는 별도 파일이 없으므로 새로운 검사 수로 합산하지 않는다.

합성 HTTP 응답으로 실제 클라이언트 핸들러를 실행했다. React 상태 훅과 라우터는 제한된 테스트 하네스이며 실제 브라우저·네트워크·DB 검증을 대체하지 않는다. 서버 영수증/If-Match 순서는 repository와 기존 DB 계약을 읽어 대조했다. 이 담당자는 신규 DB 검사, 운영 요청, 백업 실행, 전체 빌드, commit, 배포를 수행하지 않았다.

## 통합 UI 확인 경로

격리 fixture의 SUPER_ADMIN으로 `/admin/balance-ai`를 연다. 수동 조정은 플레이어 선택 → 종합/포지션 선택 → -1000~1000 정수 → 영문으로 시작하는 사유 코드 → 공개 설명 입력 → `조정 원장 추가` 순서다. 정상 완료 시 플레이어·입력이 초기화되고 최신 계산 버전이 표시돼야 한다. 재계산은 `전체 원장 재계산` → 페이지 내 확인 대화상자 → `확인 후 재계산`이며 native confirm은 사용하지 않는다.

모바일 그리드, 실제 새 창 로그인, 실제 refresh/포커스 동작 및 통합 배포 후 확인은 통합 담당자의 증거와 별도로 연결해야 한다. 본 문서만으로 해당 항목 통과를 주장하지 않는다.

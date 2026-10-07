# 1.0.8 독립 변경 검토

기준은 운영 소스 `0716a60bf09654118cc40493481839d75269b3f7` 이후 작업 공간의 MMR 관리자 복구 UI와 이벤트 상세 표시 변경이다. 이 검토자는 해당 제품 코드를 작성하지 않았으며, 소스 읽기와 아래 한정된 합성 핸들러 재현만 수행했다.

## 발견 사항

### P2 — 명령의 계산 버전과 맞지 않는 성공 응답: 수정 후 재검증 통과

최초 후보는 성공 응답의 `generation > expectedGeneration`만 확인했다. 서버는 전역 잠금 아래 현재 generation과 If-Match가 같은지 확인한 뒤 정확히 `+1`한 generation을 게시하며, 재시도 영수증도 그 응답을 그대로 반환한다. 따라서 If-Match 3 요청에 revision/generation이 모두 5인 응답은 해당 요청의 유효한 결과가 될 수 없다.

실제 `MmrAdminActions` 핸들러에 이 합성 응답을 주입하자 완료 안내·키 완료·refresh가 실행되어 독립 회귀가 실패했다. 잘못된 generation 5까지 다음 작업을 잠그는 부작용도 소스에서 확인했다. 이는 응답 확인의 오류이며, 운영에서 해당 응답이 관측됐다거나 중복 DB 원장이 만들어졌다는 주장이 아니다.

- 최초 재현: [mmr-independent-before.log](mmr-independent-before.log), 1 FAIL.
- 재현 파일: 무시 경로 `.tmp/mmr-admin-independent-review.test.mjs`; 실제 TSX를 실행하고 재계산·조정 모두에 동일한 계약을 적용한다.
- 담당자가 `generation === expectedGeneration + 1` 조건으로 수정하고 공식 잘못된 성공 응답 행렬에 두 명령의 generation 5/revision 5 사례를 추가했다.
- 동일한 독립 재현을 수정 없이 다시 실행한 결과 [mmr-independent-after.log](mmr-independent-after.log), 1 PASS였다. 재계산·조정 모두 잘못된 성공 응답에서 refresh하지 않고, 후속 재확인에 원래 본문·If-Match·멱등성 키를 보존한 뒤 정상 receipt를 수신하면 refresh함을 확인했다.

수정 후 검토한 변경 범위에서 미해결 중대 문제나 명확한 과업 방해 요소는 발견하지 않았다. 이 판단은 아래 읽기/핸들러 범위에 한정한다.

## 별도 대조 결과

- `postgres-mmr-repository.ts`의 영수증 조회는 새 명령의 generation 검사보다 먼저 수행된다. 같은 actor·scope·키와 같은 request hash는 기존 응답을 재생하고, 새 키의 오래된 generation은 조정 삽입 전에 412로 거절된다. UI의 frozen body·If-Match·키 보존은 이 기존 계약을 사용한다.
- 즉시 ref guard와 요청 중 잠금은 같은 tick의 중복 전송을 막는다. 완료 응답 이후에는 transition과 실제 새 generation 도착을 모두 기다린다. 새로고침이 이전 결과를 반환하면 잠금을 유지하고 결과 다시 불러오기를 제공한다.
- 401/403에서는 기존 요청을 유지하고 관리자 로그인을 별도 창으로 연다. 412에서는 원래 요청의 재전송 대신 사용자가 명시적으로 입력을 버리고 최신 결과를 확인한다. 성공한 조정은 선택과 입력을 초기화한다.
- API의 SUPER_ADMIN, 세션 재확인, Origin, 요청 크기, If-Match, 멱등성 계약은 바뀌지 않았다. 새 UI가 서버 권한을 대신하지 않는다.
- 설치된 Next 16 문서의 `router.refresh()` 상태 보존 설명과 부모 페이지 구성을 대조했다. MMR 부모는 generation에 따라 클라이언트를 재마운트하지 않으므로 미확정 요청과 완료 generation의 상태가 유지된다.
- disabled fieldset 내부에 입력·선수 picker·제출 버튼이 포함되고, 기존 4열/모바일 1열 폼 그리드에 맞춰 subgrid만 추가했다. 이 읽기 검토를 실제 화면 크기·키보드 검증으로 간주하지 않는다.
- 이벤트 상세는 기존 공개용 format/lifecycle/position 라벨을 재사용한다. ACTIVE 인원 집계, 취소된 참가자 행, 참가 출처 구분, ADMIN 권한 검사, 공개 화면 링크, 원본 EventAdminActions props와 revision key를 보존했다. 해당 변경에서 새로운 기능 방해나 권한 문제는 찾지 못했다.

## 검증 범위와 남은 확인

기존 [MMR 담당자 검증](mmr-admin-recovery.md) 및 [이벤트 표시 검증](event-admin-display.md)의 실제 핸들러/페이지 테스트와 서버 코드를 대조했다. 독립 재현 명령은 `node --test --test-name-pattern='independent malformed non-successor' .tmp/mmr-admin-independent-review.test.mjs`이며, 수정 전·후 각각 한 번만 실행했다. 변경 파일의 `git diff --check`도 통과했다. 이 검토에서 전체 검사·DB 서버·빌드·공유 브라우저·운영 요청은 실행하지 않았다. API·도메인·DB 스키마의 제품 diff가 없음을 확인했다.

운영 최고 관리자 로그인, 실제 MMR 공식 전환, 최신 운영 백업과 복원 실행은 이 문서로 완료 처리하지 않는다. 실제 브라우저의 새 창 로그인·초점·반응형·refresh 결과, 통합 릴리스 검사와 배포 후 확인은 통합 담당자의 별도 근거가 필요하다.

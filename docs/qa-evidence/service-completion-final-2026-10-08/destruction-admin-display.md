# 관리자 멸망전 목록 표시 후속 검증

대상: `/admin/progress/destruction`와 연결된 관리자 상세. 2026-10-08. 제품 변경은 목록 `page.tsx` 한 파일에 한정했다. 공개 갤러리·모달·관리 동작·API·검색 파서는 변경하지 않았다.

## 발견 및 원인

Root가 최적화 빌드의 실제 관리자 목록 접근성 트리에서 상태 필터의 `PLANNED`, `RECRUITING` 등, 예선 방식의 `FULL_ROUND_ROBIN_BO3` 등, 카드의 방식·상태 코드가 그대로 보임을 확인했다. 본 검토자는 공유 브라우저를 조작하지 않았으며, 이 기록을 별도로 수행한 브라우저 검증으로 계산하지 않는다.

P3: 운영자가 상태와 경기 방식을 고를 때 내부 enum을 해석해야 했다. 목록은 DTO 값을 직접 렌더링했고, 옵션에는 `value`가 없어 표시 문자열이 제출 값으로도 사용되고 있었다. 따라서 표시만 한국어로 바꾸면 기존 검색 계약까지 깨질 수 있었다.

연결 상세의 예선 방식·진행 단계·현재 단계는 이미 기존 표시 함수를 사용하고 있었다. 상세, 생성 폼, 관리자 액션의 관련 `status`·`preliminaryFormat`·`gameMode`·`position`·`auctionStatus` 출력도 대조했으며, 이번 목록과 동일한 직접 enum 본문 출력은 추가 확인하지 못했다. 상세의 `LIVE AUCTION CONTROL`은 별도 고정 제목이며 이번 enum 표시 변경에는 포함하지 않았다.

## 최소 수정

- 목록 옵션·카드에 상세에서 사용하던 `DESTRUCTION_STATUS_LABEL`, `competitionPreliminaryFormatLabel`을 재사용했다.
- 상태·방식 옵션에 원래 enum `value`를 명시했다. 선택 상태, URL 파싱, repository 인자, API 계약은 그대로다.
- 8개 예선 방식은 단판과 3판 2선승을 구분한다. 서로 같은 라벨로 합치지 않았다.
- 제목·세부 화면 링크·정원·변경 버전·권한 검사·오류와 빈 상태는 유지했다. 기능, 공통 추상화, 설명 문단을 추가하지 않았다.

## 실제 실행 근거

`tests/destruction-admin-display.test.mjs`는 실제 async 목록·상세 TSX와 실제 query parser 및 표시 모듈을 실행한다. 합성 repository와 인증 경계만 주입하며, DB나 운영 데이터는 사용하지 않는다.

| 확인 | 수정 전 | 수정 후 |
|---|---|---|
| 상태·방식 선택 문구, 8개 방식 구별, canonical 값/현재 선택/실제 파서 연결 | FAIL: 상태 enum 직접 노출 | PASS |
| 8개 상태·방식 카드의 한국어 표시, 제목·경로·인원·버전 유지 | FAIL: 첫 카드 enum 직접 노출 | PASS |
| 연결 상세의 기존 한국어 단계·방식, canonical stage 링크 유지 | PASS | PASS |

- [정상 하니스의 수정 전 결과](destruction-admin-display-before.log): 2 FAIL, 1 PASS.
- [수정 후 결과](destruction-admin-display-after.log): 새 실행 회귀 3개와 기존 destruction UI 계약 3개, 총 6 PASS.
- [범위 ESLint](destruction-admin-display-lint.log): exit 0. 최초 익명 React Link stub의 lint 오류는 named function으로 수정했다.
- [타입 검사](destruction-admin-display-typecheck.log): `npx tsc --noEmit --incremental false`, exit 0.
- `git diff --check`: 공백 오류 없음. Windows CRLF 알림만 발생했다.

최초 하니스에서는 상세 경로에 필요한 `isDestructionUuid` 실제 export 로딩이 빠져 별도 TypeError가 났다. [초기 하니스 로그](destruction-admin-display-harness-initial.log)에 분리했고 제품 오류로 세지 않았다. 실제 서비스 모듈을 로드한 뒤, 제품 수정 전 상태에서 2 FAIL/1 PASS를 다시 확인했다. 제품 기대값을 완화하지 않았다.

## 범위와 남은 확인

소스 안정 후 root에 통보했고 제품은 고정했다. 전체 릴리스 검사·최종 빌드·이 변경이 포함된 실제 브라우저 확인·배포는 root가 진행 중이다. 기존 31647 서버는 이 목록 변경 이전 빌드이므로 이 변경의 브라우저 통과 근거로 사용할 수 없다. 최종 빌드에서 상태 `선수 경매`, 방식 `스위스 라운드 · 단판` 등으로 조회했을 때 canonical query 값 유지와 카드 표시를 확인하면 된다.

이 검증은 실제 HTTP 조회, 브라우저 키보드 조작, 실기기 검증을 대신하지 않는다. 목록 표시 변경에는 신규 외부 연동·DB 변경이 없으며, 기존 기능의 미확인 외부 조건은 전체 완료 문서에서 별도 유지한다.

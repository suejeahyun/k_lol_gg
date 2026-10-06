# 처음 이용하는 참가자의 메뉴·검색·포지션 확인

검증일: 2026-10-06 KST. 합성 입력만 사용했고 운영 계정·신청·경기를 변경하지 않았다.

## 재현 및 수정

| 문제 | 수정 전 재현 | 수정 후 결과 |
|---|---|---|
| 이벤트전·멸망전 신청 메뉴의 현재 위치가 오늘 내전으로 표시됨 | 실제 `PrimaryUserNavigation`을 `/applications?type=event` 상태로 렌더하면 `aria-current="page"`가 `/applications` 링크에 붙음 | 쿼리의 신청 종류를 반영한다. 오늘 내전·이벤트전·멸망전 각각 현재 링크 1개, 잘못되거나 중복된 종류는 현재 링크 0개 |
| 팀 만들기에서 느린 검색을 지우면 계속 검색 중으로 표시됨 | 실제 `TeamBalanceBuilder`의 입력 이벤트와 effect를 지연 응답으로 실행. 검색 시작 후 입력을 지우면 요청은 abort되지만 `검색 중…`은 남음 | 입력 삭제·입력 초기화에서 검색 상태도 초기화. 취소된 과거 요청이 새 검색의 로딩 상태를 덮어쓰지 않는 기존 보호 유지 |
| 한글로 고른 포지션이 완료 후 영문 코드로 바뀜 | 신청 입력은 탑·정글·미드·원딜·서폿·전체 가능, 내 상태와 공개 명단은 TOP/JGL/MID/ADC/SUP/ALL 직접 출력 | 기존 신청 라벨을 공유해 내 상태와 명단도 같은 용어로 표시. 저장 값, 가능 포지션, 주·부 포지션 규칙은 변경 없음 |

## 실행 근거

- `node --test tests/first-visit-interactions.test.mjs`: 수정 전 메뉴·검색 초기화 2개 실패, 과거 응답 보호 1개 통과. 제품 수정 후 3개 모두 통과.
- `node --test tests/first-visit-interactions.test.mjs tests/application-navigation.test.mjs`: 7개 통과. 실제 컴포넌트 렌더/이벤트/효과 정리 코드를 실행하며 검색 응답만 합성 지연으로 대체한다.
- `npx tsx --test tests/user-navigation.test.ts`: 5개 통과.
- `npx tsx --test tests/season-domain.test.ts`: 11개 통과. 주·부 포지션 및 ALL 혼합 방지 정책 유지.
- `node --test tests/team-tools-ui.test.mjs tests/team-tools-retry.test.mjs`: 8개 통과.
- 변경한 컴포넌트·표시 helper·회귀 테스트 8개 파일에 focused ESLint 오류·경고 없음.

포지션 검증은 6개 값 전체의 내 상태·공개 명단을 렌더하고 데이터 불변을 확인한다. 칼바람·증강 칼바람은 계속 `포지션 구분 없음`을 표시한다. 검색 검증은 입력 삭제·입력 초기화·이전 요청 취소 후 새 검색 완료를 확인한다.

이 문서의 검증은 격리된 컴포넌트 실행 및 서버 렌더 검증이다. 실제 기기, 브라우저 접근성, 운영 배포 완료를 대신하지 않는다. 통합 검사와 배포 후 브라우저 확인은 릴리스 근거에 별도로 기록한다.

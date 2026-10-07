# 예선 경기 기록·확정 진출 표시의 독립 검토

2026-10-08, `release_inventory`가 다른 담당자의 안정된 1.0.10 후보를 읽기만 검토했다. 제품 변경·DB/브라우저/서버 실행·검사 재실행·운영 데이터 변경은 하지 않았다. 기존 1.0.9 증거를 수정하지 않았다.

## 판단

추가 배포 차단 finding 없음. 운영에서 확인된 문제는 이전 규칙·운영자 선택으로 확정한 진출팀과 현재 V2 순위 집계의 상위 팀이 다르면서, 화면이 현재 계산 순위를 과거의 확정 예선 순위로 표현한 것이다. 이번 변경은 그 충돌이 있는 표에서만 확정 순위라는 표시를 제거한다. 과거 순위를 추정하거나 기존 확정 진출·경기 결과를 현재 계산으로 덮어쓰지 않는 범위가 적절하다.

## 실제 경계 대조

- 제품 diff는 `components/competitions/destruction/public-progress.tsx`의 표시 분기와 공개 destruction 상세 `page.tsx`의 진출 요약 한 곳이다. API·repository·도메인 계산·DTO·schema는 변경하지 않았다.
- `toDestructionPublicDto`는 standings를 현재 `destructionStandings`로 계산하고, qualifiedTeamIds와 본선 경기/우승 정보는 기존 aggregate에서 읽어 제공한다. 이번 표는 그 두 자료를 비교할 뿐 DTO에 쓰지 않는다.
- 조별 방식은 각 조 상위 2개, 그 외 방식은 advanceTeamCount까지를 비교한다. 이는 기존 configuration/standings 계약과 일치한다. 확정 진출 ID가 없는 경우, 현재 계산 상위 ID와 확정 ID 집합이 같은 경우에는 기존 순위 열·계산 기준을 유지한다. 집합 비교이므로 같은 진출팀의 seed 배열 순서가 다르다는 이유만으로 정상 순위를 숨기지 않는다.
- 불일치에서는 제목/영역 이름/표 caption을 `예선 경기 기록`으로 바꾸고 순위 열과 기존 상위 진출 설명을 제거한다. 경기 수·승/패·승점·세트 기록과 팀 순서는 유지하고, `본선 진출` 표시는 실제 qualifiedTeamIds를 따른다. 확정 대진 기준이라는 짧은 문구가 표시 기준을 설명한다.
- 상세 요약은 확정 ID가 있으면 실제 확정 수를 표시하고, 없으면 기존 예정 진출 수를 표시한다. 참가 신청·MVP·조회 권한·원래 대진·우승 표시는 변경하지 않았다.
- 1.0.9의 gallery client, 썸네일 ID, imageIndex/닫기 URL, 이미지 데이터, native dialog·키보드 동작은 이번 제품 diff에 없다. 기존 갤러리 test fixture에 추가한 `qualifiedTeamIds: []`는 실제 DTO의 필수 필드를 보충한 것이며 모달 기대값을 바꾸지 않았다.

## 근거와 미확인 범위

새 `tests/destruction-qualification-display.test.mjs`는 합성 6팀·각 조 동률 aggregate에서 **실제 aggregate→toPublicDTO→표/전체 페이지 SSR**을 실행한다. 실제 badge 대상, 순위 열 제거, 세트 기록 유지, 렌더 전후 aggregate/DTO JSON 동일성, 정상 일치·미확정·진행 중 분기, 확정 수 요약을 검증한다. [수정 전](qualification-display-before.log)의 2 FAIL·1 PASS와 [수정 후](qualification-display-after.log)의 새 3조건+기존 갤러리/권한 8조건, 총 11 PASS를 대조했다. 초기 하니스/갤러리 필수 필드 오류는 별도 로그로 보존되어 제품 실패와 구분된다. [ESLint](qualification-display-lint.log)는 0출력 exit 0으로 보고됐다.

이 검토는 과거 모든 대회의 원래 동률 순위를 복원했다는 주장이 아니다. 충돌을 현재 DTO로 확인할 수 있는 경우의 표시 정확성을 보완한 것이다. 실제 운영에서 발견된 대회의 화면 재확인, 최종 전체 검사·빌드·배포 결과와 실기기 검증은 root의 별도 기록에 따른다. 이 독립 읽기에서 운영 결과나 진출팀을 다시 계산·수정하지 않았다.

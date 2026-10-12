# 브라우저 검증 — 전체 점검 보완

- 실행: Codex in-app browser, loopback 전용 합성 PostgreSQL fixture. 운영 계정·운영 데이터 변경 없음.
- 범위: 실제 폼 제출·충돌 복구·목록 이동·가입 결과·좁은 화면. 전체 화면/버튼 전수 통과를 의미하지 않는다.

| 시나리오 | 관찰 결과 | 근거 |
|---|---|---|
| 사용자 프로필 동시 수정 | 관리자가 먼저 저장한 뒤 사용자 저장이 412. 사용자 입력 유지, 최신 저장값 비교, 저장 차단. `내 입력 유지` 후 정상 저장 | account-conflict.png |
| 관리자 프로필 동시 수정 | 사용자가 먼저 저장한 뒤 관리자 저장이 412. 입력 보존. `입력 버리고 최신값 사용`으로 실제 최신값 복구 | admin-conflict.png |
| 참가 신청 두 탭 동시 수정 | 새 loopback origin에서 최종 production 빌드로 확인. 첫 탭 TOP 초안과 둘째 탭이 저장한 MID를 비교 표시하고 초안 유지, 선택 전 저장·취소 차단. 입력 유지 후 TOP 재저장 성공, 다른 탭에서는 버리기로 최신 TOP 복구 | [application-conflict.png](application-conflict.png) |
| 정원 마감 신청 | 본 참가 10/10에서 두 참가 구분 모두 미선택. 본 참가/제출 비활성. 예비 참가와 주라인을 직접 선택 후 접수, 예비 1명 표시 | 합성 fixture 및 실제 UI 제출 |
| 운영 신청 목록 | PENDING 105건. 1쪽 100건에서 다음 이동 후 2/2·5건, type/status 유지 | operation-forms-page2.png |
| 시즌 생성 실패 | 중복 이름의 저장 오류 후 이름 입력 유지 | season-failure-input.png |
| 회원 가입 | 잘못된 ID의 native validation·focus 확인. 합성 가입 완료 결과가 계속 표시되며 로그인 링크에 `/applications` 복귀 경로 유지 | signup-complete.png |
| 플레이어 좁은 화면 | 실제 viewport 320/390/1440에서 document scrollWidth=clientWidth. 최근 경기 5건과 긴 제목이 카드 내부 유지 | responsive.json, player-320-fixed.png |

목록 첫 검증에서 `/admin/operation-forms/suggestions?...` 경로의 canonical redirect가 페이지·상태 쿼리를 버리는 문제를 발견했다. 목록 필터·페이지 링크를 canonical `/admin/operation-forms?type=suggestions&status=PENDING&page=2`로 맞춘 뒤 실제 이동을 다시 통과했다.

신청 동시 수정의 초기 개발 서버 관측은 최종 판정에서 제외했다. service worker/development chunk cache가 원인일 가능성을 조사했으나 원인을 입증하지는 않았다. 최종 판정은 아래처럼 기존 origin과 분리한 loopback 주소에서 최종 production 빌드를 실행한 결과를 기준으로 한다. 이는 로컬 최적화 빌드 검증이며 운영 배포를 뜻하지 않는다.

## 참가 신청 두 탭 검증 순서

1. 두 탭이 동일 신청의 기준값 ALL, revision 0을 조회했다.
2. 첫 탭에서는 주라인 TOP을 입력해 저장하지 않은 초안을 만들었다.
3. 둘째 탭에서는 주라인 MID로 바꾸어 저장했다.
4. 첫 탭에서 수동 새로고침했다. 최신 저장값 MID를 비교 표시하면서 작성한 TOP은 유지됐다. 명시적인 충돌 처리 전에는 저장과 취소 버튼이 비활성화됐다.
5. 첫 탭에서 입력 유지 선택 후 다시 저장해 TOP 저장이 성공했다.
6. 둘째 탭에서 새로고침한 뒤 입력 버리기를 선택하자 최신 TOP이 복구됐다.

[충돌 안내와 초안 유지 화면](application-conflict.png)을 보관했다. 이 결과는 참가 신청의 초안이 갱신된 서버 revision을 자동 수락하지 않는 것과 유지/버리기 분기가 실제 브라우저에서 이어지는 것을 확인한다.

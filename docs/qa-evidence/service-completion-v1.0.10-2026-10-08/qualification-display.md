# 과거 멸망전의 확정 진출과 예선 순위 표시

2026-10-08, 후속 1.0.10. 기존 1.0.9 릴리스 근거는 수정하지 않았다.

## 발견과 원인

P2 표시 정합성 오류. 완료된 공개 멸망전에서 각 조의 세 팀 모두 1승 1패·승점 1인데 현재 표의 1·3번 팀에 본선 진출이 표시되고, 안내는 “예선 최종·조별 상위 2팀”이라고 단정했다.

Root의 운영 공개 상세 확인 뒤 본 검토자가 같은 공개 API를 읽기 전용 GET하여 HTTP 200, 완료 상태·변경 버전 1, 조별 BO3, 해당 불일치를 확인했다. 참가자 개인정보·API 원문·운영 데이터를 fixture로 저장하지 않았다. 운영 DB에 접속하거나 쓰기를 실행하지 않았다.

다음 증거가 원인을 설명한다.

1. 대상 대회·팀 UUID는 승인된 V1 이관의 결정적 ID 생성식과 일치한다. `src/platform/legacy-identifiers.ts`와 동일한 로컬 해시 계산으로 확인했다. 이 확인은 DB 감사 원문 조회를 대신하지 않는다.
2. `scripts/cutover/import-v1-competitions.ts:467`은 원래 준결승 참가 팀과 대진을 기준으로 진출 팀/시드를 구성한다. `:596`은 예선 점수·승패를 검증하지만 새 정렬 기준으로 과거 진출 팀을 바꾸지 않는다. `:646`에서 그 확정 진출 팀을 보존한다.
3. `toDestructionPublicDto`는 `state.ts:186`에서 예선 standings를 현재 규칙으로 다시 계산하고 `:243`에서 확정 진출 팀은 원본 aggregate에서 읽는다. 현재 `core/standings.ts:123`의 정렬은 승점→승수→적은 패수→팀 식별자다.
4. `docs/cutover/V1_BLUEBLACK_BASELINE.md`에 명시된 V1 기준 작업 트리의 `DestructionStandingsBoard.tsx:127`은 동률 시 세트 득실·세트 승수를 먼저 비교한다. 관측한 두 조의 세트 득실을 이 기준으로 보면 원래 진출한 두 팀이 상위 두 팀이다.
5. 같은 V1의 `api/destruction-tournaments/[tournamentId]/tournament/route.ts:157`은 운영자가 선택한 서로 다른 네 팀과 준결승 대진을 허용하며, 선택 팀이 참가 팀인지 검증한다. 순위표만으로 자동 진출을 강제하지 않았다. 따라서 현재 확정 대진을 새 순위 규칙에 맞춰 재작성할 근거가 없다.

읽은 공개 응답의 실제 준결승 두 경기와 결승 참가 팀은 저장된 진출 네 팀과 일치했다. 결론은 확정 진출 데이터 오류가 아닌, 과거 확정 기록과 현재 계산 정렬을 같은 최종 순위로 표시한 오류다. 실제 당시 운영자의 의사결정 사유나 개별 감사 로그까지 확인한 것은 아니다.

## 최소 수정

제품 파일 두 개만 변경했다.

- `public-progress.tsx`: 기존 DTO의 계산 상위 팀과 확정 진출 팀 집합이 다른 경우에만 “예선 경기 기록”으로 표시하고 순위 열을 숨긴다. 팀·경기·승패·승점·세트 득실·확정 진출 표시는 유지한다. “집계: 확정 경기 · 본선 진출: 확정 대진 기준”이라는 필수 기준만 짧게 표시한다.
- 공개 상세 `page.tsx`: 확정 진출 팀이 있으면 요약을 “4팀 확정”처럼 실제 확정 수로 표시한다. 아직 확정하지 않았으면 기존 상위 팀 수 기준을 유지한다.

정상 일치 기록, 확정 전 순위, 진행 중 잠정 순위는 유지한다. 순위·점수·진출·본선 대진·우승자 원본, DTO, 집계 함수, API, DB는 변경하지 않았다. 과거 정렬 정책을 추정하여 새로 적용하거나, 모든 대회에 설명을 추가하지 않았다. 점수표 탭의 참가자 평가에는 이 예선 순위 표시가 없어 추가 변경하지 않았다.

## 실행 검증

새 `tests/destruction-qualification-display.test.mjs`는 합성 aggregate의 실제 `toDestructionPublicDto`를 실행하여 실제 standings·확정 bracket을 만들고, 실제 표시 컴포넌트와 async 공개 상세 Page를 렌더링한다. API나 단순 문자열 모의값으로 충돌 조건을 대신하지 않는다.

| 조건 | 결과 |
|---|---|
| 조별 1·3번 팀이 이미 진출한 기록 | 순위 열/예선 최종 단정 제거, 네 팀 진출 표시 유지 |
| 진출 집합이 계산 결과와 일치하되 배열 순서는 다름 | 기존 순위·조별 진출 기준 유지 |
| 예선 완료 후 아직 진출 미확정 | 기존 순위와 진출 기준 유지, 확정 배지 없음 |
| 아직 결과가 없는 예선 경기 포함 | 진행 중·잠정 순위 유지 |
| 전체 공개 상세 요약 | 확정 팀 수와 미래 진출 기준을 구분 |
| 표시 전후 aggregate/DTO | rank·점수·fixture·bracket·qualifiedTeamIds JSON 동일 |

- [수정 전](qualification-display-before.log): 제품 오류 2 FAIL, 기존 정상 조건 1 PASS.
- [수정 후](qualification-display-after.log): 새 실행 회귀 3개와 기존 갤러리·UI 경계 회귀 포함 11 PASS.
- [범위 ESLint](qualification-display-lint.log): exit 0.
- [타입 검사](qualification-display-typecheck.log): `tsc --noEmit --incremental false`, exit 0.
- `git diff --check`: 공백 오류 없음.

초기 하니스의 VM 배열 realm 비교 오류는 [초기 로그](qualification-display-harness-initial.log)로 분리하고 JSON 값 비교로 고친 뒤 제품 수정 전 2 FAIL/1 PASS를 다시 확인했다. 기존 갤러리 테스트 fixture에는 DTO 필수 필드 `qualifiedTeamIds`가 없어서 [별도 초기 로그](qualification-display-gallery-fixture-initial.log)의 TypeError가 발생했다. 그 fixture에 빈 배열만 보충했으며 갤러리 제품·동작·기대값은 변경하지 않았다. 두 문제를 제품 실패나 별도 제품 수정으로 세지 않는다.

## 최종 확인 상태

소스·범위 검사 완료 후 root에 전달했다. release_inventory의 독립 읽기 검토는 actual DTO·기존 진출 정책·조건부 표시·갤러리 fixture 보완을 대조하고 새 차단 문제를 발견하지 못했다. 독립 검토자가 같은 테스트나 브라우저를 다시 실행한 것은 아니다. 통합 검사·최적화 빌드·브라우저·배포는 root 진행 범위이며 이 문서는 완료를 대신 주장하지 않는다. 최종 브라우저에서는 동일 공개 대회의 두 조에 순위 열이 없어지고 원래 네 팀의 진출 표시·점수·준결승·결승이 유지되는지 확인해야 한다. 정상 대회와 미확정 대회는 합성 fixture의 실제 DTO 렌더링에서 확인했으며 실제 외부/실기기 검사로 세지 않는다.

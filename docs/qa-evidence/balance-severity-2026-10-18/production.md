# 추가 조정 기각 및 기존 운영 유지

이번 `EXCESS_FIRST` 조정안은 **NOT_DEPLOYED / REJECTED**다. 사용자 지정 조건인 “개선이 확인된 변경만 반영하고, 개선 근거가 없으면 기존 계산식을 유지”에 따라 조정용 평가에서 기각했다. 후보의 평균 최대 라인 격차 감소를 새로운 계산식의 운영 배포 근거로 사용하지 않았다.

유지하는 운영 버전은 **`inhouse-fairness@2.0.2`**, tag `inhouse-fairness-v2.0.2`, source `131abbf777a331b056a96ab587957cf654387a78`, 점수 계산식 `V2_INHOUSE_RELAXED_2026_10_16`이다. 이 릴리스의 운영 반영 내용은 표본 0건의 자료 부족 진단이며, 앞선 [실제 배포·후보 검증·source CI·복구 근거](../balance-research-2026-10-18/production.md)를 보존했다.

| 항목 | 확인 대상 |
|---|---|
| 운영 deployment | `dpl_HvxXc1nShJhxNndox6HhiU4zfRjq` |
| immutable 주소 | [확인된 배포](https://k-lol-7siucpmza-tjdmswo11-3715s-projects.vercel.app) |
| 운영 주소 | [K-LOL.GG](https://k-lol-gg.vercel.app) |
| 연구 시작 시 운영 확인 | [source·READY·alias](baseline-deployment.json), [읽기 전용 HTTP 12조건](baseline-http.json) |
| 연구 종료 시 운영 확인 | [source·READY·alias](production-deployment.json), [읽기 전용 HTTP 12조건](production-http.json) |

운영 확인은 health, 공개 화면과 인증이 필요한 경계의 익명 GET만 사용한다. 응답 본문·쿠키·비밀값을 저장하지 않았다. 운영 참가자·팀·경기·초안·MMR·관리자 보정의 생성·수정과 migration은 모두 0건이다. 신규 자동 실행이나 반복 예약도 0건이다.

새 후보의 release deployment·source CI·실제 브라우저 검증을 수행했다고 주장하지 않는다. 사전 단계에서 채택 조건을 충족하지 못했으므로 해당 배포 절차에 진입하지 않았다. 기존 운영 source의 격리 PostgreSQL·Chromium 흐름 17항목, DB 계약 9항목, 후보/운영 HTTP 각 12항목과 source CI 근거는 앞선 릴리스 기록에 있다. 이번 연구 코드에 대한 전체 검사 결과는 [validation.json](validation.json)에 구분해 기록했다.

연구 코드·결과는 별도 `codex/balance-severity-20261018` 브랜치에 보존한다. [실험 보고](README.md)의 실패 지표를 보고 새 가중치를 추가하거나 기각 후보를 검증/최종 집합에 재적용하지 않았다. 점수와 편성 이력의 원본도 유지한다. 실제 결과가 없는 가상 편성을 실제 승률 개선으로 설명하지 않는다.

새 운영 변경이 없어 이번 연구 때문에 실행할 rollback은 없다. 유지 중인 2.0.2의 복구 대상·절차는 원래 배포 근거를 따른다.

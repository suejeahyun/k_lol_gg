# 실제 자료 비교 및 데이터 부족 진단 2.0.2 운영 근거

현재 상태: **PRODUCTION**. source `131abbf777a331b056a96ab587957cf654387a78`, tag `inhouse-fairness-v2.0.2`.

- 후보 배포: `dpl_ASgW8T5xxQBh97V48pmBRc6LHp6G`, [동일 source·READY](candidate-deployment.json), [HTTP 12조건 PASS](candidate-http.json).
- main 운영 배포: `dpl_HvxXc1nShJhxNndox6HhiU4zfRjq`, immutable [운영 배포](https://k-lol-7siucpmza-tjdmswo11-3715s-projects.vercel.app), canonical [K-LOL.GG](https://k-lol-gg.vercel.app).
- 운영 READY: `2026-10-17T16:24:59.368Z`; [source·alias 확인](production-deployment.json), [운영 HTTP 12조건 PASS](production-http.json), 확인 시각 `2026-10-17T16:25:23.757Z`.
- [source GitHub CI 39049230363](https://github.com/suejeahyun/k_lol_gg/actions/runs/39049230363) success. [CI 단계 근거](source-ci.json): 비밀정보·production 의존성 감사·전체 check·관리자 HTTP 검증 통과.

## 반영 범위

실제 선수 1,000개 고유 참가자 조합과 921,331,808개 고유 배치를 조사했다. 후보 비교는 조정용 500개에서 세 선택 방식으로 수행했고, 후보 탈락 후 나머지 500개는 기존 계산식만 감사했다. SUB_TIE는 전부 동일, SUB_SOFT_1은 28/500(5.6%) 악화하여 채택하지 않았다. 추천 계산식은 `V2_INHOUSE_RELAXED_2026_10_16`을 유지한다.

운영 변경은 표본이 0인 선수를 자료 부족 인원에 포함하는 한 줄의 진단 수정이다. 개인 점수·추천 순위·정책·원본 등록 역할을 바꾸지 않았다. 실제 14개 조합의 140개 배정에서 누락 30건을 정정했으며 이는 고유 선수 수가 아니다. 과거 초안의 저장 점수 JSON은 보존한다.

## 검증과 한계

[전체 보고](README.md), [검사 집계](validation.json), [실제 격리 DB·production build·Chromium 흐름 17항목](browser.json). 전체 check 계약 728·단위 1,159 통과와 기존 독립 DB fixture 1건 제외를 구분한다. 대상 DB 계약 9/9, 입력 순서·팀 색 대칭·실제 유효점수 +0.1 안정성, 전체 탐색 oracle 33/33과 독립 재평가 2,000건도 통과했다.

운영 확인은 읽기 전용 GET이며 참가자·팀·경기·초안·MMR·보정을 생성/수정하지 않았다. 생성·교환·평가·저장 검증은 격리된 합성 자료에서 수행했다. 운영의 인증·소유권 정책을 우회하지 않는다. 스키마 migration이 없고 migration head는 `0049_stable-recruit-codes`다. 시간별 자동 실행·반복 예약을 만들지 않았다.

과거 경기 전 자료 연결은 0건이어서 실제 승패 예측 개선은 검증하지 않았다. 팀 합계 차이 0.51점·원딜 격차 88.65점인 최악 사례와 교환 민감도는 남아 있다. 현재 확보한 자료와 명시된 정책 안에서 기존 추천이 이번에 비교한 후보보다 근거가 충분하다는 결론이며, 실제 경기 결과를 보장하지 않는다.

## 복구

직전 운영 source는 `48e82aef77d0dc69d30d1bbccf34b3938437c85a`, deployment `dpl_BNbgQurdEkcrstoJEdkinsv8Ke8Z`, immutable [직전 배포](https://k-lol-fwynqbv5j-tjdmswo11-3715s-projects.vercel.app)다. 런타임 이상 시 해당 검증 배포로 운영 alias를 복구하고 health·인증 경계를 다시 확인한다. DB migration과 운영 자료 수정이 없어 데이터를 되돌릴 작업은 없다. Git tag는 이동하지 않고 후속 수정 버전으로 기록한다.

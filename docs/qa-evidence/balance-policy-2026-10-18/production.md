# 내전 팀 배치 2.1.0 검증·배포 근거

**운영 반영 완료: inhouse-fairness@2.1.0.** source `6964bb58eefc166d1341b8bdc24e73eb00a93613`, tag `inhouse-fairness-v2.1.0`의 READY·운영 canonical alias·읽기 전용 HTTP 12조건을 확인했다. [K-LOL.GG](https://k-lol-gg.vercel.app)에 드래그·점수 미리보기·이름 표시·두 줄 복사 개선을 반영했다. 추천 계산식은 `V2_INHOUSE_RELAXED_2026_10_16`을 유지한다.

| 운영 근거 | 확인 결과 |
|---|---|
| deployment | `dpl_6B2a4crdWnPW6WctV4GoGP24bH2v` |
| immutable 주소 | [확인한 배포](https://k-lol-nfze3to26-tjdmswo11-3715s-projects.vercel.app) |
| source·READY·alias | [메타데이터](production-deployment.json) |
| health·공개 화면·인증 경계 | [운영 HTTP 12조건 PASS](production-http.json) |
| 확인 시각 | `2026-10-17T20:16:43.205Z` |
| 동일 source CI | [V2 CI 성공](https://github.com/suejeahyun/k_lol_gg/actions/runs/39065911120) · [검사 내역](source-ci.json) |

새 `ANCHORED_PARETO` 추천은 **기각·운영 비활성**이다. 새 500개 실제 선수 조합·462,889,392개 고유 배치에서 보호 지표 개선 129개, 동일 371개, 보호 지표 악화/혼합 0개였고 사전 정의한 유의미한 개선은 24개(4.8%)였다. 그러나 역할 표본 부족과 일부 신규·저표본 집단의 신뢰도 기준을 위반해 채택하지 않았다. 아직 열지 않은 검증·최종 500개는 실험 완료 수에 넣지 않았다. 기존 6개 조합 규칙과 개인 점수 계수는 유지한다.

검증한 배포 후보 source는 `6964bb58eefc166d1341b8bdc24e73eb00a93613`, deployment는 `dpl_4tfwrnK28LTpWYLD1JK9Uxg8jT8Y`다. `--prod --skip-domain`으로 생성하여 운영 canonical alias 연결과 분리했다. [후보 READY·source](candidate-deployment.json), [후보 HTTP 12조건 PASS](candidate-http.json), [비공개 입력 제외 확인](deployment-input.json)을 기록했다. 후보 주소는 [immutable 배포](https://k-lol-an0xjyn24-tjdmswo11-3715s-projects.vercel.app)다.

## 변경 범위

- 카드 드래그로만 자리 교환, 모바일 가장자리 자동 스크롤, 키보드 집기·놓기·취소.
- 교환 직후 공통 도메인으로 선수 적용 점수·팀 점수·밸런스 점수와 안내 갱신. 수동 수정 결과는 자동 추천과 구분.
- 권한이 확인된 초안에서 닉네임 옆에 등록 이름 표시. 복사는 포지션 순서의 `BLUE 이름 5명` / `RED 이름 5명` 두 줄. 이름 누락은 `이름미등록`.
- 카드의 교체 선택 버튼 대신 포지션 적합도와 역할 표본 수 제공.

등록 이름은 기존 초안 소유자·관리자 조회 경계 안에서 읽는다. 공개 선수 DTO를 넓히거나 과거 점수·참가자 스냅샷을 수정하지 않는다. 변경의 근거는 [ADR0016](../../architecture/0016-inhouse-drag-and-name-copy.md)과 [패치 노트](../../patch-notes/inhouse-fairness-v2.1.0.md)에 기록했다.

연구 계산식의 채택 여부는 [연구 보고](README.md)를 따른다. 조합·배치 수, 반복 측정, 합성 브라우저 자료를 구분하며 가상 편성의 실제 승률 개선을 주장하지 않는다.

## 완료한 로컬 검증

[검사 집계](validation.json)와 [실제 브라우저 결과](browser.json)를 보존했다.

| 검증 | 결과 |
|---|---|
| 전체 `npm run check` | 계약 732 PASS, 단위 1,191 PASS·기존 별도 DB fixture 1 SKIP |
| lint·타입·ERD·이미지·production build | 오류 0, 기존 lint 경고 58; ERD 114테이블·175외래키; 모두 PASS |
| 격리 PostgreSQL 팀 도구 계약 | 초안 7 + 점수 2 = 9 PASS |
| production build 실제 Chromium | 생성·드래그·평가·저장·재평가·복사·권한 등 25 PASS |
| 관리자 HTTP 인증 검사 | PASS |
| production 의존성 감사·현재 파일 비밀정보 검사 | 취약점 0·PASS |
| 독립 UI 소스 검토 | 남은 P1/P2 발견 없음 |

브라우저는 1440·390·320px에서 가로 넘침을 확인했고 마우스, 터치, 화면 밖 양 팀 간 자동 스크롤, 키보드 교환을 수행했다. 교환 직후 개인·팀·밸런스 점수가 공통 도메인과 일치했다. 수동 결과의 서버 평가 전 저장 제한, 소유권·동일 출처·revision·멱등성, 재평가 후 과거 점수 보존도 확인했다. [합성 화면](browser-screenshots/cards-390.png)은 실제 서비스의 원본 이름을 포함하지 않는다. 별도 개발 빌드와 중복되는 focused 검사 수는 위 합계에 더하지 않았다.

## 데이터·운영 보호

연구는 기존 권한으로 읽은 익명 고정 스냅샷을 사용했다. `.private`와 `.tmp`는 Git 및 Vercel 업로드에서 제외된다. 브라우저 생성·교환·평가·저장·재평가는 격리 PostgreSQL과 합성 참가자로만 실행한다. 운영 HTTP 검증은 읽기 전용 GET이며 응답 본문·쿠키·인증정보를 보관하지 않는다.

이 작업으로 운영 참가자·팀·경기·초안·개인 MMR·관리자 보정을 생성하거나 변경하지 않는다. migration head는 `0049_stable-recruit-codes`를 유지한다. 시간별 자동 실행·반복 예약은 추가하지 않는다.

## 확인 전 운영 기준

시작 시 운영 source는 `131abbf777a331b056a96ab587957cf654387a78`, tag는 `inhouse-fairness-v2.0.2`였다. [메타데이터](baseline-deployment.json)와 [읽기 전용 HTTP 12조건](baseline-http.json)을 별도 보존했다.

## 배포 후 복구

문제가 발생하면 검증된 이전 source `131abbf777a331b056a96ab587957cf654387a78`의 배포 `dpl_HvxXc1nShJhxNndox6HhiU4zfRjq`로 운영 alias를 되돌린 뒤 source·READY·health와 읽기 전용 경계를 다시 확인한다. 스키마와 저장 이력 형식을 변경하지 않으므로 이 릴리스의 복구에 DB 데이터 삭제나 역방향 migration은 필요하지 않다. 과거 Git tag는 이동하지 않는다.

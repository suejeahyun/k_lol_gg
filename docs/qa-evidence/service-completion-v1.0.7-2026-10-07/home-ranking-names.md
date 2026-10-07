# 홈 랭킹 선수명 — 1.0.7 후속

2026-10-07, 작업 기준 HEAD `0277c327`. AGENTS/PROJECT_RULES, 현재 홈 페이지·랭킹 projection·캐러셀 JSX/CSS와 기존 이름 회귀를 대조했다. 수정 전 로컬 Next 문서 `node_modules/next/dist/docs/01-app/01-getting-started/11-css.md`의 CSS Modules 지침도 다시 확인했다. release registry와 다른 담당자의 외부 연동 변경은 수정하지 않는다.

## 판단과 원인

root가 운영 320px 화면에서 홈 랭킹 선수명 끝이 말줄임표로 잘리는 것을 확인했다. 이 담당자는 공유 브라우저를 조작하거나 운영 데이터를 수정하지 않았다. 실명·운영 Riot ID를 합성 fixture나 외부 서비스로 복사하지 않는다.

홈의 displayName은 통계 projection의 nickname이며, JSX는 전체 표시 이름을 `<strong>`의 텍스트와 title로 이미 제공한다. 따라서 API나 문자열 가공 오류는 아니다. 홈 전용 CSS에서 `.name`과 보조 `.riotId`에 `white-space: nowrap; overflow: hidden; text-overflow: ellipsis`를 함께 적용하여 2·3위의 좁은 카드에서 이름이 시각적으로 잘린다. title은 터치 화면에서 읽을 수 있는 본문을 대신하지 못한다. 처음 방문한 사람이 랭킹 선수를 식별하고 해당 전적으로 이동하는 데 필요한 이름이므로 보완이 타당하다.

1.0.5의 긴 이름 수정 대상은 별도 `/rankings` 페이지 CSS다. 홈은 다른 CSS Module을 사용하므로 이전 수정이 홈에 적용됐다고 간주하지 않았다. 현재 캐러셀의 승률·최다 참여·최다 MVP 단일 슬라이드, 명시 선택·키보드·모션 감소 동작 및 홈 여섯 영역 순서는 이번 수정 대상이 아니다.

## 최소 변경

화면 런타임의 변경 파일은 `src/components/home/home-ranking-carousel.module.css` 하나다. 아래의 격리 capture 시드 후속 변경은 운영 화면 구현과 분리한다.

- 선수명만 정상 줄바꿈 및 `overflow-wrap: anywhere`로 표시한다. 글자 수 축약·2줄 clamp는 사용하지 않는다.
- 두 줄에 해당하는 최소 공간을 예약하여 짧은 이름과 두 줄 이름의 카드 높이를 안정시킨다. 이름이 더 길면 필요한 줄을 허용한다.
- 모바일 2·3위 카드는 같은 행 높이로 늘리고 이름 공간이 남는 높이를 채워 하단 수치 정렬을 유지한다. 1위의 기존 가로 카드와 왼쪽 이름 정렬은 보존한다.
- 보조 Riot ID는 기존 말줄임을 유지한다. 색·이미지·폰트 크기·카드 배치·조작 UI와 접근성 속성은 바꾸지 않는다.

## 검증과 미확인

root 지시에 따라 CSS 문자열 자체를 검사하는 테스트는 추가하지 않았다. 기존 `tests/home-ranking-carousel.test.mjs`의 실제 컴포넌트 조작 회귀는 유지했고 DOM/JSX를 변경하지 않았다. build와 테스트 실행은 root 통합 단계에서 수행한다. 이 담당자는 CSS 소스 반영을 실제 레이아웃 통과나 배포 완료로 보고하지 않는다.

root 최종 브라우저에서 320px·390px·PC 화면으로 일반 한 줄/두 줄 이름, 각 랭킹 이동, 2·3위 카드와 수치의 정렬, 가로 넘침 및 1위 이름을 확인해야 한다. 신규 닉네임 입력의 실제 도메인 상한은 `players/domain/admin-player.ts`와 `accounts/domain/account-contracts.ts`에서16자다. 격리 화면에 합성 `WWWWWWWWWWWWWWWW` 및 `가나다라마바사아자차카타파하가나`를 사용할 수 있다. 이 극단 사례는 두 줄을 넘어도 잘리지 않아야 한다. DB의64자 컬럼은 과거 호환 저장 범위이므로 현재 신규 입력의 상한으로 혼동하지 않는다.

실기기·실제 터치·최종 폰트 로딩 후 높이·합성 최대 길이 fixture 렌더는 아직 이 담당자가 검증하지 않았다. root의 수정 후 실제 geometry/screenshot 근거를 이 문서와 연결한다.

## 홈 최대 길이용 격리 시드 확장

기존 `prepareRankingCaptureFixture`는 별도의 ENDED 시즌에 합성 선수2명의 표시용 통계를 만든다. 홈은 `getPublicSeasonRanking(null, 10)`에서 ACTIVE 시즌을 우선 선택하므로 별도 시즌의 긴 이름만으로는 홈 카드가 검증되지 않는다. 기존 시드의 반환값·ENDED 시즌·2명 통계는 유지하고, 같은 합성2명과 추가16자 혼합 이름 `WW가나WW다라WW마바WW사아`의 표시용 통계를 현재 ACTIVE 시즌에도 추가했다. 의도적으로 같은 합성 선수가 두 시즌에 등장하며 실제 시즌 기록을 흉내낸 데이터로 보고하지 않는다.

시드는 원래의 browser hold 조건 및 `assertSafeTestDatabase`의 loopback/`klol_v2_test_` 접두사 가드를 그대로 거친다. 기존 ACTIVE READY projection이 있으면 generation/계산 메타데이터를 유지한다. 계약 검사 뒤 browser fixture가 새 ACTIVE 시즌을 만든 경우 projection 행 자체가 없으므로 표시용 READY generation 1 행만 추가한다. 기존 EMPTY 등 READY가 아닌 projection을 교체하지 않고 해당 경우에는 transaction을 중단한다. 미래 상태를 위한 옵션·시즌 활성화·기존 projection 갱신은 추가하지 않았다. 기존 ACTIVE 시즌 및 통계 행은 덮어쓰지 않는다.

현재 ACTIVE generation의 최대 참여·MVP를 한 번 집계한다. `max(최대 참여, 최대 MVP, 10) + 3`부터 내림차순3명에게 totalGames/participationCount/wins/mvpCount를 같은 값으로 넣고 losses는0으로 둔다. 따라서 최소 참여10, 승+패=전체게임, MVP≤전체게임, 참여≤전체게임을 유지하면서 승률·참여·MVP의 top3가 모두 합성 긴 이름이 된다. 기존 공개 정렬 규칙이나 운영 집계 코드는 변경하지 않는다.

실행 위치는 `run-data-contracts.ts`의 fresh/upgrade 계약 검사가 끝난 뒤 `runSeasonBrowserQaServer`의 기존 `V2_SERVICE_BROWSER_QA` capture 시점이다. 운영 DB나 경기 원장을 수정하지 않았으며, 이 표시용 projection으로 경기 집계의 정확성을 검증했다고 기록해서는 안 된다. 화면 캡처 fixture 전용이며 업무 UI가 기록을 재집계하면 이 임시 표시 순위는 유지 대상이 아니다.

변경 시드 파일 ESLint exit0, scoped `git diff --check` 공백 오류 없음. 이 담당자는 별도 서버·DB를 실행하지 않았다. 실제 fixture 적용과 홈의3종 top3 노출은 root의 최종 격리 DB/브라우저 실행에서 확인해야 한다.

## 첫 capture 준비 실패와 QA 하니스 보완

root의 첫 실제 실행은 DB 계약 검사를 통과한 뒤 browser capture 준비에서 exit 1로 끝났고, pool의 미처리 `57P01` 오류가 출력됐다. 최초 seed 예외는 이 출력에 가려져 직접 확인되지 않았으므로 특정 assertion이 최초 원인이었다고 단정하지 않는다. root가 정리한 `database-contracts-first.log`를 그대로 유지하며, 자격 증명 포함 가능성이 있는 private raw 로그는 문서에 복사하지 않았다.

소스 조사에서는 서로 연결되는 두 가지 QA 결함을 확인했다. 계약 종료 시 기존 ACTIVE 시즌이 끝나면 browser fixture는 projection 없는 ACTIVE 시즌을 새로 생성한다. 따라서 최초 capture 시드에 추가했던 READY 필수 assertion은 실제 준비 순서와 맞지 않았다. 또 `runSeasonBrowserQaServer`는 pool 생성 뒤 계정/시드 준비를 child 정리용 try 밖에서 수행하여, 준비가 실패하면 pool을 닫지 않은 채 바깥 cluster 종료로 넘어갈 수 있었다.

`run-data-contracts.ts`에서 pool 생성 이후 전체 준비·child 실행을 바깥 try/finally로 감싸 seed 예외도 원래대로 전파하면서 pool을 닫게 했다. 기존 child 종료·에러 처리는 유지했다. capture 시드는 위에서 설명한 대로 projection 행 부재에만 표시용 READY 행을 추가한다. 이는 QA 준비 수정이며 제품·API·인증·경기 집계 계약을 변경하지 않는다.

`tests/browser-qa-seed-lifecycle.test.ts`는 실제 `runSeasonBrowserQaServer` 함수와 실제 capture 함수를 격리 실행한다. pool/transaction을 대체하되 capture 입력은 실제 도메인 parser, schema와 DB 안전 가드를 사용한다. 서버나 DB는 실행하지 않는다.

- 수정 전 `capture-seed-before.log`: 2 FAIL, 1 PASS. 준비 실패 시 pool이 닫히지 않는 문제와 projection 없는 ACTIVE 시드 실패를 재현했다.
- 수정 후 `capture-seed-after.log`: 3 PASS. 비밀번호 준비/첫 seed query 예외의 동일 객체 전파·pool 종료 1회, 누락 projection 생성, 기존 READY generation 보존, ENDED 2명 통계 보존, ACTIVE 표시 수치 일관성, 원격 DB 주소 쓰기 전 차단을 확인했다.
- 변경 QA 파일 ESLint exit 0, `npx tsc --noEmit --incremental false` exit 0, scoped diff 공백 검사 통과.

이 결과는 실제 함수의 격리 회귀다. 실제 PostgreSQL 재실행, 준비 서버 유지, 최종 홈 DOM/geometry 및 320px·390px 캡처는 root의 후속 실행 결과로 따로 확인해야 한다.

## 통합 담당의 최종 실제 검증

후속 격리 PostgreSQL 재실행은 계약·capture 준비 모두 통과했고, 준비된 최적화 서버에서108페이지179HTTP조건이 통과했다. 검증 종료 후 cluster 정지·임시 경로 삭제·하니스 exit0을 확인했다. 근거는 [DB 로그](v107-browser-final-retry-database.log)와 [HTTP 결과](page-http-final.json)다.

[실제 DOM 측정](home-names-after.json)은 폰트 로딩 후320/390/768/1280px 각각에서 세 종류의16자 이름 전체 표시, 가로 넘침 없음, 이름/수치 겹침 없음, 모바일2·3위 카드 하단/수치 정렬을 확인했다. [320px 캡처](home-names-after-320.png)도 직접 확인했다. 이는 승률 슬라이드의 실제 로컬 렌더이며, 막힌 native confirm 때문에 최다 참여/MVP 슬라이드의 실제 클릭 전환까지 확인한 것으로 보고하지 않는다. 실제 모바일 기기는 사용하지 않았다. 운영 후속 결과는 [배포 근거](production.md)에 기록한다.

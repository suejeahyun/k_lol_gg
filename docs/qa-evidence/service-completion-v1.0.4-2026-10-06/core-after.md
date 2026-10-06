# 공개 핵심 과업 문구 정리 결과

2026-10-06 KST. [수정 전 전체 분석](core-analysis.md)의 순서대로 홈 → 참가 신청 → 파티 모집 → 대회 종류·목록 → 이벤트 상세 → 멸망전 상세를 수정했다. 원본 8개 페이지 중 목록 wrapper 2개는 구현을 공유하므로 본문 변경은 `competition-list-views.tsx`에 반영했다. commit·build·전체 check·배포는 이 담당자가 실행하지 않았다.

## 반영 내용

| 범위 | 정리한 내용 | 보존한 과업 정보 |
| --- | --- | --- |
| 홈 | 반복 소개, 과업 카드 설명, 영문 장식, 챔피언 응원 문장 제거. 공개 수치를 직접 label로 표시 | 여섯 영역 순서, 참가/검색/기록 링크, 생성 챔피언 이미지와 비공식 팬아트 alt, 배경·아이콘, 실제 피드·갤러리 콘텐츠, 계정 상태, 활성 플레이어·확정 경기·시즌 수 |
| 단일 랭킹 | 종류별 반복 설명 제거, 시즌명·참여 기준·순위를 직접 표시 | 승률/최다 참여/최다 MVP 선택, 값·단위, 단일 슬라이드, 이전/다음·키보드·사용자 시작 자동 재생·정지, 모션 감소 |
| 참가 신청 | 제목을 `참가 신청`으로 변경. 소개·반복 문장 제거, 정원·검토·포지션·개인정보 표시를 간결화 | 회차·날짜·신청 문맥, 본 참가/예비/정원, 계정/플레이어 조건, 저장·취소·재신청, 동시 변경 복구, 연결 대기 인원·200명 제한·공개 항목 |
| 카카오 신청 연결 | 긴 연결 설명을 신규 신청 문맥의 `카카오 신청 회원 연결 문의` 링크로 교체 | `/help/contact`에 실제 복구 경로 제공. 기존에 카카오로 접수한 사람이 사이트에서 보이지 않는 경우의 문의 행동을 제거하지 않음 |
| 파티 모집 | 제목을 `파티 모집`, 목록을 `현재 모집`으로 구분. 소개·장식 제거 | 정원·예비·참가자·시간·게임·주최자, 실제 모집 내용, 오류/빈 상태·재시도, 기존 스크림의 신규 참가 종료 |
| 모집 명령 복사 | `카카오 명단 조회 명령 복사`로 실제 행동 표시, 외부 참가 단계를 간결화 | `구인상세 N`, 복사 완료와 참가 미완료 구분, 직접 입력 복구, 최신 전체 명단/이름/전송/봇 저장 완료 확인, 방 찾기·취소 도움말 |
| 대회 진입·목록 | `대회`/`이벤트전` 명칭, 반복 기능 소개·영문 장식·기본 환영 문장 제거 | 대회 종류·검색·필터·초기화·페이지·상태·마감·참가 수, 작성된 이벤트 설명, query/redirect 계약 |
| 이벤트 상세 | 장식·기본 축하·중복 heading 제거, 포지션을 한국어 label로 표시 | 등록 설명·갤러리, 우승 팀/MVP, 일정·진행 단계·팀·대진, 신청/수정/취소, 포지션 API 값·로그인 복귀·deep-link 포커스·revision/멱등성 |
| 멸망전 | 중복 단계 안내·장식·축하·갱신 주기 설명 제거. 상태와 필수 계산 기준을 짧은 label·수식으로 정리 | 일정·모집·팀/경매·예선/본선·점수·투표·갤러리, 실제 데이터, 조회 실패·오프라인·재시도, 자기보고/자료 대기/0점 차이, 평가·정렬·최소 포인트 기준. 완료·취소 상태는 투표 종료로 표시 |

`/help/recruits`, 공통 shell/navigation/StatusPanel, global CSS, 관리자 화면은 이 담당자가 수정하지 않았다. 원래 데이터·도메인·API·DB 정책은 바꾸지 않았다.

## 확인된 재시도 오류 수정

`applications/error.tsx`는 `reset`만 실행해 서버 조회를 다시 요청하지 않았다. 설치된 Next.js 16.3.8의 `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/error.md`는 `retry`가 re-fetch와 re-render, `reset`은 재조회 없는 오류 상태 초기화임을 명시한다. root가 작성한 실제 `ErrorBoundaryHandler` 실행 회귀에 맞춰 `retry` prop을 사용한다.

오류 경계만 보고 “입력 내용은 전송되지 않았습니다”라고 단정할 수 없어 해당 문장도 삭제했다. 실패 제목과 재시도 버튼은 유지한다. 관리자 경계 수정과 테스트 작성은 다른 담당자 범위다.

## 실제 검증 결과

- [core-focused.log](core-focused.log): 36개 통과. 실제 신청 페이지 문맥/렌더, 랭킹 선택·키보드·재생, 검색 취소, 현재 메뉴, 실제 Next 재시도, 공개 DTO/권한/UI 계약을 실행했다.
- [core-contracts.log](core-contracts.log): 38개 통과. 이벤트 신청·취소·재신청·권한/멱등성, deep link, 멸망전 모집·경매·순위·점수·일정, 홈 공개 피드/챔피언 선택을 검증했다.
- [core-result-hierarchy.log](core-result-hierarchy.log): 3개 통과. 공통 챔피언 이미지·계정 연결·우승 데이터/결과 계층 계약이다.
- `npx tsc --noEmit --incremental false`: exit 0. [core-typecheck.log](core-typecheck.log)는 오류 출력이 없어 비어 있다.
- 최종 변경 파일 21개의 focused ESLint: exit 0. [core-lint.log](core-lint.log)는 오류·경고 출력이 없어 비어 있다.

실행 회귀에는 2가지 확인을 추가했다. 실제 신청 폼 렌더에서 카카오 회원 연결 문의 목적지와 신청 입력이 함께 남는지, 실제 이벤트 폼의 한국어 포지션 표시가 API의 `TOP/JGL/MID/ADC/SUP` option·checkbox 값을 보존하는지 확인한다.

## 과거 문구 검사와 새 요청의 차이

첫 focused 실행은 28개 중 27개 통과했고, `여성 챔피언 팬아트`라는 화면 보조 문장 존재 검사만 새 요구와 충돌했다. 해당 assertion을 이미지 자체의 `championPresentation.localImageAlt` 보존으로 바꿨다. 여성 챔피언 선택·로컬 생성 이미지·일일 선택·비공식 팬아트 도메인 조건은 그대로 검사한다.

다른 담당자 검사에서 발견한 `EVENT CHAMPION`/`DESTRUCTION CHAMPION` 장식 문자열 기대는 실제 최종 결과 section의 접근성 이름과 우승 팀 데이터 heading으로 교체했다. 카카오 연결 설명 문장 기대는 실제 문의 링크 계약으로 교체했다. 기능 오류를 숨기기 위한 기대값 변경이 아니라 사용자가 제거한 보조 문구와 기능 의미를 분리한 변경이다.

## 변경 파일

제품 17개:

- `src/app/(public)/(home)/page.tsx`
- `src/components/home/home-ranking-carousel.tsx`
- `src/app/(public)/(applications)/applications/page.tsx`
- `src/app/(public)/(applications)/applications/application-actions.tsx`
- `src/app/(public)/(applications)/applications/error.tsx`
- `src/components/navigation/recruiting-competitions.tsx`
- `src/components/navigation/recruit-instructions.tsx`
- `src/app/(public)/(recruiting)/recruits/page.tsx`
- `src/app/(public)/(competitions)/competitions/page.tsx`
- `src/app/(public)/(competitions)/competitions/competition-list-views.tsx`
- `src/app/(public)/(competitions)/competitions/events/[eventId]/page.tsx`
- `src/app/(public)/(competitions)/competitions/events/[eventId]/event-application-actions.tsx`
- `src/app/(public)/(competitions)/competitions/destruction/[tournamentId]/page.tsx`
- `src/app/(public)/(competitions)/competitions/destruction/[tournamentId]/destruction-owner-actions.tsx`
- `src/components/competitions/destruction/public-progress.tsx`
- `src/components/competitions/destruction/score-table.tsx`
- `src/components/competitions/destruction/live-status.tsx`

기존 테스트 4개: `tests/application-navigation.test.mjs`, `tests/home-current-state.test.mjs`, `tests/season-kakao-pending-http-ui.test.mjs`, `tests/account-activity-champion-ui.test.mjs`.

실제 브라우저에서 짧아진 문구의 여백·줄바꿈·버튼 식별·키보드 조작, 통합 필수 검사, 운영 배포와 사후 확인은 root의 릴리스 기록에 연결한다. 이 단계의 source/컴포넌트 검증을 실기기나 운영 완료로 표시하지 않는다.

## 통합 재검토 보완

root는 신청 오류 화면을 실제 공개 layout과 조합해 `main` 2개를 먼저 재현한 뒤 오류 화면 바깥 태그를 `div`로 교정했다. [application-landmark-after.log](application-landmark-after.log)의 404·권한 경계·오류 본문·실제 Next 재요청 8개 검증이 통과했다. 공통 화면과 관리자 변경의 읽기 전용 독립 검토는 [core-cross-review.md](core-cross-review.md)에 기록했다. 이 후속 교정은 root가 담당했으며 이 문서 작성 단계에서는 제품 소스를 추가 수정하지 않았다.

## 최종 실제 화면 피드백 반영

root의 실제 화면 재검토에서 2개 후속 항목을 확인해 최소 수정했다.

- 신청 폼은 정상 초기 상태에도 다른 탭의 수정과 새로고침을 설명하는 문장을 표시하고 있었다. 이 상시 문장과 단독 사용 CSS `.revision`을 제거했다. API 실패 `detail`/`title`을 표시하는 실제 오류 처리, 412의 최신 데이터 재조회 안내, 입력 검증·정원·검토 완료·개인정보 표시는 유지한다. 홈·신청·모집·대회와 해당 공개 지원 컴포넌트의 유사 fallback 문구를 재검토했고, 나머지는 상태·입력 제약·집계 기준·실제 오류 복구 또는 사용자가 펼치는 외부 참가 절차여서 유지했다.
- 멸망전 목록의 방식 8개가 4개 이름으로 중복 표시됐다. 실제 차이는 팀 수가 아닌 BO1/BO3였다. 이미 존재하는 `competitionPreliminaryFormatLabel`을 목록 filter와 card에서 재사용해 ‘전체 풀리그 · 단판’과 ‘전체 풀리그 · 3판 2선승’처럼 구별한다. API query 값·도메인 format·상세의 기존 방식/BO 표시·집계는 변경하지 않았다.

`tests/application-navigation.test.mjs`에서 실제 목록 JSX를 8개 방식으로 각각 렌더하는 회귀를 추가했다. [수정 전 로그](core-final-formats-before.log)는 서로 다른 label 수가 4개여서 8개 기대에 실패한다. 수정 후에는 8개 이름의 구별, canonical option value, 선택 상태, repository query와 다음 페이지의 format/q/status 보존 및 card 표시를 확인한다. [관련 실행 27 PASS](core-final-targeted-after.log)는 이 회귀와 기존 회차·카카오 연결·랭킹 조작·대회 경계·실제 Next 재시도를 포함한다. 새 문자열 기대만으로 기능을 통과시키지 않았다.

후속 source는 `application-actions.tsx`, `applications.module.css`, `competition-list-views.tsx`이며 기존 테스트 1개를 확장했다. 이 단계에서 전체 check/build/commit/deploy를 실행하지 않았다. 최종 bundle 및 실제 화면 재확인은 root 통합 절차에 연결한다.

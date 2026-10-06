# 공개 핵심 과업 전체 분석 — 수정 전

2026-10-06 KST. 기준 HEAD `f4ab0647`. 이 단계는 읽기 전용이며 제품 소스 수정, 테스트 실행, 운영 데이터 변경을 하지 않았다. `AGENTS.md`, `PROJECT_RULES.md`, 카카오 호환/엄격 경계 계약, 기능 목록을 읽고 실제 페이지와 관련 컴포넌트를 기준으로 작성했다. 전체 사이트 인벤토리 통합이 끝난 뒤 아래 순서로 검토·수정한다.

이번 문구 정리의 적용 기준은 선택적 소개·반복 사용 설명·장식 문구 제거다. 필수 label, 상태, 입력 제약, 집계 의미, 법적 고지, 작성자가 등록한 실제 콘텐츠는 유지한다. 새 기능·API·도메인 정책은 추가하지 않는다. 홈 여섯 영역 순서, 랭킹 단일 캐러셀, 생성 이미지 아이콘과 배경·챔피언 테마는 보존한다.

## 정확한 8개 페이지 원본

| 순서 | 실제 주소 | 페이지 원본 |
| --- | --- | --- |
| 1 | `/` | `src/app/(public)/(home)/page.tsx` |
| 2 | `/applications` | `src/app/(public)/(applications)/applications/page.tsx` |
| 3 | `/recruits` | `src/app/(public)/(recruiting)/recruits/page.tsx` |
| 4 | `/competitions` | `src/app/(public)/(competitions)/competitions/page.tsx` |
| 5 | `/competitions/events` | `src/app/(public)/(competitions)/competitions/events/page.tsx` |
| 6 | `/competitions/destruction` | `src/app/(public)/(competitions)/competitions/destruction/page.tsx` |
| 7 | `/competitions/events/[eventId]` | `src/app/(public)/(competitions)/competitions/events/[eventId]/page.tsx` |
| 8 | `/competitions/destruction/[tournamentId]` | `src/app/(public)/(competitions)/competitions/destruction/[tournamentId]/page.tsx` |

홈 실제 주소는 `/`다. 5·6번은 `competition-list-views.tsx`의 별도 목록 구현을 export한다. `/help/recruits`는 모집 과업의 외부 단계와 도움말 의존성을 확인하기 위해 추가로 읽었으며 위 8개 핵심 화면과 구분한다.

## 기능·조작 순서와 문구 분류

### 1. 홈

조작: 오늘 내전 참가 / 파티 찾기 → 플레이어 검색 → 랭킹 종류 선택·이전/다음·재생/정지·선수 전적 → 네 가지 과업 카드 → 최근 경기·모집·대회·우승 사진 → 로그인/가입 또는 내 계정·플레이어·신청·제출·저장 팀 → 현재 시즌 → 공개 기록.

화면 순서는 ① 우리 같이 롤하자 ② 랭킹 ③ 무엇을 하러 왔나요? ④ 지금 올라온 소식 ⑤ 내 활동 이어보기 ⑥ 지금 볼 수 있는 기록을 그대로 유지한다.

- 제거 후보: “같이할 사람을 찾고, 팀을 나누고, 오늘의 기록을 남겨요”, 과업 카드 description 4개, “자주 쓰는 기능을 한 번에…”, “최근 경기와 커뮤니티 소식을…”, “함께한 플레이어와 확정된 경기 기록을…”, 영문 장식 소제목, 챔피언 응원 문장, 로그인으로 무엇을 이어볼 수 있는지 반복하는 소개, 데이터가 생기면 보인다는 반복 문장.
- 필수: 각 목적지의 이름, 검색 label·검색어 범위, 현재 계정 상태, 공개 통계의 활성 플레이어/확정 경기 의미, 시즌과 종료 상태, 조회 오류/사용 불가/빈 목록 구분, 링크 복구, 이미지 alt.
- 압축 후보: HomeDataState의 긴 집계 설명은 숫자별 직접 label로 바꾸면 활성·확정 의미를 유지할 수 있다. 계정 상태를 문장 대신 직접 상태로 표시할 수 있다.
- 랭킹 제거 후보: “승률이 높은 순”처럼 제목을 반복하는 설명. 최소 참여 횟수, 시즌, 값·단위는 유지한다. 세 선택 버튼·키보드·사용자 시작 자동 넘김·모션 감소는 그대로 둔다.
- 실제 콘텐츠: 최근 경기 제목·스코어, 모집 요약, 대회 상태, 우승 갤러리 제목·등록 설명은 정적 보조 문구와 구분한다.

### 2. 참가 신청 허브

조작: 오늘 내전/이벤트전/멸망전/파티 탭 → 모집 회차 → 본 참가·예비 선택 → 협곡 주/부 포지션 → 신청/수정/취소/재신청 → 내 상태와 공개 명단. 이벤트·멸망전 탭은 모집 중 대회에서 `?action=apply`로 해당 신청 영역에 이동한다.

- 제거 후보: “신청 종류를 고르고 현재 모집과 내 신청 상태를…”, “새 시즌이 열리면…”, “첫 신청을 기다리고 있어요”, 취소 완료 문장의 “이력은 안전하게 보관됩니다”, 대회를 고르면 신청 영역으로 이동한다는 설명.
- 제목 후보: “오늘 같이 뛰어요” → “참가 신청”. 카카오 유입 표시는 흐름의 출처이므로 장식 문구와 구분한다.
- 필수: 모집 중/마감, 선택 회차·날짜, 본 참가/예비/정원/확정 수, 승인·로그인·활성 플레이어 연결, 주라인 필수/부라인 복수 선택 의미, 정원 마감 시 예비 선택, 검토 후 수정 제한, 다른 탭 변경 시 복구, 저장·취소 결과, 조회 실패와 회차 보존 재조회.
- 집계·개인정보: 회원 연결 대기 인원도 포함됨, 공개 명단 200명 제한, 닉네임·Riot ID·선택 라인 공개 항목은 유지한다.
- 의존성: 시즌·날짜·회차별 `ApplicationActions` key, POST/DELETE `/api/applications/season`, revision과 멱등성, 로그인 복귀, source 쿼리 보존. 문구 정리에서 변경하지 않는다.

### 3. 파티 모집

조작: 현재 파티·정원·예정 시간·게임·주최자·참가자 확인 → 카카오 명단 조회 명령 복사 → 카카오의 최신 명단에서 참가 → 도움말/모집방 찾기. 기존 스크림은 저장 기록 조회와 내전 신청 연결이다.

- 제거 후보: “카카오톡 봇과 사이트에서 등록된…”, “새 모집이 등록되면…”, 제목에 이미 있는 기존 스크림 반복 소개.
- 제목 후보: “오늘 같이 플레이해요” → “파티 모집”. “참가 명령 복사”는 실제로 `구인상세 N`을 복사하므로 “카카오 명단 조회 명령 복사”처럼 실제 행동을 표시한다.
- 필수: 참가 가능/정원 마감/남은 자리, 예비, 누락 정보의 모집방 확인, 빈 목록·오류·재시도, 복사 성공/실패와 직접 입력 복구. 명령 복사만으로 참가 완료가 아니라는 결과는 유지한다.
- 제거 위험: 최신 전체 명단 → 이름 입력 → 전송 → 봇의 저장 결과 확인은 이 과업의 실제 외부 단계다. 필요한 최소 단계나 명시적 도움말 경로가 없으면 처음 방문자가 참가를 끝낼 수 없다.
- 기존 스크림: 신규 참여가 종료된 기능을 현재 모집으로 오해하지 않도록 직접 상태나 이름을 남긴다.
- 도움말 의존성: `/help/recruits`에는 방 찾기, 새 모집 생성, 최신 명단 편집, 취소·마감, 저장 불확실 시 재조회, 개인정보 공개 범위가 있다. 도움말 자체를 보조 장식으로 일괄 제거하지 않는다. 카카오 명령 원문·정확 응답·oracle fixture는 이 화면 정리 범위가 아니다.

### 4. 대회 종류 진입

조작: 이벤트전 또는 멸망전 선택. 과거 `type` 쿼리 주소는 각 목록으로 redirect하며 검색·상태·방식·페이지 조건을 전달한다.

- 제거 후보: 종류별 운영 흐름 소개, 각 카드의 기능 나열 설명, EVENT/DESTRUCTION 장식.
- 제목 후보: “대회 종류를 선택해 주세요.” → “대회”.
- 필수: 두 종류의 구분·명칭과 목적지. 허용하지 않는 주소 처리와 기존 redirect 조건은 보존한다.

### 5~6. 이벤트전·멸망전 목록

조작: 종류 전환 → 이름 검색 → 상태·방식 필터 → 찾기/초기화 → 대회 상세 → 이전/다음 페이지. 잘못된 주소, 조회 불가, 조건에 맞는 대회 없음은 서로 다른 상태다.

- 제거 후보: hero의 기능 소개, “즐거운 이벤트 대회가 준비되고 있어요” 기본 문구, “N개 팀의 멸망전이 진행 중이에요” 같은 중복 상태 서술.
- 필수: 검색/상태/방식 label, 초기화, 페이지와 전체 페이지 수, 대회 상태·형식·모집 마감·참가자 수, 조회 실패와 전체 목록 복구.
- 실제 콘텐츠: 운영자가 입력한 `event.description`은 소개 template과 별개다.
- 명칭 후보: 메뉴의 “이벤트전”과 목록/상세의 “이벤트 대회”를 통일한다.
- 의존성: canonical query parser, 필터 context key, pagination 조건 유지, pageSize와 상태 enum. 문구 삭제가 쿼리/폼 name 변경으로 번지지 않게 한다.

### 7. 이벤트전 상세와 참가 신청

조작: 목록 복귀 → 상태·일정·참가 인원·결과 → 승인 계정으로 주/부 포지션 선택 → 신청/수정/취소 → 팀·대진·점수 → 우승/MVP → 갤러리.

- 제거 후보: “즐거운 이벤트전입니다” 기본 설명, “참가한 모든 선수에게 박수를 보내요” 기본 축하, 영문 장식, 신청 영역의 중복 heading.
- 필수: 등록된 대회·갤러리 콘텐츠, 모집·취소 상태, 신청 권한/기간, 칼바람의 포지션 없음, 저장 결과, 412 동시 변경 후 재확인, 오류와 복구.
- label 후보: 신청의 TOP/JGL/MID/ADC/SUP는 기존 `competitionPositionLabel`을 재사용해 한국어로 보여줄 수 있다. 저장 enum은 유지한다.
- 의존성: `?action=apply` 자동 스크롤/포커스, 로그인 후 복귀, 동일 요청 멱등성, revision, 신청 취소, 레거시 ID canonical redirect, 목록 복귀 조건.

### 8. 멸망전 전체 과업

조작 순서: 상태·진행 단계 → 일정 → 포지션별/전체 모집 → 신청/일반 선수·주장 지원 → 칼바람 누적 승패 → 경매 카드·팀 포인트 → 예선 순위·본선 대진 → MVP 투표/재투표 → 점수표/주장 포인트/참가 선수/갤러리/MVP 탭 → 선수 상세/이미지 확대·닫기 → 실패 시 요청 결과 확인 또는 재조회.

- 제거 후보: hero 소개, 제목과 버튼이 이미 표현하는 단계별 안내, “우승을 축하합니다”, 정상 연결 상태의 확인 주기 설명, 낙찰 확정 뒤 포인트 반영을 반복하는 문장.
- 필수 상태: 현재 단계·취소·모집 종료·참가 확정·변경 가능 기간, 실제 신청 상태·역할, 오프라인·갱신 실패·이전 확인 내용, 최근 확인 시각, 처리 중·응답 불확실·동일 요청 확인 버튼.
- 필수 입력 의미: 주장 지원은 즉시 주장 확정이 아님, 해당 계정/모드의 누적 승수·패수, 0판과 미입력 차이, 확정 후 평가 고정, 투표할 경기·후보·가능한 경기 없음.
- 필수 집계 의미: 확정 경기 집계, 승점/승수/패수/동률 순서, 조별/전체 진출 기준, 세트 득실 의미, 경매 포인트 공식과 최소값, 공식 Riot 티어/MMR이 아닌 임시 등급, 표본 부족, 판수/300×100점 및 상한·승률 미반영, 자기보고/운영자 보완 출처, 조회 오류/자료 대기.
- 점수표의 긴 문장을 무조건 삭제하면 실제 숫자의 의미를 잃는다. caption·항목 label·기준 표로 압축할 수 있는 부분과 반드시 남는 기준을 나누어 검토한다.
- 실제 콘텐츠: 갤러리 등록 설명, 팀/선수명, 경기·MVP 결과는 유지한다.
- 의존성: public DTO, revision polling·숨김 탭/오프라인·타임아웃, mutation hook의 미확정 요청 동일 재시도, GET/PATCH와 실제 투표/신청 권한, query tab/player/image parse, 포커스와 dialog 닫기, 모션 감소.

## 함께 읽은 구현 파일

8개 페이지 외의 연결 구현은 다음과 같다. 아래 경로는 저장소 root 기준이다.

- `src/components/home/home-ranking-carousel.tsx`
- `src/components/home/home-guide-art.tsx`
- `src/app/(public)/(applications)/applications/application-actions.tsx`
- `src/app/(public)/(applications)/applications/loading.tsx`
- `src/app/(public)/(applications)/applications/error.tsx`
- `src/components/navigation/recruiting-competitions.tsx`
- `src/components/navigation/recruit-instructions.tsx`
- `src/app/(public)/(recruiting)/help/recruits/page.tsx`
- `src/app/(public)/(competitions)/competitions/competition-list-views.tsx`
- `src/app/(public)/(competitions)/competitions/events/[eventId]/event-application-actions.tsx`
- `src/app/(public)/(competitions)/competitions/destruction/[tournamentId]/destruction-owner-actions.tsx`
- `src/components/competitions/destruction/public-progress.tsx`
- `src/components/competitions/destruction/score-table.tsx`
- `src/components/competitions/destruction/live-status.tsx`
- `src/components/competitions/destruction/auction-reveal.tsx`
- `src/components/competitions/destruction/use-destruction-mutation.ts`
- `src/modules/home/domain/home-snapshot.ts`
- `src/modules/statistics/domain/public-ranking-view.ts`
- `src/modules/competitions/public-navigation.ts`
- `src/modules/competitions/destruction/workflow.ts`

공통 shell/navigation/StatusPanel은 별도 담당자의 전체 기능 분석과 통합한다. 이 문서를 전체 서비스 인벤토리 완료나 실제 운영 기능 통과의 근거로 사용하지 않는다.

## 수정 후 검증에 연결할 항목

문구가 사라졌다는 정적 검사만으로 완료 판단하지 않는다. 기존 실행 회귀에서 행동 이름·입력 의미·상태·복구 경로가 남는지 확인한다.

- `home-current-state.test.mjs`, `home-ranking-carousel.test.mjs`: 여섯 영역 순서, 단일 랭킹, 선택·키보드·재생/정지.
- `application-navigation.test.mjs`, `first-visit-interactions.test.mjs`: 신청/회차/포지션/검색 상태 의미 보존.
- `recruits-matches-competitions-ui.test.mjs`, `competition-navigation.test.ts`: 모집·대회 진입 및 조건 보존.
- `competition-events.test.ts`, `destruction-ui-contract.test.mjs`, `destruction-workflow.test.ts`, `destruction-self-reported-rating.test.ts`: 신청·투표·실패 복구와 점수 의미 보존. 도메인 기대값을 문구 정리에 맞춰 바꾸지 않는다.
- CUA: 짧아진 설명으로 생기는 빈 여백·잘림, 모바일/PC 버튼 식별, 키보드 label/포커스, 최초 방문의 다음 행동을 확인한다.

검증 결과는 이후 실제 실행 시 별도로 추가한다. 현재 문서는 분석과 후보 분류를 완료한 상태다.

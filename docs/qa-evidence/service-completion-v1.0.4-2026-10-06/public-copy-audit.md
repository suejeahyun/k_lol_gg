# 공개 기능 문구 조사 — 수정 전

기준: `f4ab0647` 이후 현재 소스, 2026-10-06. 이 문서는 소스 문구와 실제 호출부 조사 결과이며 브라우저 동작·운영 배포 검증을 통과했다는 뜻은 아니다. 이 조사 단계에서는 제품 코드를 수정하지 않았다.

## 적용 기준

- 제거: 제목·버튼·입력으로 이미 알 수 있는 소개, 조작을 되풀이하는 안내, 영문 장식 문구, 구현 방식을 설명하는 문구.
- 유지: 필드명, 상태/진행률, 실패와 복구 행동, 권한/승인 조건, 실제 게시물 내용, 정책/동의, 입력 제약, 통계의 분모·산식·누락값·갱신 시점. 필요한 정보는 의미를 유지하면서 짧게 정리한다.
- 안내 페이지의 설치 절차·명령·연결 범위는 그 페이지의 본문 기능이다. 페이지를 비우거나 정책을 삭제하는 것은 이번 요청의 취지가 아니다.
- `aria-label`, 이미지 대체 텍스트, `sr-only`, 오류와 연결된 `aria-describedby`는 보이는 부연 설명과 분리한다. 삭제하는 도움말의 ID를 입력에서 참조하지 않게 한다.
- 생성 이미지·배경·핵심 UI는 유지한다. 소개 카드 삭제 후 빈 2열·불필요한 높이·빈 상태 패널을 만들지 않는다.

## 범위와 순서

홈·참가 신청·모집·대회 및 모집/카카오 도움말은 journey 담당, 전체 shell/메뉴/상태 패널/AI/공통 오류는 root 담당이다. 아래 나머지 공개 화면, 계정 shell, 일반/관리자 인증, Riot 공개 UI를 조사했다. 관리자 업무 화면은 별도 담당이다. 소스 경로의 `(…)`는 Next route group이다.

### 1. 로그인·가입·계정

| 기능/파일 | 제거·축약 대상 | 유지하는 계약 |
|---|---|---|
| `src/app/(public)/login/page.tsx:19` | “아이디와 비밀번호를 입력…”; 측면 `ACCOUNT ACCESS`, “가볍게 돌아와요”, 소개·3개 약속 카드 | 로그인 입력, 실패, 복구/가입 링크, 안전한 next 복귀. 관리자 별도 인증은 링크 이름으로 구분 가능 |
| `src/app/(public)/signup/page.tsx:23` | 상단·측면 자동 승인 설명 반복, `JOIN KLOL`·환영 문구·약속 카드 | 신규 Riot ID 자동 승인과 기존 플레이어 수동 검토 차이는 실제 가입 폼/동의에서 유지 |
| `src/app/(public)/forgot-password/page.tsx` | “다시 들어갈 길…” 장식 제목, 입력을 반복한 설명 | 복구는 관리자 확인 후 임시 비밀번호 전달임을 짧게 유지; 존재 여부를 숨기는 접수 상태 유지 |
| `src/app/(public)/account/password/page.tsx` | “새 비밀번호로 안전하게…” 소개와 계정 상태 무관 설명 | 변경 후 모든 기기 재로그인, 필수 변경 상태, 복귀 경로 |
| `src/components/accounts/account-shell.tsx:20,27` | 페이지 description prop/출력과 중복 장식 | 제목·계정 상태·탭·로그아웃 결과 유지 |
| `src/app/(public)/account/page.tsx` | 계정 관리 소개, 승인 완료의 일반적 설명 반복 | 승인 대기/거절/정지 사유, 강제 비밀번호 변경, 선수 연결 요청 상태, 공개 Riot 연결과 소유권 인증 구분, 활동 데이터 |
| `src/app/(public)/account/riot/page.tsx:20` | shell 소개, 연결 버튼의 역할을 되풀이하는 빈 상태 문구 | 현재 연결 방식·ID·동기화 시각/오류, 미연결/중단, 권한/준비 상태. 직접 연결은 소유권 인증이 아님 |
| `src/app/(public)/account/discipline/page.tsx:14` | “한 장씩 안전하게…나가도 이어서” 상시 설명 | 실제 과제 수·업로드 상태·검토 사유·완료/거절·재제출 가능 여부 |
| `src/components/accounts/account-auth-forms.tsx:147-154` | 가입 완료/검토 정책을 여러 곳에 반복하는 기본 메시지 정리 | 로그인 ID 4~64자 허용 문자, 비밀번호 문자+숫자 10자 이상, Riot 이름/태그 길이, 기존 선수 수동 검토, 약관/개인정보 동의 |
| `src/components/accounts/account-player-form.tsx:98,166,170,176` | 티어 선택을 설명하는 긴 교습 문구를 실제 활성 필드로 전달 | 닉네임 길이·Riot ID 형식, 티어별 단계/LP 제약, Riot ID 변경 시 연동 해제 경고. help ID 참조 정합성 |
| `src/components/accounts/account-password-form.tsx:112` | 입력 제약의 문장형 표현만 간결화 가능 | 문자+숫자 10자 이상, 입력/실패/완료 상태 |
| `src/components/auth/admin-login-page.tsx:15-21` | “보호된 운영 공간”, 관리자 ID·비밀번호 입력 반복 | 관리자 로그인 제목, 인증 오류, 사용자 로그인과의 구분. 공용 기기 로그아웃 안내는 선택적 일반 보안 문구 |
| `src/app/(auth)/admin/security/page.tsx` | 제거할 보이는 설명 없음 | 권한 확인 후 안전한 내부 경로 redirect |

### 2. 플레이어·랭킹·Riot 전적

| 기능/파일 | 제거·축약 대상 | 유지하는 계약 |
|---|---|---|
| `src/app/(public)/(registry)/players/page.tsx:45-47,92` | `PLAYER REGISTRY`, 검색/티어 사용 소개, `SEARCH RESULT` | 검색어·티어·초기화·결과 수·페이지 상태. 68행 회원명 정확 일치 검색과 공개 닉네임/Riot ID 범위는 검색 의미/개인정보 조건 |
| `…/(registry)/players/[playerId]/page.tsx:156,162,174` | RIOT/PROFILE/RECORDS 장식, “챔피언·포지션…확인하세요” | 공개 프로필 데이터, 활성/비활성 상태, 빈 전적/오류, 193행 팀 밸런스 점수 “실제 배치 당시 유효 점수 평균” |
| `…/(statistics)/rankings/page.tsx:50-52` | `SEASON RANKING`, 비교 소개 | 71행 참여는 **게임 수가 아닌 내전 회차**·최소 참여, 73행 마지막 집계·공개 경기 범위, 107행 동률 처리 순서, 각 수치/빈 상태 |
| `…/(statistics)/rankings/mmr/page.tsx:46,64-72` | 동일 공식으로 계산한다는 일반 소개, 표 열을 반복한 설명, generation 구현 용어 | 종합 신뢰도/라인별 표본·점수 구분, 마지막 집계, 이전 공식 게시 중/재계산 대기라는 **실제 상태**는 삭제 금지 |
| `src/components/riot/player-riot-profile.tsx:53,106,108-113` | “열 제목을 눌러…”, “이름을 누르면…”, 필터 조작 설명, 리포트의 타 서비스/AI 미제공 설명, 추가 로드 반영 설명 | `—`는 미수집/0으로 평균 내지 않음; 선택 표본·다시하기 제외; 본인 승률; 동일 포지션 상대·15분 표본; 게임 종류/맵별 채택률 분모; 실제 산식·경기 수·업데이트 상태 |
| `src/components/riot/player-build-insights.tsx:39-40` | “미리 수집된 경기만 읽으며 Riot 새 동기화 안 함”, 필터 사용 교습 | 타임라인 표본, 시작 90초/코어 1,000골드·업그레이드/맵 정의, 취소 보정, 채택률 분모. 기존 상세 영역에 짧게 보존 가능 |
| `src/components/riot/player-report-history.tsx:27` | “서버 저장/AI 분석이 아님” 중복 대조 | **이 브라우저 저장**, 최대 보관 수/오래된 순 교체, 같은 선수/Riot ID, 저장 당시 값 불변, 저장·삭제 결과. 단순 소개가 아니라 데이터 수명 조건 |
| `src/components/riot/player-history-chart.tsx:17,24-25` | 문장만 간결화 가능 | 실제 동기화 관측값과 경기 집계의 범위 차이, KST/다시하기 제외, 티어 좌표가 게임 MMR이 아님, KDA 산식/Perfect 조건 |
| `src/components/riot/player-match-detail.tsx:61` | “판매와 구매 취소를 포함한 실제 이벤트”는 행별 구매/판매/취소 라벨과 중복 | 스코어보드·타임라인·팀/라인전 수치, 수집 불가/미수집 구분, 실패/재시도, 능력치 파편·패치·원본 경기 식별자 |
| `src/components/champions/champion-portrait.tsx` | 제거할 보이는 부연 설명 없음 | 챔피언 이름·이미지 대체 텍스트·실패 fallback. 별도 공개 챔피언 관리 페이지 없음 |

### 3. 팀 만들기·랜덤·코인

| 기능/파일 | 제거·축약 대상 | 유지하는 계약 |
|---|---|---|
| `…/(tools)/tools/team-balance/page.tsx:28,39` | 10명/실력/포지션 일반 소개, 접근 제한에서 반복된 기능 설명 | 승인 계정 필요/현재 계정 상태와 로그인·가입 다음 행동 |
| `…/team-balance/team-balance-builder.tsx:337,372` | 단계별 “신청 그룹 가져오거나…”, “펼쳐 수정…” | 1/2단계 제목, 참가자 10명과 수, 그룹 출처·선택값, 검색/가져오기 로딩·실패, 표본 없는 중립점수 기준 |
| `…/team-balance/drafts/page.tsx:62-64` | `TEAM DRAFTS`/`PICK·BAN` 장식과 초안/추천 소개 | 선택 초안·팀·최신 여부, 저장 상태, 페이지 이동, 미선택/없음/권한/실패 복구 |
| `…/team-balance/drafts/[draftId]/page.tsx:38` | 저장된 배치 기반 추천이라는 부제 반복 | 접근 권한·초안 식별자/상태 |
| `…/team-balance/drafts/[draftId]/team-balance-draft-workspace.tsx:156,209` | 자동 배치 설명, 수동 배치 평가 버튼 설명 반복 | 산출 기준·중립점수/누락 데이터, generation/갱신/경합 상태, 수동 변경 평가/저장 행동 |
| `…/team-balance/drafts/team-balance-recommendations-panel.tsx:29,53` | 미선택 안내의 계산 방식 장문 | 팀 선택 prerequisite, 현재 시즌/표본, 동일 챔피언은 최상위 상대 한 명이라는 추천 집계 기준 |
| `…/(tools)/tools/random-team/page.tsx:26` | 붙여넣기/무작위/티어 설명 | 실제 무작위/티어 모드 선택과 참가자 입력 |
| `…/random-team/random-team-tool.tsx:170,220` | 번호 제거/결과 표시 사용법 | 10명 제약, 동명 슬롯은 실제 중복이 있을 때 알림(173행), 티어 점수/최소 차이/동률 선택 기준, 복사 결과. hint ID 삭제 시 aria-describedby 조정 |
| `…/(tools)/tools/coin-toss/page.tsx:20` 및 `coin-toss-tool.tsx:133,176` | 용도 소개, 보안 난수/2초 fallback 구현 설명, 버튼 조작을 되풀이한 phase body | 진행 중/앞뒷면/회차 결과를 제목·aria-live로 유지; 버튼/초기화/복사/오류; 모션 감소 동작 유지 |

### 4. 경기 결과·제출

| 기능/파일 | 제거·축약 대상 | 유지하는 계약 |
|---|---|---|
| `…/(matches)/matches/page.tsx:70-72,101` | `MATCH ARCHIVE`/`RESULTS`, 승패·MVP 소개 | 필터·정렬·초기화·검색 상태·시리즈 결과·날짜·총 경기 수·제출 진입 |
| `…/(matches)/matches/[matchId]/page.tsx:82` | “닉네임, 챔피언…확인할 수 있어요” | 같은 문장 뒤 **MVP 산정 기준 버전**, 실적·세트/승패·비활성 프로필 상태 |
| `…/(matches)/matches/submit/page.tsx:78` | “함께한 경기의 기록” 장식/결과 이미지 소개 | 제출은 즉시 전적 반영이 아니라 검토 후 반영이라는 상태는 실제 제출 흐름에서 유지 |
| `…/matches/submit/submission-form.tsx:297,302,349` | 연결 초안의 일반 설명, “같은 날 첫 번째…”, 이미 보이는 내 기록 위치 설명 | 초안 참가자 전달 사실, 결과 이미지에 승패·10명 표시 조건, **본인·운영자만 공개**, 검토/거절/취소 후 가능 행동, 파일 제약/업로드 개수/완료/오류/재시도 |
| `…/matches/submissions/page.tsx:47` | `MY SUBMISSIONS`와 접수 코드/검토 결과 사용 소개 | 접수 코드, 이미지 수, 검토 상태·공개 사유, 이어하기·승인 경기 링크, 필터·더 보기·세션 복귀 |

### 5. 미디어·도움말·정책·익명 집계

| 기능/파일 | 제거·축약 대상 | 유지하는 계약 |
|---|---|---|
| `…/(media)/highlights/page.tsx:21-22` | K-LOL MOMENTS/HIGHLIGHTS/PLAY 장식, “웃음과 역전…” 소개 | 게시된 제목과 **실제 item.description**, 영상 목록 수·페이지·외부 영상 fallback |
| `…/(media)/images/page.tsx:18-19` | K-LOL GALLERY/GALLERIES/HOME 장식, “우승 순간과…” 소개 | 게시물 제목·**실제 description**, 이미지 수·다음 목록·데이터 없음/실패 |
| `…/(media)/highlights/[highlightId]/page.tsx:38`, `images/[imageId]/page.tsx:36` | HIGHLIGHT/GALLERY/HOME GALLERY 장식 | 실제 게시 내용·재생/사진 넘기기·목록 복귀·YouTube 열기, 새 탭 접근성 |
| `…/(media)/highlights/loading.tsx`, `images/loading.tsx` | “반짝이는 장면을 정리…”, “이미지를 차례대로…” | 로딩 상태 제목/role 유지 |
| `…/(media)/media-carousel.tsx:124,129` | 실제 사진 설명은 콘텐츠이므로 유지; 화면에 보이지 않는 키보드 조작 설명은 대상 아님 | 슬라이드 위치 aria-live, 키보드 설명/연결 ID, 사용자 조작·모션 감소 |
| `…/(media)/youtube-player.tsx:27`, `resilient-media-image.tsx:26` | YOUTUBE HIGHLIGHT 장식 | 재생 버튼/YouTube 대체 행동·이미지 오류/재확인 상태 |
| `…/(guides)/start/page.tsx:21-23,35-43` | QUICK START, 일반 시작 소개, 카드마다 행동을 반복한 본문 | 행동명·목적지, 계정 상태/승인·권한 배지, 로그인/가입/내 계정 연결, 기존 생성 배경 이미지 |
| `…/(guides)/help/page.tsx:8-23` | 헤더·도움말 항목별 중복 설명·문의 안내 반복 | 사용자가 찾는 과업 이름과 도움말/직접 작업 링크 |
| `…/(guides)/help/riot/page.tsx:15-17,24,31,41` | 영문 장식·연결 소개·섹션 제목 반복 설명 | 직접 연결/RSO 차이, 연결·해제 절차, 공개/비공개 범위, 외부 API 지연은 **도움말 본문** |
| `…/(guides)/install/page.tsx:16-18,24,29` | 영문 장식, 같은 주소/앱 창 등 반복 소개 | iOS/Safari·Android/Chrome·데스크톱의 실제 설치 방법, 지원 환경 상태와 설치 실패/취소, 민감한 화면 오프라인 비저장 조건 |
| `…/(guides)/help/contact/page.tsx:8` | 운영팀 확인/비로그인 가능 일반 소개 | 비공개 문의/연락처, 답변 경로·실시간 아님, 접수번호·접수 결과, 개인정보 수집 동의/보관기간 |
| `src/components/navigation/support-form.tsx:30-36` | 라벨/placeholder와 중복하는 연락 방법 입력 설명 | 연락 수단으로 답변·자동 메일 아님, 비밀번호/인증 코드/민감 식별자 미입력, 필수 수집·기간·거부 결과 동의, 재시도 시 내용/키 보존 |
| `…/(discipline)/discipline/page.tsx:14,17` | FAIR PLAY, 공개 집계 소개의 문장형 표현, 파일 해시/원본 저장 위치 구현 설명 | 익명 집계라는 범위, 실제 주의/경고/제한/해결 수·시각, 3회 검토와 과제 10/15게임 정책, 증빙 공개 범위 |
| `src/app/(public)/terms/page.tsx`, `privacy/page.tsx` | SERVICE TERMS/PRIVACY NOTICE 영문 장식만 제거 가능 | **법적/운영 정책 본문·정책 식별자·시행일·동의 범위·문의/삭제·방문 통계 선택** 모두 유지 |
| `…/(legacy)/app/page.tsx`, `…/(legacy)/app/players/page.tsx` | 보이는 설명 없음 | 기존 경로와 query 보존 redirect |

## 수정 후 순서별 확인 항목

1. 로그인·가입·복구/비밀번호·관리자 로그인: 제목/라벨/CTA만으로 이동 가능, 문구 제거 뒤 빈 intro 열 없음, 모든 오류/필수 제약/동의 유지, 안전한 next 복귀.
2. 계정·Riot 연결·과제: 사용자 상태별 원인과 다음 행동, 변경 결과/개인정보 범위 유지.
3. 플레이어·랭킹·MMR·Riot 분석: filter/reset/페이지/빈 상태, 실제 metric 의미/산식/누락값/표본/집계시점 유지, 저장 결과 수명 의미 유지.
4. 팀 밸런스·초안·랜덤·코인: 참가자/선택수·동명 처리·입력 제약·로딩/취소/재시도·저장/충돌·복사·모션 감소, dangling aria-describedby 없음.
5. 경기 목록·상세·제출 이력: 로그인/승인/강제 비밀번호 변경, 업로드 완료/검토/거절/취소·이어하기, 전적 산정 기준.
6. 미디어·도움말·정책: 실제 게시 본문을 오삭제하지 않음, 이미지/외부 영상 실패, 설치 지원/비지원, 도움말의 실제 답변과 정책/동의 유지.
7. 각 변경 화면 좁은 모바일/태블릿/PC, 키보드·스크린리더 명칭, 길어진 데이터에서 잘림/빈 영역을 별도 확인. 소스 조사만으로 이 항목을 통과 처리하지 않음.

공통 상태·로딩·404와 네비게이션 수정은 root 결과와 합쳐 재검토한다. 정합성·권한·집계·저장·외부 통신 정책 자체는 이 문구 정리의 변경 대상이 아니다.

# 관리자 기능·보조 설명 전수 분석 (Phase 1)

- 기준: `f4ab0647`, 2026-10-06. 분석 중 root가 원장/회귀 파일을 추가했으며 이 담당자는 제품 소스를 수정하지 않았다.
- 범위: `src/app/(admin)` + `src/components/admin`의 TSX **102개**, 그중 페이지 **61개**, 공통으로 직접 연결한 관리자/팀/대회 컴포넌트. `(auth)/admin/login`, `(auth)/admin/security` 두 페이지는 auth 담당 분석으로 연결한다.
- 기존 [386 route 기능 원장](../2026-10-05-service-completion/feature-inventory.json)의 page/route 소스 383개와 현재 소스 집합을 대조해 추가·누락 0개를 확인했다. metadata 3개 포함 386개다. 과거 control 수/line 번호/검증 완료 주장은 현재 사용자 상태 검증의 대체 근거가 아니다.
- 이 문서는 **실제 소스 분석 결과**다. 전체 관리자 과업의 실행 완료, 각 권한/기기/외부 연동의 통과를 의미하지 않는다. [전체 분석](core-analysis.md), [순서별 검토](ordered-review.md)에 실행 상태를 연결한다.

## 삭제 판단 기준

반복 소개·사용법 강의·버튼 내용을 문장으로 다시 말하는 문구·구현 기술 설명을 제거한다. 상태/성공/실패/빈 결과/재시도, 입력 label·형식·범위, 접근 권한, 개인정보 공개 범위, 취소/삭제/재계산의 영향, 실제 사용자 콘텐츠, 집계 기준은 유지하거나 짧게 만든다. tooltip로 숨기거나 과도한 placeholder로 이동해 설명을 그대로 남기는 방식은 쓰지 않는다. 검색에 필요한 내부 메타데이터와 실제 description 필드는 표시 문구 정리와 구분한다.

## 새로 확인된 과업 방해

**P2 · 관리자 오류 화면의 재시도가 데이터 재조회로 이어지지 않음.** `players/error.tsx`, `users/error.tsx`는 reset만 호출한다. 상세 `users/[userAccountId]/error.tsx`는 전체 페이지 reload로 복구하며 같은 결함이 아니다. 설치된 Next 16.3.8 ErrorBoundaryHandler의 retry는 refresh를 포함하지만 reset은 경계 state만 해제한다. Root의 [보정된 회귀 재현](recovery-corrected-before.log)은 공개 신청 + 관리자 목록 2개에서 재조회 실패 3개를 재현했고, 관리자 상세의 전체 새로고침은 통과했다. 초기 window stub 누락으로 상세가 실패한 기록(recovery-product-before.log)은 제품 결함 4개로 해석하지 않는다. Phase 2에서는 관리자 목록 2개의 결함을 수정하고 상세 1개는 segment retry로 통일한다.

## 61개 관리자 페이지별 판정

line 번호는 분석 기준 소스 위치다. source 수정 후 다시 확인한다.

| 정확한 페이지 파일 | 제거 후보·보존 판단 |
| --- | --- |
| `src/app/(admin)/admin/ai-requests/page.tsx` | 호환 이동 페이지: 자체 소개 제거 없음. 실제 redirect 목적지·검색 파라미터·권한 연결 유지; 목적지 컴포넌트에서 중복 없이 처리. |
| `src/app/(admin)/admin/balance-ai/page.tsx` | 제거: L40 원장 재생 소개와 L45 기술 처리 설명의 중복. 유지: 현재/전환 공식, generation, 실제 상태, 재계산 영향 확인. |
| `src/app/(admin)/admin/balance/drafts/[draftId]/page.tsx` | 축약: L37 관리자 읽기 전용. 공유 workspace/추천 컴포넌트는 public 담당과 조정; 실제 소유자·revision·저장 상태 유지. |
| `src/app/(admin)/admin/balance/drafts/page.tsx` | 제거: L43 검수·보관 업무 소개. 유지: 후보/저장 배치 상태, 현재 필터, 빈 결과 및 복구. |
| `src/app/(admin)/admin/balance/page.tsx` | 제거: L31 집계 소개. 유지: generation·집계 시각·대기 이벤트·권한·빈 상태·오류·재계산 영향. |
| `src/app/(admin)/admin/champions/[championId]/edit/page.tsx` | 축약/유지: L19 키 변경 불가·삭제 대신 비활성화는 실제 제약. champion-form과 중복되는 경우 한 곳만 유지. |
| `src/app/(admin)/admin/champions/new/page.tsx` | 제거: L9 키와 표시명 입력 안내. 유지: 입력 label/형식/유효성. |
| `src/app/(admin)/admin/champions/page.tsx` | 제거: L27 챔피언 키·표시명 관리 소개. 유지: 검색·활성 상태·실데이터. |
| `src/app/(admin)/admin/discipline/[recordId]/page.tsx` | 유지: 기록 내용·사유·진행 상태·권한·과제·복구 동작; 실제 콘텐츠를 보조 설명으로 삭제하지 않음. |
| `src/app/(admin)/admin/discipline/new/page.tsx` | 유지: L9 당사자 공개 범위는 개인정보 안내. 필수 제약을 짧게 유지. |
| `src/app/(admin)/admin/discipline/page.tsx` | 제거: L23 기록·과제·검토 관리 소개. 유지: 기록 상태/권한/빈 상태. |
| `src/app/(admin)/admin/highlights/[highlightId]/edit/page.tsx` | 공통 관리자 media/private-assets 화면 호출. 공통 컴포넌트 후보를 한 번 수정; 실제 제목·내용·자산 상태·empty/error 유지. |
| `src/app/(admin)/admin/highlights/new/page.tsx` | 공통 관리자 media/private-assets 화면 호출. 공통 컴포넌트 후보를 한 번 수정; 실제 제목·내용·자산 상태·empty/error 유지. |
| `src/app/(admin)/admin/highlights/page.tsx` | 공통 관리자 media/private-assets 화면 호출. 공통 컴포넌트 후보를 한 번 수정; 실제 제목·내용·자산 상태·empty/error 유지. |
| `src/app/(admin)/admin/images/[imageId]/edit/page.tsx` | 공통 관리자 media/private-assets 화면 호출. 공통 컴포넌트 후보를 한 번 수정; 실제 제목·내용·자산 상태·empty/error 유지. |
| `src/app/(admin)/admin/images/new/page.tsx` | 공통 관리자 media/private-assets 화면 호출. 공통 컴포넌트 후보를 한 번 수정; 실제 제목·내용·자산 상태·empty/error 유지. |
| `src/app/(admin)/admin/images/page.tsx` | 공통 관리자 media/private-assets 화면 호출. 공통 컴포넌트 후보를 한 번 수정; 실제 제목·내용·자산 상태·empty/error 유지. |
| `src/app/(admin)/admin/kakao/operation-forms/[formType]/page.tsx` | 호환 이동 페이지: 자체 소개 제거 없음. 실제 redirect 목적지·검색 파라미터·권한 연결 유지; 목적지 컴포넌트에서 중복 없이 처리. |
| `src/app/(admin)/admin/kakao/operation-forms/page.tsx` | 호환 이동 페이지: 자체 소개 제거 없음. 실제 redirect 목적지·검색 파라미터·권한 연결 유지; 목적지 컴포넌트에서 중복 없이 처리. |
| `src/app/(admin)/admin/kakao/page.tsx` | 제거: L96 화면별 관리 소개, L122 검색 이용 설명. 축약: L160 프로토콜·legacy 상태는 실제 적용 범위만 유지. 유지: L67/136 조회 상한, L169 만료 정리 영향·오류·연동 상태. |
| `src/app/(admin)/admin/kakao/recruits/logs/page.tsx` | 호환 이동 페이지: 자체 소개 제거 없음. 실제 redirect 목적지·검색 파라미터·권한 연결 유지; 목적지 컴포넌트에서 중복 없이 처리. |
| `src/app/(admin)/admin/kakao/recruits/page.tsx` | 호환 이동 페이지: 자체 소개 제거 없음. 실제 redirect 목적지·검색 파라미터·권한 연결 유지; 목적지 컴포넌트에서 중복 없이 처리. |
| `src/app/(admin)/admin/kakao/recruits/settings/page.tsx` | 호환 이동 페이지: 자체 소개 제거 없음. 실제 redirect 목적지·검색 파라미터·권한 연결 유지; 목적지 컴포넌트에서 중복 없이 처리. |
| `src/app/(admin)/admin/kakao/rooms/page.tsx` | 축약: L15 레거시 V2/V3 전용, V4 권한/라우팅에 영향 없음. 유지: 읽기 전용 권한·방 연결·최근 활동·장치 상태. |
| `src/app/(admin)/admin/kakao/scrims/page.tsx` | 호환 이동 페이지: 자체 소개 제거 없음. 실제 redirect 목적지·검색 파라미터·권한 연결 유지; 목적지 컴포넌트에서 중복 없이 처리. |
| `src/app/(admin)/admin/kakao/season-apply/page.tsx` | 호환 이동 페이지: 자체 소개 제거 없음. 실제 redirect 목적지·검색 파라미터·권한 연결 유지; 목적지 컴포넌트에서 중복 없이 처리. |
| `src/app/(admin)/admin/kakao/settings/page.tsx` | 호환 이동 페이지: 자체 소개 제거 없음. 실제 redirect 목적지·검색 파라미터·권한 연결 유지; 목적지 컴포넌트에서 중복 없이 처리. |
| `src/app/(admin)/admin/kakao/stats/page.tsx` | 호환 이동 페이지: 자체 소개 제거 없음. 실제 redirect 목적지·검색 파라미터·권한 연결 유지; 목적지 컴포넌트에서 중복 없이 처리. |
| `src/app/(admin)/admin/logs/kakao/page.tsx` | 호환 이동 페이지: 자체 소개 제거 없음. 실제 redirect 목적지·검색 파라미터·권한 연결 유지; 목적지 컴포넌트에서 중복 없이 처리. |
| `src/app/(admin)/admin/logs/page.tsx` | 제거: L33 감사·통계·AI 원장 소개. 유지: 실제 로그 내용·시각·필터·권한·조회 실패. |
| `src/app/(admin)/admin/matches/[matchId]/edit/page.tsx` | 공통 화면/호환 경로의 실제 내용·상태 유지. 직접 렌더와 호출 컴포넌트를 확인했으며 추가 단독 소개 제거 후보 없음. |
| `src/app/(admin)/admin/matches/[matchId]/page.tsx` | 유지: 경기 revision·시즌·날짜·점수·현재 공개 상태·무결성 결과. 하위 editor 별도 후보 참조. |
| `src/app/(admin)/admin/matches/new/page.tsx` | 제거: L82 NEW DRAFT 및 일반 구조화 경기 입력 소개. 유지: 선택한 배치 제목·적용 결과·필수 입력. |
| `src/app/(admin)/admin/matches/page.tsx` | 제거: L57 A4 · MATCH OPERATIONS와 초안/공개/무효화 소개. 유지: 실제 상태·집계·접수·필터·empty/error. |
| `src/app/(admin)/admin/matches/submissions/[submissionId]/page.tsx` | 유지: 제출 코드·상태·주최자·날짜·시즌·제출 내용. 하위 review 별도 후보 참조. |
| `src/app/(admin)/admin/operation-forms/[formType]/[id]/page.tsx` | 운영 양식 공통 화면 호출. 실접수 내용·개인정보·답변 처리 방식·상태 유지; 반복 업무 소개는 공통 list에서 제거. |
| `src/app/(admin)/admin/operation-forms/[formType]/page.tsx` | 운영 양식 공통 화면 호출. 실접수 내용·개인정보·답변 처리 방식·상태 유지; 반복 업무 소개는 공통 list에서 제거. |
| `src/app/(admin)/admin/operation-forms/page.tsx` | 운영 양식 공통 화면 호출. 실접수 내용·개인정보·답변 처리 방식·상태 유지; 반복 업무 소개는 공통 list에서 제거. |
| `src/app/(admin)/admin/operation-forms/warnings/page.tsx` | 호환 이동 페이지: 자체 소개 제거 없음. 실제 redirect 목적지·검색 파라미터·권한 연결 유지; 목적지 컴포넌트에서 중복 없이 처리. |
| `src/app/(admin)/admin/page.tsx` | 제거: L48 업무 소개, L61 반복 권한 안내, L84 메뉴 이용 안내, L94 workspace.description. 유지: 현재 계정·역할·상태·집계·조회 실패. |
| `src/app/(admin)/admin/players/[playerId]/page.tsx` | 제거: L59 가짜 정보 대체 금지 같은 구현 설명. 유지: 조회 실패/재시도, 현재 Riot 연동 비활성 상태. L116 기본 꺼짐 문구는 현재 상태와 겹치면 삭제. |
| `src/app/(admin)/admin/players/new/page.tsx` | 제거: L16 감사 기록·멱등성 영수증 등 기술적 등록 소개. 유지: 회원명 개인정보 범위와 필수/형식 제약. |
| `src/app/(admin)/admin/players/page.tsx` | 제거: L54 관리자 경계·UUID/Riot 기술 소개, L92 상세 오류 비공개 반복, L104 감사 기록 표현. 유지: 100자·단일필터 제약, 빈 상태·새 선수 링크·실패 복구. |
| `src/app/(admin)/admin/private-assets/[assetId]/page.tsx` | 공통 관리자 media/private-assets 화면 호출. 공통 컴포넌트 후보를 한 번 수정; 실제 제목·내용·자산 상태·empty/error 유지. |
| `src/app/(admin)/admin/private-assets/page.tsx` | 공통 관리자 media/private-assets 화면 호출. 공통 컴포넌트 후보를 한 번 수정; 실제 제목·내용·자산 상태·empty/error 유지. |
| `src/app/(admin)/admin/progress/destruction/[tournamentId]/page.tsx` | 유지: 실제 대회 설명·모집·경매·대진·결과·평가 상태. 하위 actions의 선택 영향/계산 의미는 유지. |
| `src/app/(admin)/admin/progress/destruction/new/page.tsx` | 제거: L11 팀 수/방식/상한 먼저 정하기 안내. 유지: 실제 입력 label·설정 제약. |
| `src/app/(admin)/admin/progress/destruction/page.tsx` | 제거: L22 모집부터 완료까지 운영 소개. 유지: 대회 상태·기간·참가 수·empty/error. |
| `src/app/(admin)/admin/progress/event/[eventId]/page.tsx` | 유지: L43 event.settings.description은 실제 운영 콘텐츠; 참가/팀 empty·점수·상태 유지. 하위 참가자 선택의 반복 소개만 제거. |
| `src/app/(admin)/admin/progress/event/new/page.tsx` | 제거: L9 BO와 기간 먼저 정하기 안내. 유지: 실제 입력 label·범위. |
| `src/app/(admin)/admin/progress/event/page.tsx` | 제거: L21 단계별 처리 소개. 유지: 현재 이벤트 상태·기간·목록·empty/error. |
| `src/app/(admin)/admin/recruits/page.tsx` | 호환 이동 페이지: 자체 소개 제거 없음. 실제 redirect 목적지·검색 파라미터·권한 연결 유지; 목적지 컴포넌트에서 중복 없이 처리. |
| `src/app/(admin)/admin/riot/page.tsx` | 제거: L63 총괄 소개, L71 계정 탭 소개, L81 작업 탭 소개, L85 안전 로그 소개. 유지: 5000명 상한, SUPER 제한, 전체 동기화의 범위, 실제 상태·실패·복구. |
| `src/app/(admin)/admin/search/page.tsx` | 제거: L32 검색 사용법 및 L39 workspace.description 표시. 보존: L24 description을 포함한 검색 인덱스, 결과 이름·이동·검색어·빈 결과. |
| `src/app/(admin)/admin/seasons/kakao-pending/[pendingId]/page.tsx` | 축약/유지: L31 제공된 정보를 확인한 뒤 연결하는 신원 확인 조건; 실제 신청 내용·상태 유지. |
| `src/app/(admin)/admin/seasons/kakao-pending/page.tsx` | 축약/유지: L54 미연결 신청도 모집 인원에 포함되며 확인 후 연결한다는 집계/신원 의미. |
| `src/app/(admin)/admin/seasons/page.tsx` | 제거: L78 시즌/신청 흐름 소개, L88 샘플 대체 등 구현 설명. 유지: 시즌 단계·신청 수·연결 장애·재시도. |
| `src/app/(admin)/admin/site-settings/page.tsx` | 제거: L11 기능 스위치·AI 정책 관리 소개. 유지: 실제 설정 label·값·권한·저장 결과. |
| `src/app/(admin)/admin/usage/page.tsx` | 제거: L18 실제 이용/방문/찾는 정보 소개. UsageReportView의 기간·집계 정의·개인정보는 아래 기준 적용. |
| `src/app/(admin)/admin/users/[userAccountId]/page.tsx` | 유지: L37 식별자 실데이터, L38 삭제 계정, L39 Riot 소유권 미확인, L40 임시 비밀번호 복구 조건, L41 개인정보 제한. 실제 상태·복구 안내는 보조 소개가 아님. |
| `src/app/(admin)/admin/users/page.tsx` | 제거: L42 가입 승인/역할/복구/소프트삭제/revision 관리 소개. 유지: 계정 상태·권한·검색·empty/error. |

## 공통·상태·클라이언트 컴포넌트 판정

| 파일 또는 하위 경로 | 후보와 필수 보존 정보 |
| --- | --- |
| `src/components/admin/admin-shell.tsx`, `admin-navigation.tsx`, `admin-logout-button.tsx` | 현재 역할·계정·환경·메뉴·로그아웃 상태 보존. 반복 보호된 공간 소개만 제거 가능; role label을 보조 설명으로 제거하지 않는다. |
| `src/components/admin/admin-workspace-page.tsx` | L16 workspace.description, L26 업무 예정 소개, L30–41 일반 이용 안내(권한/데이터/오류/보안), L45 준비 완료 전 제한의 반복 제거 후보. 현재 미제공 상태·제목·돌아가기 유지. 현재 import 호출이 없어 현 사용자 화면 개선 효과는 없음; 새 기능 추가 근거도 아님. |
| `src/components/admin/media/admin-media-pages.tsx` | L21 draft/publish/asset 업무 소개, L29 게시 전 확인 사용법, L38 If-Match·멱등성 기술 설명 제거. 보관이 기록 삭제가 아니라는 영향은 필요한 실제 확인에 유지. item.description은 콘텐츠다. |
| `src/components/admin/media/admin-private-asset-pages.tsx` | L35/L60 허용 메타데이터만 표시한다는 구현 소개 제거. READY 여부·권한·empty/error·자산 선택 조건 유지. |
| `src/components/admin/media/admin-media-form.tsx` | L301 내부 초안→검사→READY 파이프라인, L312 빈 초안 사용법, L334 서버 재검사 기술 설명 제거. L300 초안 생성 전 이미지 사용 불가 상태·최대 5장·순서·부분 성공 자산 유지·현재 업로드/저장/실패 상태 보존. L313/315 중 동작 영향만 짧게 유지. |
| `src/components/admin/media/admin-private-asset-delete.tsx` | L26 즉시 물리 삭제되지 않고 정리 대기가 되는 실제 영향 유지. 삭제 확인·실패 복구 보존. |
| `src/components/admin/players/admin-player-form.tsx` | L144 비공개 회원명, L158 legacy ID 고유성, L184 태그 형식, L186 Riot 연결 해제/작업 취소, 역할 제한·세션 종료·비활성화/복구 영향 유지. 감사/멱등성 구현을 설명하는 중복 문장만 제거. |
| `src/components/admin/accounts/admin-account-actions.tsx` | 역할/탈퇴 계정/claim 상태·로그인 ID 확인·세션 종료·한 번만 표시하는 임시 비밀번호·소프트삭제 영향 유지. L432 DB/감사/receipt에 원문 저장 안 함이라는 구현 설명은 1회 표시/복구 의미만 남겨 축약. |
| `balance-ai/mmr-admin-actions.tsx` | 권한과 전체 generation 교체/공식 전환 확인 유지. 파괴적 영향 확인을 소개 문구로 삭제하지 않는다. |
| `balance-ai/team-balance-override-actions.tsx` | 기존 경기 MMR와의 구분, 기존 배치 영향 없음, 미설정 0, 초기화 이유는 계산 의미/작업 영향으로 유지. |
| `balance/statistics-recalculate-button.tsx` | 재계산 동작·진행·성공/실패 상태 유지. API 계약/권한 변경 불필요. |
| `champions/champion-form.tsx` | 고정 키·형식·비활성화·저장 결과 유지. 페이지와 중복 제약만 한 곳으로 축약. |
| `kakao/kakao-settings-form.tsx`, `kakao-health-repair.tsx`, `rooms/kakao-room-actions.tsx` | 읽기 전용 권한, capability·적용 범위, revision 충돌, 복구/저장 결과 유지. |
| `matches/bounded-picker.tsx` | 두 글자 이상, 이름#태그, 최대 조회 수, 로딩/검색 실패/선택 상태는 입력/완료 조건으로 유지. |
| `matches/match-editor.tsx` | L427 기본정보/로스터/공개 revision/statistics 일반 강의 제거. L481 검사 통과 상태 유지, 내부 V1_COMPAT_1 공식 설명은 UI에 불필요. L488 무효화의 공개 집계 제외/복구 가능/3–500자 이유는 유지. |
| `matches/new/admin-import-panel.tsx` | L240 펼쳐서 안전 검토하는 반복 설명 제거. L242/L251 파일·붙여넣기 control의 입력 방식, OCR 후보는 직접 확인해야 함, 개인정보 처리·기존 가져오기 복구 링크 유지. |
| `matches/submissions/[submissionId]/submission-review.tsx` | L454 붙여넣기 로컬 범위, L456 각 행 직접 확인 필요, L457 충돌 후 로컬 내용 보존, L488 공개 반려 이유/3–500자/내부OCR 금지 유지. revision·이미지 hash·OCR confidence 실제 운영 상태를 무조건 제거하지 않는다. |
| `matches/[matchId]/match-integrity-review.tsx` | L16 외부 AI/비밀 전송 없이 매번 재계산한다는 기술 소개 제거. 무결성 검사 결과·실제 문제 세부 내용 유지. |
| `progress/event/[eventId]/event-admin-actions.tsx` | L91 여러 명 선택 방법의 반복 소개 제거. 이미 참가한 선수 제외, 활성 등록 조건, 실제 선택/추가 결과는 유지. |
| `progress/event/new/event-create-form.tsx` | 입력 label·필수 기간·BO 범위·저장 결과만 있어 단독 소개 제거 없음. description은 실제 이벤트 콘텐츠 입력이다. |
| `progress/destruction/new/destruction-create-form.tsx` | 모드/기록 출처·고정 라운드·모집 정원에 미연결 대기 포함은 설정/집계 의미. 유지하되 짧게 정리. |
| `progress/destruction/[tournamentId]/destruction-admin-actions.tsx` | L185 현장 입찰/대기 선수 조작의 반복 강의는 제거 후보. 취소 영향, 시간만 설정해도 자동 진행하지 않음, 권한·완료 상태 수정 제한, 최근 100판/5분/평가 모드 조건, 산식·최소금액·예산, 점수 수정 영향, 이미 경기한 선수 교체 제한, MVP override 영향은 필수. |
| `seasons/season-admin-actions.tsx`, `seasons/kakao-pending/pending-actions.tsx` | 운영 단계 전환·사이트 신청 보존·신원 연결 조건·현재 결과/권한 유지. |
| `site-settings/settings-form.tsx` | 설정 label·현재값·저장 성공/실패 유지. 별도 소개 제거 없음. |
| `operational-health.tsx` | 단순 소개가 아닌 관측 범위다. 조회 시각·마지막 성공/실패·대기/실패 수·미확인 표시 보존. 임계값(통계15분/Riot30분/알림5분), KST 일일 마감, 수동 probe와 실제 API권한/RSO/휴대폰수신의 차이는 허위 정상 판단을 막으므로 짧게 유지. 빈 대기열 cron 실행을 확인했다고 바꾸지 않는다. |
| layout / not-found / loading / error | 랜드마크·진짜 로딩·404 복구·오류 메시지와 재시도 유지. 관리자 목록 error 2개는 P2 수정, 상세는 복구 방식 통일. not-found 설명의 공통 정리는 root 소유. |

### 직접 연결되는 다른 공통 UI

| 정확한 파일 | 판단 |
| --- | --- |
| `src/components/discipline/admin-discipline-create-form.tsx` | L40 이름 두 글자 이상은 입력 제약 유지; 선택하면 자동 입력된다는 강의는 제거 후보. |
| `src/components/discipline/admin-discipline-actions.tsx` | SUPER 전용 수정/삭제 제한과 현재 결과 유지. |
| `src/components/operation-forms/admin-operation-form-list.tsx` | L21 일반 관리 소개 제거. 사이트 문의 위치·접수 연락처로 직접 답변하는 실제 완료 방식은 짧게 유지. |
| `src/components/operation-forms/admin-operation-form-actions.tsx` | 상태 전환·삭제 확인·처리 오류 유지. |
| `src/components/riot/riot-admin-actions.tsx` | 현재 선택·revision·확정 N명·전체 작업 범위/상한 유지. L139 원자적 처리 기술 설명 제거; L148 실제 저장 영향만 확인 문구로 유지. |
| `src/components/usage/usage-report.tsx` | L56 무엇을 찾았는지 추정하는 일반 소개 제거. 수집 꺼짐·부분 기간·unique 브라우저≠사람·로그아웃 회원 포함·중복 집계/분모·30분 방문 정의·클릭≠완료·같은 방문 내 이동·검색어 미저장·관리자 제외·개인정보 링크는 집계 의미/개인정보로 유지·축약. 실제 count와 상세 의미를 모두 지우면 오해를 만든다. |
| `src/app/(public)/(tools)/tools/team-balance/drafts/[draftId]/team-balance-draft-workspace.tsx` | L156 전체 조합을 평가해 적용하는 일반 강의, L209 수동 평가/저장 중복 강의 제거 후보. L164 criterion.description/L165 누락값 0 계산은 metric 의미로 축약/유지. L151 소유자·generation·revision 실제 상태 유지. public 담당 소유, 여기서 수정하지 않는다. |
| `src/app/(public)/(tools)/tools/team-balance/drafts/team-balance-recommendations-panel.tsx` | L29 선택 필요 empty-state의 반복 문장 축약 가능. L53 같은 챔피언 중 가장 위협적인 상대 1명은 추천 집계 정의 유지. 실제 통계 부족/없음·분석 시즌/건수 유지. public 담당 소유. |
| `src/app/(public)/(tools)/tools/team-balance/team-balance-feature-state.tsx` | disabled/unavailable 상태와 재시도는 유지; 다시 열리면 쓸 수 있다는 반복 미래 설명만 제거 가능. public 담당 소유. |
| `src/components/competitions/destruction/auction-reveal.tsx` | WHO IS NEXT? 장식 설명은 제거 후보. 실제 추첨·대기·입찰 상태·점수 유지. 공유 public 소유. |
| `src/components/competitions/destruction/provisional-ratings.tsx` | 입력 출처·가중치·하한·부족 기록·확정 후 잠금·실제 Riot rank와 차이 모두 metric/제약 의미 유지. 감사 기록 구현 반복만 제거. |
| `src/components/competitions/destruction/live-status.tsx` | 최근 확인 시각/자동 갱신 상태·실패 복구 유지. |
| `src/components/champions/champion-portrait.tsx`, 공개 resilient-media-image 및 shared UI | 이미지 대체·접근성 label·실제 콘텐츠 유지. 단독 관리자 소개 제거 없음. |

## Phase 2 순서와 검증 경계

1. 전체 기능 분석 완료를 root가 확인한 뒤, 공통 shell/소개 및 목록 헤더 → 실제 form → empty/error/제약 순으로 정리한다. 소유자가 다른 shared 팀 UI는 중복 수정하지 않는다.
2. 오류 경계 P2 3파일을 retry로 수정하고 실제 Next ErrorBoundaryHandler 회귀를 재실행한다. 보조 설명 삭제 테스트로 제품 오류를 가리지 않는다.
3. 관리자 역할별 접근, 검색/필터/페이지/초기화, 입력 실패/중복/충돌/취소, 성공 상태를 **격리 DB**에서 순서대로 검증한다. 운영 회원/경기/계정을 변경하지 않는다.
4. 미디어 부분 업로드/삭제 대기·임시 비밀번호 한 번 표시·시즌/대회 취소/재계산 영향·Riot scope를 개별 검증한다. 설명 제거로 제약/복구/개인정보가 사라지지 않았는지 재검토한다.
5. 모바일/키보드/로딩/오류의 실제 화면 검증은 별도 실행 기록을 남긴다. 이 분석만으로 실기기/외부 RSO/휴대폰 알림/빈 대기열 cron 최근 실행까지 통과시키지 않는다.
6. lint/type/회귀/릴리스 검사와 배포 후 확인은 root의 master checklist로 통합한다. 분석 단계에서 재배포하거나 테스트 기대값만 바꾸지 않는다.

## API·자동 작업 의존성

관리자 API **112개**, 관리자 legacy 호환 handler **11개**를 원장과 연결했다. UI 설명 정리 자체는 API 계약·인증·권한·If-Match·멱등성 영수증·오류 코드를 변경할 이유가 없다. 모든 상태를 실제로 요청한 기록으로 오해하지 않도록 아래 목록은 **소스 의존성 확인**으로 분류한다. 로그인/세션 경계는 auth 담당과 연결한다.

| 영역 | 주요 과업/검증 시 유지할 계약 |
| --- | --- |
| 계정/선수/징계/양식 | 승인·역할·복구·soft delete·1회 비밀번호, 식별자/소유권 검증, 민감 필드 제한, 대상 revision·재시도 receipt |
| 경기/미디어 | 초안→공개·무효화/복구, 구조/점수/MVP 검증, 제출 반려/재접수/승인, OCR·private image 접근, READY·용도·개수·rev·삭제 정리 |
| 시즌/모집/대회 | 기간·정원·대기·미연결 신청 수, 단계 전환, 경매/평가 동결·예산·대진/점수/MVP 영향, 참가/교체 충돌 |
| 밸런스/통계/MMR | 원장/활성 공식·generation·대기 source event, 재계산/조정 범위, 권한·atomic replacement와 stale write 방지 |
| Riot/카카오 | 실제 동작 switch·scope·계정 연결/해제·작업 상태·상한·rate limit·재시도, legacy와 canonical 권한 구분 |
| 설정/로그/사용량 | 기능 switch·허용된 로그 redaction·기간·집계 분모·개인정보·export 범위 |

6개 vercel cron: destruction-ratings 매분, statistics-projection 5분, mmr-projection 5분, kakao-daily-close 매일 06:00 KST, riot-sync 5분, support-retention 매일 04:00 KST. 7개 signed internal job은 아래 파일 목록에 기록한다. 외부 probe는 예전 성공 시각의 증거이며 현재의 사용자 E2E 전체 정상 선언 근거가 아니다. 카카오 실제 휴대폰 수신, RSO 소유권/승인, 빈 대기열일 때 개별 cron 최근 호출은 별도 증거가 필요하다.

## 누락 방지용 정확한 파일 목록

### 페이지 외 41개 admin TSX

```text
src/app/(admin)/admin/balance-ai/mmr-admin-actions.tsx
src/app/(admin)/admin/balance-ai/team-balance-override-actions.tsx
src/app/(admin)/admin/balance/statistics-recalculate-button.tsx
src/app/(admin)/admin/champions/[championId]/edit/not-found.tsx
src/app/(admin)/admin/champions/champion-form.tsx
src/app/(admin)/admin/highlights/[highlightId]/not-found.tsx
src/app/(admin)/admin/images/[imageId]/not-found.tsx
src/app/(admin)/admin/kakao/kakao-health-repair.tsx
src/app/(admin)/admin/kakao/kakao-settings-form.tsx
src/app/(admin)/admin/kakao/rooms/kakao-room-actions.tsx
src/app/(admin)/admin/layout.tsx
src/app/(admin)/admin/matches/[matchId]/match-integrity-review.tsx
src/app/(admin)/admin/matches/bounded-picker.tsx
src/app/(admin)/admin/matches/match-editor.tsx
src/app/(admin)/admin/matches/new/admin-import-panel.tsx
src/app/(admin)/admin/matches/submissions/[submissionId]/submission-review.tsx
src/app/(admin)/admin/not-found.tsx
src/app/(admin)/admin/operational-health.tsx
src/app/(admin)/admin/players/error.tsx
src/app/(admin)/admin/players/loading.tsx
src/app/(admin)/admin/players/not-found.tsx
src/app/(admin)/admin/progress/destruction/[tournamentId]/destruction-admin-actions.tsx
src/app/(admin)/admin/progress/destruction/new/destruction-create-form.tsx
src/app/(admin)/admin/progress/event/[eventId]/event-admin-actions.tsx
src/app/(admin)/admin/progress/event/new/event-create-form.tsx
src/app/(admin)/admin/seasons/kakao-pending/pending-actions.tsx
src/app/(admin)/admin/seasons/season-admin-actions.tsx
src/app/(admin)/admin/site-settings/settings-form.tsx
src/app/(admin)/admin/users/[userAccountId]/error.tsx
src/app/(admin)/admin/users/error.tsx
src/app/(admin)/admin/users/loading.tsx
src/components/admin/accounts/admin-account-actions.tsx
src/components/admin/admin-logout-button.tsx
src/components/admin/admin-navigation.tsx
src/components/admin/admin-shell.tsx
src/components/admin/admin-workspace-page.tsx
src/components/admin/media/admin-media-form.tsx
src/components/admin/media/admin-media-pages.tsx
src/components/admin/media/admin-private-asset-delete.tsx
src/components/admin/media/admin-private-asset-pages.tsx
src/components/admin/players/admin-player-form.tsx
```

### 관리자 API 112개

```text
src/app/api/admin/ai-requests/route.ts
src/app/api/admin/backups/[kind]/route.ts
src/app/api/admin/balance-ai/adjustments/route.ts
src/app/api/admin/balance-ai/players/route.ts
src/app/api/admin/balance-ai/recalculate/route.ts
src/app/api/admin/balance-ai/reviews/route.ts
src/app/api/admin/balance-ai/summary/route.ts
src/app/api/admin/balance-ai/team-overrides/route.ts
src/app/api/admin/champions/[championId]/route.ts
src/app/api/admin/champions/route.ts
src/app/api/admin/competitions/destruction/[tournamentId]/route.ts
src/app/api/admin/competitions/destruction/route.ts
src/app/api/admin/competitions/events/[eventId]/route.ts
src/app/api/admin/competitions/events/route.ts
src/app/api/admin/dashboard/route.ts
src/app/api/admin/discipline-records/[recordId]/route.ts
src/app/api/admin/discipline-records/route.ts
src/app/api/admin/discipline-records/target-options/route.ts
src/app/api/admin/discipline-tasks/[taskId]/review/route.ts
src/app/api/admin/discipline/assets/[assetId]/route.ts
src/app/api/admin/highlights/[highlightId]/assets/route.ts
src/app/api/admin/highlights/[highlightId]/route.ts
src/app/api/admin/highlights/route.ts
src/app/api/admin/images/[imageId]/assets/route.ts
src/app/api/admin/images/[imageId]/home-display/route.ts
src/app/api/admin/images/[imageId]/route.ts
src/app/api/admin/images/route.ts
src/app/api/admin/kakao/recruit-health/route.ts
src/app/api/admin/kakao/rooms/route.ts
src/app/api/admin/kakao/settings/route.ts
src/app/api/admin/kakao/stats/route.ts
src/app/api/admin/login/route.ts
src/app/api/admin/logout/route.ts
src/app/api/admin/logs/route.ts
src/app/api/admin/logs/stats/route.ts
src/app/api/admin/maintenance/admin-log-cleanup/route.ts
src/app/api/admin/maintenance/rate-limit-cleanup/route.ts
src/app/api/admin/matches/[matchId]/publish/route.ts
src/app/api/admin/matches/[matchId]/restore/route.ts
src/app/api/admin/matches/[matchId]/route.ts
src/app/api/admin/matches/[matchId]/void/route.ts
src/app/api/admin/matches/editor-options/players/route.ts
src/app/api/admin/matches/import/route.ts
src/app/api/admin/matches/integrity/route.ts
src/app/api/admin/matches/route.ts
src/app/api/admin/matches/submissions/[submissionId]/approve/route.ts
src/app/api/admin/matches/submissions/[submissionId]/cancel-import/route.ts
src/app/api/admin/matches/submissions/[submissionId]/images/[imageId]/ocr/route.ts
src/app/api/admin/matches/submissions/[submissionId]/images/[imageId]/route.ts
src/app/api/admin/matches/submissions/[submissionId]/reject/route.ts
src/app/api/admin/matches/submissions/[submissionId]/reopen/route.ts
src/app/api/admin/matches/submissions/[submissionId]/review-draft/route.ts
src/app/api/admin/matches/submissions/[submissionId]/route.ts
src/app/api/admin/matches/submissions/route.ts
src/app/api/admin/operation-forms/[formType]/[id]/route.ts
src/app/api/admin/operation-forms/route.ts
src/app/api/admin/players/[playerId]/balance-profile/route.ts
src/app/api/admin/players/[playerId]/password-reset/route.ts
src/app/api/admin/players/[playerId]/reactivate/route.ts
src/app/api/admin/players/[playerId]/route.ts
src/app/api/admin/players/route.ts
src/app/api/admin/private-assets/[assetId]/metadata/route.ts
src/app/api/admin/private-assets/[assetId]/route.ts
src/app/api/admin/private-assets/route.ts
src/app/api/admin/recruits/[recruitId]/route.ts
src/app/api/admin/recruits/route.ts
src/app/api/admin/riot/bulk-link/route.ts
src/app/api/admin/riot/bulk/route.ts
src/app/api/admin/riot/link/route.ts
src/app/api/admin/riot/retry/route.ts
src/app/api/admin/riot/route.ts
src/app/api/admin/riot/sync/route.ts
src/app/api/admin/season-applications/[applicationId]/review/route.ts
src/app/api/admin/season-applications/route.ts
src/app/api/admin/season-kakao-pending/[pendingId]/cancel/route.ts
src/app/api/admin/season-kakao-pending/[pendingId]/resolve/route.ts
src/app/api/admin/season-kakao-pending/[pendingId]/route.ts
src/app/api/admin/season-kakao-pending/route.ts
src/app/api/admin/seasons/[seasonId]/activate/route.ts
src/app/api/admin/seasons/[seasonId]/clone/route.ts
src/app/api/admin/seasons/[seasonId]/end/route.ts
src/app/api/admin/seasons/[seasonId]/route.ts
src/app/api/admin/seasons/route.ts
src/app/api/admin/security/totp/disable/route.ts
src/app/api/admin/security/totp/enable/route.ts
src/app/api/admin/security/totp/route.ts
src/app/api/admin/security/totp/setup/route.ts
src/app/api/admin/session/route.ts
src/app/api/admin/site-settings/route.ts
src/app/api/admin/stats/consistency/route.ts
src/app/api/admin/stats/recalculate/route.ts
src/app/api/admin/team-tools/drafts/[draftId]/archive/route.ts
src/app/api/admin/team-tools/drafts/[draftId]/recommendations/route.ts
src/app/api/admin/team-tools/drafts/[draftId]/reevaluate/route.ts
src/app/api/admin/team-tools/drafts/[draftId]/restore/route.ts
src/app/api/admin/team-tools/drafts/[draftId]/route.ts
src/app/api/admin/team-tools/drafts/[draftId]/save/route.ts
src/app/api/admin/team-tools/drafts/[draftId]/select/route.ts
src/app/api/admin/usage/export/route.ts
src/app/api/admin/users/[userAccountId]/2fa-reset/route.ts
src/app/api/admin/users/[userAccountId]/approve/route.ts
src/app/api/admin/users/[userAccountId]/delete/route.ts
src/app/api/admin/users/[userAccountId]/details/route.ts
src/app/api/admin/users/[userAccountId]/password-reset/route.ts
src/app/api/admin/users/[userAccountId]/reject/route.ts
src/app/api/admin/users/[userAccountId]/reset-pending/route.ts
src/app/api/admin/users/[userAccountId]/reset/route.ts
src/app/api/admin/users/[userAccountId]/restore/route.ts
src/app/api/admin/users/[userAccountId]/role/route.ts
src/app/api/admin/users/[userAccountId]/route.ts
src/app/api/admin/users/[userAccountId]/suspend/route.ts
src/app/api/admin/users/route.ts
```

### 관리자 호환 handler 11개

```text
src/app/(admin)/admin/balance-ai/players/route.ts
src/app/(admin)/admin/balance-ai/recalculate/route.ts
src/app/(admin)/admin/balance-ai/reviews/[reviewId]/route.ts
src/app/(admin)/admin/balance-ai/reviews/route.ts
src/app/(admin)/admin/balance/drafts/[draftId]/recommendations/route.ts
src/app/(admin)/admin/balance/recommendations/route.ts
src/app/(admin)/admin/matches/[matchId]/ai-review/route.ts
src/app/(admin)/admin/players/[playerId]/balance/route.ts
src/app/(admin)/admin/players/[playerId]/edit/route.ts
src/app/(admin)/admin/players/[playerId]/riot/route.ts
src/app/(admin)/admin/progress/route.ts
```

### signed internal job 7개

```text
src/app/api/internal/jobs/discipline-assets-cleanup/route.ts
src/app/api/internal/jobs/discipline-assets-recover/route.ts
src/app/api/internal/jobs/kakao-daily-close/route.ts
src/app/api/internal/jobs/maintenance/route.ts
src/app/api/internal/jobs/riot-api-probe/route.ts
src/app/api/internal/jobs/riot-sync/route.ts
src/app/api/internal/jobs/storage-probe/route.ts
```

### scheduled cron 6개

```text
src/app/api/cron/destruction-ratings/route.ts
src/app/api/cron/kakao-daily-close/route.ts
src/app/api/cron/mmr-projection/route.ts
src/app/api/cron/riot-sync/route.ts
src/app/api/cron/statistics-projection/route.ts
src/app/api/cron/support-retention/route.ts
```

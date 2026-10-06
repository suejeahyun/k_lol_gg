# 공개·공통 변경 독립 재검토

- 기준: f4ab0647 대비 현재 v1.0.4 작업 diff, 2026-10-06.
- 작성자: 관리자 변경 담당. **본인이 수정한 관리자 53개 소스와 그 문구 테스트는 독립 검토 범위에서 제외**했다. 아래 public/auth/shared 변경을 읽기 전용으로 검토했다. 제품 source 수정·빌드·운영 호출은 실행하지 않았다.
- API·domain/service·DB/schema·migration 변경 파일: **0개**. package/lockfile/vercel/public 자산 변경도 없음을 확인했다. 화면 설명 정리가 서버 계약/권한/데이터 경계를 바꾸지 않았다.

## 발견 사항

- **P3 · 해결 확인:** 이벤트전 빈 결과 문구가 “이벤트전가”로 변경되어 root에 전달했다. 담당자의 수정 후 `competition-list-views.tsx:31`에서 “이벤트전이”를 다시 확인했다. 제품 과업/저장 동작의 결함으로 부풀리지 않는다.
- 독립 검토한 변경 범위에서 **새 릴리스 차단 결함이나 명확한 필수 과업 방해는 발견하지 않았다**. 이는 전체 기능/외부 연동/실기기 모두 정상이라는 선언이 아니다.

## 확인한 경계

| 범위 | 소스 근거와 판단 |
| --- | --- |
| 회원가입·로그인·복구·비밀번호·계정 | 약관/개인정보 필수 checkbox와 정책 링크, 동의 payload·가입 승인/연결 조건, 아이디/비밀번호/Riot ID 길이/형식, safe next와 복구 링크 유지. 가입 결과 설명은 신규 즉시 승인/기존 관리자 연결로 축약되어 구분 가능하다. 비밀번호 변경 후 전 기기 재로그인과 Riot ID 변경 시 기존 연동 해제 안내 유지. |
| 개인정보·약관 | 정책 본문/버전/시행일은 그대로다. 삭제는 decorative header뿐이다. 문의 연락처/내용의 운영팀 열람, 민감값 입력 금지, 수동 답변 의미, 이미지 본인/운영자 열람 범위가 남는다. |
| 신청·대회 | 공개/승인/미연결/제한/마감/예비/검토 완료 상태와 실제 동작 guard를 유지한다. 신청 회차·필터/로그인 복귀·연결 문의 링크·제출 상태가 유지된다. 이벤트 포지션은 value를 유지한 한글 label이다. 대회 취소·고정 대진·참가/MVP 조건·경매 산식·표본/누락/확정 후 고정 정보는 축약 후에도 뜻이 남는다. |
| 경기 결과 제출 | code/owner 접근·접수/이미지 수·잠금/transition·로그인/password next는 변경하지 않았다. 같은 날 회차는 label로 옮겼고 1–9999 입력 제약 유지. AWAITING_UPLOAD은 결과 화면 조건/열람 범위, PENDING_REVIEW는 제출 완료/운영자 검토 후 반영으로 표시한다. 다음 행동 링크/접수 코드·실패 상태 보존. |
| 랭킹·Riot 분석·팀 구성 | 시즌/참여 회차/최소 참여·이전 MMR 공식 표시·관리자 재계산 필요·confidence/sample 유지. Riot 미수집≠0, 분모/게임종류/맵/기간·소수 표본의 해석·로컬 기록 범위 유지. 팀 점수 누락 중립값·criterion/계산 의미·수동 배치/저장/결과 제출 control 유지. |
| 홈·탐색·상태/404 | 홈 여섯 섹션 순서, 단일 랭킹 carousel/직접 선택·최소 참여 기준·생성 이미지/테마/모션 동작 유지. 전체 검색은 결과 설명만 지우고 검색 인덱스/키보드 핸들러·로그인 필요 label을 유지. 404 홈 복구·오류 digest/재시도·권한 부족의 계정 링크 유지. 공통 StatusPanel은 선택 description/eyebrow만 조건부 렌더한다. |
| 카카오 참가 | 복사를 참가 완료로 표시하지 않는다. 조회 명령·최신 전체 명단 편집/저장 확인·모집방 문의와 상세 도움말을 유지한다. 설명이 필수 절차인 도움말 본문은 일반 장식 소개와 구분되어 남아 있다. |
| 설치 흐름 | prompt/userChoice reject를 error 상태로 처리, installing ref로 중복 실행 방지, accepted와 실제 appinstalled 분리, 첫 animation frame이 ready를 덮지 않도록 보존, appinstalled 이후 늦은 실패/취소가 installed를 덮지 않음. 실제 브라우저/실기기 설치 수명주기는 root의 실행 증거와 분리한다. |

## 검증의 한계

이번 독립 재검토는 diff·현재 소스와 계약 경계 확인이다. CUA, 새 브라우저 렌더, 전체 테스트·실제 설치/외부 API/메시지 수신은 이 담당자가 재실행하지 않았다. root의 최종 check·격리 HTTP/DB·브라우저·배포 후 증거가 릴리스 완료 판단에 필요하다. 기존 source-only 문자열 검사만으로 권한/E2E가 확인되었다고 쓰지 않는다.

## 검토 대상 public/auth/shared 소스 (85개)

```text
src/app/(public)/(applications)/applications/application-actions.tsx
src/app/(public)/(applications)/applications/error.tsx
src/app/(public)/(applications)/applications/page.tsx
src/app/(public)/(competitions)/competitions/competition-list-views.tsx
src/app/(public)/(competitions)/competitions/destruction/[tournamentId]/destruction-owner-actions.tsx
src/app/(public)/(competitions)/competitions/destruction/[tournamentId]/page.tsx
src/app/(public)/(competitions)/competitions/events/[eventId]/event-application-actions.tsx
src/app/(public)/(competitions)/competitions/events/[eventId]/page.tsx
src/app/(public)/(competitions)/competitions/page.tsx
src/app/(public)/(discipline)/discipline/page.tsx
src/app/(public)/(guides)/help/contact/page.tsx
src/app/(public)/(guides)/help/page.tsx
src/app/(public)/(guides)/help/riot/page.tsx
src/app/(public)/(guides)/install/install-actions.tsx
src/app/(public)/(guides)/install/page.tsx
src/app/(public)/(guides)/start/page.tsx
src/app/(public)/(home)/page.tsx
src/app/(public)/(matches)/matches/[matchId]/page.tsx
src/app/(public)/(matches)/matches/page.tsx
src/app/(public)/(matches)/matches/submissions/page.tsx
src/app/(public)/(matches)/matches/submit/page.tsx
src/app/(public)/(matches)/matches/submit/submission-form.tsx
src/app/(public)/(media)/highlights/[highlightId]/page.tsx
src/app/(public)/(media)/highlights/loading.tsx
src/app/(public)/(media)/highlights/page.tsx
src/app/(public)/(media)/images/[imageId]/page.tsx
src/app/(public)/(media)/images/loading.tsx
src/app/(public)/(media)/images/page.tsx
src/app/(public)/(media)/youtube-player.tsx
src/app/(public)/(recruiting)/help/recruits/page.tsx
src/app/(public)/(recruiting)/recruits/page.tsx
src/app/(public)/(registry)/players/[playerId]/page.tsx
src/app/(public)/(registry)/players/page.tsx
src/app/(public)/(statistics)/rankings/mmr/page.tsx
src/app/(public)/(statistics)/rankings/page.tsx
src/app/(public)/(tools)/tools/coin-toss/coin-toss-tool.tsx
src/app/(public)/(tools)/tools/coin-toss/page.tsx
src/app/(public)/(tools)/tools/random-team/page.tsx
src/app/(public)/(tools)/tools/random-team/random-team-tool.tsx
src/app/(public)/(tools)/tools/team-balance/drafts/[draftId]/page.tsx
src/app/(public)/(tools)/tools/team-balance/drafts/[draftId]/team-balance-draft-workspace.tsx
src/app/(public)/(tools)/tools/team-balance/drafts/page.tsx
src/app/(public)/(tools)/tools/team-balance/drafts/team-balance-recommendations-panel.tsx
src/app/(public)/(tools)/tools/team-balance/page.tsx
src/app/(public)/(tools)/tools/team-balance/team-balance-builder.tsx
src/app/(public)/(tools)/tools/team-balance/team-balance-feature-state.tsx
src/app/(public)/account/discipline/page.tsx
src/app/(public)/account/page.tsx
src/app/(public)/account/password/page.tsx
src/app/(public)/account/riot/page.tsx
src/app/(public)/error.tsx
src/app/(public)/forbidden/page.tsx
src/app/(public)/forgot-password/page.tsx
src/app/(public)/loading.tsx
src/app/(public)/login/page.tsx
src/app/(public)/privacy/page.tsx
src/app/(public)/signup/page.tsx
src/app/(public)/terms/page.tsx
src/app/globals.css
src/components/accounts/account-access.module.css
src/components/accounts/account-auth-forms.tsx
src/components/accounts/account-password-form.tsx
src/components/accounts/account-player-form.tsx
src/components/accounts/account-shell.tsx
src/components/auth/admin-login-page.tsx
src/components/competitions/destruction/live-status.tsx
src/components/competitions/destruction/public-progress.tsx
src/components/competitions/destruction/score-table.tsx
src/components/home/home-ranking-carousel.tsx
src/components/navigation/recruit-instructions.tsx
src/components/navigation/recruiting-competitions.tsx
src/components/navigation/support-form.tsx
src/components/navigation/user-site-navigation.tsx
src/components/not-found-content.tsx
src/components/riot/player-build-insights.tsx
src/components/riot/player-match-detail.tsx
src/components/riot/player-report-history.tsx
src/components/riot/player-riot-profile.tsx
src/components/riot/riot-owner-actions.tsx
src/components/site-ai-assistant.module.css
src/components/site-ai-assistant.tsx
src/components/site-feature-state.module.css
src/components/site-feature-state.tsx
src/components/site-shell.tsx
src/components/status-panel.tsx
```

## 최종 관리자 후속 변경 독립 검토

- 검토자: 공개·계정 화면 담당. 위 공개·공통 검토와 반대로, 직접 구현하지 않은 관리자 변경을 읽기 전용으로 검토했다. 제품 소스나 테스트를 수정하지 않았다.
- 범위: `admin-after.md`의 마지막 상단 분류·장식 정리 36개 파일과 계정·멸망전 기본 메시지 후속을 포함해, 기준 `f4ab0647` 대비 관리자 경로·관리자 공통·Riot 관리자 변경 TSX 57개를 대조했다. AST 비교에서 권한 확인과 mutation/command/fetch 호출, 입력의 필수 여부·길이·범위·비활성 조건, 이벤트 핸들러, 접근성 ID 참조와 제목을 확인하고 제거·축약 문구의 실제 의미를 별도로 읽었다.
- 결과: 이 검토 범위에서 새 중대 오류나 명확한 과업 방해 요소를 발견하지 않았다. 관리자/최고 관리자 경계, 계정 대상 확인, 일회성 비밀번호의 재확인 불가, MMR 공식 전환 권한, 카카오 레거시 범위, 미디어 공개·삭제 영향, 경매 최소/최대 포인트 및 기존 경기 보존 조건은 유지되어 있다. 계정과 멸망전은 기본 설명만 감추며 실제 처리·심사·실패·재시도 메시지와 결과 재확인 버튼을 유지한다.
- 제목·접근성: 장식 배지 제거 후 업무 h1과 경기 번호 h3가 남는다. 관리자 준비 화면은 서비스 준비 상태와 고유 제목, 관리자 홈 링크를 유지한다. 제거한 보조 제목을 계속 가리키는 `aria-labelledby`/`aria-describedby`/`htmlFor` 참조가 새로 생기지 않았다. Riot 확인 대화상자의 제목·설명 ID 연결도 유지한다. 사용되지 않는 import 후보는 발견하지 않았다.
- AST에서 입력·버튼 동작 차이는 앞서 통합된 계정 오류 화면 2개의 `retry` 연결만 확인했다. 설치된 Next의 `dist/client/components/error-boundary.d.ts`가 제공하는 `retry: () => void` 계약과 일치한다. 이번 관리자 장식·메시지 정리에서 새로운 명령 또는 권한 호출 변경은 없다.
- 별도 전체 검사는 재실행하지 않았다. 최종 필수 검사와 실제 UI 검증은 root의 통합 기록을 따른다. 이 검토는 정적·구조 검토이며 실제 보조기기, 실기기, 외부 카카오·Riot·수신 연동이나 운영 변경 성공을 확인한 것으로 확장하지 않는다. `git diff --check`는 exit 0이었다.

# 관리자 정리·검증 결과

기준 소스 f4ab0647에서 [Phase 1 전체 분석](admin-audit.md)을 완료한 뒤 root의 Phase 2 승인 범위만 수정했다. 관리자 페이지 61개와 지원 UI를 전부 다시 확인했다. **제품 소스 53개**, 기존 회귀 5개 문구를 수정했으며 API·DB·권한·집계·저장 로직은 변경하지 않았다.

## 바뀐 내용과 남긴 정보

- 관리 홈/목록/등록 헤더의 반복 업무 소개, 내부 단계 코드·projection/If-Match/멱등성 설명, 검색 결과의 반복 workspace 설명, 일반적인 DB/migration 확인 안내를 제거했다. 검색 인덱스의 description 메타데이터는 유지했다.
- media 업로드는 최대 장수·선택 순서·부분 성공 유지·수정 가능 상태만 간결하게 표시한다. 게시된 실제 description/접수 내용/이벤트 설명은 삭제하지 않았다.
- Riot 전체 동기화의 필터와 무관한 대상 범위, 5,000건 상한·미연결 계정 조건을 짧게 유지했다. 사용량은 브라우저와 사람, 분모·중복·부분 집계·클릭과 완료 차이를 직접 표시한다.
- 임시 비밀번호 1회 표시·역할/삭제/세션 종료·계정 연결 해제·공식 전환·보정값·입력 제한·OCR 직접 확인·비공개 범위·실제 관측 한계는 필수 정보로 남겼다.
- 운영 진단은 대기 임계값과 최근 관측 시각, 수동 검사/현재 상태의 차이, 빈 대기열 cron 최근 호출/전적 API/본인 인증/실제 휴대폰 수신의 미확인을 축약해 유지했다.
- P2: 관리자 players/users 목록의 reset만 호출하던 재시도를 Next 16.3.8 retry로 바꿔 서버 segment 재조회로 연결했다. 관리자 계정 상세는 원래 전체 reload로 복구 가능했으며, 이번에는 동일 retry 동작으로 통일했다. 상세를 기존 재조회 불가 결함으로 세지 않는다. [보정된 수정 전 재현](recovery-corrected-before.log)은 공개 신청 포함 3개 제품 실패 + 상세 1개 정상이다.

## 실제 검증

| 실행 범위 | 결과와 근거 |
| --- | --- |
| 실제 설치 Next ErrorBoundaryHandler 재시도, admin route 원장/한글 label/선택기/권한/팀 초안/챔피언/징계, Riot 목록 실제 서버 렌더/페이지/대상 범위, 경기 가져오기·충돌·키보드 dialog, 운영 진단 경계·오류 제목·파괴전 lifecycle | [admin-focused.log](admin-focused.log): 15개 테스트 파일, **51/51 PASS**. 이 중 실제 Next 재시도 4개 PASS. |
| media 업로드·usage 집계/개인정보·운영 진단 판정·선수 관리자·MMR 공식 전환 | [admin-unit.log](admin-unit.log): 5개 파일 **18/18 PASS**. 격리 단위/합성 데이터로 실행. |
| MMR UI와 실제 역할 연결 계약 | [admin-mmr-ui.log](admin-mmr-ui.log): **3/3 PASS**. 설명의 SUPER_ADMIN 문자열 대신 최고 관리자 표시를 확인하고, 페이지 allowed의 실제 SUPER_ADMIN 조건·재계산/조정 API의 SUPER_ADMIN 검사와 mutation parsing 이전 순서를 명시적으로 확인. |
| 변경 TSX 및 회귀 lint, diff whitespace | [admin-lint.log](admin-lint.log): 모두 exit 0. |
| 잔여 문구 재검토 | root의 AST 잔여 검사 재실행. 남은 행은 실제 empty/error, 입력/권한/비공개 조건, 작업 영향, 집계 의미, 외부 관측 범위로 분류했다. 단순 p/small 일괄 삭제를 하지 않았다. |

운영 진단과 Riot의 이전 긴 문장을 그대로 요구하던 문자열 assertion은 의도된 문구 축약과 불일치했다. 해당 **표시 assertion만** 축약 문구에 맞췄으며 개인정보/권한/readonly/no polling/실제 필터 범위/페이지 이동 검증은 그대로 유지했다. 초기 공개 신청 문구 불일치는 공개 담당에게 전달했고 이 담당의 최종 집중 검증에는 해당 별도 파일을 넣지 않았다. 전체 회귀·빌드·격리 DB·브라우저·배포는 root의 릴리스 검증에서 별도로 수행한다.

## 페이지별 결과 (61개)

각 행의 완료는 **선택적 설명 정리와 소스 검토** 결과다. 권한/모바일/외부 연동의 모든 상태를 이 문서만으로 실제 실행했다고 주장하지 않는다. 상세 후보와 보존 이유는 Phase 1 표에 연결한다.

| 페이지 | 결과 |
| --- | --- |
| `src/app/(admin)/admin/ai-requests/page.tsx` | 검토 완료: 호환 redirect 유지; 이동한 실제 화면에서 정리 |
| `src/app/(admin)/admin/balance-ai/page.tsx` | 완료: 해당 파일의 선택적 소개/기술 문구 제거·축약; 과업/상태/입력 유지 |
| `src/app/(admin)/admin/balance/drafts/[draftId]/page.tsx` | 완료: 해당 파일의 선택적 소개/기술 문구 제거·축약; 과업/상태/입력 유지 |
| `src/app/(admin)/admin/balance/drafts/page.tsx` | 완료: 해당 파일의 선택적 소개/기술 문구 제거·축약; 과업/상태/입력 유지 |
| `src/app/(admin)/admin/balance/page.tsx` | 완료: 해당 파일의 선택적 소개/기술 문구 제거·축약; 과업/상태/입력 유지 |
| `src/app/(admin)/admin/champions/[championId]/edit/page.tsx` | 완료: 해당 파일의 선택적 소개/기술 문구 제거·축약; 과업/상태/입력 유지 |
| `src/app/(admin)/admin/champions/new/page.tsx` | 완료: 해당 파일의 선택적 소개/기술 문구 제거·축약; 과업/상태/입력 유지 |
| `src/app/(admin)/admin/champions/page.tsx` | 완료: 해당 파일의 선택적 소개/기술 문구 제거·축약; 과업/상태/입력 유지 |
| `src/app/(admin)/admin/discipline/[recordId]/page.tsx` | 검토 완료: 자체 선택적 소개 없음 또는 실제 내용·제약·상태만 유지 |
| `src/app/(admin)/admin/discipline/new/page.tsx` | 검토 완료: 자체 선택적 소개 없음 또는 실제 내용·제약·상태만 유지 |
| `src/app/(admin)/admin/discipline/page.tsx` | 완료: 해당 파일의 선택적 소개/기술 문구 제거·축약; 과업/상태/입력 유지 |
| `src/app/(admin)/admin/highlights/[highlightId]/edit/page.tsx` | 완료: 공통 media/private-assets 컴포넌트 수정 반영 |
| `src/app/(admin)/admin/highlights/new/page.tsx` | 완료: 공통 media/private-assets 컴포넌트 수정 반영 |
| `src/app/(admin)/admin/highlights/page.tsx` | 완료: 공통 media/private-assets 컴포넌트 수정 반영 |
| `src/app/(admin)/admin/images/[imageId]/edit/page.tsx` | 완료: 공통 media/private-assets 컴포넌트 수정 반영 |
| `src/app/(admin)/admin/images/new/page.tsx` | 완료: 공통 media/private-assets 컴포넌트 수정 반영 |
| `src/app/(admin)/admin/images/page.tsx` | 완료: 공통 media/private-assets 컴포넌트 수정 반영 |
| `src/app/(admin)/admin/kakao/operation-forms/[formType]/page.tsx` | 검토 완료: 양식 공통 목록 소개 축약 반영; 접수 내용·연락/처리 상태 유지 |
| `src/app/(admin)/admin/kakao/operation-forms/page.tsx` | 검토 완료: 양식 공통 목록 소개 축약 반영; 접수 내용·연락/처리 상태 유지 |
| `src/app/(admin)/admin/kakao/page.tsx` | 완료: 해당 파일의 선택적 소개/기술 문구 제거·축약; 과업/상태/입력 유지 |
| `src/app/(admin)/admin/kakao/recruits/logs/page.tsx` | 검토 완료: 호환 redirect 유지; 이동한 실제 화면에서 정리 |
| `src/app/(admin)/admin/kakao/recruits/page.tsx` | 검토 완료: 호환 redirect 유지; 이동한 실제 화면에서 정리 |
| `src/app/(admin)/admin/kakao/recruits/settings/page.tsx` | 검토 완료: 호환 redirect 유지; 이동한 실제 화면에서 정리 |
| `src/app/(admin)/admin/kakao/rooms/page.tsx` | 완료: 해당 파일의 선택적 소개/기술 문구 제거·축약; 과업/상태/입력 유지 |
| `src/app/(admin)/admin/kakao/scrims/page.tsx` | 검토 완료: 호환 redirect 유지; 이동한 실제 화면에서 정리 |
| `src/app/(admin)/admin/kakao/season-apply/page.tsx` | 검토 완료: 호환 redirect 유지; 이동한 실제 화면에서 정리 |
| `src/app/(admin)/admin/kakao/settings/page.tsx` | 검토 완료: 호환 redirect 유지; 이동한 실제 화면에서 정리 |
| `src/app/(admin)/admin/kakao/stats/page.tsx` | 검토 완료: 호환 redirect 유지; 이동한 실제 화면에서 정리 |
| `src/app/(admin)/admin/logs/kakao/page.tsx` | 검토 완료: 호환 redirect 유지; 이동한 실제 화면에서 정리 |
| `src/app/(admin)/admin/logs/page.tsx` | 완료: 해당 파일의 선택적 소개/기술 문구 제거·축약; 과업/상태/입력 유지 |
| `src/app/(admin)/admin/matches/[matchId]/edit/page.tsx` | 검토 완료: 자체 선택적 소개 없음 또는 실제 내용·제약·상태만 유지 |
| `src/app/(admin)/admin/matches/[matchId]/page.tsx` | 검토 완료: 자체 선택적 소개 없음 또는 실제 내용·제약·상태만 유지 |
| `src/app/(admin)/admin/matches/new/page.tsx` | 완료: 해당 파일의 선택적 소개/기술 문구 제거·축약; 과업/상태/입력 유지 |
| `src/app/(admin)/admin/matches/page.tsx` | 완료: 해당 파일의 선택적 소개/기술 문구 제거·축약; 과업/상태/입력 유지 |
| `src/app/(admin)/admin/matches/submissions/[submissionId]/page.tsx` | 검토 완료: 자체 선택적 소개 없음 또는 실제 내용·제약·상태만 유지 |
| `src/app/(admin)/admin/operation-forms/[formType]/[id]/page.tsx` | 검토 완료: 양식 공통 목록 소개 축약 반영; 접수 내용·연락/처리 상태 유지 |
| `src/app/(admin)/admin/operation-forms/[formType]/page.tsx` | 검토 완료: 양식 공통 목록 소개 축약 반영; 접수 내용·연락/처리 상태 유지 |
| `src/app/(admin)/admin/operation-forms/page.tsx` | 검토 완료: 양식 공통 목록 소개 축약 반영; 접수 내용·연락/처리 상태 유지 |
| `src/app/(admin)/admin/operation-forms/warnings/page.tsx` | 검토 완료: 양식 공통 목록 소개 축약 반영; 접수 내용·연락/처리 상태 유지 |
| `src/app/(admin)/admin/page.tsx` | 완료: 해당 파일의 선택적 소개/기술 문구 제거·축약; 과업/상태/입력 유지 |
| `src/app/(admin)/admin/players/[playerId]/page.tsx` | 완료: 해당 파일의 선택적 소개/기술 문구 제거·축약; 과업/상태/입력 유지 |
| `src/app/(admin)/admin/players/new/page.tsx` | 완료: 해당 파일의 선택적 소개/기술 문구 제거·축약; 과업/상태/입력 유지 |
| `src/app/(admin)/admin/players/page.tsx` | 완료: 해당 파일의 선택적 소개/기술 문구 제거·축약; 과업/상태/입력 유지 |
| `src/app/(admin)/admin/private-assets/[assetId]/page.tsx` | 완료: 공통 media/private-assets 컴포넌트 수정 반영 |
| `src/app/(admin)/admin/private-assets/page.tsx` | 완료: 공통 media/private-assets 컴포넌트 수정 반영 |
| `src/app/(admin)/admin/progress/destruction/[tournamentId]/page.tsx` | 검토 완료: 자체 선택적 소개 없음 또는 실제 내용·제약·상태만 유지 |
| `src/app/(admin)/admin/progress/destruction/new/page.tsx` | 완료: 해당 파일의 선택적 소개/기술 문구 제거·축약; 과업/상태/입력 유지 |
| `src/app/(admin)/admin/progress/destruction/page.tsx` | 완료: 해당 파일의 선택적 소개/기술 문구 제거·축약; 과업/상태/입력 유지 |
| `src/app/(admin)/admin/progress/event/[eventId]/page.tsx` | 검토 완료: 자체 선택적 소개 없음 또는 실제 내용·제약·상태만 유지 |
| `src/app/(admin)/admin/progress/event/new/page.tsx` | 완료: 해당 파일의 선택적 소개/기술 문구 제거·축약; 과업/상태/입력 유지 |
| `src/app/(admin)/admin/progress/event/page.tsx` | 완료: 해당 파일의 선택적 소개/기술 문구 제거·축약; 과업/상태/입력 유지 |
| `src/app/(admin)/admin/recruits/page.tsx` | 검토 완료: 호환 redirect 유지; 이동한 실제 화면에서 정리 |
| `src/app/(admin)/admin/riot/page.tsx` | 완료: 해당 파일의 선택적 소개/기술 문구 제거·축약; 과업/상태/입력 유지 |
| `src/app/(admin)/admin/search/page.tsx` | 완료: 해당 파일의 선택적 소개/기술 문구 제거·축약; 과업/상태/입력 유지 |
| `src/app/(admin)/admin/seasons/kakao-pending/[pendingId]/page.tsx` | 검토 완료: 자체 선택적 소개 없음 또는 실제 내용·제약·상태만 유지 |
| `src/app/(admin)/admin/seasons/kakao-pending/page.tsx` | 검토 완료: 자체 선택적 소개 없음 또는 실제 내용·제약·상태만 유지 |
| `src/app/(admin)/admin/seasons/page.tsx` | 완료: 해당 파일의 선택적 소개/기술 문구 제거·축약; 과업/상태/입력 유지 |
| `src/app/(admin)/admin/site-settings/page.tsx` | 완료: 해당 파일의 선택적 소개/기술 문구 제거·축약; 과업/상태/입력 유지 |
| `src/app/(admin)/admin/usage/page.tsx` | 완료: 해당 파일의 선택적 소개/기술 문구 제거·축약; 과업/상태/입력 유지 |
| `src/app/(admin)/admin/users/[userAccountId]/page.tsx` | 검토 완료: 자체 선택적 소개 없음 또는 실제 내용·제약·상태만 유지 |
| `src/app/(admin)/admin/users/page.tsx` | 완료: 해당 파일의 선택적 소개/기술 문구 제거·축약; 과업/상태/입력 유지 |

## 실제 수정 소스

```text
src/app/(admin)/admin/balance-ai/mmr-admin-actions.tsx
src/app/(admin)/admin/balance-ai/page.tsx
src/app/(admin)/admin/balance-ai/team-balance-override-actions.tsx
src/app/(admin)/admin/balance/drafts/[draftId]/page.tsx
src/app/(admin)/admin/balance/drafts/page.tsx
src/app/(admin)/admin/balance/page.tsx
src/app/(admin)/admin/champions/[championId]/edit/not-found.tsx
src/app/(admin)/admin/champions/[championId]/edit/page.tsx
src/app/(admin)/admin/champions/champion-form.tsx
src/app/(admin)/admin/champions/new/page.tsx
src/app/(admin)/admin/champions/page.tsx
src/app/(admin)/admin/discipline/page.tsx
src/app/(admin)/admin/kakao/page.tsx
src/app/(admin)/admin/kakao/rooms/page.tsx
src/app/(admin)/admin/logs/page.tsx
src/app/(admin)/admin/matches/[matchId]/match-integrity-review.tsx
src/app/(admin)/admin/matches/match-editor.tsx
src/app/(admin)/admin/matches/new/admin-import-panel.tsx
src/app/(admin)/admin/matches/new/page.tsx
src/app/(admin)/admin/matches/page.tsx
src/app/(admin)/admin/operational-health.tsx
src/app/(admin)/admin/page.tsx
src/app/(admin)/admin/players/[playerId]/page.tsx
src/app/(admin)/admin/players/error.tsx
src/app/(admin)/admin/players/new/page.tsx
src/app/(admin)/admin/players/not-found.tsx
src/app/(admin)/admin/players/page.tsx
src/app/(admin)/admin/progress/destruction/[tournamentId]/destruction-admin-actions.tsx
src/app/(admin)/admin/progress/destruction/new/page.tsx
src/app/(admin)/admin/progress/destruction/page.tsx
src/app/(admin)/admin/progress/event/[eventId]/event-admin-actions.tsx
src/app/(admin)/admin/progress/event/new/page.tsx
src/app/(admin)/admin/progress/event/page.tsx
src/app/(admin)/admin/riot/page.tsx
src/app/(admin)/admin/search/page.tsx
src/app/(admin)/admin/seasons/page.tsx
src/app/(admin)/admin/site-settings/page.tsx
src/app/(admin)/admin/usage/page.tsx
src/app/(admin)/admin/users/[userAccountId]/error.tsx
src/app/(admin)/admin/users/error.tsx
src/app/(admin)/admin/users/page.tsx
src/components/admin/accounts/admin-account-actions.tsx
src/components/admin/admin-shell.tsx
src/components/admin/admin-workspace-page.tsx
src/components/admin/media/admin-media-form.tsx
src/components/admin/media/admin-media-pages.tsx
src/components/admin/media/admin-private-asset-delete.tsx
src/components/admin/media/admin-private-asset-pages.tsx
src/components/admin/players/admin-player-form.tsx
src/components/discipline/admin-discipline-create-form.tsx
src/components/operation-forms/admin-operation-form-list.tsx
src/components/riot/riot-admin-actions.tsx
src/components/usage/usage-report.tsx
```

## 미확인 경계

- 이 담당은 CUA를 실행하지 않았다. 데스크톱/모바일의 실제 배치와 순서별 전체 과업 확인은 root 기록을 따른다.
- auth 관리자 로그인/보안 화면과 public 공유 팀/대회 화면은 다른 담당 소유이며 여기서 중복 수정하지 않았다.
- 운영 외부 송신, 실계정·회원 데이터 변경, 최고 관리자 MMR 공식 전환, 실기기·RSO 승인과 실제 수신은 수행하지 않았다.
- 배포·운영 확인은 이 파일 작성 시 root가 담당하는 후속 단계다. 이 파일은 그 완료를 선언하지 않는다.

## 전체 검사 후 문구 계약 보정

- `kakao-v4-installation-scope.test.ts`: 삭제한 긴 구현 설명 대신 V1 strict R8/V4의 프로필별 권한, 방 등록부 레거시 전용, V2/V3 설치본당 방 1개, V4 권한/라우팅 영향 없음 표시를 검증한다. 화면의 SUPER_ADMIN 수정/readOnly 조건도 명시적으로 확인했다. 기존 HMAC·서명·잘못된 설치본/프로필 거부·room registry 미참조·전화 콜백 격리 실행 테스트는 그대로 유지했다.
- `media-private-assets.test.ts`: 부분 성공 이미지 유지 문구와 저장소 미연결 시 file picker 대신 업로드 불가 상태를 확인한다. READY에서만 원본 링크, DELETE_PENDING에서 삭제 비활성화, 실제 API 관리자 인증 이후 bytes 접근을 함께 확인했다. 기존 MIME/용량/동일 출처/If-Match/SHA 검증은 유지했다.
- [admin-contract-followup.log](admin-contract-followup.log): 두 파일과 기존 실제 gallery 파일 계획/부분 결과 검증 **19/19 PASS**. 수정한 두 test ESLint exit 0. 최초 diff-check에서 CRLF 줄끝을 trailing whitespace로 보고해 두 파일을 LF로 정규화한 뒤 diff-check exit 0.
- 제품 소스 변경 없음. 운영 자산·실회원 데이터·외부 발송 사용 없음.

## 기본 상태의 잔여 부가 설명 최종 점검

- 관리자 JSX의 정적 텍스트뿐 아니라 `message` 등의 조건식·fallback도 재검토했다. 계정 작업의 revision/멱등성/트랜잭션 구현 설명과 멸망전 작업의 반복 기본 안내를 제거했다. 실제 메시지·진행 중·심사 중·재시도 상태가 있을 때만 해당 영역을 렌더하여 기본 상태의 빈 안내 상자도 남기지 않는다.
- 계정 작업의 성공 `status`/실패 `alert`와 `aria-live`, 멸망전의 처리/심사 상태 및 요청 결과 다시 확인 버튼은 유지했다. 발급된 일회성 비밀번호의 현재 상태, 권한, 삭제/복구 영향, 입력 조건, 경매 포인트 계산 기준과 단계 준비 상태는 부가 설명으로 분류하지 않았다.
- AI 요청 로그의 빈 결과에서 현재 활성 상태를 확인하지 않고 제시하던 “AI는 기본적으로 비활성입니다”를 제거했다. “기록된 AI 요청이 없습니다”라는 실제 빈 상태는 유지했다.
- 이번 추가 수정 파일: `src/components/admin/accounts/admin-account-actions.tsx`, `src/app/(admin)/admin/progress/destruction/[tournamentId]/destruction-admin-actions.tsx`, `src/app/(admin)/admin/logs/page.tsx`. API·DB·인증·mutation 로직 변경 없음.
- 기존 focused 계약 검사 [7/7 PASS](admin-idle-contracts.log), 일회성 비밀번호/멸망전 workflow 단위 검사 [11/11 PASS](admin-idle-unit.log), 세 소스 ESLint exit 0. 이 검사는 실제 브라우저 DOM의 표시 확인을 대체하지 않으며 최종 화면 확인과 전체 검사·배포는 root 통합 기록으로 구분한다.

## 상단 분류 코드·장식 표제 최종 정리

- 실제 관리자 화면에서 발견한 S01/S02/S12를 계기로 관리자·인증 페이지와 관리자 공통 컴포넌트의 header/hero/eyebrow/panelHeading 및 정적 배지를 AST와 문자열 검색으로 대조했다. S07/S08/S09/A3, 버튼의 S06 구현 분류 코드도 함께 제거했다.
- 한국어 제목을 반복하는 ADMIN/KAKAO/HUMAN REVIEW/DETERMINISTIC REVIEW, GAME 번호, FILTERED QUEUE/PLAYER MATCH, 콘텐츠·자료/새 콘텐츠, 시즌·운영 진단 등의 장식 표제를 제거했다. breadcrumb의 보호된 작업 공간 fallback과 그때의 단독 구분자도 제거했다. 인증 화면에는 해당 장식 표제 실사용이 남아 있지 않아 추가 수정하지 않았다.
- 실제 권한·대상 구분·집계·운영 상태는 유지했다. 사이트 설정은 최고 관리자 전용으로 표시하고, 계정 상세의 사용자 계정/동적 로그인 아이디, 카카오 접수 정보/동적 접수 이름, 현재 역할, 운영 환경, 변경 버전, 대회 방식, 수동 재계산 권한, 비공개/삭제 영향은 보존했다. 생성 이미지 자산·테마·네트워크/DB/API 로직 변경 없음.
- 기존 3개 테스트에서 분류 코드가 든 장식 표제의 기대값만 실제 h1 사용자 계정/플레이어 등록부로 교체했다. 해당 테스트의 역할 제한, 현재 상태, 복구, 데이터 계약 검사는 유지했다.
- [admin-heading-contracts.log](admin-heading-contracts.log) 13개 파일 **56/56 PASS**, [admin-heading-unit.log](admin-heading-unit.log) 4개 파일 **27/27 PASS**. 마지막 breadcrumb/통계 중복 표제 정리 뒤 [admin-heading-final-targeted.log](admin-heading-final-targeted.log) **16/16 PASS**. 수정 소스와 테스트 ESLint `--max-warnings 0`, diff-check exit 0. 실브라우저 전체 화면 확인이나 배포 확인으로 확장하여 주장하지 않는다.
- 이 추가 정리는 아래 36개 소스에만 적용했다. 아래 목록은 이 단계의 변경 목록이며 앞 단계 53개 목록을 새로 집계한 수치가 아니다.

```text
src/app/(admin)/admin/balance-ai/page.tsx
src/app/(admin)/admin/balance/drafts/[draftId]/page.tsx
src/app/(admin)/admin/balance/drafts/page.tsx
src/app/(admin)/admin/balance/page.tsx
src/app/(admin)/admin/champions/new/page.tsx
src/app/(admin)/admin/champions/page.tsx
src/app/(admin)/admin/discipline/[recordId]/page.tsx
src/app/(admin)/admin/discipline/new/page.tsx
src/app/(admin)/admin/discipline/page.tsx
src/app/(admin)/admin/kakao/page.tsx
src/app/(admin)/admin/kakao/rooms/page.tsx
src/app/(admin)/admin/logs/page.tsx
src/app/(admin)/admin/matches/[matchId]/match-integrity-review.tsx
src/app/(admin)/admin/matches/match-editor.tsx
src/app/(admin)/admin/matches/submissions/[submissionId]/submission-review.tsx
src/app/(admin)/admin/operation-forms/[formType]/[id]/page.tsx
src/app/(admin)/admin/operational-health.tsx
src/app/(admin)/admin/page.tsx
src/app/(admin)/admin/players/[playerId]/page.tsx
src/app/(admin)/admin/players/new/page.tsx
src/app/(admin)/admin/players/page.tsx
src/app/(admin)/admin/progress/destruction/page.tsx
src/app/(admin)/admin/progress/event/[eventId]/event-admin-actions.tsx
src/app/(admin)/admin/progress/event/page.tsx
src/app/(admin)/admin/riot/page.tsx
src/app/(admin)/admin/search/page.tsx
src/app/(admin)/admin/seasons/kakao-pending/[pendingId]/page.tsx
src/app/(admin)/admin/seasons/kakao-pending/page.tsx
src/app/(admin)/admin/seasons/page.tsx
src/app/(admin)/admin/site-settings/page.tsx
src/app/(admin)/admin/usage/page.tsx
src/app/(admin)/admin/users/page.tsx
src/components/admin/admin-navigation.tsx
src/components/admin/admin-workspace-page.tsx
src/components/admin/media/admin-media-pages.tsx
src/components/admin/media/admin-private-asset-pages.tsx
```

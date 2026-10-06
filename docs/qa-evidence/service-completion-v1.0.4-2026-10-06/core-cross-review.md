# 공통 화면·관리자 변경 독립 교차 검토

- 검토자: journey_audit (공개 핵심 8페이지 담당, 이 문서의 공통·관리자 소스는 다른 담당자 변경)
- 기준: `f4ab0647` 대비 1.0.4 작업 트리 변경. 2026-10-06.
- 방식: 변경 diff와 주변 실제 구현을 읽는 독립 검토. 이 단계에서 제품 소스 변경·빌드·배포·운영 데이터 조작은 하지 않았다.
- 결론: 아래 범위에서 보조 문구 제거로 새로 생긴 주요 과업 방해, 필수 상태 의미 손실, 끊어진 접근성 참조는 발견하지 않았다. 실제 화면 배치와 운영 동작은 별도 브라우저·배포 확인 대상이다.

## 공통 화면

| 검토 대상 | 실제 확인 사항 |
| --- | --- |
| `components/site-shell.tsx`, `app/globals.css` | 브랜드 보조 문장·푸터 소개만 제거. 본문 바로가기의 `#main-content`, 하나의 `main`, 도움말·처음 이용·정책 링크, Riot 고지는 유지. CSS 삭제는 제거된 `brand small`, 검색 결과 설명, 메뉴 힌트 선택자에 대응한다. |
| `components/navigation/user-site-navigation.tsx` | 검색·전체 메뉴의 제목 ID와 `aria-labelledby`가 일치한다. 검색 입력 label, 결과 목록, 로그인 필요 표시, 플레이어 검색 대안, 닫기 버튼은 남는다. 방향키·Enter·Escape와 포커스 제어를 제거하지 않았다. 삭제한 힌트에 연결된 `aria-describedby`는 없다. |
| `components/status-panel.tsx`, `components/not-found-content.tsx` | 설명·eyebrow는 선택값일 때만 렌더한다. 제목과 `aria-labelledby`, 복구 링크는 유지된다. 삭제 문구 때문에 빈 설명 태그를 남기지 않는다. 공통 404 내용은 자체 shell/main을 추가하지 않는다. |
| `components/site-feature-state.tsx`, `.module.css` | 비활성 상태와 조회 실패를 각각 직접 제목으로 표시한다. `status`/`alert` 구분과 홈 복귀 링크를 유지한다. 삭제된 문단 공간에 맞춰 제목 여백이 조정되었다. |
| `components/site-ai-assistant.tsx`, `.module.css` | 도우미 제목 ID, 입력 label·제약, 닫기·전송 이름, 로딩 및 실패 응답이 유지된다. 빈 대화 영역은 입력 전 대화 기록 영역이며 form은 바로 이용 가능하다. 입력 목적 외 저장하지 않는 개인정보 문구를 유지한다. 기능 설정·API·권한·요청 처리는 이번 diff에서 바뀌지 않았다. |

## 관리자 화면과 중요한 작업 상태

| 검토 대상 | 실제 확인 사항 |
| --- | --- |
| `app/(admin)/admin/layout.tsx`, `components/admin/admin-shell.tsx` | 관리자 layout의 `requirePageRole`와 요청 주소 복귀 처리, 역할 표시, 로그아웃·관리자 검색·메뉴가 유지된다. AdminShell은 `main`을 만들지 않아 하위 관리자 오류 페이지의 `main`과 중복되지 않는다. |
| 관리자 `players/error.tsx`, `users/error.tsx`, `users/[userAccountId]/error.tsx` | 오류 제목과 다시 시도 버튼 유지. 실제 서버 데이터를 다시 요청하는 Next `retry`로 연결된다. 계정 상세 목록 복귀 링크도 유지된다. |
| `components/admin/admin-workspace-page.tsx` | 소개·계약 설명이 없어져도 제목, 준비 중 상태, 내용 section의 접근성 제목, 관리자 홈 복귀 링크가 남는다. 빈 카드나 끊어진 제목 참조가 생기지 않았다. |
| `components/admin/accounts/admin-account-actions.tsx` | 임시 비밀번호의 1회 표시, 페이지 이탈 후 재확인 불가, 재발급 복구 조건을 짧게 유지한다. 대상 아이디 확인·운영 사유·권한 조건·보기/복사/닫기와 상태 변경 제어는 유지한다. |
| `components/admin/players/admin-player-form.tsx`, `components/discipline/admin-discipline-create-form.tsx` | Riot ID 도움말에 연결된 실제 ID가 남으며 비활성화·재활성화 영역 제목도 유지한다. 입력 형식·사유 최소 길이·플레이어 선택과 해당 코드 값에 변경이 없다. |
| `components/admin/media/admin-media-form.tsx`, `admin-media-pages.tsx`, `admin-private-asset-pages.tsx`, `admin-private-asset-delete.tsx` | 이미지 선택 한도·형식·크기 및 `aria-describedby` 대상, 선택 순서·부분 성공 보존·편집 가능 상태·저장소 미연결 구분을 유지한다. 삭제 요청과 실제 파일 정리 시점 차이가 남는다. 업로드·연결·재시도·조회 제어는 삭제되지 않았다. |
| `app/(admin)/admin/operational-health.tsx` | 조회 시점 기록과 현재 상태의 한계를 분리하며, 통계·일 마감·Riot·알림의 점검 시간 기준과 수동 검사 범위를 남긴다. 실제 휴대폰 수신·현재 API 권한 등을 확인된 것으로 바꾸지 않았다. |
| `app/(admin)/admin/balance-ai/mmr-admin-actions.tsx`, `team-balance-override-actions.tsx` | 관리자/최고 관리자 역할 구분, 팀 편성만 반영·원장과 저장 초안 유지·0점 해제 조건 보존. 작업 확인과 입력 제어 변경 없음. |
| `app/(admin)/admin/matches/match-editor.tsx`, `matches/[matchId]/match-integrity-review.tsx`, `matches/new/admin-import-panel.tsx` | 구조 검사 성공 상태와 MVP 자동 계산 의미, 오류 목록, 저장·공개·무효화·복구 제어를 유지한다. OCR은 비공개 원본·후보 검토·명시적 승인 후 공개 조건이 남는다. 자동 검수의 등급·오류/경고 수·다시 분석 버튼도 남는다. |
| 이벤트·멸망전 관리자 action 컴포넌트 | 승인 회원 가져오기 조건, 경매 상태·금액·팀 정원 제약, 교체 적용 범위, MVP 결과 변경 안내와 최고 관리자 제한이 유지된다. |
| `components/auth/admin-login-page.tsx` | 중복 로그인 설명 제거 후에도 h1/section 참조, 홈 링크, 실제 로그인 form 및 `nextPath` 전달은 유지된다. |

## 확인된 오류와 검증 근거 연결

Next 설치본의 error boundary 계약에서 `reset`은 이전 오류만 지우고, `retry`는 데이터 갱신을 요청한다. 기존 오류 화면 3곳은 전자를 사용했고, 계정 상세는 페이지 reload를 사용했다. root가 추가한 `tests/route-error-recovery.test.mjs`는 문자열 검사 대신 실제 설치된 `ErrorBoundaryHandler`의 `refresh` 호출을 계수한다. 원본 결과는 3 실패·1 통과, 수정 결과는 4 통과이다. 교차 검토에서는 해당 테스트 구현과 현재 source 연결을 확인했으며 같은 검사를 다시 반복하지 않았다.

추가로 root는 신청 오류 화면을 실제 PublicLayout·SiteShell과 조합했을 때 `main`이 2개라는 회귀를 먼저 재현했다. 해당 바깥 태그를 `div`로 바꾼 뒤 하나의 본문 영역과 오류/재시도 버튼이 함께 남는지 검사했다. [application-landmark-after.log](application-landmark-after.log)의 8개 사례는 404·관리자 권한 경계·신청 오류 본문·서버 재요청 검증이 통과했음을 기록한다. 테스트 수를 실브라우저 또는 외부 연동 확인으로 해석하지 않는다.

## 별도 확인 범위

- 축약 문구의 최종 줄바꿈·빈 공간·모바일 메뉴·시각적 대비·실제 키보드 포커스는 root의 최적화 빌드 브라우저 확인으로 판단한다.
- 통합 필수 검사와 운영 배포 및 배포 후 동작 확인은 root의 1.0.4 릴리스 기록을 따른다.
- 운영 권한이 필요한 실제 관리자 변경·외부 저장소·Riot·휴대폰 수신을 이 source 검토만으로 검증 완료라고 표시하지 않는다.
- 이 범위에서는 권한/데이터 경로 변경이나 새로운 기능 추가가 없어 별도 기능 확장을 제안하지 않았다.

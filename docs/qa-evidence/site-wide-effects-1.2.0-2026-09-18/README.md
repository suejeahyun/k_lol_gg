# 사이트 전체 효과 확장 1.2.0 검수

- 검증일: 2026-09-18 KST
- 기능 버전: `site-wide-effects@1.2.0`
- 범위: 공개·계정·인증·관리자 105개 페이지
- 데이터 변경: 없음
- 운영 배포: 기능 커밋 확정 후 기록

## 반영 범위

- 공통: 실제 viewport 진입 reveal, 스크롤 header depth, 활성 navigation line, 버튼 press, busy sheen, 성공·경고·오류·선택 surface, form validity, dialog·table focus
- 홈: 여성 챔피언 포인터 광원, 제한된 깊이 이동, Top 3, feed 종류, 활성 시즌, 우승 사진 효과
- 구인: 정원 progress, 빈 상태·마감 임박·만석, 주최자와 참가자 상태
- 경기·접수: 시리즈 승자, 게임 승리 팀, MVP, 업로드 등록률, 접수 상태와 처리 중 피드백
- 팀 도구: 참가자 10명 완성, BLUE·RED team, 점수 균형도, 라인 차이, 추천 선택, drag·keyboard·저장 상태
- 미디어·랭킹·대회: 실제 이미지 load blur 해제, HOME·영상 상태, Top 3·MMR 신뢰도, 대회 종류·진행·승자·우승
- 계정·관리자: focus-within, 저장·대기·성공·실패 상태선, 선택 행, upload, 권한·시즌·경기·Kakao 상태

## 자동 검증

| 검증 | 결과 |
| --- | --- |
| `npm run check` | PASS |
| ESLint | 오류 0, 기존 private bot 산출물 비차단 경고만 존재 |
| TypeScript | PASS |
| Drizzle ERD drift | PASS |
| 계약·단위 테스트 | 784개 중 783 PASS, PostgreSQL 전용 1개 의도적 skip |
| 여성 챔피언 홈 이미지 | 68명·68개·1672×940·SHA-256 중복 0 |
| Next.js production build | PASS, 정적 페이지 93개 |
| 격리 PostgreSQL·복구 계약 | PASS |
| 전체 화면 합성 QA | 105페이지·339캡처·HTTP 200·issue 0 |
| 로컬 production 브라우저 품질 | 27/27 PASS, issue 0 |
| `git diff --check` | PASS |

## 브라우저 품질

공개 핵심 9개 경로를 desktop, mobile, 320px narrow 환경에서 검사했다.

- 최대 TTFB: 253ms
- 최대 LCP: 584ms
- 최대 CLS: 0
- 최대 long task: 208ms
- 최대 요청: 47개
- 최대 전송량: 517,705 bytes
- 최대 script: 215,624 bytes
- 수평 넘침·키보드 focus 누락·감속 모션 위반·axe 위반: 0

## 전체 화면 캡처

- App Router page: 105/105
- capture: 339/339
- HTTP 200: 339
- 자동 감지 issue: 0
- session: anonymous 109, account 39, admin 188, setup 3
- 운영 데이터·운영 credential 사용: 없음
- 임시 결과: `.tmp/site-wide-effects-1.2.0-20260918`

### 증거 SHA-256

| 파일 | SHA-256 |
| --- | --- |
| `summary.json` | `95C8BED4CFD70E6CF3919E6DE2F2C5461C14A9339BD9475D995306FF9D0315F0` |
| `screenshots/index.json` | `B2F59701EEAC9079D9847203CBCE0E003109CC6CF33AF4C3279C72CEC9D81695` |
| `browser-quality-local.json` | `2DE95EFED7B9C7CF7DC32ED1F6A16C3F15964A74DA3FC64ADE65BA0CE4295E48` |

## 육안 검수

홈 desktop/mobile, 구인, 팀 밸런스 desktop/mobile, 랭킹, 관리자 dashboard를 직접 확인했다.

- 제목·입력·CTA가 효과에 가려지지 않음
- 홈 챔피언 이미지와 텍스트 대비 유지
- 구인 정원과 참여자 정보가 상태 효과와 함께 읽힘
- 팀 밸런스 폼의 DOM 순서와 모바일 한 열 흐름 유지
- 관리자 화면은 반복 장식 없이 focus·상태 중심
- 모바일 수평 잘림 없음

## 안전 경계와 남은 확인

- 강한 효과는 홈·Top 3·승자·우승에 한정했다.
- hover·포인터 광원은 fine pointer에서만 동작한다.
- `prefers-reduced-motion`에서는 이동·반복 효과를 제거한다.
- forced-colors에서는 색상 장식을 테두리와 Highlight로 대체한다.
- 실제 저사양 Android GPU와 Windows 실기기 고대비·200% 확대는 운영자 기기 수동 확인이 남아 있다.

## 다음 패치 추천

1. 7일간 RUM으로 INP·LCP·long task와 저사양 모바일 체감을 관찰한다.
2. 실제 구인 참가·삭제 완료율과 팀 밸런스 확정률을 효과 적용 전후 비교한다.
3. Windows 고대비·200% 확대와 Android TalkBack을 실기기로 확인한다.
4. 실제 사용량이 확인된 상태 패턴부터 `StatusSurface` 공통 primitive로 점진 추출한다.
5. 멸망전 대진표 데이터가 충분할 때 선택 팀 경로와 다음 라운드 이동 효과를 별도 패치한다.

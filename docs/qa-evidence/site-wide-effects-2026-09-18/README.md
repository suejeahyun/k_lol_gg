# 사이트 전체 효과·휠 캐러셀 검수

- 검증일: 2026-09-18 KST
- 기능 커밋: `a79d3fc79edc18b234bb04e39018580ca237d49f`
- 범위: 공개·계정·관리자 105개 페이지, 홈 우승 사진·이미지 상세 캐러셀
- 판정: 소스 반영, 로컬 통합 검증, 전체 화면 검수, Vercel 운영 배포, 운영 별칭 검증 완료

## 운영 배포

- Vercel Production: `dpl_FVVQ3zMhumLt8xB1xUyRm61RTxxi`
- 불변 URL: `https://k-lol-p88rgvruj-tjdmswo11-3715s-projects.vercel.app`
- 운영 별칭: `https://k-lol-gg.vercel.app`
- Vercel 판정: `Ready` · `Production` · commit `a79d3fc`
- 운영 별칭 확인: 2026-09-18 19:35:38 KST
- `/api/health`: HTTP 200 · `application/json` · `{"status":"ready"}`
- DB migration·운영 데이터 직접 수정·삭제: 없음

불변 URL은 Vercel Deployment Protection 화면을 반환하므로 공개 애플리케이션 품질 검사는 운영 별칭에서 수행했다. 배포 자체의 `Ready`·`Production`·commit 연결은 로그인된 Vercel 배포 상세에서 확인했다.

## 변경 요약

- 공개·계정·관리자 화면이 공통 `VisualEffectsController`를 재사용하도록 연결했다.
- 경로 전환과 동적 카드·패널에 짧은 reveal을 적용하고 현재 세로 위치를 상단 진행선으로 표시한다.
- 공개 기능 surface와 관리자 operational surface를 구분해 관리자 표·폼에는 과한 장식을 적용하지 않았다.
- 신청, 경기 접수·이력, 징계 현황, 가이드·구인 도움말에 의미 있는 상태선·강조·focus를 보강했다.
- 검색·플레이어 선택·티어 필터의 키보드 focus를 보강하고 모바일 header blur를 낮췄다.
- 버튼·배지의 `transition-all`을 필요한 속성 전환으로 제한했다.
- 홈 우승 사진과 이미지 상세 캐러셀은 마우스 휠로 한 장씩 가로 이동한다.
- 첫 사진의 위쪽 휠과 마지막 사진의 아래쪽 휠은 세로 페이지 스크롤로 빠져나오며 자동 재생·무한 휠 순환은 없다.
- 좌우 화살표 키, 이전·다음 버튼, 직접 선택 점과 스크린리더 안내를 유지했다.

## 자동 검증

| 검증 | 결과 |
| --- | --- |
| `npm run check:wave` | PASS |
| `npm run check` | PASS |
| ESLint | 오류 0, 기존 private 산출물의 비차단 경고만 존재 |
| TypeScript | PASS |
| Drizzle ERD drift | PASS |
| 계약·단위 테스트 | 784개 중 783 PASS, 격리 PostgreSQL 전용 1개 의도적 skip |
| 여성 챔피언 홈 안내 이미지 | 68명·68개·1672×940·SHA-256 중복 0 |
| Next.js production build | PASS, 정적 페이지 93개 생성 |
| 전체 화면 합성 QA | 105페이지·339캡처·HTTP 200·issue 0 |
| 운영 별칭 브라우저 품질 | 27/27 PASS, 접근성·수평 넘침·모션·성능 issue 0 |
| 운영 휠 캐러셀 | 5장 실제 데이터에서 1→2→3→4→5 이동 및 마지막 경계 세로 스크롤 확인 |

## 전체 화면 캡처

- App Router 페이지: 105/105
- 캡처: 339/339
- HTTP 200: 339
- 자동 감지 issue: 0
- 세션: anonymous 109, account 39, admin 188, setup 3
- 실제 운영 데이터와 실제 자격 증명: 사용·저장하지 않음
- 결과 경로: `.tmp/site-wide-effects-20260918`

### 증거 SHA-256

| 파일 | SHA-256 |
| --- | --- |
| `summary.json` | `B984C64D225215C0377754E5769E87412783621DA60FD8DFF91D8B319187666B` |
| `screenshots/index.json` | `21C08DA8747238ADE76409F8ABD72370C69BFF7B35522EE9E5E50F484A2DE4D3` |
| `browser-quality-production.json` | `7CA3A058AEB2D31BECB6BE93C5DE07C5261D65F33DEBD5E58056EB1D1A49BF42` |

## 브라우저 품질

공개 핵심 9경로를 desktop, mobile, 320px narrow에서 운영 별칭으로 검사했다.

- 27/27 PASS, issue 0
- WCAG 2 A/AA·2.1 A/AA·2.2 AA 자동 위반 0
- 수평 넘침 0
- 키보드 focus 비표시 0
- 감소 모션 위반 0
- 최대 TTFB 21ms
- 최대 LCP 1,788ms
- 최대 CLS 0.0174
- 최대 long task 161ms
- 최대 요청 24개
- 최대 전송량 607,122 bytes
- 최대 script 186,109 bytes

## 육안 검수

홈 desktop/mobile, 참가 신청, 경기 결과 접수, 징계 현황, 구인 도움말, 관리자 홈 desktop/mobile을 직접 확인했다.

- 제목·입력·CTA가 효과에 가려지지 않음
- 모바일 카드가 한 열로 정리되고 수평 잘림이 없음
- 상태 색은 텍스트·숫자와 함께 표시됨
- 관리자 화면은 선택·focus 중심이며 반복 모션이 없음
- 운영 홈의 우승 사진 5장이 휠 한 번에 한 장씩 이동함
- 마지막 사진에서 다음 휠 입력이 페이지 세로 스크롤로 이어짐

## 검증 한계

- 실제 모바일 터치 감각, 스크린리더 실사용, Windows 고대비 실기기는 자동 검사와 CSS 계약으로 확인했다.
- Riot·Blob·Kakao 외부 쓰기 기능은 이번 시각 효과 범위에서 호출하지 않았다.
- Vercel 불변 URL은 Deployment Protection 대상이라 공개 브라우저 품질은 운영 별칭을 기준으로 했다.

## 다음 패치 추천

1. 배포 후 7일간 실제 사용자 LCP·CLS와 캐러셀 이탈률을 비교한다.
2. 홈 외 대회 상세의 다중 사진 묶음도 실제 사용량이 확인될 때 같은 캐러셀 primitive로 통합한다.
3. Windows 실제 고대비와 200% 확대를 운영자 기기에서 수동 점검한다.
4. 상태 강조가 중복되는 공개 카드부터 공통 `StatusSurface` primitive로 점진 추출한다.
5. 모바일 저사양 기기에서 blur와 shadow 비용을 RUM으로 관찰하고 필요 시 한 단계 더 낮춘다.

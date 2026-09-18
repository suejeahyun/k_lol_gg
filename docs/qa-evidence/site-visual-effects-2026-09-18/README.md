# 사이트 시각 효과·전체 화면 검수

- 검증일: 2026-09-18 KST
- 기능 커밋: `9235bbbfd767b2775311c7b9a1dd77ac3584d97d`
- 범위: 홈, 구인, 경기, 랭킹·MMR, 팀 밸런스, 대회, 미디어, 계정, 관리자 공통 화면
- 현재 판정: 소스 반영·로컬 통합 검증·Vercel 운영 배포·운영 별칭 health 확인 완료

## 운영 배포

- Vercel Production: `dpl_5zKtasDGL6ZUVeauVA8PL3CJTPK9`
- 불변 URL: `https://k-lol-303oj671s-tjdmswo11-3715s-projects.vercel.app`
- 운영 별칭: `https://k-lol-gg.vercel.app`
- Vercel 판정: `Ready` · `Production`
- 운영 별칭 확인: 2026-09-18 18:53:34 KST
- `/api/health`: HTTP 200 · `{"status":"ready"}`
- DB migration·운영 데이터 직접 수정·삭제: 없음

## 적용 원칙

- 홈 히어로와 핵심 결과만 Signature 효과를 사용한다.
- 구인·경기·대회·미디어는 상태와 우선순위를 보여 주는 Feature 효과를 사용한다.
- 계정과 관리자는 장식보다 입력, 선택, 성공, 경고, 오류의 구분을 우선한다.
- hover는 fine pointer에서만 실행하고, 일반 reveal은 180~240ms로 제한한다.
- `prefers-reduced-motion`, 키보드 focus, forced-colors를 별도 경계로 둔다.
- 영상, 파티클, 새 폰트, 새 애니메이션 라이브러리는 추가하지 않는다.

상세 계약은 `docs/frontend/VISUAL_EFFECTS_SYSTEM.md`에 고정했다.

## 변경 요약

- 전역 surface·shadow·glow·motion 토큰과 홈 1회 reveal을 추가했다.
- 구인 카드에 유형·상태 스트라이프, 정원 표시, 주최자 강조를 추가했다.
- 경기 카드에 블루·레드·무승부 텍스트와 결과 밴드를 추가했다.
- 시즌 랭킹 1~3위, 본인 행, MMR 상태·빈 화면의 위계를 강화했다.
- 팀 밸런스 활성 단계, 결과 등장, 블루·레드 팀 표면을 강화했다.
- 이벤트 대회와 멸망전의 색조, 상태 진행선과 완료 결과를 분리했다.
- 미디어 대표 카드, 이미지 오버레이, 이미지 비율과 focus-visible을 강화했다.
- 계정·관리자 본문과 라벨의 최소 가독성, 선택·성공·경고·오류 상태를 보강했다.

## 자동 검증

| 검증 | 결과 |
| --- | --- |
| `npm run check` | PASS |
| ESLint | 오류 0, 기존 private 산출물의 비차단 경고만 존재 |
| TypeScript | PASS |
| Drizzle ERD drift | PASS |
| 계약·단위 테스트 | 783개 중 782 PASS, 격리 PostgreSQL 전용 1개 의도적 skip |
| 여성 챔피언 홈 안내 이미지 | 68명·68개·1672×940·SHA-256 중복 0 |
| Next.js production build | PASS, 정적 페이지 93개 생성 |
| 격리 PostgreSQL 전체 계약·복구·FK·rollback | PASS |
| 인증 HTTP | PASS |
| 릴리스 증거·migration 연결 | 30개 PASS |
| Git 전체 이력 비밀값 검사 | PASS, 고신뢰 비밀 패턴 0 |

## 전체 화면 캡처

- App Router 페이지: 105/105
- 캡처: 339/339
- HTTP 200: 339
- 자동 감지 issue: 0
- 세션: anonymous 109, account 39, admin 188, setup 3
- 화면 폭: desktop 159, tablet 90, mobile 90
- 실제 운영 데이터와 실제 자격 증명: 사용·저장하지 않음
- 결과 경로: `.tmp/site-full-audit-effects-20260918`

### 증거 SHA-256

| 파일 | SHA-256 |
| --- | --- |
| `summary.json` | `FBDA0B7A839AC23CAC1AF9F4A60D474AACBB535F124DB60B31DC5609F59AD1D0` |
| `screenshots/index.json` | `69D12D8D71FD66E4420703D2D81E7AA2F07DD1FC24B47128BC72B18C3AC317CF` |
| `browser-quality.json` | `97A4C98FB34FA42C5CEC465A41EA6AE2CED4F22112B24F0FA69D0D420E3D06C8` |

## 브라우저 품질

공개 핵심 9경로를 desktop, mobile, 320px narrow에서 검사했다.

- 27/27 PASS, issue 0
- WCAG 2 A/AA·2.1 A/AA·2.2 AA 자동 위반 0
- 수평 넘침 0
- 키보드 focus 비표시 0
- 감소 모션 위반 0
- 최대 TTFB 34ms
- 최대 LCP 344ms
- 최대 CLS 0
- 최대 long task 98ms
- 최대 요청 47개
- 최대 전송량 505,678 bytes
- 최대 script 209,190 bytes

## 육안 검수

홈 desktop/mobile, 구인 desktop/mobile, 경기, 랭킹, 팀 밸런스, 이벤트 대회, 멸망전, 미디어, 계정 플레이어 편집, 관리자 사용자 계정을 직접 확인했다.

- 효과가 제목·입력·CTA를 가리지 않음
- 카드 상태선과 결과 강조가 색상 외 텍스트와 함께 표시됨
- 390px 모바일에서 카드가 한 열로 정리되고 수평 잘림이 없음
- 관리자 표와 탐색의 본문·메타 가독성이 개선됨
- 과도한 무한 모션, 자동 재생, 모바일 패럴랙스가 없음

## 검증 한계

- 캡처의 미디어 자산은 격리 QA 저장소 fixture라 외부 운영 Blob 자체를 증명하지 않는다. 실패 상태 UI가 안전하게 표시되는 것은 확인했다.
- 실제 모바일 터치 감각, 스크린리더 실사용, Windows 고대비 실기기는 자동 검사와 CSS 계약으로만 확인했다.
- Riot·Blob·Kakao 외부 서비스와 운영 데이터의 쓰기 동작은 이번 시각 효과 패치 범위에서 호출하지 않았다.

## 다음 패치 추천

1. 운영 이미지 자산을 대상으로 썸네일 전달 성공률과 원본 비율을 별도 관측한다.
2. 팀 밸런스 결과가 있는 fixture를 추가해 블루·레드 결과 화면을 캡처 회귀에 고정한다.
3. 관리자 대형 표의 200% 확대와 Windows 실제 고대비 모드를 수동 점검한다.
4. 홈과 핵심 목록의 RUM LCP·CLS를 배포 후 7일 동안 비교한다.
5. 상태 강조용 공통 primitive를 점진적으로 추출해 화면별 CSS 중복을 줄인다.

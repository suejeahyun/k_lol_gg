# K-LOL.GG UI V2 Integration Audit

## 기준 폴더

- 최종 작업 폴더: `2.k_lol_gg_ui_v2_integration`
- 기능 참고 폴더: `0.k_lol_gg` (읽기 전용 기준)
- UI 참고 폴더: `1.k_lol_gg_v2` (Figma/V2 구조 참고)

## 이번 패치 완료

- 다크모던 기반 테마 시스템 추가: `다크`, `네온`, `골드`
- 라이트 테마 제거 유지. 다크/네온/골드는 서로 다른 색상·표면·배경 질감을 사용
- 테마 버튼을 PC 상단바와 모바일 앱 헤더에 추가
- 테마 선택값을 `localStorage`에 저장하고 초기 렌더 전에 적용
- 고품질 사이트 장식 이미지 6종 추가
  - 홈 히어로 트로피
  - 공통 페이지 헤더 크리스탈
  - 와이드 배경 프레임
  - 모바일 앱 배경
  - 관리자 컨트롤룸 배경
  - 라이브/경매 스테이지 배경
- `/app` 모바일 홈을 검색 페이지가 아닌 모바일 홈 요약형으로 재구성
- 와이드 화면 배경 오버레이를 재조정해 검정 바탕 느낌을 줄이고, 좌우/상단에 다크모던 경기장 조명 노출
- 모바일 폭에서는 `/app` 안내/이동 게이트 적용
- 사용자 티어 수동 입력 제거: 회원가입, 내 플레이어 정보, `/account/tier`에서 Riot 연동/동기화 흐름으로 전환
- 레거시 수동 티어 편집 컴포넌트와 내 정보 저장 payload의 티어 잔여값 제거
- Riot API 키가 있으면 Riot 기능 활성화. 명시적으로 `RIOT_FEATURE_ENABLED=false`일 때만 비활성화
- Riot 솔랭 동기화 성공 시 `Player.currentTier` 자동 갱신, 기존 최고 티어보다 현재 Riot 티어가 높으면 `Player.peakTier`도 자동 보정
- 관리자 대시보드 자동 승인 정책 문구 반영
- 관리자 Riot 페이지 문구와 상태를 자동 티어 동기화 중심으로 정리
- `0.k_lol_gg` 최신 main과 최종 비교
  - page/api/layout 라우트 수 동일 확인: page 140, api 160, layout 5
  - `0`에만 있던 최신 Prisma migration 6개를 `2`에 반영
  - Riot Production/RSO 환경변수 예시와 신청 문서를 `2`에 반영
  - Riot 도메인 검증 파일 `public/riot.txt`를 `0` 최신 값으로 동기화
  - 코드에서 참조되지 않는 light theme 이미지 자산 제거 유지
- PC 홈, 플레이어 목록, 모바일 홈 대표 화면 캡처 검증
- `npm run build` 통과

## 검증 기준

- PC 와이드: 2293px 기준 전체 높이 캡처
- 모바일 앱: 390px 기준 전체 높이 캡처
- 수평 오버플로우 확인
- 고정 하단 탭바가 모바일 실제 viewport에서 사용 가능한지 확인
- 본문을 가리는 배경 이미지가 없는지 확인

## 대표 검증 결과

| Route | 상태 | 메모 |
| --- | --- | --- |
| `/` | 통과 | 히어로, TOP3, 최근 내전, 시즌 요약, 멸망전 우승, 최근 MVP, 진행현황 배치 확인 |
| `/players` | 통과 | 와이드에서 테이블형 데이터 보드 유지, 수평 넘침 없음 |
| `/app` | 통과 | 모바일 홈 요약형으로 변경, 구인/내전/TOP3/MVP 노출 |
| `/admin` | 통과 | 자동 승인 카드, 운영 로그, 와이드 수평 넘침 없음 |
| `/admin/riot` | 통과 | Riot 기능 활성 상태, 연결/솔랭 캐시/동기화 작업 요약 확인 |
| `/signup` | 통과 | 수동 티어 입력 제거, Riot API 자동 반영 안내 노출 |

## 유지/삭제 정책

- 게시판, 클립, 사진첩, 공지사항, 이벤트 공지는 삭제 유지
- Discord 관련 UI/기능은 삭제 유지
- Light theme UI/자산은 삭제 유지. 테마는 dark/neon/gold만 유지
- 카카오/Riot/내전/랭킹/팀밸런스/멸망전/이벤트 중심으로 정리
- 관리자 화면은 유저 화면보다 절제된 다크모던 운영 도구 톤 유지

## 다음 세부 점검 우선순위

1. `/players/[id]`: 내전 통계와 솔랭 통계 탭형 정리
2. `/matches/[id]`: 챔피언 원형 얼굴, 팀 비교, 세트 요약 강화
3. `/players/balance`: 신청자 가져오기, 계산, 추천 결과 UI 고도화
4. `/players/balance/recommendations`: 추천안 A/B/C 비교 UI 재구성
5. `/progress/event/*`, `/progress/destruction/*`: 탭형 상세 구조 최종 검수
6. `/participation/*`: 시즌/이벤트/멸망전 신청 흐름 정리
7. `/admin/*`: 회원/플레이어 통합 관리 세부 UX, 카카오 관리, 경고/주의 관리 순서로 추가 정리

## 빌드 결과

```txt
npm run typecheck
✓ TypeScript passed

npm run build
✓ Compiled successfully
✓ TypeScript passed
✓ Generated static pages successfully

npx eslint src/components/ThemeSwitcher.tsx
✓ Passed

npx eslint 'src/app/(admin)/admin/page.tsx' 'src/app/(admin)/admin/riot/page.tsx' 'src/app/(admin)/admin/users/page.tsx' 'src/app/(user)/account/page.tsx' 'src/app/(user)/account/tier/page.tsx' 'src/app/(user)/me/player/page.tsx' 'src/app/(user)/me/riot/page.tsx' src/app/api/auth/signup/route.ts src/app/api/my-player/route.ts src/components/AccountProfileEditForm.tsx src/components/SignupForm.tsx src/components/riot/RiotAccountManager.tsx src/lib/riot/feature.ts src/lib/riot/solo-sync.ts
✓ Passed
```

## 남은 기술 부채

- `npm run lint` 전체 실행은 기존 관리자/카카오/랜덤팀 파일의 누적 오류로 실패
- 이번 패치에서 추가한 `ThemeSwitcher.tsx`는 별도 ESLint 검증 통과
- 전체 lint 복구는 UI 작업과 분리해서 기존 `any`, `Date.now()` render purity, unused import 항목을 정리하는 별도 패치 권장

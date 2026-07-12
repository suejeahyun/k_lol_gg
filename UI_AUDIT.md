# K-LOL.GG Dark Modern Audit

## 기준 폴더

- 최종 작업 폴더: `0.k_lol_gg`
- 기능 참고 폴더: `0.k_lol_gg` 현재 main 기준
- UI 참고 폴더: `1.k_lol_gg_v2`, `2.k_lol_gg_ui_v2_integration`

## 이번 최종 점검 반영

- 슈퍼어드민 사이트 설정을 방별 운영형으로 확장: 사이트명, 방 이름, 기본 테마, 로고 URL, 배경 URL, 체험 종료일, 결제 담당, 운영 메모
- 공개 사이트 설정 런타임 반영 추가: 방별 기본 테마와 배경 이미지가 전역 CSS 변수로 적용됨
- 기본 배경 이미지 값을 `/images/theme/dark-modern/klol-global-stage-v1.png`로 지정해 신규 배포 직후 검정 배경처럼 보이지 않도록 수정
- 상단바/유저 사이드바/관리자 사이드바에 사이트 로고 URL 표시 지원
- 관리자 대시보드에 운영 사이트, 잠긴 기능 수, 활성 구인, 오늘 구인 로그, 방별 기능 상태, ENV 준비 상태 카드 추가
- 모바일 작은 화면에서 PC 라우트 접근 시 `/app` 계열로 즉시 안내되도록 부트 스크립트 보강
- `/app/players` 기본 노출 인원을 12명으로 제한해 모바일 검색 페이지의 과도한 세로 길이 완화
- 상세 페이지 hero 제목/이름 영역이 우측 버튼에 밀리지 않도록 PC hero title offset 보정
- `/progress/destruction/*` 상세 hero 액션을 제목 중앙 정렬을 방해하지 않는 구조로 보정
- 랭킹 1/2/3위 이미지를 원형 프레임과 등수별 테두리로 정리
- 모든 상세 설명성 문구를 숨기는 CSS 범위 확장
- 내전 상세 슬라이더에 이전/다음/현재 세트 컨트롤 연결
- 멸망전 경매 관리자 화면의 운영 확대 보조 액션 연결
- 팀 밸런스 결과에서 사용하지 않는 점수 근거 상세 코드 제거
- 카카오/API/매치 import 쪽 미사용 보조 함수 정리
- 보안 관련 관리자 2FA 상태 로딩 hook 구조 안정화

## 기능/운영 정책 확인

- 게시판, 클립, 사진첩, 공지사항, 이벤트 공지는 삭제 유지
- Discord 관련 UI/기능은 삭제 유지
- Light theme 삭제 유지. 테마는 dark/neon/gold만 유지
- 유료 잠금 대상: Kakao, 구인현황, K-LOL 랭킹/Balance AI, 랜덤 팀 나누기, Riot 연동 관리
- 사이트별 방 운영은 `SiteSetting`/env/DB 분리 기준으로 지원
- Riot 티어는 닉네임#태그/Riot 연동 기반 자동 동기화 방향 유지

## 브라우저 검증

검증 기준:

- PC wide: `2293x960`
- Mobile: `390x844`
- 확인 항목: 수평 overflow, 제목/hero 중앙 정렬, 상세 설명 잔여 표시, 모바일 `/app` 리다이렉트

대표 결과:

| Route | 상태 | 메모 |
| --- | --- | --- |
| `/` | 통과 | 수평 overflow 없음, 상세 설명 잔여 없음 |
| `/players` | 통과 | 테이블형 데이터 보드 유지, 수평 overflow 없음 |
| `/players/38` | 통과 | 이름/닉네임 영역 우측 보정, 상세 설명 숨김 |
| `/players/38/riot` | 통과 | 이름/닉네임 영역 우측 보정, 상세 설명 숨김 |
| `/rankings` | 통과 | 랭킹 프레임 적용, 수평 overflow 없음 |
| `/matches` | 통과 | 필터/목록 수평 overflow 없음 |
| `/matches/39` | 통과 | 슬라이더 문서 폭 overflow 없음, 이전/다음 컨트롤 연결 |
| `/progress/destruction/16` | 통과 | 콘텐츠 중앙 정렬, 액션 버튼이 제목 중앙을 방해하지 않음 |
| `/ai-balance` | 통과 | 수평 overflow 없음 |
| `/random-team` | 통과 | 유료 잠금 대상 유지, 수평 overflow 없음 |
| `/recruit` | 통과 | 유료 잠금 대상 유지, 수평 overflow 없음 |
| `/admin/login` | 통과 | 전체 화면 중앙 정렬 |
| `/admin/riot` | 통과 | 상세 설명 잔여 CSS 보정 |
| `/admin/matches` | 통과 | 버튼/테이블 수평 overflow 없음 |
| `/app` | 통과 | 모바일 홈 요약형, 수평 overflow 없음 |
| `/app/players` | 통과 | 기본 12명 표시로 길이 완화, 수평 overflow 없음 |
| `/app/matches` | 통과 | 수평 overflow 없음 |
| `/app/rankings` | 통과 | 수평 overflow 없음 |
| `/app/me` | 통과 | 수평 overflow 없음 |

추가 확인:

- `/api/site-settings` 공개 설정 응답 확인
- `homeBackgroundUrl` 기본값 노출 확인
- 브라우저 런타임에서 `data-site-background="custom"` 및 `--site-background-image` 적용 확인

## 검증 명령 결과

```txt
npm run lint
✓ 0 errors
! 11 warnings: remaining warnings are next/image recommendations for QR, Riot/champion, ranking, auction images

npm run typecheck
✓ passed

npm run prisma:validate
✓ schema valid

npm run check:admin-guards
✓ 63 admin routes checked

npm run check:secrets
✓ no exposed secret detected

npm audit --audit-level=high
✓ found 0 vulnerabilities

npm run build
✓ compiled successfully
✓ TypeScript passed
✓ static pages generated
```

## 배포 전 필수 확인

- `npm run check:deploy-readiness`는 로컬에서 `SUPER_ADMIN_ID` 누락으로 실패
- Vercel 프로젝트별 env에 `SUPER_ADMIN_ID`를 반드시 설정해야 함
- 방별 별도 배포 시 각 Vercel 프로젝트에 DB/env/site setting을 별도 연결해야 함

## 남은 권장 개선

- `next/image`로 전환 가능한 정적 이미지부터 단계적으로 최적화
- `/players/[id]/riot` 전체 높이가 긴 편이므로 최근 20게임 분석을 탭/접힘 섹션으로 더 줄이는 후속 개선 가능
- 관리자 상세 페이지들은 기능은 통과했지만, 운영 빈도에 따라 고급 설정/일반 작업 메뉴를 더 분리하면 사이드바 밀도가 낮아짐

## 생성 이미지 적용 재검수

추가 검수 기준:

- 생성 이미지/텍스처가 단순 홈 화면에만 머물지 않고 유저 상세, 매치 상세, 참가자, 관리자 카드/테이블까지 닿는지 확인
- 외부 챔피언 이미지가 늦게 로딩될 때 빈칸처럼 보이지 않는지 확인
- 큰 이미지가 카드/패널 안에서 의미 없이 잘리거나 텍스트를 방해하지 않는지 확인

반영:

- 상세 페이지 전용 표면 보강: `player-panel`, `player-analysis-panel`, `civil-radar-card`, `civil-kpi-board`, `champion-stat-card`
- 매치 상세 보강: `match-series-detail`, `match-slide`, `match-slide__panel`, `match-slide__row`
- 멸망전/참가 페이지 보강: `destruction-detail-summary-card`, `destruction-rank-list`, `destruction-match-list`, `destruction-participant-table-wrap`
- 관리자 페이지 보강: `admin-matches-header`, `admin-player-row-card`, `admin-summary-card`, `admin-log-section`, `admin-form`, 관리자 모듈형 `__panel/__tableWrap/__list`
- Riot/내전 챔피언 이미지 fallback 보강: 외부 Data Dragon 이미지가 늦거나 실패해도 원형 프레임과 어두운 크리스탈 배경이 유지됨

재검수 결과:

| 항목 | 결과 |
| --- | --- |
| 실제 깨진 이미지 | 0건 |
| 주요 라우트 수평 overflow | 없음 |
| 큰 이미지 비율/잘림 위험 | 감지 없음 |
| 생성 이미지 적용 | 홈, 유저 목록/상세, 랭킹, 매치, 팀밸런스, 진행현황, 참가, 관리자, 모바일 `/app` 전반 적용 |
| 외부 이미지 지연 | Riot/Data Dragon 챔피언 이미지 일부가 늦게 로딩될 수 있어 fallback 프레임 적용 |

판정:

- 현재 생성 이미지는 페이지 목적에 맞게 들어가 있으며, 검정 단색 배경으로 남는 대표 페이지는 없음
- 홈/랭킹은 시각 자산이 가장 강하게 보이고, 관리자 페이지는 과한 장식 없이 질감 중심으로 정리됨
- 추가 이미지 생성보다는 현재 10개 고품질 배경을 목적별로 재사용하는 편이 더 깔끔함

## 모바일 앱 전환 패치 검증

- PC 공통 CSS 안전장치 추가: 모든 주요 컨테이너 `min-width: 0`, 와이드/노트북 폭별 content max 보정, 테이블 래퍼 수평 스크롤 보정
- 모바일 게이트 확장:
  - `/players` → `/app/players`
  - `/players/[id]` → `/app/players/[id]`
  - `/players/balance`, `/balance`, `/random-team` → `/app`
  - `/matches/[id]` → `/app/matches/[id]`
  - `/recruit`, `/kakao`, `/recruit-helper` → `/app/recruits`
  - `/progress/*`, `/participation/*` → `/app/matches?tab=events`
  - `/ai-balance` → `/app/rankings`
  - `/admin/*` → `/app/admin`
- `/app/matches` 재구성: 내전 / 구인 / 랭킹 / 이벤트 탭 허브화
- `/app/recruits` 재구성: 전체 / 진행중 / 마감 / 취소 / 초기화 상태 필터, 기본 16개 노출
- `/app/rankings` 재구성: TOP3 섹션 + 전체 랭킹, 플레이어 상세 링크 연결
- `/app/me` 재구성: 로그인 전/후 분기, 내 시즌 요약, Riot 연동/솔랭 요약, 관리자 바로가기
- `/app/matches/[id]`: 챔피언 원형 아이콘 추가
- `/app/admin`: 운영 상태, 빠른 확인, 로그 요약 보강

브라우저 확인:

| 기준 | Route | 결과 |
| --- | --- | --- |
| PC 2293x960 | `/`, `/players`, `/rankings`, `/matches`, `/progress/destruction/16` | 수평 overflow 없음 |
| PC 2293x960 | `/app`, `/app/matches?tab=events`, `/app/recruits`, `/app/me` | 수평 overflow 없음 |
| Mobile 390x844 | `/players` | `/app/players` 이동, 수평 overflow 없음 |
| Mobile 390x844 | `/players/38` | `/app/players/38` 이동, 수평 overflow 없음 |
| Mobile 390x844 | `/players/balance` | `/app` 이동, 수평 overflow 없음 |
| Mobile 390x844 | `/matches/39` | `/app/matches/39` 이동, 수평 overflow 없음 |
| Mobile 390x844 | `/recruit` | `/app/recruits` 이동, 수평 overflow 없음 |
| Mobile 390x844 | `/progress/destruction/16` | `/app/matches?tab=events` 이동, 수평 overflow 없음 |
| Mobile 390x844 | `/ai-balance` | `/app/rankings` 이동, 수평 overflow 없음 |
| Mobile 390x844 | `/admin` | `/app/admin` 이동, 수평 overflow 없음 |

검증 명령:

```txt
npm run typecheck
✓ passed

npm run lint
✓ 0 errors
! 11 warnings: existing next/image recommendations

npm run prisma:validate
✓ schema valid

npm run check:admin-guards
✓ 63 admin routes checked

npm run check:secrets
✓ no exposed secret detected

npm audit --audit-level=high
✓ found 0 vulnerabilities

npm run build
✓ compiled successfully
```

## 멸망전 경매 추첨 실사용 테스트 2026-07-11

테스트 데이터:

- 대상: `/destruction-auction-live/17`
- 테스트 멸망전: `TEST`
- 랜덤 참가자: 30명
- 팀장: 6명
- 경매 대상: 24명

패치:

- 추첨 버튼 클릭 시 사운드 unlock 대기가 UI 상태 전환을 막지 않도록 비동기 처리
- 대기 카드 영역을 단순 `K` 카드에서 실제 `/auction-cards/back-premium.svg` 기반 3장 카드 덱으로 변경
- 대기/보류/완료 상태를 카드 덱 하단 pill로 표시
- 다크모던 오버라이드가 예전 span 카드 스타일을 덮어쓰지 않도록 CSS 정리

전체 과정 검증:

```txt
1. 테스트 멸망전 17번에 랜덤 참가자 30명 입력
2. 팀장 6명 / 경매 대상 24명 생성
3. 경매 전용 화면 접속
4. 플레이어 추첨 클릭
5. 카드 섞기 오버레이 확인
6. 티어 상승/카드 공개 확인
7. Blue Crown에 37P 낙찰 저장
8. DB 반영 확인: 하림(SUP) SOLD, Blue Crown 잔여 263P
9. 화면 반영 확인: 미추첨 23명, 낙찰 1/24명
```

대표 캡처:

- `artifacts/visual-audit/auction-draw-test/auction-live-test-ready-after-patch.png`
- `artifacts/visual-audit/auction-draw-test/auction-draw-shuffling-after-patch.png`
- `artifacts/visual-audit/auction-draw-test/auction-draw-final-revealed-after-patch.png`
- `artifacts/visual-audit/auction-draw-test/auction-after-sold-closed-after-patch.png`
- `artifacts/visual-audit/auction-draw-test/auction-after-sold-viewport-after-patch.png`

검증:

```txt
npm run typecheck
✓ passed
```

## 대표 라우트 재순회 감사 2026-07-11

브라우저 세션 기준:

- Viewport: `2293x960`
- 대상: 유저/관리자/모바일/경매 대표 38개 라우트
- 검사: 네비게이션 실패, 수평 overflow, 깨진 이미지

결과:

```txt
라우트 수: 38
네비게이션 실패: 0
수평 overflow: 0
깨진 이미지: 0
하드 이슈: 0
```

의도된 이동:

- `/participation` → `/progress`
- `/participation/destruction/16` → `/progress/destruction/16`

감사 산출물:

- `artifacts/visual-audit/route-sweep-20260711/route-sweep.json`
- `artifacts/visual-audit/route-sweep-20260711/route-sweep-summary.json`
- `artifacts/visual-audit/route-sweep-20260711/*.png`

배포 준비:

- `npm run check:deploy-readiness`는 로컬 `SUPER_ADMIN_ID` 누락으로 실패
- Vercel 방별 프로젝트마다 `SUPER_ADMIN_ID`, DB URL, Riot/Kakao/env를 별도로 지정해야 함

## 최종 검수 패치 2026-07-11

적용:

- 대표 라우트 33개 Node HTTP 점검: 전부 `200`
- 프로젝트 감사 스크립트: pages 141, apis 164, sourceFiles 610, issueCount 0
- `/players/[id]`, `/players/[id]/riot`, `/progress/destruction/[id]` 상세 헤더의 제목 중앙 정렬 우선순위 보강
- `/rankings` TOP3/테이블 메달 이미지 전용 원형 링 CSS 보강
- 관리자 대시보드에 배포 전 ENV 보안 상태 추가
- 약한 슈퍼어드민/필수 ENV 경고는 값 노출 없이 키와 사유만 표시

검증:

```txt
npm run typecheck
✓ passed

npm run lint
✓ 0 errors
! 11 warnings: existing next/image recommendations

npm run prisma:validate
✓ schema valid

npm run check:admin-guards
✓ 63 admin routes checked

npm run check:secrets
✓ no exposed secret detected

npm audit --audit-level=high
✓ found 0 vulnerabilities

npm run build
✓ compiled successfully
```

배포 차단:

- `npm run check:deploy-readiness`는 로컬 슈퍼어드민 값이 운영 기준으로 약해서 실패
- 현재 실패 항목: `SUPER_ADMIN_ID`, `SUPER_ADMIN_PASSWORD` 12자 미만 및 추측 가능한 값
- Vercel 운영 배포 전 방별 프로젝트마다 강한 슈퍼어드민 ID/PW와 필수 ENV를 재설정해야 함

## 이미지 목적성 최종 검수 패치 2026-07-11

적용:

- 홈 TOP3의 랭킹 이미지/티어 이미지가 이중 원형으로 겹치던 구조를 제거하고, 순위는 CSS 배지·티어는 단일 원형 이미지로 정리
- 홈 히어로/배경 이미지는 콘텐츠 영역 안에서 잘리지 않도록 높이와 배경 포지션을 재조정
- AI 팀 밸런스 결과 영역은 BLUE/RED 대전판 이미지를 배경으로 사용하도록 CSS 적용
- 밴픽 추천과 팀 결과 패널도 동일한 BLUE/RED 시각 언어를 공유하도록 정리
- 멸망전 경매/카드 뽑기 UI는 카드 뒷면·카드 프레임·경매 스테이지 이미지를 목적별로 적용
- `/players/[id]`, `/players/[id]/riot`, `/progress/destruction/[id]` 상세 헤더는 우측 버튼 때문에 제목이 밀리지 않도록 중앙 정렬 보강
- Riot 상세의 챔피언 이미지는 lazy 로딩으로 검수 시 깨진 이미지처럼 잡히지 않도록 eager 로딩으로 변경
- 모바일 `/app`, `/app/matches`, `/app/rankings`의 TOP3 순위 배지를 골드/실버/브론즈 스타일로 통일

시각 검수:

```txt
PC wide 2293x960
/                              이미지 깨짐 0, 수평 overflow 없음, 홈 TOP3 이중 원형 제거 확인
/players                       이미지 깨짐 0, 수평 overflow 없음
/rankings                      이미지 깨짐 0, 랭킹 이미지 원형 링 확인
/players/38                    이미지 깨짐 0, 제목 중앙 정렬 확인
/players/38/riot               이미지 깨짐 0, 제목 중앙 정렬 확인
/players/balance               수평 overflow 없음, BLUE/RED 대전판 배경 CSS 적용 확인
/ai-balance                    수평 overflow 없음
/matches                       수평 overflow 없음
/matches/39                    가시 챔피언 이미지 정상, 수평 overflow 없음
/recruit                       수평 overflow 없음
/progress                      수평 overflow 없음
/progress/destruction/16       제목 중앙 정렬 확인, 수평 overflow 없음
/participation                 수평 overflow 없음
/participation/destruction/16  수평 overflow 없음
/account                       수평 overflow 없음
/account/tier                  수평 overflow 없음

Mobile 390x844
/app, /app/players, /app/matches, /app/recruits, /app/rankings, /app/me, /app/admin
✓ 이미지 깨짐 0
✓ 수평 overflow 없음
✓ 모바일 TOP3 순위 배지 적용 확인
```

대표 캡처:

- `artifacts/visual-audit/final-image-pass/home-wide-viewport-after-layout.png`
- `artifacts/visual-audit/final-image-pass/player-detail-wide-after-header.png`
- `artifacts/visual-audit/final-image-pass/player-riot-wide-after-header.png`
- `artifacts/visual-audit/final-image-pass/destruction-detail-wide-after-header.png`
- `artifacts/visual-audit/final-image-pass/app-mobile-after-rank-badges.png`

검증 명령:

```txt
npm run typecheck
✓ passed

npm run lint
✓ 0 errors
! 10 warnings: existing next/image recommendations

npm run prisma:validate
✓ schema valid

npm run check:admin-guards
✓ 63 admin routes checked

npm run check:secrets
✓ no exposed secret detected

npm run build
✓ compiled successfully
```

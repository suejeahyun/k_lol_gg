# K-LOL.GG Dark Modern Audit

## 기준 폴더

- 최종 작업 폴더: `0.k_lol_gg`
- 기능 참고 폴더: `0.k_lol_gg` 현재 main 기준
- UI 참고 폴더: `1.k_lol_gg_v2`, `2.k_lol_gg_ui_v2_integration`

## 이번 최종 점검 반영

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

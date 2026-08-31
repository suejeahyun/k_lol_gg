# Bright Bloom 브라우저·자동 QA 기록

## 범위

- 브랜치: `ui/next-site-improvement-2026-08-31`
- 기준 디자인: `16-bright-bloom-redesign-spec.md`
- 확인 환경: 로컬 Next.js 개발 서버, Chromium 기반 인앱 브라우저
- 데스크톱 및 390×844 모바일 뷰포트

## 확인된 결과

### 공통

- 홈 영웅 영역, 내비게이션, 카드, 입력 폼, 모바일 하단 내비게이션을 Bright Bloom 색상 체계로 전환했다.
- Bright Bloom, Lavender Dream, Mint Breeze 테마 모두 밝은 배경과 읽을 수 있는 대비를 유지했다.
- 전면 로딩 화면이 화면 전체를 덮도록 수정해 이전의 어두운 배경이 노출되지 않는다.
- 홈 브라우저 콘솔에서 오류와 경고가 발견되지 않았다.

### 데스크톱 화면

다음 경로를 실제 브라우저에서 열어 레이아웃, 색 대비, 주요 CTA와 폼 가독성을 확인했다.

- `/`
- `/recruit`
- `/players`
- `/matches`
- `/rankings`
- `/participation`
- `/login`
- `/progress`
- `/random-team`
- `/ai-balance`
- `/discipline`
- `/highlights`
- `/coin-toss`

### 모바일 화면

- `/app`: 밝은 모바일 홈, 영웅 영역, 카드, 하단 내비게이션을 확인했다.
- `/app/recruits`: 밝은 모집 목록과 모바일 서브탭을 확인했다.

## 자동 검증

다음 명령은 현재 디자인 변경을 포함한 상태에서 통과했다.

- `npm run check`
- `npm run build`
- `npm audit --omit=dev --audit-level=high`
- `npm run check:bright-bloom`
- `npm run check:next-site-improvements`
- `npm run check:mobile-user-flow`
- `npm run check:accessibility`
- `npm run typecheck`
- `npm run lint`
- `git diff --check`

Bright Bloom 핵심 스타일 파일은 47,859바이트로 현재 50KiB 계약 상한 이내다.

## 남은 확인 및 위험

- `/coin-toss`의 게임 영상 프레임은 집중 영역으로 어두운 표현이 남아 있다. 밝은 외곽 셸과의 경계를 다시 다듬고 의도된 예외인지 최종 판정해야 한다.
- 최신 보정 이후 랭킹 상위 플레이어, 징계 현황 카드, 모바일 서브탭은 회귀 화면 확인을 한 번 더 수행해야 한다.
- 인증이 필요한 관리자 화면의 전체 시각 QA는 아직 수행하지 않았다.
- `check:findmany`가 공개 경로를 포함한 무제한 조회 후보를 보고했다. 쿼리 의미를 보존할 수 있는 항목만 상한과 페이지네이션을 적용해야 한다.
- `check:secrets`는 현재 소스가 아니라 기존 Git 기록의 알려진 비밀 패턴 때문에 실패한다. 외부 Kakao 호출자 전환과 이전 키 폐기 후 기록 정리가 필요하다.
- 로컬 `check:deploy-readiness`는 운영 전용 환경 변수와 운영 URL을 갖추지 않은 QA 환경이라 실패했다. 실제 배포 전 Vercel 운영 환경을 기준으로 다시 확인한다.

## 운영 반영 상태

이 문서의 Bright Bloom 변경은 아직 운영에 배포하지 않았다. 성능 보정, 남은 화면 회귀 확인, 독립 QA를 마친 뒤 운영 배포와 실제 URL 검증을 진행한다.

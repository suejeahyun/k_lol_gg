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
- `npm run check:performance-budget`
- `npm run typecheck`
- `npm run lint`
- `git diff --check`

Bright Bloom 핵심 스타일 파일은 49,395바이트로 현재 50KiB 계약 상한 이내다.

로컬 비밀 파일 `.env`와 `.env.local`은 상속 ACL을 제거하고 현재 사용자, `SYSTEM`, `Administrators`만 명시적 `FullControl`을 갖도록 제한했다. 파일 내용은 확인·출력하지 않았다.

## 성능 확인

- 운영 빌드의 `/app/recruits` 조회를 사이트 설정·상태별 집계·현재 페이지 목록 병렬 조회로 변경했다.
- 동일한 로컬 운영 빌드와 데이터에서 반복 응답 시간이 약 1.04초에서 약 0.63초로 줄었다.
- 핵심 공개 화면의 첫 로드 비압축 JS는 모두 650KiB 예산 이내다.
- 성능 예산은 핵심 경로·측정값 누락과 중복도 실패로 처리해 진단 산출물의 거짓 통과를 막는다.
- 실제 gzip 전송 기준 표본은 홈 173,058바이트, 모바일 구인 164,058바이트, 코인토스 165,519바이트였다.
- Bright Bloom 영웅 이미지는 160KiB, 마스코트는 100KiB 자동 예산을 적용했다.

## 남은 확인 및 위험

- `/coin-toss`는 외곽 셸·헤더·결과·버튼·모바일 배경을 밝게 전환하고, 게임 영상만 집중 프레임으로 남겼다. 데스크톱과 모바일에서 회귀 확인했다.
- 최신 보정 이후 랭킹 상위 플레이어, 징계 현황 카드, 모바일 모집 서브탭을 실제 브라우저에서 다시 확인했다.
- 인증이 필요한 관리자 화면의 전체 시각 QA는 아직 수행하지 않았다.
- `check:findmany`가 공개 경로를 포함한 무제한 조회 후보를 보고했다. 쿼리 의미를 보존할 수 있는 항목만 상한과 페이지네이션을 적용해야 한다.
- `check:secrets`는 현재 소스가 아니라 기존 Git 기록의 알려진 비밀 패턴 때문에 실패한다. 외부 Kakao 호출자 전환과 이전 키 폐기 후 기록 정리가 필요하다.
- 로컬 `check:deploy-readiness`는 운영 전용 환경 변수와 운영 URL을 갖추지 않은 QA 환경이라 실패했다. 실제 배포 전 Vercel 운영 환경을 기준으로 다시 확인한다.

## 운영 반영 상태

이 문서의 Bright Bloom 변경은 아직 운영에 배포하지 않았다. 성능 보정, 남은 화면 회귀 확인, 독립 QA를 마친 뒤 운영 배포와 실제 URL 검증을 진행한다.

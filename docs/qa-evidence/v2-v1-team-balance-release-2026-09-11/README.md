# K-LOL.GG V2/V1 팀 밸런스·결과 공유 운영 릴리스 QA

## 기준과 범위

- 로컬 UI 검사 시각: 2026-09-11 19:10~19:15 KST
- 운영 공개 QA 시각: 2026-09-11 19:28:11 KST (`2026-09-11T10:28:11.460Z`)
- 최종 기능 commit: `8ee4fa4455cf98f0ada62f6ad31d8d45dacc23c4`
- 브랜치: `feat/kakao-v4-gateway-20260910`
- 릴리스 tag: `v2-v1-team-balance-v1.0.1`
- tag 생성 시각: 2026-09-11 19:26:48 KST — registry `releasedAt` 기준
- 운영 deployment ID: `dpl_4BzqPTPUWTVmzmXui1sSVcrzreKC`
- 불변 URL: `https://k-lol-btwyt99iy-tjdmswo11-3715s-projects.vercel.app`
- 운영 별칭: `https://k-lol-gg.vercel.app`
- 대상: 로컬 production server와 운영 별칭
- 공개 표본: 10개 경로 × desktop 1440×1000, mobile 390×844, narrow 320×800 = 30조건
- 인증 화면: 실제 계정·운영 데이터는 사용하지 않았다. 현재 103개 `page.tsx`에 대한 합성 fixture 캡처 계획만 생성했다.

## 판정

| 검사 | 판정 | 결과 |
| --- | --- | --- |
| 운영 공개 브라우저 품질·접근성·성능 | PASS | 운영 별칭 30/30조건, 자동 이슈 0, axe 위반 0 |
| 전체 높이 스크린샷 | PARTIAL | 30장 생성, 27조건 PASS, `/competitions` 3조건 BLOCKED |
| 깨진 `<img>` 요소 | PASS(렌더된 표본) | 3개 렌더, `complete=true` 및 `naturalWidth>0`, 깨짐 0 |
| 현재 전체 페이지 인벤토리 | PASS | 103개 `page.tsx`, 합성 fixture 기준 335개 캡처 대상 생성 |
| 인증·관리자 전체 캡처 | BLOCKED | 로컬 DB·합성 세션 미기동 |
| 최종 전체 소스 검사 | PASS | contracts 347/347, unit 707 pass·1 intentional skip, build 92 app routes |
| 운영 DB migration | PASS | 37개, `0035`·`0036` 단일 transaction 적용, 중복·소유자 불일치 0 |
| 운영 앱 배포 | PASS | 지정 deployment와 운영 별칭, health `ready`, 공개 브라우저 30/30 확인 |

로컬 전체 높이 캡처에서 `/competitions`는 HTTP 200과 정상 레이아웃을 반환했지만 로컬 DB 부재로 “이벤트전 목록을 불러올 수 없어요”가 표시됐다. 이 3조건은 전체 높이 UI PASS가 아니라 환경 제한에 따른 BLOCKED다. 운영 공개 자동 검사에서는 `/competitions`를 포함한 30조건이 모두 HTTP 200·issue 0이었지만, 정상 데이터·0건·부분 누락 상태의 전체 높이 캡처를 대신하지 않는다.

## 운영 공개 브라우저 품질 결과

- TTFB 최대: 55ms / 예산 800ms
- LCP 최대: 2,120ms / 예산 2,500ms
- CLS 최대: 0.024 / 예산 0.1
- long task 최대: 151ms / 예산 500ms
- 요청 수 최대: 23 / 예산 75
- 전송량 최대: 557,852 bytes / 예산 2MiB
- script bytes 최대: 177,123 bytes / 예산 700KiB
- 문서 언어, `main` 1개, H1, 수평 오버플로, 모션 감소, skip link, 최초 12회 키보드 포커스, 접근 가능한 이름 검사 모두 통과했다.

## 이전 이슈 재검증

- `/signup` 링크 대비: 이전 공개 검사에서는 3뷰포트 모두 axe `color-contrast` 실패였다. 로컬 production 재검사와 운영 별칭 재검사에서는 3뷰포트 모두 PASS다.
- `/rankings` CLS: 이전 release-candidate cold load 1회에서 desktop CLS 0.1094가 기록됐다. 별도 3뷰포트 재시도와 운영 별칭 3뷰포트 검사는 모두 PASS다. 운영 공개 전체 최대 CLS는 0.024였고 `/rankings`는 3뷰포트 모두 0이었다. 단발성 cold-load 결과는 폐기하지 않고 참고 증거로 유지한다.
- 개발 서버 재실행 결과는 HMR·개발 번들 때문에 30조건 모두 script 예산을 초과했다. production 판정에서 제외하며 `browser-quality-public-final.json`에 보존했다.

## 103페이지 전체 캡처 준비 상태

`full-103-capture-plan.json`은 합성 ID만 포함한 fixture로 생성됐다.

- 전체 캡처 대상: 335
- 세션: anonymous 105, account 39, admin 188, setup 3
- 뷰포트: desktop 159, tablet 88, mobile 88
- 그룹: public 102, account 39, admin 188, admin-auth 6

전체 실행에는 격리 DB fixture와 합성 ACCOUNT/ADMIN/SETUP 쿠키가 필요하다. 실제 계정이나 운영 데이터를 사용해서는 안 된다.

## 빌드 상태

이 UI QA 작업에서 실행한 `npm run build`는 동일 작업 트리의 다른 빌드가 이미 진행 중이어서 종료 코드 1로 중단됐다. 이후 갱신된 `.next/BUILD_ID`를 확인했고 `next start -p 3000`은 Ready 상태로 정상 기동됐다. 따라서 UI QA 자체의 독립 빌드 성공으로 판정하지 않는다.

그 뒤 최종 릴리스 검증의 `npm run check`가 별도로 통과했다. 최종 결과는 contracts 347/347, unit 707 pass·1 intentional skip, production build 92 app routes다.

## 운영 DB 적용 근거

비밀값을 출력하지 않는 read-only preflight 후 운영 Neon production에 `0035`와 `0036`을 적용했다.

### 적용 전

- migration: 35개, head timestamp `1788963649789`
- CONNECTED Riot identity 중복 그룹: 0
- owner 중복 그룹: 0
- player-owner mismatch: 0
- 자동 만료 1일 복구 분기: `pre-0035-0036-20260911`

### 적용과 사후 검증

- `0035`·`0036`: 단일 transaction 적용
- migration: 37개
- head hash: `ebb200d8597ed63d270c2a66a7369dd67d3536c238939458aeed337028bdc63f`
- Riot unique index: 2개
- player-owner index: 1개
- validated player-owner foreign key: 1개
- CONNECTED identity 중복, owner 중복, player-owner mismatch: 모두 0

운영 DB migration과 무결성 사후 검증을 확인했다. 최종 기능 commit의 운영 앱 배포, health `ready`, 운영 공개 브라우저 30/30도 확인했다.

## 전체 검사 요약

- `npm run check`: contracts 347/347, unit 707 pass·1 intentional skip, build 92 app routes
- `npm run test:db`: migration 37개, 저장소 head `0036_flowery_hairball`, Kakao V4 P0 31/31, recovery archive 검증 통과
- `verify:auth-http`: 통과
- tree-only secret scan: 통과
- Data Dragon: 챔피언 173종, 자산 346개
- 여성 홈 가이드: 68/68

## 증거 파일

- `browser-quality-production-deployed.json`: 운영 별칭 최종 30조건 PASS, issues 0
- `browser-quality-public-production-final.json`: 최종 production 30조건 PASS
- `browser-quality-public-final.json`: 개발 서버 결과, 성능 판정 제외
- `public-capture-plan.json`: 공개 30조건 캡처 계획
- `screenshots/index.json`: 전체 높이 캡처 결과
- `screenshots/contact-public-release-candidate-01.png`: 30화면 contact sheet
- `image-audit-summary.json`: 렌더된 이미지와 환경 제한 요약
- `full-capture-fixtures.json`: 비운영 합성 ID fixture
- `full-103-capture-plan.json`: 현재 103페이지 전체 실행 계획

## 확인 한계와 후속 검증

1. 로그인·관리자 화면을 포함한 103개 페이지 335회 실캡처는 실행하지 않았다. 합성 fixture와 캡처 계획만 생성했다.
2. 실제 휴대폰의 Kakao 두 방 E2E는 이번 릴리스에서 다시 확인하지 않았다.
3. 실제 사용자 Riot RSO와 Vercel Blob 업로드·읽기·삭제 E2E는 완전히 검증하지 않았다.
4. V1의 최근 솔로 20경기 상세 데이터와 관리자 밸런스 수동 보정 원천 데이터는 V2에 없다. 해당 입력은 추정하지 않고 명시적 0/미제공 경로를 사용한다.
5. `/competitions`의 정상 데이터·0건·부분 누락 상태 전체 높이 캡처, 실제 모바일 터치·키보드·뒤로 가기, 모달 포커스와 랭킹 표 스크린리더 이해 가능성은 추가 확인이 필요하다.

## 변경 상태

- 제품 소스 수정: 없음
- 운영 DB 변경: `0035`·`0036` 적용 확인
- 운영 앱: commit `8ee4fa4455cf98f0ada62f6ad31d8d45dacc23c4`, tag `v2-v1-team-balance-v1.0.1`, deployment `dpl_4BzqPTPUWTVmzmXui1sSVcrzreKC` 운영 반영 확인
- 이 작업에서 추가한 파일: 이 증거 폴더 아래 QA 계획·JSON·PNG·README만 해당한다.

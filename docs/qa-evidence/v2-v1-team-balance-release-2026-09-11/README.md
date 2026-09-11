# K-LOL.GG V2/V1 팀 밸런스 release-candidate UI QA

## 기준과 범위

- 검사 시각: 2026-09-11 19:10~19:15 KST
- 소스 HEAD: `63415c29eca82f58042acc969836f7b7e249041a`
- 브랜치: `feat/kakao-v4-gateway-20260910`
- 릴리스 commit·tag·registry 배포 ID: 보류
- 운영 앱 deployment ID·URL: 미확인
- 대상: 로컬 production server `http://127.0.0.1:3000`
- 공개 표본: 10개 경로 × desktop 1440×1000, mobile 390×844, narrow 320×800 = 30조건
- 인증 화면: 실제 계정·운영 데이터는 사용하지 않았다. 현재 103개 `page.tsx`에 대한 합성 fixture 캡처 계획만 생성했다.

## 판정

| 검사 | 판정 | 결과 |
| --- | --- | --- |
| 브라우저 품질·접근성·성능 | PASS | 30/30조건, 자동 이슈 0, axe 위반 0 |
| 전체 높이 스크린샷 | PARTIAL | 30장 생성, 27조건 PASS, `/competitions` 3조건 BLOCKED |
| 깨진 `<img>` 요소 | PASS(렌더된 표본) | 3개 렌더, `complete=true` 및 `naturalWidth>0`, 깨짐 0 |
| 현재 전체 페이지 인벤토리 | PASS | 103개 `page.tsx`, 합성 fixture 기준 335개 캡처 대상 생성 |
| 인증·관리자 전체 캡처 | BLOCKED | 로컬 DB·합성 세션 미기동 |
| 최종 전체 소스 검사 | PASS | contracts 347/347, unit 707 pass·1 intentional skip, build 92 app routes |
| 운영 DB migration | PASS | 37개, `0035`·`0036` 단일 transaction 적용, 중복·소유자 불일치 0 |
| 운영 앱 배포 | 미배포 | deployment ID·URL이 없고 운영 smoke도 실행 전 |

`/competitions`는 HTTP 200과 정상 레이아웃을 반환했지만 로컬 DB 부재로 “이벤트전 목록을 불러올 수 없어요”가 표시됐다. 이 3조건은 UI PASS가 아니라 환경 제한에 따른 BLOCKED다. `/api/health`도 같은 이유로 `degraded`였다.

## 최종 공개 브라우저 품질 결과

- TTFB 최대: 171ms / 예산 800ms
- LCP 최대: 400ms / 예산 2,500ms
- CLS 최대: 0.0021 / 예산 0.1
- long task 최대: 145ms / 예산 500ms
- 요청 수 최대: 45 / 예산 75
- 전송량 최대: 494,157 bytes / 예산 2MiB
- script bytes 최대: 190,390 bytes / 예산 700KiB
- 문서 언어, `main` 1개, H1, 수평 오버플로, 모션 감소, skip link, 최초 12회 키보드 포커스, 접근 가능한 이름 검사 모두 통과했다.

## 이전 이슈 재검증

- `/signup` 링크 대비: 이전 공개 검사에서는 3뷰포트 모두 axe `color-contrast` 실패였다. 현재 production 재검사에서는 3뷰포트 모두 PASS다.
- `/rankings` CLS: 이전 release-candidate cold load 1회에서 desktop CLS 0.1094가 기록됐다. 별도 3뷰포트 재시도 통과에 이어 이번 전체 공개 production 재검사에서도 모두 PASS했고 전체 최대 CLS는 0.0021이었다. 단발성 cold-load 결과는 폐기하지 않고 참고 증거로 유지한다.
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

운영 DB migration과 무결성 사후 검증은 확인됐다. 운영 앱은 아직 배포하지 않았으므로 팀 밸런스·결과 복사 기능이 운영에 반영됐다고 판정하지 않는다.

## 전체 검사 요약

- `npm run check`: contracts 347/347, unit 707 pass·1 intentional skip, build 92 app routes
- `npm run test:db`: migration 37개, 저장소 head `0036_flowery_hairball`, Kakao V4 P0 31/31, recovery archive 검증 통과
- `verify:auth-http`: 통과
- tree-only secret scan: 통과
- Data Dragon: 챔피언 173종, 자산 346개
- 여성 홈 가이드: 68/68

## 증거 파일

- `browser-quality-public-production-final.json`: 최종 production 30조건 PASS
- `browser-quality-public-final.json`: 개발 서버 결과, 성능 판정 제외
- `public-capture-plan.json`: 공개 30조건 캡처 계획
- `screenshots/index.json`: 전체 높이 캡처 결과
- `screenshots/contact-public-release-candidate-01.png`: 30화면 contact sheet
- `image-audit-summary.json`: 렌더된 이미지와 환경 제한 요약
- `full-capture-fixtures.json`: 비운영 합성 ID fixture
- `full-103-capture-plan.json`: 현재 103페이지 전체 실행 계획

## 남은 출시 전 검증

1. 릴리스 commit·tag와 registry·운영 deployment ID를 실제 발급값으로 기록한다.
2. 운영 앱 배포 뒤 health, 팀 밸런스 계산, 결과 복사와 인증 경계를 smoke로 확인한다.
3. 격리 DB와 합성 계정 세션으로 335대상 전체 캡처를 실행한다.
4. `/competitions`의 정상 데이터·0건·부분 누락 상태를 세 뷰포트에서 다시 검사한다.
5. 플레이어·경기·챔피언·갤러리 데이터가 있는 fixture에서 모든 이미지의 네트워크·decode 결과를 검사한다.
6. 실제 모바일에서 터치 영역, 모바일 키보드, 스크롤·뒤로 가기를 확인한다.
7. 모달 포커스 이동·복귀와 랭킹 표의 스크린리더 이해 가능성은 수동 검증한다.

## 변경 상태

- 제품 소스 수정: 없음
- 운영 DB 변경: `0035`·`0036` 적용 확인
- 운영 앱 커밋·푸시·배포: 없음
- 이 작업에서 추가한 파일: 이 증거 폴더 아래 QA 계획·JSON·PNG·README만 해당한다.

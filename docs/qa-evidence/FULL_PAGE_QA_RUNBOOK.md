# 전체 페이지 합성 세션 QA 실행서

## 목적

운영 DB와 실제 계정을 사용하지 않고 현재 App Router 전체 화면을 `anonymous`, `account`, `admin`, `setup` 세션으로 캡처한다. 격리 PostgreSQL 18, 합성 계정, 실제 로그인 API와 HttpOnly 세션, 최적화 Next.js 서버를 그대로 통과한다.

`admin` 캡처 세션은 전체 관리자 경로를 열 수 있는 합성 `SUPER_ADMIN` 계정이다. 일반 `ADMIN`의 최고관리자 전용 UI 숨김·403 경계는 별도 권한 회귀 테스트의 책임이며, 이 339개 시각 캡처 수에 중복 추가하지 않는다.

## 실행

다른 작업이 소스를 수정하거나 빌드 중이지 않은 clean checkout에서 실행한다.

```powershell
npm run qa:capture:full
```

기본 결과는 `.tmp/full-page-qa`에 생성된다.

- `fixtures.json`: 합성 DB에서 실제 조회한 비운영 ID만 포함
- `capture-plan.json`: 현재 105개 `page.tsx`의 339개 캡처 대상
- `screenshots/*.png`: desktop·tablet·mobile 전체 높이 캡처
- `screenshots/index.json`: 경로별 HTTP·redirect·overflow·런타임 오류 판정
- `summary.json`: 전체 개수와 issue 0 여부

릴리스 증거 폴더를 직접 지정하려면 다음처럼 실행한다.

```powershell
node scripts/run-full-page-qa.mjs --output docs/qa-evidence/<release>/full-page --expected-pages 105 --expected-captures 339
```

이미 현재 checkout에서 만든 production build를 의도적으로 재사용할 때만 `--build false`를 붙인다. 이 경우 `.next/BUILD_ID`가 없으면 즉시 실패한다.

## 보안·격리 계약

- runner는 상속 환경에서 DB URL과 인증 비밀을 제거한다.
- 매 실행마다 비밀번호, TOTP, 서명 키와 암호화 키를 새로 생성한다.
- 자격 증명은 캡처 프로세스의 stdin으로 한 번 전달하고 JSON·PNG·로그에 저장하지 않는다.
- 동적 상세 경로 ID는 격리 DB에서 실제 생성·조회한 row만 사용한다.
- 운영 DB, Neon production/preview, 실제 계정, 실제 세션 cookie는 사용하지 않는다.
- 캡처 도중 문제가 생겨도 runner는 서버를 중지하고 임시 PostgreSQL cluster 정리를 기다린다.

## 합격 기준

- 현재 페이지 수와 캡처 수가 지정한 기준과 일치
- 모든 계획 대상이 `screenshots/index.json`에 존재
- HTTP 오류, redirect destination 불일치, 수평 overflow, framework/runtime 오류, H1 누락이 0건
- `summary.json`의 `passed`가 `true`, `credentialsPersisted`와 `containsProductionData`가 모두 `false`

이 자동 캡처는 실제 모바일 터치, 스크린리더 탐색 순서, 외부 Riot·Blob·Kakao 연동과 운영 스케줄러를 대신하지 않는다.

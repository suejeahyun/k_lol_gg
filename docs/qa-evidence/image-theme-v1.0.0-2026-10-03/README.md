# 이미지 테마 1.0.0 검증

## 범위와 구현

- 108개 App Router 페이지에 공통 이미지 배경 적용. 공개·계정·인증·관리자 shell과 주요 카드/패널 스타일 연결.
- 기존 106개 파일의 Lucide import를 공통 이미지 아이콘으로 교체하고, 별 문자와 조작용 문자 화살표도 교체. 차트의 데이터 도형, 작성된 내용, 카카오 봇 메시지는 해당 웹 아이콘 범위에 포함하지 않는다.
- 새 그림은 built-in `image_gen`으로 생성했다. 독창적인 판타지 정원, 야간 경기장, 진주빛 유리 질감 3종과 투명 배경 아이콘 atlas 6종(96개 그림)이다. 전체 생성 프롬프트·좌표·파일 해시는 [이미지 명세](../../design/image-theme-v1.json)에 있다.
- 최종 WebP 11개(배경 모바일 크기 2개 포함), 합계 797,524 bytes. 6개 아이콘 atlas 합계 520,080 bytes. 원본은 생성 위치에 유지하고 크기·형식만 최적화했다.
- 기존 SVG 크기·CSS selector를 유지하는 viewport 안에서 실제 WebP 그림의 한 칸을 표시한다. 텍스트와 접근성 이름은 계속 텍스트로 제공한다. 숨김 이미지에는 aria-hidden을 적용한다.
- 그림의 명암이 제목과 겹치지 않도록 흰색 오버레이를 사용한다. reduced-motion에서는 아이콘 애니메이션을 멈추며, forced-colors/인쇄에서는 장식 배경을 제거한다.
- 팀 편성의 바깥 grid 열을 minmax(0, 1fr)로 고정해 320px 가로 넘침을 보완했다. 계정 진입 화면의 h2에도 기존 제목 글꼴·크기를 적용했다.

## 검사

- `npm run check`: lint 오류 0, 기존 경고 58, typecheck, ERD drift, 계약 445/445, 단위 1,039 통과·1 skip, 기존 챔피언 이미지 68개 검사, production build 통과.
- `tests/image-theme.test.ts`: 모든 실제 icon import의 export/이미지 렌더링, 접근성·크기, 이미지 SHA-256·알파·96칸 그림 존재, 850KB 이하 전송 예산 검사.
- 격리 PostgreSQL 18 UI fixture: 문의·입력·동일 요청·관리자 접근·감사·cron·검색 노출·이벤트·가입 HTTP 경계 10개 통과. `V2_UX_QA_THEME=true`로 합성 관리자 암호와 연결 플레이어만 추가한다. 실제 운영 계정/데이터를 사용하지 않는다.
- [108개 경로 HTTP 결과](local-http.json): 95개 200, 합성 자료가 없는 관리자 상세 13개 404. 모든 200 응답에서 공유 배경 CSS 확인, 11개 이미지 응답·형식·해시 일치, 5xx 없음. 20개 동적 경로에는 일부 실제 fixture가 없으므로 전체 업무 시나리오 검증으로 해석하지 않는다. Next의 404 streaming HTML에 stylesheet 링크가 없는 경우는 HTTP만으로 판정하지 않았으며, 관리자 챔피언 누락 화면의 실제 브라우저에서 shell·배경 CSS가 적용되는 것을 확인했다.
- [브라우저 측정](browser-layout.json): 1280·768·390·320px에서 홈, 구인, 계정, 팀 편성, 관리자 등의 배경·아이콘·문서 너비 검사. [홈](home-desktop.jpg), [모바일 홈](home-mobile.jpg), [계정](account-desktop.jpg), [관리자](admin-desktop.jpg).
- 홈 랭킹의 다음/이전 이동, 세 지표 선택, 기존 overflow:clip과 scrollTop=0, 모바일 메뉴/검색, 일반·관리자 로그인 확인.
- `node scripts/check-secrets.mjs --tree-only`: 현재 트리 검사 통과. Git 전체 이력 검사를 실행한 것으로 기록하지 않는다.

## 별도 테스트 환경 제한

기존 전체 DB contract fixture를 브라우저용으로 기동하려던 시도는 `tests/database/data-platform.contract.test.ts`의 오래된 세션 삽입에서 `sessions_purpose_role_consistency` 위반으로 종료됐다(ADMIN role + 기본 ACCOUNT purpose). 해당 DB 스키마/테스트/도메인 코드는 이번 변경에 포함되지 않는다. 이를 성공으로 계산하지 않았고, 정식 migration을 적용하는 기존 UX 전용 격리 fixture로 화면과 HTTP를 검증했다. 전체 DB contract 통과를 주장하지 않는다.

실제 휴대폰 터치·OS 대비/모션 설정 변경은 실행하지 않았다. UI의 색상/명도 및 CSS 대응, 브라우저 viewport와 키보드/클릭 조작을 확인한 범위다. 화면 검증용 데이터가 없는 각 상세 업무 상태는 추가로 생성하지 않았다.

## 재현

```powershell
npm run check
$env:PG_BIN_DIR='C:\Program Files\PostgreSQL\18\bin'
$env:V2_UX_QA_RANKING='true'
$env:V2_UX_QA_THEME='true'
$env:V2_UX_QA_HOLD='true'
# 이전 검증에서 만든 .tmp/ux-qa/stop 파일이 있으면 그 파일만 제거한다.
npx tsx scripts/test-db/run-ux-http-qa.ts
```

별도 터미널에서 `node qa/verify-image-theme-http.mjs`로 108개 경로와 이미지 응답을 검사한다. `.tmp/ux-qa/result.json`의 loopback origin을 열고 공개 화면, 합성 `ux-admin` 계정의 사용자/관리자 로그인, 반응형 배치를 확인한다. 암호는 해당 fixture 소스의 합성 값이다. 종료 시 `.tmp/ux-qa/stop` 파일을 만들면 이 프로세스가 자신이 생성한 서버·격리 DB를 정리한다.

운영 배포 ID·commit·검증 시각은 [운영 근거](production.md)를 기준으로 확인한다.

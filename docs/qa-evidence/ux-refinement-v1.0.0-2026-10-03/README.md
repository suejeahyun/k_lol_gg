# UX refinement 1.0.0

## 변경 범위

공개 홈의 진입 버튼·모집/대회 소개·경기일, 로그인/가입 순서, 경기 검색, 모집 참가 안내, 공통 메뉴와 랭킹 조작을 개선한다. 사용자 요청의 홈 순서와 단일 랭킹 캐러셀·이미지 테마를 유지한다.

운영 자료를 수정·삭제하지 않는다. 모집 홈 소개는 IN_PROGRESS 중 본 참가 인원이 정원 미만인 파티만 대상으로 한다. 예비 인원은 정원에서 제외한다. 종료되지 않은 기존 스크림은 모집 페이지의 기록으로 계속 조회한다.

대회 홈 소개는 실제 모집 이후 단계만 대상으로 하고 진행 중 항목을 완료 항목보다 우선한다. `HOME_PLACEHOLDER_COMPETITION_TITLE_PATTERN`과 정확히 일치하는 임시 제목을 홈 조회 SQL의 limit 전에 제외한다. 의미 있는 제목에 test라는 단어가 포함되어 있어도 제외하지 않는다. 원래 대회 목록·상세와 상태는 바꾸지 않는다.

## 이미지

기본 96개 아이콘 중 조작 아이콘 16개를 새 투명 WebP atlas로 대체했다. 기존 이미지 파일은 보존한다. 새 atlas는 512×512, 45,794바이트, 공유 이미지 전체는 843,318바이트다. [정확한 생성 프롬프트·출처·해시·셀 목록](../../design/image-theme-controls-v2.json)에 built-in image_gen 생성 근거를 기록했다. 밝은 배경 및 랭킹의 밝은 조작 버튼 위에 그림을 표시한다.

## 검증

- 전체 검사: [check.log](check.log). lint 오류 0·기존 경고 58, 타입·ERD·계약 445개·단위 1,042개 통과(1 skip), 기존 챔피언 이미지 68개, production build.
- 단위 검증: 진행 중 대회 우선·임시 제목 정확 매칭·입력 불변성, 선택하지 않은 날짜·승패 GET 값과 잘못된/중복 값의 구분, 이미지 alpha·매핑·해시·850KB 예산.
- 격리 PostgreSQL 18: 기존 UX HTTP fixture에 정원 마감/예비 참가/게시일과 경기일이 다른 경기/임시 대회 5개를 추가했다. 빈자리 계산과 홈 SQL limit 전 제외를 실제 DB에서 확인했다. 기존 문의·가입·권한 등 10개 HTTP 경계도 유지했다. [실행 로그](db-http.log).
- 주요 화면과 이미지 HTTP: [local-http.json](local-http.json). 빈 필드가 포함된 실제 GET URL, 사용 중인 필터 자동 펼침, 이미지 MIME·해시를 포함한다.
- 390·320·1280px, 홈·로그인·가입·경기·모집·팀 만들기 총 18개 레이아웃에서 가로 넘침 없음. [측정](browser-layout.json).
- 모바일 390×844 기준: 로그인 아이디 위치 828→264px, 로그인 버튼 973→409px, 경기 결과 제목 1,163→634px. 랭킹 높이 약 478px. 실제 기기의 글꼴·화면 설정에 따라 달라질 수 있다.
- 브라우저: 랭킹 다음/이전·지표·키보드와 내부 scrollTop=0, 메뉴 Enter/Escape, 기능 검색의 방향키·Enter, 합성 일반 계정 로그인 후 요청한 팀 도구 복귀, 마감 파티 명령 복사·완료 안내, 상세 필터 적용·접은 상태 제출·초기화를 확인한다. 최종 결과는 [상호작용 기록](browser-interactions.json)에 저장한다.

화면 예: [로그인](login-mobile.jpg), [경기 기록](matches-mobile.jpg), [모바일 랭킹](ranking-mobile.jpg), [마감 파티](full-party-mobile.jpg).

## 재현

```powershell
npm run check
$env:PG_BIN_DIR='C:\Program Files\PostgreSQL\18\bin'
$env:V2_UX_QA_RANKING='true'
$env:V2_UX_QA_THEME='true'
$env:V2_UX_QA_JOURNEY='true'
$env:V2_UX_QA_HOLD='true'
# 이전 검증의 .tmp/ux-qa/stop 파일이 있으면 해당 파일만 제거한다.
npx tsx scripts/test-db/run-ux-http-qa.ts
```

다른 터미널에서 `node qa/verify-ux-refinement-http.mjs`를 실행한다. `.tmp/ux-qa/result.json`의 loopback origin을 브라우저에서 연다. fixture 종료 시 `.tmp/ux-qa/stop` 파일을 만들면 자체 생성한 서버·격리 DB를 정리한다.

## 검증 한계와 배포

실제 휴대폰 터치·저속 네트워크 성능·전체 DB contract suite는 이번 범위에서 실행하지 않았다. 운영 계정으로 신청·대회·모집 자료를 생성하거나 수정하지 않는다. migration head는 0047_usage_analytics로 유지한다. 현재 트리 비밀정보 검사와 Git 전체 이력 검사는 구분한다.

소스 commit·tag와 운영 배포 ID·health 확인은 [production.md](production.md)를 기준으로 판정한다.

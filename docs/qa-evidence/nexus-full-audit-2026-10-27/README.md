# NEXUS 전체 점검 — 2026-10-27

NEXUS의 공개·회원·관리자 화면, DB 분리와 권한, 참가·팀 배치 저장, 카카오 서버 경계, Riot 신청 상태, 의존성 보안을 점검했다. 운영 DB는 읽기 전용으로 검사하고 작성 검증은 합성 데이터가 있는 격리 PostgreSQL에서 수행했다.

## 수정

- NEXUS 테마의 복수 클래스 선택자 누락을 수정했다. 관리자 내부 폼과 목록, 신청 화면, 경기 접수, 이벤트, 팀 배치의 배경·글자 대비와 선택 상태를 보완했다.
- 설치 안내의 밝은 overlay와 과도한 이미지 높이를 조정했다. 마스코트 원본과 기존 기능·권한·DB schema는 유지한다.
- npm 보안 감사에서 발견한 런타임 의존성 문제를 수정했다. 최종 버전·감사 결과와 노출 조건은 [의존성 보안 보고](production-dependency-audit.md)에 기록한다.
- 보안 업데이트 이후 Next 16.4의 CSS Module 이름 축약으로 기존 테마 선택자가 맞지 않는 회귀를 실제 브라우저에서 발견했다. NEXUS 빌드에 안정적인 의미별 클래스 표식을 추가하고 테마가 이 표식을 사용하도록 변경했다. 번들러의 해시나 디버그 이름을 테마의 식별자로 사용하지 않는다. 45개 모듈·928개 클래스의 원래 스타일과 K-LOL 원문 보존을 검사했다.

## 검증 근거

| 범위 | 결과와 근거 |
| --- | --- |
| 전체 검사 | lint, TypeScript, ERD, 계약 747개, 단위 1,201개(기존 skip 1개), 안내 이미지, Next production build. 최종 수정본의 결과는 validation.json에 기록한다. |
| DB·인증 | [DB/인증 보고](db-auth-audit.md): DB 185개, 빈 DB bootstrap 9개, NEXUS 인증 HTTP 10개 및 ADMIN/SUPER 경계 검사. 운영 migration 50개와 지정 관리자 권한 읽기 확인. |
| 기능 저장 | [합성 DB 결과](ui-database-persistence.json): 신청 6→7명, TOP·보조 JGL 수정 저장, 10인 팀 추천과 SAVED 저장, 팀당 5명·선수/포지션 중복 없음. CUA에서 저장된 팀을 경기 접수 화면으로 연결했다. |
| 공개·관리자 UI | [소스 검토](ui-source-review.md): page 108개와 CSS Module 45개 열거. 공개 25개 경로와 관리자·회원 대표 화면을 브라우저로 검사했다. 모든 108개 화면을 시각 검증했다는 뜻은 아니다. |
| 서버·외부 연동 | [연동 보고](integrations-audit.md): 계약 115개, 운영 HTTP 29개, 서명된 읽기 전용 카카오 진단 4개. 실제 방에는 메시지를 발송하지 않았다. |
| Riot 신청 | [포털 확인](riot-portal-status.json): 로그인된 공식 포털에서 신청 898158의 Pending Review 확인. |

화면 검사는 CUA 브라우저의 DOM·스크린샷으로 수행했다. 대비 수치 검사는 단색 배경에 한정하며 gradient·이미지 배경은 수동 확인한다. 접근성 인증이나 전체 자동 axe 검사로 표시하지 않는다. 원본 수정 전 결과의 sr-only·비활성 버튼 및 스트리밍 loading heading은 실제 문제와 구분했다.

최종 통합 검사 중 PostCSS 설정의 `new URL("./src", import.meta.url)`을 Turbopack가 모듈 import로 해석해 빌드가 한 차례 실패했다. 프로젝트 루트 기준 `path.resolve`로 바꾸고 해당 lint·빌드를 다시 통과시켰다. 이후 브라우저에서 확인한 보조 글자 대비만 추가 수정하여 focused 6개·CSS 컴파일·최종 production build를 다시 수행했다. 검사 실패와 수정 후 통과를 구분해 기록한다.

## 운영 준비가 남은 부분

1. 운영 DB에 시즌이 0개다. 실제 시즌명·기간을 정해 첫 시즌을 열어야 참가 신청을 운영할 수 있다. 점검을 위해 임의의 운영 시즌을 만들지 않았다.
2. Riot 운영 키 신청은 심사 중이고 API·RSO 설정은 없다. 승인된 키를 설치하기 전 전적 연동은 OFF다.
3. NEXUSMain/NEXUSNotice 휴대폰 설치와 실제 두 방 송수신은 미확인이다. 설치 파일·서버 서명 호환 검사를 실기기 설치 완료로 취급하지 않는다.
4. 실운영 이미지 업로드·Blob 외부 작성, Riot 실 API, 카카오 메시지 발송은 수행하지 않았다. 해당 외부 호출의 성공을 주장하지 않는다.

## 배포·복구

NEXUS 프로젝트 운영 배포를 확인했다. K-LOL 운영 프로젝트 변경과 새 migration은 없다. 최종 source·immutable URL·alias·health는 [production.json](production.json)에 기록했다. 이전 배포는 `dpl_2ywfbAB34CCFdB6XtcPCAfkFsSGG`, source `9e6a8b39806aae7b6aa2f17a464687d77c70ca84`다. 이전 버전으로 복구하면 이번 의존성 보안 수정도 되돌아가므로 장애 복구 이후 패치를 다시 적용해야 한다.

최종 대표 화면 검증은 [ui-final.json](ui-final.json), 합성 [팀 배치 화면](team-draft-desktop.png), [320px 관리자 화면](admin-mobile-320.png)을 참조한다. 개발 도구의 moderate 4개는 esbuild 개발 서버 advisory 한 건의 의존성 전파이며 별도 제한으로 남긴다. 운영 의존성 감사는 0개다.

### 최종 운영 결과

최종 source `4bb8f7a3bfc9fb2ca2e642fc140c221d0fc6ef3a`, tag `nexus-mascot-theme-v1.0.2`, deployment `dpl_2YMxonJLnzyr81aCYyPS4CasSggh` READY. [운영 주소](https://nexus-gg-kr.vercel.app)와 [immutable 배포](https://nexus-ntftk1d4o-tjdmswo11-3715s-projects.vercel.app)의 연결을 확인했고 HTTP 8조건이 통과했다.

1.0.1 배포 후 직접 텍스트 범위의 공개 화면 검증에서 플레이어 결과 인원 배지의 낮은 대비 한 건을 발견했다. 1.0.2는 그 글자색만 보완한 후속 패치다. [1.0.1 배포 근거](production-v1.0.1.json)와 최초 [운영 UI 결과](production-ui.json)를 보존하고, [수정 후 결과](production-count-fix.json)에서 문제 해소를 확인했다. 나머지 공개 22개 경로의 확대 검사는 [production-public-expanded.json](production-public-expanded.json)에 있다. 단색 대비·넘침·조작 이름·이미지 검사이며 전체 접근성 인증은 아니다.

합성 UI DB, 시험 서버와 이번 감사에서 시작한 PostgreSQL 인스턴스를 정리했다. 운영 DB에 시험 자료를 작성하지 않았다. 최종 후속 빌드와 module-marker 6검사도 통과했다. 화면 CSS는 후속 인원 배지 수정을 포함해 382개 NEXUS 경계 선택자를 사용한다.

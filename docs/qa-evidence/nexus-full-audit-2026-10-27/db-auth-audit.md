# NEXUS DB·인증·관리자 권한 점검

2026-10-27 점검. 상세 집계는 [db-auth-audit.json](./db-auth-audit.json)에 기록했다. 운영 DB 쓰기, 실제 사용자 비밀번호 로그인, 제품 소스 수정은 하지 않았다. 출력에는 계정 식별자·비밀번호·접속 문자열·토큰을 포함하지 않았다.

## 결과

| 범위 | 결과 |
|---|---|
| 운영 DB 분리·신원 | NEXUS 전용 descriptor와 runtime DB 일치, 기존 `DATABASE_URL` 없음, NEXUS 서비스·브랜드 일치 |
| 운영 권한 | 지정 소유자 `SUPER_ADMIN`, 지정 관리자 `ADMIN`; 모두 승인·활성·비밀번호 설정·초기 비밀번호 변경 완료 |
| 권한 변경 증거 | 두 계정 모두 권한 버전·revision 증가 및 권한 변경 감사 기록 존재 |
| 운영 세션 | fixture 세션 0개, 미폐기·유효기간 내 세션 중 계정 상태/역할/권한 버전 불일치 0개 |
| 운영 migration | 50/50개; 모든 SQL hash와 적용 시각을 migration journal과 대조해 일치 |
| 운영 초기 데이터 | 계정 3, 선수 2, 공식 챔피언 참조 173; 시즌 0, 복제·이관 시즌 0 |
| NEXUS 빈 DB 검증 | 9개 검사 통과, migration 50개, 빈 업무 테이블 111개 |
| NEXUS 인증 HTTP | 10개 검사 통과 |
| 관리자 경계 HTTP | ADMIN/SUPER 구분, 상태·비밀번호·Origin·세션 무결성·폐기 검증 통과 |
| 전체 공통 DB 계약 | 35개 파일, 185개 테스트, 실패 0, 건너뜀 0 |

## 운영 읽기 전용 검사

연결 설정에서 `default_transaction_read_only=on`을 지정하고 `BEGIN READ ONLY` 및 제한된 statement timeout 안에서 조회했다. 프로젝트/DB 목적지 가드를 먼저 확인했다. 계정은 사전에 지정된 UUID와 로그인 ID를 함께 조건으로 삼고, 보고에는 역할과 검증 boolean만 남겼다.

Riot 기능 플래그는 비활성이다. Kakao 전역·선수 검색·시즌 신청·이미지 수신·모집·예약 공지 플래그는 활성이고 점검 모드는 비활성이다. 공지 대기열은 0건, site-notice principal의 nonce binding도 0건이다. 이 수치만으로 휴대폰 설치나 실제 메시지 전달 여부를 확정하지 않는다.

시즌 0개는 사용자가 요청한 빈 데이터 시작 상태와 일치한다. 실제 내전 신청을 열려면 관리자가 시즌을 생성하고 활성화해야 한다. 점검 중 운영 시즌을 만들지 않았다.

## 로컬 검증

### 빈 NEXUS DB

```powershell
node --env-file=.env.local --import tsx scripts/nexus/verify-empty-database.ts
```

스크립트는 loopback만 허용하고 새 임의 이름의 DB를 만든 뒤 제거한다. 최초 migration, 빈 데이터, 빈 DB 재실행, 잘못된 대상 거부, 기존 데이터가 있는 대상 거부, sentinel 보존을 확인했다. Data Dragon 16.17.1 참조 챔피언 173개는 업무 데이터 없이 추가되고, 재실행이 관리자 수정값을 덮어쓰지 않음을 확인했다.

### NEXUS 인증·관리자 HTTP

```powershell
node --env-file=.env.local --import tsx scripts/nexus/verify-auth-http.ts
```

완료된 NEXUS production build를 `next start`로 실행했다. 새 관리자 생성·중복 생성 거부·임시 비밀번호 관리자 진입 차단·선수 연결 없는 계정 로그인·첫 비밀번호 변경·관리자 로그인·NEXUS 쿠키·SUPER 설정 조회·기존 서비스 쿠키 거부·선수 자동 생성 없음의 10개 검사가 통과했다.

`scripts/test-db/run-admin-password-http.ts`의 비공개 실행본에는 NEXUS DB 환경변수만 명시적으로 주입했다. ADMIN·SUPER·기존 TOTP 저장 계정의 비밀번호 로그인, USER/PENDING/임시 비밀번호 거부, 잘못된 비밀번호, 다른 Origin, HttpOnly/SameSite Strict/30분 쿠키, 실제 DB 세션, ADMIN 설정 거부와 SUPER 설정 변경, authVersion 변경·토큰 변조·로그아웃 이후 세션 거부를 검증했다. 폐기된 TOTP API의 인증 경계와 기존 TOTP 저장값 보존도 확인했다.

기존 스크립트는 더 이상 표시하지 않는 소개 문구를 고정 검사하여 첫 실행이 중단됐다. 비공개 실행본에서 실제 관리자 ID·비밀번호 입력 요소 존재 검사로 바꾼 뒤 전체 검사가 통과했다. 제품 소스와 원본 검증 스크립트는 변경하지 않았다.

### 전체 공통 DB 계약

기존 `scripts/test-db/run-data-contracts.ts`의 `allTestFiles` 목록 35개를 순서 그대로 추출해 각각 `node --import tsx --test --test-reporter=tap`으로 실행했다. 기존 `childTestEnvironment`의 loopback·테스트 DB 접두사·`NODE_ENV=test`·`V2_DB_TEST_MODE=true` 가드를 유지했다. 이 방식은 전체 runner의 후속 Next 개발 서버·HTTP·브라우저 단계를 호출하지 않는다.

검증 범위에는 migration upgrade/멱등성, DB 제약, 계정·권한·세션, 선수·시즌, 경기 snapshot/권한, 통계 projection, 팀 밸런스, MMR, 모집·Kakao snapshot/registry, 이벤트·멸망전, 운영·스토리지, Riot repository, 제재, 챔피언, pg_dump/pg_restore 복구 및 정리 준비 검사가 포함된다. 공통 schema 테스트는 기존 테스트 환경을 유지하며, NEXUS runtime 분리와 쿠키 경계는 별도 HTTP 검사로 확인했다.

## 격리·정리 및 한계

검증용 임시 DB와 HTTP 서버는 종료·제거했다. 루트 에이전트가 CUA로 점검할 합성 UI DB만 별도로 보존했다. 이 DB에는 독립 키와 임의 테스트 비밀번호, SUPER/ADMIN/USER 각 1개, 선수 10명, 활성 시즌·모집·이벤트, 기본 랭킹의 10회 참여 조건을 확인할 관계형 경기 10개가 있다. 운영 데이터는 복사하지 않았다.

UI fixture 접속 정보는 gitignored `.private/nexus-audit-ui.json`과 `.private/nexus-audit-ui.env`에만 저장한다. UI 서버를 중지한 뒤 `node .private/teardown-nexus-audit-ui.mjs`를 실행하면 loopback의 해당 `nexus_test_ui_` DB만 제거한다. 활성 연결이 남아 있으면 삭제를 거부한다.

운영 계정의 실제 비밀번호·휴대폰 전달 경로는 이 검증에서 사용하지 않았다. 운영 조회 결과와 합성 환경에서의 인증 동작 검증을 구분해 기록한다.

## 의존성 업데이트 후 재검증

Next.js 16.4.3의 완료된 production build `WXcD3d2kuofrTZgz0gtum`에서 NEXUS 인증 HTTP 10개 검사와 위 ADMIN/SUPER 권한 경계 검사를 다시 실행해 모두 통과했다. 별도 빌드를 실행하지 않았으며 각 검증 서버는 임의 loopback 포트와 별도 임시 DB를 사용했다.

재검증 서버와 DB를 모두 정리했다. CUA 화면 검수용 UI DB는 보존했고 3107 서버의 listen 상태도 유지됨을 확인했다. 운영 DB는 재접속하거나 변경하지 않았다. 상세 시각과 결과는 JSON의 `postDependencyUpdateRetest`에 기록했다.

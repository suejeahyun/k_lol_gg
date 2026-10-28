# 중앙 계정·관리형 사이트 인증 검증

2026-10-29 · 합성 계정과 loopback PostgreSQL만 사용한 로컬 검증이다. 외부 공급자의 개설 성공과 운영 배포 검증은 별도 근거를 따른다.

## 구현 경계

- HUB 자체 가입은 게임 프로필 없이 일반 `USER / APPROVED` 계정을 만든다. 제출한 role·status·player 필드는 거부하고 관리자 권한은 자동 부여하지 않는다. 기존 K-LOL/NEXUS 가입 정책은 보존한다.
- 관리형 사이트는 전용 DB, 커뮤니티 ID, 세션 키, 쿠키 이름, JWT 발급자·수신자를 사용한다. 다른 사이트의 DB로 대체하거나 다른 사이트의 세션을 수용하지 않는다.
- 중앙 로그인은 고정 HUB 발급자, 등록한 정확한 HTTPS callback, PKCE, state, 만료 60초의 일회성 코드와 원자적 소비로 연결한다. 코드 교환 때 현재 중앙 계정 상태·authVersion·사이트 상태·서버 연결 키를 다시 확인한다. 중앙 role은 전달하지 않는다.
- 개설 작업은 소유자의 로컬 `SUPER_ADMIN`과 중앙 subject 연결을 명시적으로 만든다. 일반 SSO는 로컬 `USER / PENDING`만 만들고 프로필 등록·현지 운영진 승인을 거친다. 기존 회원과 같은 Riot ID가 발견되면 자동 병합 대신 기존 소유권 검토 흐름을 따른다.
- 관리자 SSO는 중앙 비밀번호 재확인과 대상 사이트의 기존 로컬 관리자 권한을 모두 요구한다. 중앙의 일반 USER도 자신이 개설한 사이트의 소유자일 수 있다.
- 미공개 사이트의 화면·조회·가입·모집 API는 로컬 소유자의 현재 유효한 관리자 세션만 통과한다. 로그인·약관·개인정보 안내·최소 상태 응답·불변 실행 파일만 예외다. 세션 회수나 사이트 공개 변경은 다음 요청에 적용한다.
- 공개 작업의 재확인은 이미 적용된 ACTIVE 상태 관찰과 새 공개 쓰기를 구분한다. `observeOnly`는 identity를 확인한 뒤 현재 상태만 반환하며 공개·감사 기록을 변경하지 않는다.

## 완료한 자동 검증

- `V2_DB_CONTRACT_SCOPE=accounts npm run test:db`: 기존 계정 lifecycle 1/1, 신규 HUB/SSO DB 8/8 통과. 동일 실행에서 실제 account HTTP 검사와 프로필 키보드 저장·412 초안 보존·hydration·비밀번호 변경 후 복귀 브라우저 검사까지 통과했다.
- 인증·서비스 격리·공개 gate·모듈 gate에 관한 집중 TypeScript 테스트 46/46 및 SSO HTTP·HUB proxy·사용자 shell 테스트 18/18 통과했다.
- 핵심 반례는 외부 origin, 누락 동의, role 주입, callback 변경, PKCE 오류, 코드 동시 재사용, 만료·세션 버전 변경·연결 키 회수, 다른 커뮤니티 쿠키, 비소유자 미공개 접근, 저장소 장애, 정지 소유자의 새 공개 차단이다.
- PostgreSQL managed bootstrap 계약은 다른 DB identity, 기존 사업 자료, 동시 초기화, 설정 게시와 회원 보존, 공개 재전송과 감사 중복을 검증한다. ACTIVATING 재확인 변경 뒤의 최종 결과는 개설 작업 담당 검증 기록을 따른다.

## 실제 브라우저 SSO 재현 방식

`npx tsx scripts/test-db/verify-community-sso-browser.ts`는 두 production bundle을 `.next-sso-hub`와 `.next-sso-child`에 빌드한다. 환경 파일의 변수명을 빈 값으로 예약한 뒤 합성 DB·키만 주입한다. 임시 loopback 인증서를 해당 테스트 Node 프로세스와 격리 Chromium의 정확한 인증서 지문에만 신뢰시키며 OS 인증서 저장소나 운영 인증 정책은 바꾸지 않는다.

HUB는 `127.0.0.1`, 자식은 `localhost`의 서로 다른 HTTPS origin으로 실행한다. 실제 로그인 폼, 동의 폼, 관리자 비밀번호 재확인, 프로필 등록, 로컬 승인 API, 첫 모집 API를 사용한다. 세션 쿠키는 `HttpOnly / Secure / SameSite=Strict`를 유지한다.

이 검사에서 cross-site callback의 303 응답 뒤 Strict 쿠키가 첫 목적지 요청에서 제외되는 현상을 발견했다. callback가 같은 origin의 완료 문서를 먼저 확정한 다음 내부 목적지로 이동하도록 수정했다. 세션 토큰은 완료 문서에 노출되지 않는다.

최종 0051 스키마에서 두 production build, 8개 검증 단계와 정상 종료(exit 0)가 완료됐다. [결과](sso-browser.json), [소유자 관리자 미리보기](sso-owner-preview.png), [회원 프로필 등록 완료](sso-member-onboarding.png)를 보존했다. 첫 모집은 승인된 일반 회원의 실제 HTTP POST 성공으로 확인했다. 검증 중 실패한 반복 실행과 cleanup 오류는 통과 개수에 포함하지 않는다. 최종 실행의 임시 서버·DB cluster·인증서 폴더 정리도 완료했다.

## 남은 범위

이 검사는 로컬 소유자 승인과 게시 상태를 합성 fixture로 준비하므로 공급자 작업의 실제 승인→개설→공개 작업 전체를 대신하지 않는다. 기존 K-LOL/NEXUS의 계정 연결, 제휴 정보 공유, 운영 기록 교환, 공동 대회, 중앙 정지의 타 사이트 자동 전파는 구현 완료로 주장하지 않는다.

# GG HUB 독립 중앙 사이트

GG HUB는 K-LOL/NEXUS와 나란히 배포되는 중앙 관리 서비스다. 자식 사이트 안에 들어가는 메뉴가 아니다. 같은 소스를 재사용하지만 별도의 Vercel 프로젝트, Neon 프로젝트, DB, 인증 키, 쿠키와 JWT 발급자를 사용한다.

| 대상 | 운영 주소 | 데이터 소유 |
|---|---|---|
| GG HUB | https://gg-community-hub.vercel.app | 사이트 소개·방 설정·중앙 관리자 |
| K-LOL.GG | https://k-lol-gg.vercel.app | 기존 회원·모집·경기 |
| NEXUS.GG | https://nexus-gg-kr.vercel.app | 기존 회원·모집·경기 |

## 실행·배포

- `NEXT_PUBLIC_SERVICE_ID=hub`를 **빌드와 실행 모두**에 사용한다. 기존 NEXUS 빌드에 런타임 변수만 바꾸면 안 된다.
- `.env.hub.example`을 기준으로 전용 비공개 환경을 준비한다. `HUB_DATABASE_URL`은 필수이며 기존 두 사이트 DB로 대체하지 않는다. 별도 Neon 프로젝트를 사용한다.
- `SESSION_SIGNING_KEYS`, `TOTP_ENCRYPTION_KEYS`, `V2_AUTH_RATE_LIMIT_PEPPER`는 신규 생성한다. 기존 서비스 키를 복사하지 않는다. 현재 TOTP 서비스는 기존 코드에서도 폐기 상태다.
- 새 DB만 `scripts/hub/bootstrap.ts`로 초기화한다. `HUB_BOOTSTRAP_CONFIRM=CREATE_EMPTY_HUB`, 정확한 `HUB_DATABASE_NAME`, 비공개 `HUB_ADMIN_LOGIN_ID`/`HUB_ADMIN_PASSWORD`가 필요하다. 기존 계정이 있거나 다른 브랜드 DB면 중단한다.
- 초기 관리자는 독립 계정이다. `/login`에서 최초 비밀번호를 바꾼 뒤 `/admin/login`으로 접속한다. 재실행해도 기존 비밀번호·수정된 등록 정보를 초기화하지 않는다.
- Vercel 배포는 **명시적인 `--project gg-community-hub --local-config vercel.hub.json`**으로 한다. 작업 디렉터리의 기존 NEXUS `.vercel/project.json`을 덮지 않는다. 허브에는 자식 사이트 cron을 등록하지 않는다.
- 중앙용 허용 경로 외의 게임·카카오·회원 가입·기존 사이트 설정 API는 404로 차단한다. 중앙 최고 관리자도 자식 DB에 직접 접근하지 않는다.

## 현재 제공 범위

공개 사이트 목록과 방문 링크, 중앙 최고 관리자의 사이트·방 추가/수정/보관, 사이트별 모집 그룹 설정을 제공한다. 초기 설정은 실제 운영 중인 두 사이트와 사용자가 지정한 네 방이다. 방 개수는 두 개로 고정하지 않으며 사이트 100개·방 500개 한도 내에서 추가할 수 있다.

등록 상태는 실제 API 연결 상태가 아니다. `UNVERIFIED`와 `NOT_APPLIED`를 유지한다. 휴대폰 봇 설정·회원 소속·모집 원본은 변경하지 않는다. 자식 사이트의 신규 인프라 자동 생성 기능도 아직 없다.

## 다음 구현

1. 사이트 소유자 인증과 연결 설치·철회, 운영 상태 확인.
2. 양쪽 로그인으로 본인 계정 연결, 내 가입 사이트 모아보기.
3. 기기/방 고유 ID 연결과 서명된 동적 설정 배포. 기존 네 방 회귀 검증 후 방별 이관.
4. 범위별 정보 공유·연합·교류 게시판, 공동 대회.
5. 본인 확인된 계정에 한정한 운영 기록 공유, 출처·만료·이의·정정·조회 감사.

전체 설계는 [연합 허브 실행 계획](../architecture/community-federation-execution-plan.md)을 따른다. MMR 원본은 사이트별로 유지하고, 차기 산식은 [감사 보고서](../architecture/drafts/balance-mmr-audit-2026-10-29.md)의 shadow 평가를 먼저 수행한다.

## 장애·복구

중앙 서비스가 중단되어도 기존 K-LOL/NEXUS와 설치된 폰 봇은 독립적으로 운영된다. 허브 출시 이전으로 되돌려야 하면 허브 공개 도메인만 해당 허브의 검증된 배포로 전환한다. 자식 사이트 도메인이나 DB를 허브로 바꾸지 않는다. 최초 출시에는 이전 허브 배포가 없으므로 실패한 후보를 승격하지 않고 수정 재배포한다.

스키마는 기존 migration 0050까지 재사용하며 기존 서비스에 새 migration을 요구하지 않는다. 운영 DB를 지우는 down migration은 제공하지 않는다. 재배포·복구 시 중앙 등록 자료는 보존한다.

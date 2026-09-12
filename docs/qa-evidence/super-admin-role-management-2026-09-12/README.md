# 슈퍼관리자 계정 역할 관리 v1.0.0

## 판정

- 기능 ID: `super-admin-role-management`
- 기능 버전: `1.0.0`
- 코드 커밋: `0bb0751cf574c6bd425d743d0d0b226fdefc6124`
- Git tag: `super-admin-role-management-v1.0.0`
- Vercel 배포: `dpl_12eHDAaSAKUZ5UKtTpyV4g24xL5D`, `Ready`
- 불변 URL: `https://k-lol-aesm5bw3i-tjdmswo11-3715s-projects.vercel.app`
- 운영 alias: `https://k-lol-gg.vercel.app`
- 운영 health: `2026-09-12T10:46:28.090Z`에 HTTP 200, JSON `status: ready`
- DB migration: 없음, head `0037_swift_brood` 유지
- 운영 데이터 변경: 없음

사이트·서버 배포와 합성 SUPER_ADMIN 계정의 격리 PostgreSQL HTTP 흐름은 확인했다. 실제 운영 계정을 승격하는 데이터 작업은 사용자가 대상을 지정하지 않았으므로 실행하지 않았다.

## 확인된 기존 상태

역할 변경 저장소는 이미 SUPER_ADMIN만 USER와 ADMIN 사이를 변경하도록 제한하고 있었다. revision CAS, 멱등 receipt, 대상 로그인 아이디 확인, `authVersion` 증가, 전체 세션 폐기, 감사 로그, ADMIN 강등 시 TOTP 삭제도 같은 transaction에서 처리했다.

하지만 역할 변경 폼이 일반 ADMIN에게도 비활성 상태로 노출됐고, 사용자 목록에는 역할 관리 진입점이 없어 기능을 찾기 어려웠다. 또한 실제 ADMIN 승격은 문서 계약보다 좁게 활성 플레이어 연결을 요구했으며, 역할 API의 SUPER 판정이 입력 검증보다 늦어 일반 ADMIN의 비정상 요청이 403 대신 400/428을 먼저 반환할 수 있었다.

## 변경 내용

- `/admin/users` 목록에 SUPER_ADMIN 전용 `역할 관리` 열과 `관리자 지정` 링크를 추가했다.
- 링크는 사용자 상세의 `#role-management` 카드로 바로 이동한다.
- 역할 변경 폼은 SUPER_ADMIN에게만 렌더링하며 일반 ADMIN에게는 보이지 않는다.
- 승인됨(APPROVED)·미삭제 USER 계정이면 플레이어 연결 여부와 관계없이 ADMIN으로 지정할 수 있다.
- 미승인·삭제·본인·SUPER_ADMIN 대상 보호는 유지한다.
- 지정 시 기존 세션을 모두 종료하고 다음 관리자 로그인에서 2단계 인증 등록을 요구한다.
- 역할 API는 same-origin과 관리자 세션 확인 직후 SUPER_ADMIN을 판정하고, 일반 ADMIN을 UUID·If-Match·본문·멱등성 처리 전에 403으로 차단한다.
- 승격 조건 안내와 현재 변경할 수 없는 이유를 상세 카드에 표시한다.

## 검증 증거

- 전체 `npm run check`: 종료 코드 0
- 계약·단위 테스트: 728개 중 727 PASS, DB 전용 1개 intentional skip
- production build: 92 app pages PASS
- 전체 `npm run test:db`: PASS
- PostgreSQL 18 fresh·upgrade·recovery와 `db-account-http` PASS, 격리 클러스터 정상 종료·삭제
- 새 역할/UI focused 17/17 PASS
- account/auth focused 21/21 PASS
- 일반 ADMIN malformed 역할 요청 조기 403 확인
- 플레이어 미연결 APPROVED USER의 ADMIN 승격 200, 역할 저장과 기존 계정 세션 폐기 확인
- TypeScript, ERD drift, 여성 홈 가이드 아트 68/68, `git diff --check`: PASS
- ESLint: 오류 0, 기존·generated 경고 31개
- 독립 보안 QA: 즉시 차단할 권한 우회·데이터 손상 결함 없음

## 사용 방법

1. SUPER_ADMIN으로 관리자 로그인한다.
2. `관리자 → 사용자 계정`에서 일반 사용자를 검색한다.
3. 목록의 `관리자 지정`을 선택한다.
4. 내부 운영 사유와 대상 로그인 아이디를 입력하고 `역할 변경`을 실행한다.
5. 대상 사용자는 기존 세션이 종료되며, 다음 관리자 로그인에서 2단계 인증을 등록한 뒤 관리자 화면을 사용할 수 있다.

## 남은 위험과 롤백

- 정상 ADMIN→USER 강등의 TOTP·ACCOUNT/ADMIN 세션 폐기, 역할 endpoint 전용 stale revision·멱등 replay·감사 실패 rollback은 공통 계약과 전체 DB 검증으로 보호되지만 이번 릴리스에서 각각 독립 케이스로 추가하지 않았다.
- 감사 이벤트에는 이전·이후 역할과 내부 사유가 저장되지만 현재 감사 로그 화면 DTO는 모든 세부 필드를 표시하지 않는다.
- 문제가 확인되면 Vercel을 직전 Ready 배포로 되돌린다. 스키마와 운영 데이터 migration은 없어 DB 롤백은 필요하지 않다.

## 디스코드 복붙 공지

```text
[K-LOL.GG 슈퍼관리자 역할 관리 패치]

- 슈퍼관리자가 사용자 계정 목록에서 일반 사용자를 관리자로 지정할 수 있습니다.
- 사용자 목록의 ‘관리자 지정’을 누른 뒤 운영 사유와 대상 아이디를 확인하면 됩니다.
- 플레이어 연결이 없는 승인 계정도 관리자로 지정할 수 있습니다.
- 일반 관리자에게는 역할 변경 기능이 보이지 않으며 서버에서도 차단됩니다.
- 관리자 지정 후 기존 로그인은 종료되고, 대상은 다음 관리자 로그인에서 2단계 인증을 등록합니다.
```

## 다음 권장 패치

1. 감사 로그 화면에 역할 변경 전·후 값과 내부 사유를 개인정보 최소화 형태로 표시한다.
2. ADMIN→USER 강등의 TOTP 삭제·모든 세션 폐기를 전용 HTTP 회귀 테스트로 고정한다.
3. 역할 변경의 stale revision·멱등 replay·감사 실패 rollback을 전용 통합 테스트로 분리한다.
4. SUPER_ADMIN 목록에서 승격 가능·불가 상태를 색상뿐 아니라 텍스트 배지로 구분한다.

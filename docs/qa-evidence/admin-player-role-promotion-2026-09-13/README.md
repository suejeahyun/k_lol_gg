# 플레이어 상세 연결 계정 관리자 지정 QA

## 판정

- 기능 ID/버전: `admin-player-role-promotion@1.0.0`
- 상태: 소스 반영 및 로컬 검증 완료, 커밋·태그·푸시·운영 배포 미실행
- DB migration: 없음, migration head `0037_swift_brood` 유지
- 운영 데이터 변경: 없음

## 정책과 변경 범위

- 기존 상위 계약에 따라 역할 변경 실행자는 `SUPER_ADMIN`으로 유지했다. 일반 `ADMIN`에는 플레이어 상세의 승격 폼과 버튼을 렌더링하지 않고, 직접 API 요청도 입력 파싱 전에 403으로 거부한다.
- 플레이어 상세의 연결된 `APPROVED`·미삭제 `USER` 계정만 `ADMIN`으로 지정할 수 있다.
- 웹에서는 `SUPER_ADMIN`을 부여하거나 회수할 수 없고, 이미 `ADMIN`/`SUPER_ADMIN`인 대상에는 승격 폼을 표시하지 않는다.
- 새 역할 API를 만들지 않고 기존 `PATCH /api/admin/users/[userAccountId]/role`을 재사용했다. same-origin 검사, 계정 `If-Match`, 멱등 receipt, 로그인 ID 확인, 세션 폐기와 `ACCOUNT_ROLE_CHANGED` 감사 이벤트가 기존 단일 transaction에서 처리된다.
- 플레이어 관리자 projection에 연결 계정의 `revision`과 `deletedAt`만 추가했다. 플레이어 revision과 계정 revision은 섞어 쓰지 않는다.

## 로컬 검증 증거

- `node --test tests/admin-account-role-management.test.mjs`: 4/4 PASS
- `npm run typecheck`: PASS
- 변경 파일 ESLint: PASS
- `npm run lint`: 오류 0, 기존·생성 파일 경고 37
- `npm test`: 749개 중 748 PASS, DB 전용 1개 intentional skip
- `npm run build`: PASS, Next.js 16.3.4 production build와 정적 페이지 93개 생성 완료
- `npm run test:db`: PASS, 격리 PostgreSQL 18 cluster 정상 시작·종료 및 disposable workspace 삭제 확인
- 실제 Chromium 회귀: 일반 ADMIN 폼/버튼 비노출, SUPER_ADMIN 폼 노출, 키보드 입력 후 승격 200, 성공 후 ADMIN 표시 PASS
- 실제 DB/HTTP 불변식: 계정 `role=ADMIN`, `revision/authVersion +1`, 대상 ACCOUNT session revoke, 연결 player row 무변경, audit/receipt 각 1건 PASS
- 경합 회귀: 화면의 오래된 계정 revision으로 412, 최신 revision 렌더 후 재시도 200 PASS
- CSRF 회귀: SUPER_ADMIN의 cross-origin 역할 요청 403 PASS
- 전체 화면 회귀: 105 pages / 339 captures / HTTP·레이아웃 issue 0 / 종료 코드 0

## 남은 위험

- 운영 계정으로 역할 변경을 실행하지 않았으며 운영 배포도 하지 않았다.
- 역할 변경 감사 이벤트의 상세 표시 개선은 별도 운영 로그 UI 범위다.
- 승격 직후 대상 관리자는 다음 관리자 로그인에서 2단계 인증을 등록해야 한다.

## 다음 권장 패치

1. 감사 로그 화면에 역할 변경 전·후 역할과 내부 사유를 안전한 allowlist로 표시한다.
2. 플레이어 상세에서 삭제·미승인 계정의 복구/승인 상세로 이동하는 명확한 링크를 제공한다.
3. `ADMIN → USER` 강등도 같은 실제 Chromium 회귀로 TOTP 삭제와 세션 폐기를 고정한다.
4. 운영 배포 후 지정된 합성 계정으로 role API와 관리자 TOTP 등록 흐름을 smoke 검증한다.

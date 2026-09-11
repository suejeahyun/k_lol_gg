# 회원가입 자동승인 운영 릴리스

## 적용 상태

- 기능 commit: `1c49070823f195b854fe84d523a5dd9ab4877049`
- 릴리스 tag: `account-auto-approval-v1.0.0`
- migration head: `0036_flowery_hairball` — 새 migration 없음
- 운영 deployment ID: `dpl_9Aw98w2NNxkyjnybFqrCjv1yNbNo`
- 불변 URL: `https://k-lol-k43ds9jze-tjdmswo11-3715s-projects.vercel.app`
- 운영 별칭: `https://k-lol-gg.vercel.app`
- 운영 health: `ready`
- 신규 가입 자동승인 운영 반영: **확인됨**
- 기존 승인 대기 27개 실제 승인: **완료, `PENDING` 27→0**

## 변경 내용

- 새 Riot ID와 신규 플레이어를 함께 만드는 일반 사용자 가입은 같은 transaction에서 자동 승인한다.
- 신규 플레이어는 즉시 `ACTIVE`로 연결하며 계정은 `APPROVED`로 로그인할 수 있다.
- 가입 제출과 자동승인을 `ACCOUNT_SIGNUP_SUBMITTED`, `ACCOUNT_SIGNUP_AUTO_APPROVED` 이력으로 구분한다.
- 기존 등록부의 미연결 Riot ID와 일치하면 플레이어를 자동 선점하지 않고 `PENDING` claim 수동 검토를 유지한다.
- 가입 역할은 계속 `USER`로 고정하며 관리자 역할을 요청 payload로 주입할 수 없다.
- 관리자 수동 승인·거절·정지·재검토·복구 기능과 보호 정책은 유지한다.
- 회원가입·시작·이용약관 안내를 실제 자동승인 정책과 일치시켰다.
- 이용약관 식별자를 `terms-2026-09-12.1`로 갱신했다.

## 기존 승인 대기 계정

운영 read-only 사전점검에서 승인 대기 계정은 27개였다. 27개 모두 safe class였고, action-time 확인에서도 관리자 승인 대기 0개, 삭제 계정 승인 대기 0개, 미해결 player claim 0개를 확인했다. 기존 `REJECTED/SUSPENDED` 8개는 보호 대상이다.

2026-09-12 05:52 KST 전후 별도 운영 작업으로 27개를 승인했고 `PENDING`은 27개에서 0개가 됐다. 연결 플레이어는 기존 `ACTIVE` 23개 유지와 비활성 4개 재활성화를 합쳐 27개 모두 `ACTIVE`다. 세션 6개를 폐기하고 계정 status history 27개, 계정 audit 27개, 플레이어 audit 4개를 기록했다. 기존 `REJECTED/SUSPENDED` 8개는 변경되지 않았다.

신규 가입 자동승인은 앱 배포 기능이고 기존 27개 승인은 별도 운영 데이터 작업이다. 두 작업의 완료 근거를 구분한다.

## 검증

- `npm test`: 통과, unit 707 pass·1 intentional skip
- 변경 파일 ESLint와 `npm run typecheck`: 통과
- `npm run test:db`: PostgreSQL 18, migration 37개, S01 lifecycle와 account HTTP 포함 통과
- `npm run build`: 통과, 92개 app route
- 운영 deployment·별칭 health `ready`
- 운영 `/signup`, `/start`: 자동승인과 기존 플레이어 수동 검토 문구 확인

상세 근거는 [`../qa-evidence/account-auto-approval-2026-09-12/README.md`](../qa-evidence/account-auto-approval-2026-09-12/README.md)에 정리했다.

## 롤백

- DB migration이 없으므로 down migration을 만들거나 운영 DB를 되돌리지 않는다.
- 앱 문제가 발생하면 직전 정상 Vercel deployment로 롤백한다.
- 롤백은 이후 신규 가입의 정책만 되돌린다. 이미 승인된 정상 계정을 자동으로 강등하지 않는다.
- 기존 27개는 status history와 audit로 대상과 변경을 추적한다. 롤백이 필요하면 감사 대상 ID를 기준으로 현재 상태를 다시 확인한 뒤 관리자 수동 상태 변경 기능으로 개별 처리한다.
- 데이터 삭제와 스키마 migration은 수행하지 않았다.

## 확인하지 않은 범위

- 실제 사용자 운영 회원가입·로그인 E2E
- 실제 휴대폰 Kakao, Riot RSO/API와 Blob 흐름
- 전체 로그인·관리자 화면 회귀 캡처

## 디스코드 공지

[`../qa-evidence/account-auto-approval-2026-09-12/DISCORD_NOTICE.md`](../qa-evidence/account-auto-approval-2026-09-12/DISCORD_NOTICE.md)의 코드 블록을 사용한다.

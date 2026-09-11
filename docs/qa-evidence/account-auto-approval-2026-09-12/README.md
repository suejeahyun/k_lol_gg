# 계정 자동승인 운영 릴리스 QA

## 기준과 범위

- 기능 commit: `1c49070823f195b854fe84d523a5dd9ab4877049`
- 릴리스 tag: `account-auto-approval-v1.0.0`
- migration head: `0036_flowery_hairball`
- 운영 deployment ID: `dpl_9Aw98w2NNxkyjnybFqrCjv1yNbNo`
- 불변 URL: `https://k-lol-k43ds9jze-tjdmswo11-3715s-projects.vercel.app`
- 운영 별칭: `https://k-lol-gg.vercel.app`
- 운영 health: `ready`

이번 릴리스는 새 Riot ID로 신규 플레이어를 만드는 일반 사용자 회원가입을 자동 승인하는 범위다. 기존 플레이어와 Riot ID가 일치해 소유권 claim이 필요한 가입, 기존 승인 대기 계정 일괄 처리, 관리자 계정, 거절·정지·삭제·복구 계정은 서로 다른 경계로 유지한다.

## 판정

| 검사 | 판정 | 근거 |
| --- | --- | --- |
| 신규 일반 사용자 자동승인 | PASS | 가입 transaction에서 계정 `APPROVED` revision 1, 신규 플레이어 `ACTIVE` 저장 |
| 기존 플레이어 보호 | PASS | 기존 미연결 Riot ID는 계정 `PENDING`, claim `PENDING`, `ownershipVerified=false` 유지 |
| 감사 이력 | PASS | `ACCOUNT_SIGNUP_SUBMITTED` 뒤 `ACCOUNT_SIGNUP_AUTO_APPROVED` 상태·감사 이력 기록 |
| 역할 주입 방지 | PASS | 가입 payload의 추가 `role` 거부, 저장 역할 `USER` 고정 |
| 기존 제재·복구 정책 | PASS | `REJECTED`, `SUSPENDED`, 삭제·복구와 관리자 수동 상태 변경 경로 미변경 |
| 운영 앱 배포 | PASS | 지정 deployment가 운영 별칭을 가리키며 health `ready` |
| 운영 공개 문구 | PASS | `/signup`, `/start`에서 자동승인과 기존 플레이어 수동 검토 안내 확인 |
| 기존 승인 대기 27개 일괄승인 | PASS | safe class 27개 확인 후 승인 완료, `PENDING` 27→0 |

## 자동승인 계약

1. 가입 입력은 약관·개인정보 동의, 로그인 ID, 비밀번호, 회원명과 Riot ID의 기존 검증을 통과해야 한다.
2. Riot ID가 등록부에 없을 때만 신규 플레이어와 `USER` 계정을 같은 transaction에서 생성한다.
3. 계정은 `APPROVED`, 플레이어는 `ACTIVE`로 저장하며 제출과 자동승인 이력을 분리해 남긴다.
4. 기존 플레이어가 존재하지만 계정에 연결되지 않았다면 자동으로 가져오지 않는다. 계정과 claim은 `PENDING`이며 관리자 수동 검토를 거친다.
5. 이미 다른 계정에 연결된 Riot ID는 종전처럼 충돌로 거부한다.
6. 자동승인은 거절·정지·삭제 계정의 재가입 또는 복구 수단으로 사용하지 않는다.

## 검증 결과

- `npm test`: 통과, 단위 테스트 707 pass·1 intentional skip
- 변경 파일 ESLint: 통과
- `npm run typecheck`: 통과
- `npm run test:db`: 통과
  - PostgreSQL 18 격리 DB와 migration 37개
  - S01 계정 생명주기, 신규 자동승인, 기존 플레이어 claim, 거절·정지·재검토·복구
  - account/auth/admin HTTP, concurrency, replay, rate limit, audit와 fail-closed 경계
  - 격리 클러스터 정상 종료와 임시 경로 제거
- `npm run build`: 통과, 92개 app route 생성
- `git diff --check`: 통과

## 운영 상태 구분

자동승인 코드는 운영에 반영됐다. 따라서 배포 이후 새 Riot ID로 가입하는 일반 사용자에게 적용된다.

기존 `PENDING` 계정 27개는 자동승인 배포와 분리된 운영 일괄 승인 작업으로 처리했다. 2026-09-12 05:52 KST 전후 action-time 확인에서 safe class 27개, 관리자 승인 대기 0개, 삭제 계정 승인 대기 0개, 미해결 player claim 0개를 확인한 뒤 27개를 승인했다. 처리 후 `PENDING`은 27개에서 0개가 됐다.

연결 플레이어 27개는 모두 `ACTIVE`다. 기존 `ACTIVE` 23개는 유지했고 비활성 4개는 재활성화했다. 기존 세션 6개를 폐기하고 계정 status history 27개, 계정 audit 27개, 플레이어 audit 4개를 기록했다. 보호 대상 기존 `REJECTED/SUSPENDED` 8개는 변경되지 않았다.

## migration과 롤백

- 스키마·enum 변경이 없어 새 migration은 필요하지 않다.
- 저장소와 운영 DB 기준은 계속 `0036_flowery_hairball`이다.
- 앱 문제가 있으면 직전 정상 deployment로 되돌리면 이후 가입은 다시 기존 승인 대기 정책을 따른다.
- 이미 자동승인된 계정을 일괄 강등하지 않는다. 필요한 계정만 관리자 상태 변경 기능으로 개별 처리한다.
- 기존 27개 승인 작업은 계정 status history와 audit로 대상과 변경을 추적할 수 있다. 롤백이 필요하면 전체 계정을 일괄 변경하지 말고 이 작업의 감사 대상 ID를 기준으로 현재 상태를 재검사한 뒤 개별 상태 변경 기능을 사용한다.
- 스키마 migration이나 데이터 삭제는 수행하지 않았다.

## 확인하지 않은 범위

- 실제 사용자 자격 증명으로 운영 회원가입 POST와 로그인 전체 E2E
- 실제 휴대폰 Kakao 두 방 송수신
- 실제 사용자 Riot RSO/API와 Vercel Blob E2E
- 로그인·관리자 화면을 포함한 103페이지 335조건 전체 캡처

## 근거 있는 다음 작업

1. 승인된 27개 계정의 로그인 실패율과 재문의 발생 여부를 운영 지표로 확인한다.
2. 합성 신규 Riot ID로 운영 가입·로그인·승인 기능 접근 smoke를 남긴다.
3. 기존 플레이어 Riot ID 가입이 계속 수동 claim으로 남는지 운영 fixture로 확인한다.

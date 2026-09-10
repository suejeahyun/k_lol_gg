# Production 배포 증거

확인 시각: 2026-09-10 12:58 KST

## GitHub

- 검증 커밋: `886f3a58bc090278e9ff10f1160121dd84ff35f7`
- feature ref: `refs/heads/feat/kakao-v4-gateway-20260910`
- production ref: `refs/heads/main`
- 두 원격 ref 모두 같은 검증 커밋으로 확인했다.
- `origin/main`에서 fast-forward 가능한 관계를 확인한 뒤 명시적 refspec으로 push했다.
- 대규모 미커밋 변경이 남은 로컬 `main` worktree는 checkout, reset, clean, merge하지 않았다.

## Vercel

- Project: `k-lol-gg`
- Production deployment ID: `4SyV7sqyJ6h938ugCNvMmAaLYGN7`
- Source: `main` / `886f3a58bc090278e9ff10f1160121dd84ff35f7`
- Vercel UI status: `Ready`
- Production URL: `https://k-lol-gg.vercel.app`

운영 smoke 결과:

- `GET /`: HTTP 200
- `GET /api/health`: HTTP 200
- `GET /recruits`: HTTP 200
- private installer와 동일한 V4 전용 keyring으로 서명한 `V4계약확인`: HTTP 200, `KLOL_KAKAO_COMMAND_V4`, reply 존재

마지막 항목은 비밀값을 출력하지 않고 private 파일에서 프로그램으로만 읽어 수행한 비파괴 운영 서명 확인이다.

## 환경과 DB

Vercel UI에서 값은 열지 않고 이름과 Production scope만 확인했다.

확인된 Production 이름:

- `DATABASE_URL`
- `DATABASE_POOL_MAX`
- `V2_PUBLIC_ORIGIN`
- `KAKAO_V4_IDENTITY_SECRET`
- `KAKAO_V4_WEBHOOK_SECRET_CURRENT`
- `KAKAO_V4_WEBHOOK_KEY_ID_CURRENT`

V4 전용 세 값은 private generator가 값 출력 없이 Production에 등록했다. 기존 V1/V41의 `KAKAO_WEBHOOK_*` 값은 조회·변경하지 않았다.

신규 migration은 없다. 저장소 migration head는 `0034_kakao_room_capability_profiles`이며 과거 운영 증거도 0034지만, 이번 배포에서 Neon 값을 열거나 운영 DB를 새로 조회하지 않았다.

## 운영 판정

- 서버 코드, 통합 봇 산출물과 V4 route: Production 배포 확인.
- 기존 운영 사이트와 기존 카카오봇: 변경 없이 계속 사용 가능.
- V4 휴대폰 전환: Vercel과 같은 V4 전용 keyring을 내장한 private one-paste 파일 생성 완료. 실제 MessengerBot R 붙여넣기와 실기기 checklist는 미확인이다.
- signing secret을 identity secret으로 재사용하지 않는다.

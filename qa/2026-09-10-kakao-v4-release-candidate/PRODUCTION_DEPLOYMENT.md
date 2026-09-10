# Production 배포 증거

확인 시각: 2026-09-10 12:08 KST

## GitHub

- 검증 커밋: `a04da75f18a5e8f59fb01b8562425f2490046638`
- feature ref: `refs/heads/feat/kakao-v4-gateway-20260910`
- production ref: `refs/heads/main`
- 두 원격 ref 모두 같은 검증 커밋으로 확인했다.
- `origin/main`에서 fast-forward 가능한 관계를 확인한 뒤 명시적 refspec으로 push했다.
- 대규모 미커밋 변경이 남은 로컬 `main` worktree는 checkout, reset, clean, merge하지 않았다.

## Vercel

- Project: `k-lol-gg`
- Production deployment ID: `AKLqtQmqqAWiSXZtuiZmzBecRnvM`
- Source: `main` / `a04da75f18a5e8f59fb01b8562425f2490046638`
- Vercel UI status: `Ready`
- Production URL: `https://k-lol-gg.vercel.app`

운영 smoke 결과:

- `GET /`: HTTP 200
- `GET /api/health`: HTTP 200
- `GET /recruits`: HTTP 200
- 빈 JSON으로 `POST /api/integrations/kakao/v4/commands`: HTTP 400 `KAKAO_V4_COMMAND_INVALID`

마지막 항목은 V4 route가 운영에 존재하며 잘못된 입력을 fail-closed한다는 비파괴 확인이다.

## 환경과 DB

Vercel UI에서 값은 열지 않고 이름과 Production scope만 확인했다.

확인된 Production 이름:

- `DATABASE_URL`
- `DATABASE_POOL_MAX`
- `V2_PUBLIC_ORIGIN`
- `KAKAO_WEBHOOK_SECRET_CURRENT`
- `KAKAO_WEBHOOK_KEY_ID_CURRENT`

미설정:

- `KLOL_V2_KAKAO_IDENTITY_SECRET`

신규 migration은 없다. 저장소 migration head는 `0034_kakao_room_capability_profiles`이며 과거 운영 증거도 0034지만, 이번 배포에서 Neon 값을 열거나 운영 DB를 새로 조회하지 않았다.

## 운영 판정

- 서버 코드와 V4 route: Production 배포 확인.
- 기존 운영 사이트와 기존 카카오봇: 변경 없이 계속 사용 가능.
- V4 휴대폰 전환: 보류. 별도의 identity secret을 Vercel Production과 같은 휴대폰의 MessengerBot R `DataBase`에 일치시킨 뒤, 기존 분리형 두 프로필을 중지하고 통합 프로필 하나로 실기기 checklist를 통과해야 한다.
- signing secret을 identity secret으로 재사용하지 않는다.

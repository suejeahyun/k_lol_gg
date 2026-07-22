# 슈퍼 어드민 설정

K-LOL.GG의 슈퍼 어드민은 환경변수를 신뢰 기준으로 사용하고, 최초 정상 로그인 시 `UserAccount`에 `SUPER_ADMIN` 역할로 생성된다. 동일한 아이디가 이미 있으면 새 환경변수 비밀번호로 로그인할 때 역할·상태·비밀번호가 동기화되고 기존 인증 세션은 무효화된다.

## Vercel 프로덕션 설정

1. Vercel 프로젝트의 **Settings → Environment Variables**를 연다.
2. Production 범위에 아래 값을 등록한다.
   - `SUPER_ADMIN_ID`: 일반 사용자와 겹치지 않는 운영자 전용 아이디
   - `SUPER_ADMIN_PASSWORD`: 최소 16자, 다른 서비스에서 사용하지 않은 랜덤 비밀번호
   - `TOTP_ENCRYPTION_KEY`: 최소 32자의 별도 랜덤 값. 등록된 TOTP 비밀키를 DB에서 암호화한다.
   - `JWT_SECRET`: 최소 32자의 랜덤 값
   - `ADMIN_TOKEN_VALUE`: 최소 32자의 랜덤 값
3. `ALLOW_LEGACY_ADMIN_TOKEN=false`를 유지한다.
4. 저장 후 프로덕션을 다시 배포한다. 환경변수 변경은 기존 배포에 자동 반영되지 않는다.
5. `/admin/login`에서 새 `SUPER_ADMIN_ID`와 `SUPER_ADMIN_PASSWORD`로 한 번 로그인한다.
6. 로그인 직후 `/admin/security`에서 TOTP 2단계 인증을 등록하고 복구 가능 여부를 확인한다.
7. 관리자 대시보드의 배포 보안 경고가 사라졌는지 확인한다.

## 로컬 개발 설정

실제 운영 비밀번호를 복사하지 말고 `.env.local`에 로컬 전용 값을 사용한다.

```dotenv
SUPER_ADMIN_ID=local-super-admin
SUPER_ADMIN_PASSWORD=로컬에서도-16자-이상의-고유한-값
```

`.env`, `.env.local`과 Vercel 환경변수 값은 저장소에 커밋하지 않는다. 설정 상태는 값 자체를 출력하지 않는 아래 명령으로 확인한다.

```bash
npm run check:deploy-readiness
```

## 비밀번호 회전

1. Vercel의 `SUPER_ADMIN_PASSWORD`를 새 랜덤 값으로 교체한다.
2. 프로덕션을 다시 배포한다.
3. 새 비밀번호로 `/admin/login`에 로그인한다. 이때 DB의 비밀번호 해시가 동기화되고 기존 세션이 무효화된다.
4. 관리자 기능과 TOTP 로그인을 확인한다.
5. 이전 비밀번호를 비밀번호 관리자와 운영 기록에서 폐기한다.

아이디나 비밀번호를 잊은 경우 DB를 직접 수정하기보다 Vercel 환경변수를 안전하게 교체하고 위 회전 절차를 수행한다. TOTP 기기를 잃어버린 경우에는 데이터베이스 접근 권한이 있는 운영자가 별도 복구 절차로 2FA 상태를 재설정해야 하므로, 분기별 복구 훈련에 포함한다.

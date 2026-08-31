# K-LOL.GG 카카오 이중 키 최소 배포 후보

- 작성일: 2026-08-31 KST
- 저장소 기준점: `be2bed94b735669db5995b88bd111157f8f53916`
- 로컬 브랜치: `security/kakao-dual-secret-2026-08-31`
- 대상: Vercel 프로젝트 `k-lol-gg`
- 상태: 로컬 후보 검증 완료, 외부 push 및 Production 배포 미실행

## 결론

현재 active 키를 유지한 상태에서 `NEXT` 키도 동시에 수신할 수 있는 최소 보안 후보를 별도 worktree에서 구성했다. 기존 디자인·UI 변경, DB 스키마 변경, 운영 데이터 변경은 포함하지 않았다.

`lint`, `typecheck`, 기존 카카오 인증 회귀 검사, 이중 키 계약 검사, 전체 `test:ci`, 별도 `build:ci`는 통과했다. `security:ci`는 현재 후보 파일이 아니라 과거 Git 이력의 비밀 패턴 감지 1건 때문에 실패한다. 따라서 운영 배포에는 이 보류 사유를 명시적으로 승인하는 제한적 break-glass가 필요하다.

## 포함 파일

### 런타임

- `src/lib/security/secrets.ts`
- `src/lib/security/hmac.ts`
- `src/lib/security/request-guard.ts`
- `src/lib/security/deploy-env.ts`
- `src/lib/kakao/request-auth.ts`
- `src/app/api/kakao/search-player/route.ts`
- `src/app/api/kakao/operation-forms/route.ts`
- `src/app/api/kakao/destruction-scrim-recruits/_shared.ts`
- `src/app/api/kakao/party-recruits/_shared.ts`
- `src/app/api/kakao/recruit/season-apply/route.ts`
- `src/app/api/kakao/recruit/season-apply/status/route.ts`

### 검증·운영 문서

- `.env.example`
- `package.json`
- `tools/check-deploy-readiness.mjs`
- `tools/check-kakao-request-guard.ts`
- `tools/check-kakao-dual-secret.ts`
- `tools/check-secret-leaks.mjs`
- `docs/operations/kakao-dual-secret-rotation.md`
- `docs/operations/kakao-dual-secret-bot-opt-in.template.js`
- `qa/2026-08-31-security-remediation-v1/DUAL_SECRET_RELEASE_CANDIDATE.md`

## 동작 계약

1. active만 설정된 기존 구성은 계속 동작한다.
2. active와 NEXT가 서로 다른 유효한 값이면 둘 다 요청 인증에 사용할 수 있다.
3. Production에서 NEXT가 빈 값, active와 동일한 값, 또는 active 없이 단독 설정되면 인증이 fail-closed 된다.
4. 일반 헤더 인증과 HMAC 인증 모두 active/NEXT 중첩을 지원한다.
5. 봇의 NEXT 사용은 명시적 opt-in 전까지 비활성이다.
6. 비밀값, 길이, 해시, 접두사는 로그와 보고서에 기록하지 않는다.

## 검증 증거

| 검사 | 결과 | 비고 |
|---|---|---|
| `git diff --check` | PASS | 줄바꿈 변환 경고만 존재 |
| `npm run lint` | PASS | 종료 코드 0 |
| `npm run typecheck` | PASS | 종료 코드 0 |
| `npm run check:kakao-auth` | PASS | 기존 인증 회귀 검사 |
| `npm run check:kakao-dual-secret` | PASS | active-only, overlap, fail-closed, validator, opt-in 계약 |
| `npm run test:ci` | PASS | 검증용 가상 `DATABASE_URL`만 프로세스에 주입 |
| `npm run build:ci` | PASS | 검증용 가상 `DATABASE_URL`만 프로세스에 주입 |
| `npm run security:ci` | FAIL/HOLD | 과거 Git 이력의 비밀 패턴 감지 1건 |

격리 빌드는 실제 DB에 연결하지 않았기 때문에 사이트맵 동적 URL 조회에서 인증 실패 경고를 남겼다. Next.js 프로덕션 빌드 자체는 종료 코드 0으로 완료됐다. 실제 운영 환경변수와 DB 연결 검증은 Production 배포 후 별도 스모크 단계에서 수행해야 한다.

## 제한적 break-glass 조건

다음 조건을 모두 만족할 때에만 과거 이력 감지 실패를 제한적으로 예외 처리할 수 있다.

1. 사용자가 이 문서에 명시된 최소 후보의 Production 배포를 별도로 승인한다.
2. 배포 직전 현재 정상 Vercel 배포 ID와 URL을 기록한다.
3. 배포에 이 후보 커밋 외의 UI·문서·운영 데이터 변경이 섞이지 않았음을 다시 확인한다.
4. 새 배포 후 active 키 요청과 NEXT 키 요청을 각각 통제된 방식으로 검증한다.
5. 검증 실패 시 봇 키를 전환하지 않고 즉시 직전 Vercel 배포로 롤백한다.
6. Git 이력 정리는 기존 키 폐기 완료 후 별도 단계로 수행한다.

이 예외는 과거 이력 감지만 대상으로 하며, 현재 파일에서 새 비밀 노출이 감지되거나 다른 테스트가 실패하면 사용할 수 없다.

## 배포 순서

1. 후보 커밋 SHA와 변경 파일 20개(런타임·검증·운영 파일 19개와 이 보고서)를 확정한다.
2. 현재 Production 배포 ID·URL·헬스 상태를 기록한다.
3. 후보 브랜치만 원격에 push한다.
4. Vercel Production에 후보를 배포한다. DB 마이그레이션은 실행하지 않는다.
5. `/api/health`와 주요 공개 화면을 확인한다.
6. active 키로 통제 요청을 보내 정상 인증을 확인한다.
7. NEXT 키로 동일한 통제 요청을 보내 정상 인증을 확인한다.
8. 양쪽 모두 성공한 뒤에만 운영 봇을 NEXT 키로 opt-in한다.
9. 봇 실방 회귀 검증 후 NEXT를 active로 승격하고 구 active를 폐기한다.
10. 마지막으로 유출 의심 산출물과 Git 이력을 정리하고 모든 클론을 동기화한다.

## 롤백

- 코드 롤백: 배포 직전에 기록한 Vercel 직전 정상 배포를 즉시 Promote/Redeploy한다.
- 키 롤백: 봇 opt-in 전에는 active 키를 유지한다. NEXT 검증 실패 시 NEXT 사용을 중단하며 active 키는 변경하지 않는다.
- DB 롤백: 이 후보는 마이그레이션과 데이터 변경이 없으므로 필요하지 않다.
- 이력 롤백: 이 단계에서는 이력 재작성 자체를 수행하지 않는다. 전체 refs 복구 번들은 `E:\\k-LOL.GG\\backups\\security-remediation-2026-08-31\\k_lol_gg-pre-rewrite.bundle`에 별도로 존재한다.

## 운영 반영 상태와 남은 위험

- Vercel NEXT 환경변수 등록: 완료, 값은 미출력
- 이중 키 코드 Production 반영: 미실행
- active/NEXT 운영 요청 검증: 미실행
- 봇 NEXT 전환: 미실행
- 구 active 키 폐기: 미실행
- 유출 의심 산출물·Git 이력 정리: 미실행
- 독립 QA 최종 승인: 이 후보 기준 추가 필요

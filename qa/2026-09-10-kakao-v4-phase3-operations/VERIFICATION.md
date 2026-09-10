# Verification evidence

## 통과

```powershell
npm run typecheck
```

- 결과: PASS (`tsc --noEmit`)

```powershell
npx eslint src/app/api/integrations/kakao/v4/commands/route.ts src/modules/recruiting/kakao-assistant/domain.ts src/modules/recruiting/kakao-assistant/postgres-kakao-assistant.ts src/modules/recruiting/kakao-v4/application.ts src/modules/recruiting/kakao-v4/canonical-command.ts src/modules/recruiting/kakao-v4/classifier.ts src/modules/recruiting/kakao-v4/dispatcher.ts src/modules/recruiting/kakao-v4/http.ts src/modules/recruiting/kakao-v4/operation-form.ts src/modules/recruiting/operation-forms/postgres-operation-forms.ts tests/kakao-v4-phase3-operations.test.ts
```

- 결과: PASS (오류·경고 없음)

```powershell
npx tsx --test tests/kakao-v4-command-gateway.test.ts tests/kakao-v4-command-classifier.test.ts tests/kakao-v4-dispatcher.test.ts tests/kakao-v4-phase3-operations.test.ts tests/kakao-v4-server-acceptance.test.ts tests/recruiting-application.test.ts tests/kakao-assistant.test.ts tests/operation-forms.test.ts
```

- 결과: PASS, 79 tests / 0 failed / 0 skipped
- 포함 근거: typed form 4종, 필드별 누락, 정적 V1 응답, 예약 공지 단일 조회, 공통 durable receipt identity, 재시작 replay, 다른 본문 conflict와 public 409

```powershell
node --test tests/kakao-v4-v1-compatibility-contract.test.mjs tests/kakao-v40-exact-reply-parity.test.mjs tests/kakao-v40-scrim-exact-parity.golden.test.mjs tests/kakao-v40-misc-command-parity.test.mjs tests/kakao-v41-v1-inhouse-golden.test.mjs tests/kakao-v41-v1-compat.test.mjs tests/kakao-v41-v1-router-integration.test.mjs
```

- 결과: PASS, 69 tests / 0 failed / 0 skipped
- 포함 근거: V1 등록·결과·경고·인증·사진취소 문구와 운영 양식 wrapper 회귀

```powershell
npm test
```

- 결과: PASS, contract + unit 전체 547 tests / 0 failed / 0 skipped

```powershell
npm run build
```

- 결과: PASS, Next.js 16.3.4 production build 및 92개 static page 생성 완료

## 설치 참고

- 격리 worktree에서 검증 의존성을 준비하기 위해 `npm ci --ignore-scripts`를 실행했다.
- npm audit 요약은 moderate 4건이었으며 dependency version과 lockfile은 변경하지 않았다.

## 수행하지 않음

- DB migration/apply
- 실제 PostgreSQL contract/staging test
- 운영 DB 또는 환경변수 변경
- Vercel/운영 서버/JAR 배포
- 실제 카카오방 요청 및 이미지 업로드

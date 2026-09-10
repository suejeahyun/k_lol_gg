# Verification evidence

## 통과

```powershell
npm run typecheck
```

- 결과: PASS (`tsc --noEmit`)

```powershell
npx eslint src/modules/recruiting/application/commands.ts src/modules/recruiting/application/command-handler.ts src/modules/recruiting/kakao-assistant/domain.ts src/modules/recruiting/kakao-v4/application.ts src/modules/recruiting/kakao-v4/canonical-command.ts src/modules/recruiting/kakao-v4/dispatcher.ts src/modules/recruiting/kakao-v4/http.ts src/app/api/integrations/kakao/v4/commands/route.ts tests/kakao-v4-command-gateway.test.ts tests/kakao-v4-dispatcher.test.ts tests/recruiting-application.test.ts
```

- 결과: PASS (오류·경고 없음)

```powershell
npm run lint
```

- 결과: PASS, 0 errors / 기존 범위 밖 25 warnings
- 경고 위치: 기존 MessengerBot 번들 24건, 기존 `tests/database/recruiting.contract.test.ts` 1건

```powershell
npx tsx --test tests/kakao-v4-command-gateway.test.ts tests/kakao-v4-dispatcher.test.ts tests/recruiting-application.test.ts tests/recruiting-domain.test.ts tests/kakao-assistant.test.ts
```

- 결과: PASS, 58 tests / 0 failed / 0 skipped
- 포함 근거: cross-user, A→B→A, 0명 snapshot, replay, body conflict, public 409, 파티/스크림/시즌 dispatcher, deprecated scrim 안내

```powershell
npm run build
```

- 결과: PASS, Next.js 16.3.4 production build 및 92개 static page 생성 완료

```powershell
npm test
```

- 결과: PASS, contract + unit 전체 513 tests / 0 failed / 0 skipped

## 설치 참고

- 이 격리 worktree에서 검증 의존성을 준비하기 위해 `npm ci --ignore-scripts`를 실행했다.
- npm audit 요약은 moderate 4건이었으며 이번 소스 패치에서 dependency version이나 lockfile은 변경하지 않았다.

## 수행하지 않음

- DB migration/apply
- 운영 DB contract test
- Vercel build/deploy
- 운영 JAR 교체·기동
- 실제 카카오방 요청

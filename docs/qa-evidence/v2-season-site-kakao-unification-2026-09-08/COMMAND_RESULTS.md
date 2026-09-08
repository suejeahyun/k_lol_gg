# 명령 실행 결과

| 명령 | 결과 |
|---|---|
| `npm run bot:kakao:v41` | PASS |
| `node --check integrations/messengerbot-r/KLOL_KAKAO_BOT_V41_V2_ROUTER.js` | PASS |
| `node --test tests/kakao-v41-season-form.test.mjs tests/kakao-v41-bot-contract.test.mjs tests/season-kakao-pending-http-ui.test.mjs` | PASS · 7/7 |
| `npx tsx --test tests/season-domain.test.ts tests/kakao-assistant.test.ts` | PASS · 16/16 |
| `npm run typecheck` | PASS |
| 변경 대상 `npx eslint ...` | PASS |
| `npm test` | PASS · contract 130/130, unit 458/458 |
| `npm run test:db` 시즌 계약 | PASS · 23/23, 이후 공유 팀 도구 테스트에서 중단 |
| `V2_DB_CONTRACT_SCOPE=recruiting npm run test:db` | PASS · 7/7, 격리 클러스터 제거 확인 |
| `npm run build` | PASS · Next.js 16.3.4 optimized build |
| `git diff --check` | PASS · 공백 오류 없음, 줄바꿈 변환 경고만 존재 |
| `npm run security:secrets` | INCOMPLETE · 전체 Git 이력 장시간 검사 중 수동 종료 |

운영 DB·실제 카카오·배포 검증은 수행하지 않았다.

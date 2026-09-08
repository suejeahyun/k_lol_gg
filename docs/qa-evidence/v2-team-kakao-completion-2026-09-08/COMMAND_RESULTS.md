# 실행 결과

2026-09-08 KST, `E:\k-LOL.GG\7.k_lol_gg_v2_greenfield`에서 실행했다.

| 명령 | 결과 |
| --- | --- |
| `npm run lint` | PASS |
| `npm run typecheck` | PASS |
| `npm run test:contracts` | 115/115 PASS |
| `npm run test:unit` | 449/449 PASS |
| `npm run build` | PASS |
| `npm run test:db` | PASS, 격리 PostgreSQL 18 제거 확인 |
| `npm run verify:auth-http` | PASS |
| `npm run security:secrets` | PASS |
| `npm run bot:kakao:v41` | PASS |
| `node --check integrations/messengerbot-r/KLOL_KAKAO_BOT_V41_V2_COMPLETE.js` | PASS |

운영 배포와 실제 외부 Kakao 호출은 검증 명령에 포함하지 않았다.

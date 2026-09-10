# 검증 증거

## 수행

```powershell
npm ci --ignore-scripts
```

- PASS. lockfile 변경 없음.
- npm audit 요약: moderate 4건. 이번 감사에서 dependency를 변경하지 않았다.

```powershell
npm run build-messengerbot:v4
node --check integrations/messengerbot-r/v4/KLOL_KAKAO_BOT_V4_RECRUIT_MESSENGERBOT_R.js
node --check integrations/messengerbot-r/v4/KLOL_KAKAO_BOT_V4_FEATURES_MESSENGERBOT_R.js
```

- 생성 성공, 두 파일 syntax PASS.
- 생성 결과는 Git 기준 산출물과 동일했다.

```powershell
npx tsx --test tests/kakao-v4-server-acceptance.test.ts tests/kakao-v4-phase3-acceptance.test.ts tests/kakao-v4-phase3-inhouse-scrim.test.ts tests/kakao-v4-phase3-operations.test.ts
```

- PASS, 64/64.

```powershell
node --test tests/kakao-v4-client-acceptance.test.mjs tests/kakao-v4-phase3-client-acceptance.test.mjs tests/kakao-v4-artifact-acceptance.test.mjs tests/kakao-v4-bot-template.test.mjs
```

- PASS, 41/41.

```powershell
node --test tests/kakao-v4-release-readiness.test.mjs
```

- PASS, 5/5. migration ledger, receipt/nonce schema, installation/profile/key mapping, V3/V4 route 공존, P0 pairing 부재를 고정했다.

```powershell
npm run check
```

- PASS.
- ESLint: 오류 0, 기존 범위 25 warnings.
- TypeScript: PASS.
- contract tests: 280/280.
- unit tests: 588/588.
- 여성 챔피언 가이드 이미지 검증: 68/68, SHA-256 중복 0.
- Next.js 16.3.4 production build: PASS, static page 92개.

```powershell
npm run security:secrets
```

- PASS. 비밀값을 읽거나 출력하지 않았다.

## 수행하지 않음

- 운영/Preview Neon 연결 및 query
- Vercel 로그인, 환경변수 값 조회, 배포
- 실제 MessengerBot R 설치와 카카오 메시지 전송
- migration apply/down, DB row 수정·삭제
- push

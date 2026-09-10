# Command results

실행일: 2026-09-10 KST

## 의존성

```powershell
npm ci --ignore-scripts --no-audit --no-fund
```

- 결과: 성공, 652 packages 설치.
- 범위: 전용 worktree의 로컬 `node_modules`만 생성. lockfile 변경 없음.

## MessengerBot R 생성

```powershell
npm run bot:kakao:v4
```

- 결과: 성공.
- RECRUIT 단일 파일: 7,447 characters.
- FEATURES 단일 파일: 7,450 characters.
- 두 파일 모두 ES5 parse, 단일 `response()` callback, 65,535자 미만 조건을 자동 테스트에서 확인.

## 집중 계약 테스트

```powershell
node --test tests/kakao-v4-v1-compatibility-contract.test.mjs tests/kakao-v4-bot-template.test.mjs
npx tsx --test tests/kakao-v4-command-gateway.test.ts
```

- V1 계약 및 ES5 템플릿: 15 passed, 0 failed.
- V4 domain/application/schema/idempotency/error: 7 passed, 0 failed.
- 합계: 22 passed, 0 failed.
- 참고: 최초 정적 검사에서 `trimText`를 `text` 의존성으로 오인한 테스트 정규식 1건을 발견해 단어 경계 검사로 수정한 뒤 전체 재실행 통과.

## TypeScript

```powershell
npm run typecheck
```

- 결과: 성공, 오류 0.

## ESLint

```powershell
npx eslint src/app/api/integrations/kakao/v4/commands/route.ts src/modules/recruiting/kakao-v4/domain.ts src/modules/recruiting/kakao-v4/application.ts src/modules/recruiting/kakao-v4/http.ts src/modules/recruiting/kakao-access/postgres-kakao-room-registry.ts tests/kakao-v4-command-gateway.test.ts tests/kakao-v4-bot-template.test.mjs scripts/build-messengerbot-v4.mjs
```

- 결과: 성공, 오류·경고 0.

## Production build

```powershell
npm run build
```

- 결과: 성공.
- Next.js 16.3.4 optimized production build 완료.
- `/api/integrations/kakao/v4/commands` dynamic route 포함 확인.
- 92개 static page 생성 완료.

## 운영 상태

- 운영 DB 변경: 없음.
- 환경변수 변경: 없음.
- 푸시·배포: 없음.
- 실제 봇 설치: 없음.
- 명시적 501 범위: `V4상태`, `V4계약확인`을 제외한 파티·내전·스크림·전적·최근·랭킹·운영 양식·등록 안내 등 기존 V1 명령 전체.
- 이미지 기능: 이번 범위 제외.

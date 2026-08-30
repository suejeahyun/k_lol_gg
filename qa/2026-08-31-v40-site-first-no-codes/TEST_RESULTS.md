# V40 검사 결과

실행일: 2026-08-31 (KST)

## 전체 검사

```text
npm run check
결과: PASS
```

포함 항목:

- 접근성, 내비게이션, 모바일 사용자 흐름, SEO
- ESLint, TypeScript
- Prisma schema validate, Prisma Client generate
- 관리자 API guard 70개, 관리자 2차 인증·안전한 next 경로
- 요청 제한, 카카오 인증·정책·구인·관리 명령·고정 템플릿
- 비공개 이미지, 경고 소유권·재제출 묶음, 내전 소유권·단계형 UI
- Next.js Production build

## 추가 검사

```text
npm run check:secrets
결과: PASS

node --check KLOL_KAKAO_BOT_V40_GUIDED_HUB.js
결과: PASS

git diff --check
결과: PASS (공백 오류 없음, CRLF 변환 안내만 존재)
```

## 카카오봇 포맷

```text
Version: KLOL_KAKAO_BOT_V40_SITE_FIRST_NO_CODES_R2_2026_08_31
SHA-256: C91A56A289A762FE7E08143E8FD4B55C9695C4DF68EBFCB6689613DCB73776B7
CRLF: 3510
Lone LF: 0
Lone CR: 0
NBSP: 0
ES5 incompatible let/const/arrow: 0
```

## 브라우저 검증

환경: 로컬 Next.js dev server 및 Production, 390×844 viewport

- `/start`: 3개 목적 카드, 로그인 상태 안내, 이어하기 링크 표시 확인
- `/start`: 문서 너비가 viewport 안에 표시되고 가로 넘침 없음
- `/discipline/evidence`: 비로그인 시 모바일 앱 로그인 화면 연결 확인
- `/matches/submit`: 비로그인 시 모바일 앱 로그인 화면 연결 확인
- `/admin/discipline/new`: `/admin/login?next=%2Fadmin%2Fdiscipline%2Fnew` 확인
- 관리자 로그인 화면: `innerWidth=390`, `scrollWidth=390` 확인

## 운영 반영 검사

```text
운영 DB 백업: PASS
pg_restore 목록·전체 읽기: PASS
prisma migrate deploy: PASS
prisma migrate status: 102개 최신
GitHub Actions verify: PASS
Vercel Production: PASS
npm run check:deploy-api: PASS
```

- 운영 `/start`: 200, 새 등록 시작 문구 확인
- 운영 `/account`: 경고 차감 사진 제출 버튼과 경고 현황 확인
- 운영 `/discipline/evidence`: 로그인 계정 전용 화면과 과제 0건 안내 확인
- 운영 `/matches/submit`: 진행일·진행자 자동 입력 안내와 단계형 UI 확인
- 운영 관리자 로그인: `next=/admin/discipline/new` 보존 확인
- 모든 Production 모바일 확인 화면: 가로 넘침 없음

## 제한이 있는 검사

```text
npm run check:release
결과: FAIL (로컬에 Vercel Production 전용 환경변수가 없어 deploy-readiness 단계 중단)
```

소스 전체 검사, 비밀값 검사, 실제 Vercel 배포와 운영 health는 통과했다. Vercel 환경변수는 변경하지 않았다.

## 미실행

- 운영 계정 로그인 후 실제 이미지 업로드
- Vercel 비공개 Blob 실저장
- 카카오 단말 코드 교체·실방 테스트
- Android 실기기 테스트
- Preview 배포(Production 직접 배포로 대체)

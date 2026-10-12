# 보안·운영 전반 점검 — 2026-10-13 KST

- 대상: `worktrees/ux-discoverability-20261002`, HEAD `440433a27a2a9df2a012b4cc315e872acf5cb06d` 및 현재 작업 트리.
- 범위: 인증·세션·역할·Origin/CSRF·입력 제한·비공개/공개 이미지·외부 연결·보안 헤더·PWA·의존성·비밀정보 검사·CI·예약 작업·복구 런북.
- 소스·운영 DB·외부 설정은 변경하지 않았다. 이 보고서와 합성 재현 스크립트만 추가했다. 실제 비밀값·사용자 이미지·환경 파일은 읽거나 출력하지 않았다.

## 우선 조치

### S1. 알려진 취약 의존성 갱신 필요 — 설치 버전과 advisory 확인

`npm audit --json --ignore-scripts`는 영향받는 패키지 항목 17개(critical 1, high 11, moderate 5)를 보고했다. `--omit=dev` 결과는 high 2개다. 17개의 독립적인 서비스 취약점이라는 뜻은 아니며 전이 의존성 중복 항목을 포함한다.

| 패키지 | 현재 → 수정 버전 | 실제 경로·제약 |
| --- | --- | --- |
| sharp | 0.35.4 → 0.35.5 | 직접 운영 의존성, Next 이미지 처리와 업로드 검사에 사용. `package.json:57`. advisory는 librsvg/SVG 처리와 특정 Linux 실행 조건을 설명한다. 앱 업로드는 PNG/JPEG/WebP 매직 바이트·컨테이너·픽셀 제한을 먼저 검사하므로 공개 업로드 경로의 SVG 악용은 확인되지 않았다. |
| source-map-js | 1.2.1 → 1.2.2 | `next → postcss → source-map-js`; lockfile `package-lock.json:11044`. 조작된 source map 처리 시 CPU 소진 advisory. 사용자 입력이 이 파서까지 도달하는 운영 경로는 확인되지 않았다. |
| proxy-addr | 2.0.7 → 2.0.8 이상 | critical 항목은 개발 도구 `shadcn → @modelcontextprotocol/sdk → express → proxy-addr`에 있다. 사이트 운영용 Express 서버가 존재한다는 뜻은 아니다. |

공식 근거: [sharp 보안 공지](https://github.com/advisories/GHSA-wq5f-xc86-pv6w), [source-map-js 보안 공지](https://github.com/advisories/GHSA-68fv-2mgg-jv7q). 두 페이지를 2026-10-13에 확인했다. 개발 의존성에는 MCP SDK·braces·esbuild·PostCSS selector parser 관련 항목도 있다. 자동 audit fix는 일부 도구의 major 다운그레이드를 제안하므로 그대로 실행할 대상으로 보지 않았다. 의존성 변경·설치·fix는 수행하지 않았다.

### S2. 갤러리·하이라이트 삭제 요청을 실제 Blob 삭제로 소비하는 경로가 없음 — P2

- `src/app/api/admin/private-assets/[assetId]/route.ts:35`는 `requestDeletion` 후 202를 반환한다.
- `src/modules/assets/application/private-asset-service.ts:230`의 `requestDeletion`은 DB를 `DELETE_PENDING`으로 바꾸고 감사 이벤트를 남긴다. 실제 Blob 삭제는 같은 파일 `:308`의 `executeCleanup`에서만 수행한다.
- 실행 코드 전체의 `planCleanup`/`executeCleanup` 호출은 `src/app/api/internal/jobs/discipline-assets-cleanup/route.ts:20`뿐이다. 그 서비스의 repository는 `src/modules/discipline/infrastructure/postgres-discipline-adapter.ts:646`에서 징계 바인딩 테이블과 JOIN한다. 갤러리·하이라이트 자산은 여기에 해당하지 않는다.
- 일반 미디어 repository에는 cleanup 후보 조회가 있지만(`src/modules/assets/infrastructure/postgres-private-asset-admin-adapter.ts:253`) 이를 실행하는 라우트/스크립트가 없다. `vercel.json`에도 일반 자산 cleanup/recovery 예약이 없다.

따라서 앱에 구현된 경로만으로는 미디어 삭제 요청과 업로드 실패 보상 뒤의 Blob 보존이 끝나지 않는다. 저장 비용·보존 정책과 관리자의 삭제 기대에 영향을 준다. 일반 자산의 bounded cleanup/recovery 작업을 연결하고 성공·실패·가장 오래된 대기 시간을 관측해야 한다. 외부에서 별도로 직접 정리하는 작업의 존재 여부는 확인하지 않았다.

### S3. 만료 세션 정리 구현이 실제 실행 경로에 연결되지 않음 — P2

`src/modules/auth/infrastructure/postgres-auth-repository.ts:759`에 `cleanupExpiredAuthState`가 있으나 `src/`, `scripts/`의 호출자는 없다. `/api/internal/jobs/maintenance`의 실제 구현(`src/modules/operations/infrastructure/postgres-operations-repository.ts:495`)은 rate-limit bucket·receipt·nonce만 정리하고 `auth.sessions`는 정리하지 않는다. 로그인은 매번 세션 행을 추가하므로 장기 운영 시 만료/폐기 행이 계속 누적된다. 만료 세션이 다시 인증되는 문제는 아니다. 기존 expiry/revocation 검증은 유지된다.

정리 함수를 실제 예약 작업에 연결하고 큰 누적량을 한 transaction에서 모두 삭제하는 현재 방식도 batch 제한으로 보완해야 한다. 실제 운영 누적 행 수·외부 수동 청소 여부는 확인하지 않았다.

### S4. 공개 이미지가 원본 EXIF를 그대로 유지함 — 합성 입력으로 확인, P2

미디어 업로드는 `src/modules/media/infrastructure/media-private-assets.ts:18`에서 공통 이미지 검사를 사용한다. 검사는 픽셀 decode를 수행하지만 `src/modules/matches/infrastructure/private-image.ts:139`에서 원본 bytes를 그대로 반환하며, `src/modules/assets/application/private-asset-service.ts:149`도 원본을 저장한다. 공개 읽기는 `src/modules/assets/application/public-private-asset-service.ts:39` 및 `src/app/api/media/assets/[assetId]/route.ts:17`에서 같은 bytes를 응답한다.

32×32 합성 JPEG에 가짜 EXIF Artist 문자열만 넣어 검증·공개 서비스 경로를 실행했다. 원본과 공개 bytes가 동일하고 EXIF 222 bytes 및 합성 Artist가 유지됐다. 실제 개인정보 유출이나 기존 업로드의 GPS 존재를 조사한 것은 아니다. 촬영 위치·작성자 메타데이터가 있는 사진을 관리자가 공개하면 해당 정보도 함께 배포되는 구조다.

갤러리/썸네일 공개용 파생 이미지에서 EXIF/GPS를 제거하고, 증거용 원본 보존 정책과 분리해야 한다. 재인코딩 시 SHA-256·파일 크기·중복 판정은 최종 저장 bytes 기준으로 맞춰야 한다.

재현: `node --import tsx docs/qa-evidence/full-audit-2026-10-13/security-operations-probe.mjs` — exit 0. DB·네트워크·원본 사용자 이미지가 필요 없다.

### S5. Riot RSO를 켜면 외부 로그인에서 돌아오는 첫 요청이 인증 실패할 구조 — 활성화 전 P2

- ACCOUNT 쿠키도 `src/modules/auth/infrastructure/session-cookie-policy.ts:11`에서 `SameSite=Strict`다.
- `src/components/riot/riot-owner-actions.tsx:37`은 `auth.riotgames.com`으로 전체 페이지를 이동한다.
- GET callback은 `src/app/api/me/riot/rso/callback/route.ts:17`에서 state/code 처리 전에 ACCOUNT 세션을 요구한다.

Strict 쿠키는 외부 사이트에서 돌아오는 최초 탐색에 포함되지 않으므로 콜백이 401로 끝난다. [브라우저 SameSite 규칙](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Set-Cookie#samesitesamesite-value)을 확인했고 합성 probe로 ACCOUNT 쿠키 옵션도 확인했다. 실제 Riot 계정·승인된 RSO 자격으로 실행한 결과는 아니다. 현재 RSO는 설정으로 활성화를 제어하므로 운영 장애 발생을 주장하지 않는다.

일반 계정의 외부 인증 callback에 맞춘 쿠키/짧은 만료의 전용 callback 바인딩을 설계하고, state 소유자·일회성 소비·세션 재검증을 유지한 채 서로 다른 사이트 사이 왕복 E2E를 추가해야 한다.

## 추가 개선 및 운영 확인 항목

1. **게시 취소 후 캐시 효력 명시/조정.** 공개 자산 응답은 `src/app/api/media/assets/[assetId]/route.ts:22`에서 `public, max-age=300, stale-while-revalidate=86400`이다. DB가 DRAFT/ARCHIVED로 바뀌어도 이미 캐시된 응답은 즉시 사라지지 않는다. 최장 stale 허용 구간과 공개 취소 정책을 맞추고 필요하면 재검증·CDN 무효화를 연결해야 한다. 현재 운영 CDN에서 실제 잔존 시간을 측정하지 않았다.
2. **PWA의 이름이 고정된 이미지 갱신.** `public/sw.js:37`은 캐시가 있으면 네트워크를 조회하지 않는다. `/images/brand`, `/images/home` 등의 내용을 같은 URL로 교체하면서 cache version을 올리지 않으면 설치 사용자는 이전 파일을 계속 받는다. 내용 hash 또는 stale-while-revalidate 정책이 필요하다. API/사용자 응답을 서비스워커 캐시에 넣지 않는 경계는 확인했다.
3. **보안 검사 자동화 범위.** 전체 의존성 advisory 검사/예약 업데이트 설정은 `.github`에 없다. secret scan은 PR/workflow_dispatch용 `data-contract.yml:53`에만 있고 main push용 `ci.yml`에는 없다. `npm run check` 자체도 secret scan과 dependency audit를 포함하지 않는다. 보호 브랜치·외부 Dependabot 설정은 별도 확인 대상이다.
4. **외부 운영 증거.** 제공자 PITR 복원·RPO/RTO, Blob 복원, 키 escrow, 실제 경보 수신, cleanup scheduler의 실행 이력은 이번 소스 점검으로 검증하지 않았다. `docs/operations/DATABASE_RECOVERY_RUNBOOK.md`와 `OPERATIONAL_READINESS_RUNBOOK.md`도 구현과 운영 확인을 구분하고 있다. 실제 이력을 확인해야 하며 소스에 없는 경보를 설치됐다고 가정하지 않았다.
5. **CSP 추가 방어.** production `next.config.ts:6`의 script-src는 unsafe-inline을 허용한다. source scan에서는 raw HTML/eval 삽입 경로를 발견하지 않았으며 XSS 취약점이 확인됐다는 뜻은 아니다. framework 요구를 고려해 nonce/hash 기반 정책 적용을 검토할 수 있다.

## 점검에서 확인한 보호 장치

- ACCOUNT/ADMIN 목적 세션 분리, HttpOnly/Secure 쿠키, JWS algorithm·issuer·audience·kid·TTL 검증, 토큰 hash에 대응하는 DB 세션 검증, 역할·승인 상태·authVersion·만료·폐기 재확인.
- 관리자 TOTP 제거는 `docs/architecture/0010-admin-password-login.md`에 명시된 운영자 요청이다. 이를 인증 우회 결함으로 분류하지 않았다.
- 로그인/가입/복구의 same-origin·JSON 크기·정확한 필드 검사, DB 기반 제한과 credential-work 동시 처리 제한, 복구 응답 평준화.
- 자산 읽기/변경의 세션·리소스 소유자/관리자 정책, 존재 여부를 감추는 404, 공개 자산의 READY+PUBLISHED 바인딩 확인, 비공개 저장소 모드의 fail-closed.
- PNG/JPEG/WebP 매직 바이트·컨테이너 종료·4MiB·4096px·단일 프레임·decode 검사, 업로드 읽기 시간 제한, Blob 경로/크기/hash 확인.
- Riot endpoint는 운영 설정에서 고정된 호스트로 구성하며 redirect를 거절한다. YouTube ID는 allowlist 형태로 추출하고 raw HTML을 사용하지 않는다.
- 내부 작업의 별도 HMAC 서명·timestamp·nonce, cron의 timing-safe bearer 비교, 보안 헤더, API/사용자 응답 제외 PWA cache 범위.
- PR CI에 lint/typecheck/unit/contract/build·격리 PostgreSQL·auth HTTP·release evidence·secret scan 구성이 존재한다. 실제 GitHub 실행 결과/브랜치 규칙은 이번 담당 범위에서 조회하지 않았다.

## 실행 결과와 한계

| 실행 | 결과 |
| --- | --- |
| `node scripts/check-secrets.mjs --tree-only` | exit 0, 추적/미추적 현재 트리의 high-confidence pattern 0. 기존 스캐너가 값 대신 rule/source/line만 출력함을 먼저 확인했다. |
| `npm audit --json --ignore-scripts` | exit 1, 영향 패키지 항목 17개. 설치/fix 없이 registry 조회만 수행. |
| `npm audit --omit=dev --json --ignore-scripts` | high 2개. 이후 같은 셸의 npm ls가 성공하여 전체 셸 exit가 0이었으나 audit 자체는 findings를 반환했다. |
| `npm ls sharp proxy-addr @modelcontextprotocol/sdk postcss-selector-parser source-map-js --all` | 의존성 경로 확인 성공. |
| 합성 이미지/쿠키 probe | exit 0, 원본 EXIF 유지와 ACCOUNT Strict 옵션 확인. |

전체 `npm run check`와 브라우저/DB 검증은 다른 감사 담당자의 결과를 따른다. 이 담당자는 실제 사이트 공격, 운영 쓰기, 로그인, 실계정 RSO, provider 작업, Git history 전체 secret scan을 수행하지 않았다. Secret scanner는 알려진 정규식·2MiB 이하 텍스트·git ignore 규칙 기반이며 통과를 비밀값 부재의 절대적 증명으로 해석하면 안 된다. 위 보호 장치 확인도 모든 경로에 대한 침투 테스트 통과를 의미하지 않는다.

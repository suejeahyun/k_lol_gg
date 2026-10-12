# 보안·운영 개선 검증 — 2026-10-13

기준 checkout: `full-audit-fixes-20261013`, 시작 commit `440433a27a2a9df2a012b4cc315e872acf5cb06d`. 이 문서는 소스와 로컬 합성 데이터 검증을 기록한다. 운영 배포·실제 cron 실행 여부는 상위 릴리스/배포 근거로 별도 확인한다. 비밀값, 실제 이용자 자료, 운영 파일 원본을 테스트에 기록하지 않았다.

## 변경과 안전 경계

| 항목 | 반영 내용 | 핵심 소스 |
| --- | --- | --- |
| S1 의존성 | `sharp` 0.35.5 고정, 호환 가능한 전이 의존성 갱신. production 의존성 감사 0건. | `package.json`, `package-lock.json` |
| S2 미사용 미디어 정리 | GALLERY/HIGHLIGHT_THUMBNAIL만 대상으로, DELETE_PENDING 7일 경과 후 삭제. 모든 갤러리/하이라이트 연결과 경기·징계 근거 연결을 확인하고 참조 중이면 제외. ARCHIVED 참조도 보호. | `src/modules/media/infrastructure/media-asset-maintenance.ts`, `src/modules/assets/infrastructure/postgres-private-asset-admin-adapter.ts` |
| S3 인증 보관기간 | 만료·철회 후 30일 지난 세션만 최대 1,000개 삭제. 만료 rate-limit bucket도 최대 1,000개 정리. | `src/modules/auth/infrastructure/postgres-auth-repository.ts` |
| S4 공개 이미지 메타데이터 | 공개 전달 시 WebP 파생본으로 변환하여 EXIF/IPTC/XMP 제거, 방향 보정. 저장 원본과 무결성 digest는 변경하지 않음. 공개 URL은 `?v=2`, 응답은 `no-store`. | `src/modules/assets/infrastructure/public-image-derivative.ts`, `src/modules/assets/application/public-private-asset-service.ts`, `src/modules/media/domain/public-asset-url.ts` |
| S5 RSO 외부 콜백 | 10분 HttpOnly/Lax 콜백 전용 cookie를 정확한 state·원래 세션 ID·세션 token hash와 서명으로 연결. DB에서 세션 활성 상태와 이용자를 다시 검증. 일반 ACCOUNT/ADMIN cookie는 Strict 유지. | `src/modules/riot/infrastructure/riot-rso-callback-binding.ts`, `runtime-rso-callback.ts`, `src/app/api/me/riot/rso/callback/route.ts` |
| 공개 철회·PWA | 게시 상태를 매 요청마다 확인한 뒤 파생본 cache 사용. 고정 경로 PWA asset은 온라인 재검증하고 해시가 붙은 Next asset만 cache-first. | `src/app/api/media/assets/[assetId]/route.ts`, `public/sw.js` |
| CI | 현재 트리 비밀정보 검사와 production high 이상 의존성 감사 추가. Dependabot 주간 compatible minor/patch 그룹 설정. 기존 전체 이력 비밀정보 검사 유지. | `.github/workflows/ci.yml`, `.github/dependabot.yml` |

## 정리 작업 실행 규칙

- `GET /api/cron/security-maintenance`는 기존 timing-safe CRON_SECRET 인증을 재사용하며 query를 받지 않는다. 응답은 `no-store`, 인증 실패 401, 구성/작업 실패 503이다. `vercel.json`의 일일 스케줄은 전체 작업에서 관리한다.
- 작업 상태·수량을 `operations.maintenance_runs`에 남긴다. 같은 UTC 날짜 성공 작업은 다시 실행하지 않는다. advisory lock으로 시작 경쟁을 직렬화하고, 5분 이내 RUNNING은 중복 시작하지 않는다. 실패/중단 작업은 재시도할 수 있다.
- 미디어 정리는 한 번에 stale stage 최대 20개와 삭제 후보 최대 20개로 제한한다. 업로드 후 24시간 지난 미참조 STAGED는 DELETE_PENDING으로만 전환하며 이때부터 별도의 7일 보관기간을 적용한다. READY 파일을 자동 삭제하지 않는다.
- 삭제 전 transaction에서 purpose·상태·7일 보관기간·모든 참조를 다시 확인한다. 정상 연결 경로도 동일 asset row를 잠그고 READY 여부를 확인하므로 정리 대상에 새 정상 참조가 붙지 않는다.
- 각 provider 삭제는 기존 8초 timeout을 사용한다. 계획 실행은 40초 deadline으로 제한하며 남은 후보 수를 기록한다. 이미 성공한 삭제는 감사기록으로 제외하고, provider 실패는 재시도 가능 상태를 유지한다. 파일의 감사기록과 tombstone은 남긴다.
- 실제 운영 파일을 수동 삭제하거나 이 검증에서 provider 삭제 API를 호출하지 않았다. 테스트 저장소는 메모리 구현이고 DB는 loopback 일회성 PostgreSQL 18이다.

## 공개 파생본 자원 제한

- 저장 객체의 크기와 SHA-256를 검증한 뒤 파생본을 만든다. 원본의 증거 보존 경로를 바꾸지 않는다.
- 변환은 16,777,216 pixel, 5초 처리 timeout, 결과 최대 8 MiB로 제한한다. 프로세스당 동시 decoder 4개, 대기자 최대 16개/5초, 서로 다른 진행 중 변환 최대 20개로 제한한다.
- 파생본만 메모리에 최대 64개/32 MiB/5분 보관하고 동일 내용의 변환은 합친다. cache hit 전에 게시 상태와 원본 무결성을 다시 확인한다. 게시 철회 후 새 요청은 파생본 cache에서 노출되지 않는다.
- 새 페이지/API가 반환하는 `?v=2` URL은 이전 URL의 cache를 우회한다. 이미 이용자 브라우저나 외부 cache에 저장된 이전 원본을 소급 삭제하지는 않는다. 기존 URL의 과거 cache TTL이 남을 수 있으며 이미 다운로드된 원본은 회수할 수 없다.

## RSO 콜백 검증 범위

- 콜백 capability는 HMAC-SHA256 목적 구분 서명, 정확한 state digest, 원래 session/token hash, 만료시각을 검사한다. 세션을 철회하거나 계정/세션 ID가 다르거나 state·서명·비밀키가 다르거나 만료되면 거부한다. 기존 service의 일회용 state 처리와 transaction 권한 재검증을 유지한다.
- 콜백 전용 cookie는 `/api/me/riot/rso/callback` 경로에만 적용하며 결과 처리 때 삭제한다. 일반 로그인에 사용하지 않는다.
- 외부에서 시작된 HTTP redirect chain에서 Strict cookie가 계속 누락되는 것을 피하도록 200 응답의 동일 출처 완료 문서에서 계정 페이지로 이동한다. 문서에는 code/state/token을 반영하지 않고 `no-store`, `no-referrer`, 제한 CSP와 직접 이동 링크를 제공한다.
- 실제 Riot production RSO 자격증명이나 승인 상태를 새로 설정하지 않았다. provider 연동은 기존 구성 조건을 유지한다. 여기서 검증한 것은 합성 state/session과 응답 계약이며 실제 provider 왕복 및 실제 브라우저의 cross-site 이동 성공을 주장하지 않는다.

## 실행 근거

| 검사 | 결과 |
| --- | --- |
| `V2_DB_CONTRACT_SCOPE=media npm run test:db` | 3/3 통과. 일회성 PostgreSQL 18 정리 종료 코드 0. 실제 ARCHIVED 갤러리 연결 보호, 7일 보관, 실패 후 재시도/반복 삭제, 다른 JOB principal 거부, evidence purpose 거부, stale stage의 새 보관기간, 인증 정리 상한과 30일 보관, 일일 재실행 방지 포함. |
| `npx tsx --test tests/public-image-derivative.test.ts tests/riot-rso-callback-binding.test.ts tests/media-service.test.ts tests/media-private-assets.test.ts tests/private-asset-core.test.ts tests/riot-production-adapters.test.ts tests/riot-adapter-contracts.test.ts` | 34/34 통과. 원본 EXIF와 digest 유지, 공개 WebP 메타데이터 제거, 공개 cache 이후 철회 차단, RSO state/session 연결 거부 포함. |
| `npx tsx --test tests/riot-rso-callback-binding.test.ts` | 잘못된 session ID 검증을 추가한 최종 테스트 2/2 통과. |
| `node --test tests/pwa-contract.test.mjs tests/pwa-cache-freshness.test.mjs` | 4/4 통과. 고정 경로 최신화, offline fallback, hash asset cache, API 제외. |
| 변경 보안 소스/테스트 targeted ESLint | 종료 코드 0. |
| `npx tsc --noEmit` | 종료 코드 0. |
| `node scripts/check-secrets.mjs --tree-only` | tracked/untracked 현재 트리 high-confidence pattern 검사 통과. 비밀값 출력 없음. |
| `git diff --check` | 종료 코드 0. Windows LF/CRLF 안내만 존재. |
| `npm audit --omit=dev --json --ignore-scripts` | 취약점 0건. |
| 전체 `npm audit --json --ignore-scripts` | 개발 의존성 12개 affected entry: moderate 4, high 8, critical 0. 아래 제한 참조. |

확인된 설치 버전: sharp 0.35.5, source-map-js 1.2.2, @modelcontextprotocol/sdk 1.32.1, proxy-addr 2.0.8, postcss-selector-parser 7.1.6. drizzle-kit은 기존 0.31.10을 유지했다. 단순 npm audit fix --force/강제 major 변경은 수행하지 않았다.

## 남는 운영 제한

- 전체 감사에 남은 항목은 dev 전용 braces/micromatch/fast-glob 체인과 drizzle-kit의 @esbuild-kit/esbuild 체인이다. 조회 당시 braces 최신 3.0.3도 advisory 범위에 포함되며 drizzle-kit patch 업데이트는 해당 체인을 제거하지 못했다. 호환성을 확인하지 않은 전이 major override나 무관한 downgrade를 적용하지 않았다. production 감사는 0건이고 CI에서 high 이상 재유입을 검사한다.
- 일일 미디어 20개·세션 1,000개보다 큰 backlog는 여러 날에 걸쳐 처리된다. 같은 날 성공 후 반복 호출은 새 batch를 시작하지 않는다. maintenance counts/deferred/failure 관찰과 backlog 규모에 따른 추후 조정이 필요하다.
- 공개 요청마다 게시 상태/원본 읽기·해시 검증 비용이 있다. 파생본 재변환은 제한하지만 프로세스가 늘면 cache와 동시 decoder 상한도 프로세스 수에 따라 늘어난다. 실제 traffic 성능 시험은 수행하지 않았다.
- 운영 cron 실행 이력, provider 파일 삭제, 실제 Riot RSO, CDN 과거 cache purge, 실제 기기의 설치된 service worker 갱신, 장기 알림/PITR 운영은 이 로컬 검증의 확인 범위가 아니다. 전체 릴리스 담당자의 배포·운영 증거를 별도로 참조한다.

관련 공식 advisory: [sharp](https://github.com/advisories/GHSA-wq5f-xc86-pv6w), [source-map-js](https://github.com/advisories/GHSA-68fv-2mgg-jv7q). 원래 sharp 취약점의 실제 서비스 악용을 재현한 것은 아니다. 공개 입력은 이미 SVG를 거부하고 있었으며 이번 변경은 알려진 라이브러리 취약 버전을 제거한다.

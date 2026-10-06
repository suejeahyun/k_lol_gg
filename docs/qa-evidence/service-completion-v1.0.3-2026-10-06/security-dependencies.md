# 의존성 보안 점검과 최소 패치

2026-10-06 KST, 공식 보안 공지·설치 트리·실제 import를 대조했다. 이 기록의 npm audit 수치는 패키지 그래프 경고 수이며, 독립된 취약점 수나 실제 침해 여부를 의미하지 않는다.

## 변경과 근거

| 대상 | 이전 → 이후 | 판단 |
|---|---|---|
| Next.js / eslint-config-next | 16.3.4 → 16.3.8, 정확 버전 | 같은 16.3 패치 계열에서 프레임워크·검사 설정을 동기화 |
| shadcn | 4.19.1 동일, dependencies → devDependencies | 실제 사용은 `globals.css`의 `shadcn/tailwind.css` 빌드 import뿐. UI 소스는 저장소 안에 있으며 shadcn JS·CLI·MCP를 운영 요청에서 호출하지 않음 |
| CLI 하위 undici | 7.29.0 → 7.29.1 | 공지된 보안 수정 버전. 운영 Blob SDK 하위 undici 6.28.1은 변경하지 않음 |
| CLI 하위 hono | 4.13.5 → 4.13.7 | JSX boundary XSS 수정 패치 |
| fast-uri | 3.1.6 → 3.1.8 | URI 검증·정규화 보안 패치 |
| ip-address | 10.7.0 → 10.7.3 | 동일 minor 안에서 주소 검증 보안 패치 |
| brace-expansion | 5.0.9 → 5.0.12, 1.1.18 → 1.1.21 | 각 부모의 기존 semver 범위를 만족하는 재귀·확장 보안 패치 |

`next/og` RCE 공지는 공격자 입력이 Node.js `ImageResponse`의 SVG에 들어가는 경우를 설명한다. 현재 소스·스크립트에서 해당 import나 호출은 없고 소셜 이미지는 정적 `/og.png`다. 따라서 이 공격 경로는 발견하지 못했지만, 알려진 취약 프레임워크를 유지하지 않도록 패치했다. [Next.js 공식 보안 공지](https://github.com/vercel/next.js/security/advisories/GHSA-vcvr-r3jv-pc5j)

16.3.8 공식 릴리스에는 이미지 최적화 SSRF·캐시 관련 수정도 포함된다. 현재 `remotePatterns`는 Riot Data Dragon의 명시된 HTTPS 호스트·경로만 허용한다. 공개 공지의 이미지 SSRF 수정 버전 칸은 `16.3.?`로 미완성인 반면, 릴리스가 해당 수정 포함을 명시하므로 16.3.8 릴리스 근거를 사용했다. [공식 16.3.8 릴리스](https://github.com/vercel/next.js/releases/tag/v16.3.8), [이미지 SSRF 공지](https://github.com/vercel/next.js/security/advisories/GHSA-cjq9-62q9-8jv4)

shadcn은 CSS 생성·컴포넌트 추가 도구로만 사용하며 개발 의존성으로 이동해도 `npm ci` 후 빌드에서 CSS import는 그대로 사용한다. 취약성을 숫자에서 숨기는 대신 실제 역할을 구분하고 패치 가능한 하위 패키지도 갱신했다. [shadcn 공식 CLI 문서](https://ui.shadcn.com/docs/cli), [undici 공식 공지](https://github.com/nodejs/undici/security/advisories/GHSA-w293-vg96-wgc3), [hono 공식 공지](https://github.com/honojs/hono/security/advisories/GHSA-hxh3-vqpv-xpqv), [fast-uri 공식 공지](https://github.com/fastify/fast-uri/security/advisories/GHSA-hrr3-gc8f-f4qj)

## audit 전후

| 검사 | 이전 | 이후 |
|---|---|---|
| `npm audit --omit=dev` | critical 1, high 9, moderate 2, 총 12 | 0, exit 0 |
| `npm audit` 전체 | critical 1, high 11, moderate 6, 총 18 | critical 0, high 8, moderate 4, 총 12, exit 1 |

원본: `security-runtime-before.json`, `security-runtime-after.json`, `security-full-before.json`, `security-full-after.json`. 버전 변화와 잔여 패키지의 dev 표시는 `security-audit-summary.json`에 기록했다. 전체 audit을 통과했다고 표현하지 않는다.

## 남은 개발 도구 경고 2개 원인

1. **braces 3.0.3 재귀 DoS**: shadcn → ts-morph/fast-glob 및 eslint-config-next → fast-glob → micromatch → braces로 전파되어 high 경고 8개가 남는다. 현재 npm의 최신 braces도 3.0.3이며 공개된 수정 릴리스가 없다. 저장소는 ESLint의 저장소 경로 패턴과 CSS 빌드 import를 사용하고, 운영 사용자 입력을 braces/CLI로 전달하지 않는다. 공격자가 준 중첩 패턴을 처리하는 CLI·MCP 서버를 서비스로 실행하지 않는다. 이 판단은 패치가 존재한다는 뜻이 아니며, 신뢰하지 않는 레지스트리·패턴을 개발 도구에 입력하면 별도 위험이 있다. `npm audit`이 제안하는 shadcn 1.0.0 하향은 현재 CSS export 계약을 보존하는 수정이 아니므로 적용하지 않았다. [braces 원본 이슈](https://github.com/micromatch/braces/issues/70)
2. **drizzle-kit 하위 esbuild 0.18.20 개발 서버 CORS**: drizzle-kit → @esbuild-kit/esm-loader → core-utils → esbuild 체인으로 moderate 4개가 남는다. 공지는 esbuild `serve` 기능을 대상으로 한다. 저장소의 실행 명령·스크립트와 설치된 core-utils는 `serve`를 호출하지 않으며, core-utils는 변환에 사용한다. 최신 drizzle-kit 0.31.11도 같은 legacy loader 의존성을 유지한다. 부모가 `~0.18.20`을 요구하므로 강제 major override로 바꾸지 않았다. 이 개발 서버를 열고 신뢰하지 않는 웹사이트를 방문하는 조건은 안전하다고 보장하지 않는다. [esbuild 공식 보안 공지](https://github.com/evanw/esbuild/security/advisories/GHSA-67mh-4wv8-2f99)

이 두 원인은 모두 개발 전용으로 확인했으며 제거·완치로 기록하지 않는다. 공개 요청에서 도달 가능한 경로는 소스 점검에서 발견되지 않았다. 통합 검사 후 동일한 새 빌드의 trace를 확인한 결과, 경고가 남은 12개 패키지의 설치 경로는 런타임 파일 추적 목록에 포함되지 않았다.

## 검증 상태

- `npm install` 완료, `npm ls` 의존성 오류 없음, lockfile과 설치 버전 일치.
- 신뢰된 npm registry의 버전·tarball·SHA-512 integrity를 사용했다. major 강제 변경, audit fix force, 기능 하향 적용 없음.
- React 19.2.8, Blob SDK 2.8.0와 그 하위 undici 6.28.1, Drizzle 및 데이터 계약 유지.
- `AGENTS.md` 내용 변경 없음. package.json/package-lock.json diff 검사 통과.
- 릴리스 담당의 `npm run check` 완료 후 Next.js 16.3.8의 새 production build를 확인했다. build ID `HgrFb7yHtyih42uuOP4X7`, NFT manifest 392개, 중복 제거 추적 파일 2,670개를 검사했다. Next runtime package는 포함되며 잔여 audit 패키지 12개의 추적 파일은 모두 0개다.
- 동일 빌드의 manifest SHA-256과 패키지별 결과는 `security-build-trace.json`에 있다. package·소스·실행 중인 격리 서버를 바꾸지 않고 읽기 전용으로 확인했다.
- 이 trace 확인은 빌드의 파일 추적 목록 검사다. 운영 배포 확인이나 번들 내부 모든 코드에 취약성이 없다는 증명이 아니다. 운영 배포와 smoke는 별도 릴리스 근거로 기록한다.

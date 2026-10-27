# 운영 의존성 감사 — 수정 후 재검증

root 담당자의 보안 의존성 수정 후 독립 재검사에서 **운영 의존성 취약점 0개**, 전체 의존성 **moderate 4개 / high 0 / critical 0**를 확인했다. `npm audit --omit=dev --json` exit 0, 전체 `npm audit --json` exit 1, 설치 graph `npm ls` exit 0이다. 최종 metadata는 `production-dependency-audit-final.json`에 있다. 이 판정은 현재 로컬 설치 graph에 대한 것이며 운영 배포 여부는 별도 검증해야 한다.

최종 설치는 Next/eslint-config-next 16.4.3, Blob 2.8.0 → undici 6.29.1, CLI config 0.2.4 → Zod 4.6.6이다. 개발 도구의 같은 manifest 범위 갱신으로 shadcn 4.22.2, body-parser 2.4.0, fast-uri 3.1.9, Hono 4.13.14, ip-address 10.7.5, undici 7.30.1도 확인했다. 잘못된 peer/dependency graph 오류는 없었다.

남은 moderate 4개는 `drizzle-kit@0.31.10 → @esbuild-kit/esm-loader@2.6.5 → @esbuild-kit/core-utils@3.3.2 → esbuild@0.18.20` 한 경로의 패키지별 전파 집계다. package-lock에서 네 패키지 모두 dev=true이며 근본 advisory는 1개다. 이 esbuild의 **serve 개발 서버**를 실행하는 동안 악성 웹페이지를 열면, 느슨한 CORS 때문에 해당 개발 서버의 내용을 읽힐 수 있다. 수정 버전은 esbuild 0.25.0 이상이다. [esbuild 유지관리자 advisory](https://github.com/evanw/esbuild/security/advisories/GHSA-67mh-4wv8-2f99).

이 저장소의 Drizzle 스크립트는 `db:generate: drizzle-kit generate`이며, 검토한 core-utils는 transform 호출을 사용하고 serve 호출은 없다. 저장소 스크립트에도 esbuild serve 또는 Drizzle Studio 실행은 없다. 따라서 현재 웹 제품의 요청 처리 경로에서 해당 개발 서버 노출을 찾지 못했다. 향후 이 오래된 esbuild의 serve 기능을 별도로 실행하면 다시 적용되는 제한이다. Drizzle/loader를 임의 downgrade하거나 esbuild 0.18 → 0.25를 강제 override하지 않고 이 개발 전용 잔여를 기록한다. 전체 의존성 감사가 0개라고 표현하지 않는다.

## 최초 탐지 기록

2026-10-27 `npm audit --omit=dev --json`은 exit 1을 반환했다. npm 집계는 **취약 패키지 6개: critical 1 / high 5**다. 이 집계는 실제 침해 여부나 이 사이트에서 도달 가능한 공격 경로의 개수를 뜻하지 않는다. 원본은 ignored `.private/nexus-production-dependency-audit.json`에 보관했고, 공개 가능한 패키지·advisory·조건 metadata만 `production-dependency-audit-before.json`에 기록했다. 이 감사 담당자는 package/lock/source 수정, exploit 실행, 배포를 하지 않았다.

## 실제 사용 경로 평가

| 항목 | 현재 증거 | 판단 |
| --- | --- | --- |
| Next 16.3.8 / SVG image RCE | Next가 resolve하는 sharp 0.35.5는 root와 동일. 빌드 dangerouslyAllowSVG=false | 공식 sharp workaround 충족. Next 버전 감사 경고는 남는다. |
| Next / Server Actions DoS | src에 use server directive 없음. 최신 로컬 build server-reference-manifest node/edge 항목 모두 0 | 공식 advisory의 최소 1개 Server Action 조건을 찾지 못했다. |
| Next / use cache typed-array RCE | cacheComponents=false, src에 use cache directive 없음 | 공식 advisory의 Cache Components 및 해당 cache 함수 조건을 찾지 못했다. |
| Blob 하위 undici 6.28.1 | SDK는 fetch 사용. 앱 EventSource 사용 없음. private Blob adapter는 저장 pathname을 검증 | fetch DoS의 악성 upstream 응답 경로는 남지만, 일반 사용자가 임의 origin을 전달하는 Blob 호출 경로는 찾지 못했다. |
| CLI config 하위 zod 4.1.11 | 앱 직접 import 없음. Blob → OIDC → CLI config에서 로컬 설정 파일을 파싱 | 공개 요청의 대용량 배열을 이 Zod에 전달하는 앱 경로는 찾지 못했다. 버전 취약점은 남는다. |

Next 공식 권고는 SVG 문제에 sharp 0.35.5 이상을 우회책으로 제시하고, 세 Next advisory의 16.x 수정 버전은 16.4.1이다. 현재 전제 조건이 없더라도 업그레이드를 권한다. [SVG 공식 advisory](https://github.com/vercel/next.js/security/advisories/GHSA-2464-fhr4-w9xw), [Server Actions 공식 advisory](https://github.com/vercel/next.js/security/advisories/GHSA-p3m5-59mp-jv5r), [use cache 공식 advisory](https://github.com/vercel/next.js/security/advisories/GHSA-673q-mjm6-r5xr).

Undici의 두 advisory는 6.29.1에서 수정된다. 하나는 악성 서버의 응답 처리 중 프로세스 종료, 다른 하나는 EventSource 응답의 메모리 소모 문제다. [fetch 공식 advisory](https://github.com/nodejs/undici/security/advisories/GHSA-xjj6-f33q-929c), [EventSource 공식 advisory](https://github.com/nodejs/undici/security/advisories/GHSA-4qv8-2p9j-2685). Zod 수정은 collection 크기 제한을 원소 검증 전에 처리하도록 한다. [유지관리자 수정 PR](https://github.com/colinhacks/zod/pull/6652). 버전과 앱 경로를 확인한 정적 평가이며 실제 운영 공격 검증은 수행하지 않았다.

## 최소 수정 제안

1. `next`와 `eslint-config-next`를 **16.4.3**으로 함께 고정한다. 공식 최소 패치는 16.4.1이며 npm audit는 16.4.3을 제시했다. npm registry metadata상 현재 React 19.2.8 및 Node 요구사항과 호환된다. `cacheComponents`를 새로 활성화할 필요는 없다.
2. `@vercel/blob` 2.8.0은 유지하고 하위 `undici`를 **6.29.1**로 갱신한다. 이는 Blob의 `^6.23.0` 범위 안이다. 재현성을 위해 Blob 범위의 scoped override도 가능하다.
3. `@vercel/cli-config` 범위에서 `zod`를 **4.6.6**으로 scoped override한다. 현재 CLI config 0.2.4는 Zod 4.1.11을 정확히 고정한다. 조회 시점 최신 Blob 2.8.2 및 최신 CLI config 0.3.4에도 이 고정이 남아 있어 Blob 업데이트만으로 해결되지 않는다.
4. npm이 제시한 Blob 2.4.0 강제 downgrade는 선택하지 않는다. 현재 private Blob/OIDC 기능과의 호환성을 불필요하게 바꿀 수 있다.

위 제안은 최초 탐지 시점의 판단이다. 이후 root가 수정했고 감사 담당자가 production/full audit 및 설치 graph를 재확인한 결과를 문서 첫 부분에 추가했다. `tests/private-blob-storage.test.ts`와 자산·인증·서비스 분리 계약, lint/typecheck/build/full check 및 배포 검증은 root의 후속 근거와 연결한다.

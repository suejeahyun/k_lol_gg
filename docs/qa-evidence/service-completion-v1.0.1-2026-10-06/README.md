# 서비스 이용 흐름 개선 1.0.1 — 배포 기록 보존

## 재현과 원인

1.0.0 배포 근거만 추가한 `431d7a16`의 Git provider 배포 로그에서 `.vercelignore`가 `.git/HEAD`, `.git/config` 등 27개 파일을 제거한 뒤 `ignoreCommand`가 실행되었다. 비교에 필요한 Git 기록이 사라져 fail-closed 경로가 선택되었고 문서만 바뀌어도 전체 빌드를 했다. 사이트 오류는 아니지만 불필요한 재빌드와 배포 기록 교체가 실제 발생한 운영 문제다.

## 최소 수정과 안전 경계

`.vercelignore`의 `.git`·`.git/**` 두 줄만 제거했다. [Vercel 기본 CLI 제외 규칙](https://vercel.com/docs/builds/build-features#ignored-files-and-folders)은 Git 업로드를 이미 제외하고, [Git provider ignored-build 절차](https://vercel.com/kb/guide/how-do-i-use-the-ignored-build-step-field-on-vercel)는 checkout 기록을 이용한 비교를 지원한다. `.private`, `.tmp`, 환경 파일과 빌드 산출물 제외는 유지한다.

수정 후 실제 CLI dry-run에서도 `.git`는 기본 제외되었고 업로드 파일에 없었다. 현재 Next output trace 392개에 `.git` 참조가 없고 `next.config.ts`에도 이를 포함하는 광범위 trace 설정이 없다. Git 기록을 앱 응답이나 런타임 파일로 노출하는 변경이 아니다.

기존 docs-only 계약 2개와 실제 checkout 비교에서 문서만 포함한 `73b2ee70..431d7a16`은 skip, 코드 변경을 포함한 `bd6433d2..431d7a16` 및 동일 commit 재배포는 build를 선택했다. 실제 provider의 skip 여부는 후속 문서 배포 로그로 확인한다. 최종 check와 운영 근거는 `production.md`에 연결한다.

## 기능 검증과 한계

앱 소스와 DB는 1.0.0에서 바꾸지 않았다. [전체 기능 원장·문제별 수정](../2026-10-05-service-completion/README.md), [공개 운영 UI/HTTP 및 남은 조건](../2026-10-05-service-completion/production.md)을 그대로 적용한다. MMR V1 보존/공식 전환 승인 대기, 로컬 확인창 이후 미완료 저장 E2E와 실기기·외부 연동을 완료로 확대하지 않는다.

직전 READY 배포는 `dpl_6qD46gmRkjy7JZ1rDvRBjbBaqpQU` (source `431d7a16`)다. 코드 변경을 잘못 skip하거나 핵심 운영 응답에 회귀가 생기면 해당 배포를 재승격한다. 새 비용·환경변수·DB·외부 계정 권한 변경은 없다.

# 서비스 이용 흐름 개선 1.0.1 운영 검증

- source/tag: `1ee5bd568cbb608cf7fd9bc8a845ea8dc6a27321` / `service-completion-v1.0.1`
- Vercel: `dpl_9WgTqPhaqq3bCBLp2QbftPk4ZceC`, READY
- immutable URL: https://k-lol-5jmzw8k75-tjdmswo11-3715s-projects.vercel.app
- 운영 alias: https://k-lol-gg.vercel.app
- migration: `0047_usage_analytics`, 운영 DB 변경 없음

전체 `npm run check`와 비밀정보 검사를 통과했다. 계약 463개·단위 1,045개 PASS, 조건부 skip 1개, 기존 lint 경고 58개·오류 0개이며 [최종 로그](check.log)에 기록했다. 앱 소스·의존성·Next 설정은 1.0.0과 동일하고 `.vercelignore`의 두 줄만 제거했다. 기능별 검증과 미확인 경계는 [1.0.0 운영 기록](../2026-10-05-service-completion/production.md)을 따른다.

CLI dry-run은 `.git`·환경/비공개/임시 파일의 업로드 제외를 확인했다. production 후보 `dpl_EwZR6QFVGKKRd2hwsAKjRCfU3xQm`를 `--skip-domain`으로 생성하고 기존 Vercel 인증을 통한 익명 앱 GET으로 health=ready, 홈, 관리자 API 401을 확인한 뒤 승격했다. 같은 source의 main Git 배포도 READY가 되었고 운영 alias와 일치했다.

최종 main 배포에서 [서비스 HTTP 31개](production-service-http.json), [기본 경로 14개·생성 이미지 MIME/SHA-256](production-http-base.json)이 통과했다. `/.git/HEAD`와 `/.git/config`는 모두 404로, Git 기록의 공개 노출이 없었다. Git provider 로그에서 `Removed 0 ignored files` 뒤 코드/설정 변경은 정상적으로 빌드하는 것을 확인했다. 문서만 추가한 다음 커밋의 실제 생략 여부는 후속 기록으로 확인한다.

복구 기준은 `dpl_6qD46gmRkjy7JZ1rDvRBjbBaqpQU` (source `431d7a16`)다. 잘못된 빌드 생략 또는 핵심 응답 회귀 시 재승격하고 health/공개 조회를 확인한다. DB·권한·환경변수·외부 공급자·가격 플랜은 바꾸지 않았다.

MMR은 기존 V1 결과를 보존하며 공식 전환 승인 대기 변경 이벤트 13건을 최신 반영 완료로 표시하지 않는다. 로컬 확인창 때문에 끝내지 못한 저장 E2E, 실기기/스크린리더와 실제 외부 연동도 별도 확인 항목이다. 운영 공개 브라우저의 24개 너비 조건·필터/슬라이드/로그인 링크 확인을 이 미확인 항목의 통과로 확대하지 않는다.

## 문서 전용 실제 배포 확인

후속 문서 커밋 `fc3e48b3371ea2fc266105d56854c48a838a6d2c`의 Git provider 배포에서 `Removed 0 ignored files`와 `Documentation-only change since last successful deployment; preserving the current runtime.`를 확인했다. ignored-build exit 0으로 CANCELED된 것은 의도한 생략이며 배포 실패가 아니다. 기존 READY source `1ee5bd56`의 운영 배포를 유지했다. [실제 provider 로그](docs-only-build.log). 수정 전 문서도 전체 빌드하던 원인과 수정 후 생략을 모두 운영 절차에서 확인했다.

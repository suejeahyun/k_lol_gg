# CSS marker 플러그인 독립 검토

2026-10-27 Next 16.4.3의 CSS Module 이름 형식 변화에 대한 수정안을 읽기 전용으로 검토했다. 검토 대상은 `postcss.config.mjs`, `scripts/postcss/nexus-module-markers.cjs`, `tests/nexus-module-markers.test.mjs`, `src/app/nexus-theme.css`다. 검토 담당자는 source/package/test를 수정하지 않았다.

현재 사용 중인 소스에 대한 차단할 결함은 발견하지 못했다.

- 서비스 조건은 정확히 `nexus`일 때만 활성화된다. 기본값과 K-LOL에서는 CSS 원문을 변경하지 않는다. 독립 변환에서 45개 모듈 모두 K-LOL 원문과 일치했다.
- sourceRoot 외부, 일반 global CSS는 제외된다. 소스 안 `.module.css`만 처리하며 basename 중복·잘못된 이름은 빌드를 중단한다. 현재 45개 basename에 중복이 없다.
- 함수형 `:global(...)`과 keyframes는 marker 대상에서 제외된다. 클래스 식별자를 selector parser setter로 다시 escape하므로 comma 앞 공백이나 escaped identifier가 composition 값에 섞이지 않는다.
- 현재 45개 모듈 / 928개 local class export를 Lightning CSS로 비교하는 계약이 있다. 원래 hash 이름, 렌더링 규칙 순서, disabled/selected 상태와 함께 global marker composition을 검사한다. 독립 실행에서 당시 5개 테스트가 통과했고, 이후 작성 담당자와 root가 bare scope fail-closed 검사를 포함한 최종 6개 테스트 통과를 확인했다.
- 테마의 marker module prefix 35개는 모두 실제 모듈 basename에 대응한다. 해시 접두어에 의존하던 선택자를 고정 marker로 바꿨고, prefix 대신 substring match를 사용해 hash 뒤에 오는 composed marker도 찾는다. 테마는 NEXUS data-service로 한정된다.
- marker 입력은 저장소의 CSS와 빌드 경로에서만 나온다. 공개 요청 데이터나 외부 문자열을 평가·실행하지 않는다. basename 검증과 CSS identifier escaping이 있다.
- 플러그인은 Next 문서 형식에 맞게 문자열 파일 경로로 PostCSS에 등록되어 있고 기존 Tailwind 플러그인을 유지한다. `postcss-selector-parser`는 명시적 devDependency다. `.gitignore`와 `.vercelignore`는 `scripts/postcss/`를 제외하지 않는다. 실제 배포 환경에서의 marker 생성과 화면 적용은 root의 빌드·브라우저·배포 검증으로 확인해야 한다.

## 비차단 제한 사항

bare `:global .external` 및 `:local .panel`은 최종 플러그인이 명시적으로 거부한다. 현재 소스에는 함수형 scope만 사용한다.

중첩 `:global(.external :local(.inside))` 같은 합성 구문은 현재 지원 범위로 검증되지 않았다. 독립 실험에서 원본 Lightning CSS는 export를 만들지 않지만 플러그인의 가장 가까운 local scope 처리는 inside marker export를 만들 수 있었다. 현재 45개 모듈에 이 구문은 없으며 root의 freeze 결정에 따라 추가 구문 지원이나 수정은 진행하지 않았다. 이후 이런 scope 구문을 도입할 때에는 compiler export 동등성 테스트를 먼저 추가해야 한다.

이번 검토는 실제 화면·최종 production 배포·모든 임의 CSS 문법 지원을 입증하지 않는다. 현재 저장소의 CSS에 대한 의미 보존과 서비스 범위, 배포 입력 포함성을 확인한 결과다.

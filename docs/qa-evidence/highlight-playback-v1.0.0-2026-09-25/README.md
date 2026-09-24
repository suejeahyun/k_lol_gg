# 하이라이트 재생 1.0.0

운영 하이라이트 상세에서 재생 버튼을 눌렀을 때 브라우저의 콘텐츠 차단 화면을 재현했다. 원본 YouTube 영상은 재생 가능했으나 사이트 CSP에 `frame-src`가 없어 `default-src 'self'`가 외부 재생창을 차단했다.

기존 개인정보 보호 모드 재생창의 호스트 `https://www.youtube-nocookie.com`만 frame 허용 목록에 추가했다. 클라이언트 이동에서도 문서 CSP가 유지되므로 공통 문서 헤더에 적용한다. 기존 script/connect/default/ancestor 경계와 iframe의 referrer policy는 유지했다. 상세 화면에 원본 YouTube 링크를 추가하고 모바일에서도 재생창 높이 200px 이상과 가로 넘침 방지를 확인했다.

## 검증

- `npm run check` PASS: 계약 435, 단위 960, 별도 DB 환경 의존 1 skip. lint 오류 0·기존 경고 57, 타입·ERD·가이드 이미지·프로덕션 빌드 PASS.
- media 도메인 및 실제 Next 헤더 구성 검사 9/9 PASS. 기본 문서, frame, script, object, X-Frame-Options 경계를 검증한다.
- 운영 공개 페이지 3개에서 허용 호스트와 기존 보안 헤더를 확인했다. 관리자 화면은 로그인 이동, 관리자 API는 비인증 401을 유지한다.
- 운영 상세 `4453384e-da27-4b59-a5fb-9742f648f160`에서 실제 게임 화면 및 재생 진행을 확인했다. YouTube `<video>`는 currentTime 41.499905, duration 97.261, paused false, readyState 4, error null이었다.
- 목록으로 이동한 후 해당 상세를 다시 여는 클라이언트 탐색에서도 재생창이 로드되고 2초 이상 진행됐다. 검증 후 재생을 중단했다.
- 로컬 360px 화면: 문서 폭 345px, 재생창 319×200px, 페이지 가로 넘침 없음. 브라우저 스크린샷과 DOM 수치는 작업 대화에서 확인했으며 별도 이미지 파일로 저장하지 않았다.
- 현재 트리 비밀정보 검사와 `git diff --check` PASS. 운영 DB 쓰기·스키마 변경 없음.

## 배포

소스 `dce23db8bbe684f4bbce26b128ad05b011339b0f`, Vercel `dpl_85zMgkbYY9gu5nzyDNXkgsVLFkfc` READY, 운영 alias SHA 일치, health ready. [배포·HTTP smoke·CI](./deployment.json), [통합 검증](./validation.json).

GitHub main CI [36064234975](https://github.com/suejeahyun/k_lol_gg/actions/runs/36064234975) SUCCESS: 전체 검사·빌드와 관리자 HTTP 인증 매트릭스 PASS.

태그 `highlight-playback-v1.0.0`은 위 운영 소스를 가리킨다. 함께 배포된 관리자 UI 변경은 [운영·감사 UI 1.0.1](../operations-forms-menu-v1.0.1-2026-09-25/README.md)을 참조한다.

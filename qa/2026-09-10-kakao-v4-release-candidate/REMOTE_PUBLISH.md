# Release Candidate 원격 게시 증거

이 문서는 최초 feature branch 게시 시점의 기록이다. 이후 `main`과 Vercel Production 배포 결과는 `PRODUCTION_DEPLOYMENT.md`를 기준으로 한다.

게시일: 2026-09-10 (Asia/Seoul)

## 사전 확인

- Branch: `feat/kakao-v4-gateway-20260910`.
- Release Candidate commit: `2fcfd4d7ae4f8836349193b875be9230a51dbae0`.
- Push 전 `git status --porcelain`: 출력 없음, clean.
- `node scripts/check-secrets.mjs --tree-only`: PASS, high-confidence finding 0건.
- Sanitized origin: `https://github.com/suejeahyun/k_lol_gg.git`.
- origin URL의 credential, userinfo, query 값은 출력하지 않았다.

## 최초 게시

- 일반 push로 `refs/heads/feat/kakao-v4-gateway-20260910`만 새로 게시했다.
- force push 옵션을 사용하지 않았다.
- `main` ref를 checkout, 이동, merge, push하지 않았다.
- 최초 `git ls-remote --heads origin refs/heads/feat/kakao-v4-gateway-20260910` 결과는 `2fcfd4d7ae4f8836349193b875be9230a51dbae0`으로 local RC commit과 일치했다.
- 공개 GitHub commit 페이지에서 `2fcfd4d`와 제목 `feat(kakao): finalize V4 release candidate`가 게시된 것을 확인했다.

## Preview 상태

- GitHub CLI가 설치되어 있지 않아 authenticated check-runs/deployments API는 조회하지 못했다.
- 공개 GitHub commit 페이지에는 Vercel, deployment, checks 상태나 Preview URL이 노출되지 않았다.
- 따라서 Git 연동 Preview의 생성 여부, URL, 상태는 **미확인**이다.
- 직접 Vercel deploy, Production 승격, 환경변수 변경은 수행하지 않았다.

## 범위 제한

- 운영 DB query·migration·row 변경을 수행하지 않았다.
- secret 값 조회·출력·변경을 수행하지 않았다.
- 이 증거 문서 커밋도 같은 feature branch에 force 없이 게시하며 최종 remote hash는 작업 보고에서 별도로 대조한다.

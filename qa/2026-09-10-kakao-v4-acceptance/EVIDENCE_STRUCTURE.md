# Kakao V4 증거 파일 구조

실행 증거는 버전과 run ID별로 분리한다.

```text
qa/evidence/kakao-v4/<version>/<run-id>/
  00-manifest/
    manifest.json
    environment.md
    checksums.sha256
  01-artifact/
    character-counts.json
    es5-rhino-static.log
    messengerbot-compile-recruit.png
    messengerbot-compile-features.png
  02-automated/
    artifact-acceptance.tap
    client-acceptance.tap
    server-acceptance.tap
    v1-golden.tap
    typecheck.log
    eslint.log
  03-device/
    checklist.md
    recruit-two-users/
    features-queries/
    profile-cross-negative/
    slash-negative/
    errors/
  04-network/
    retry-summary.json
    timeout-summary.json
    server-request-count.json
  05-signoff/
    acceptance-matrix.md
    defects.md
    release-decision.md
```

`manifest.json` 필수 필드:

- `runId`, `version`, `commit`
- public artifact `sha256`, LF/CRLF 문자 수
- Android/MessengerBot R/KakaoTalk/API 환경 버전
- `startedAtKst`, `finishedAtKst`, `testerRole`
- G01~G14의 `PASS|FAIL|BLOCKED|NOT TESTED|NOT APPLICABLE`
- 각 결과의 증거 상대 경로
- 알려진 위험과 출시 결정

private installer 본문, secret, signature, token, cookie, 실제 room/user 식별자는 manifest와 Git에 저장하지 않는다.

이번 QA 계획·자동 결과 위치:

```text
qa/2026-09-10-kakao-v4-acceptance/
  README.md
  AUTOMATED_RESULTS.md
  DEVICE_CHECKLIST.md
  EVIDENCE_STRUCTURE.md
  DISCORD_NOTICE.md
```

실기기·staging 실행을 하지 않았으므로 `qa/evidence/kakao-v4/...` 실제 run 폴더는 아직 생성하지 않는다.

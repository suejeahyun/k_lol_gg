# Production 배포 증거

## GitHub

- commit: `7265717f`
- branch: `feat/kakao-v4-gateway-20260910`
- `origin/feat/kakao-v4-gateway-20260910`: push 성공
- `origin/main`: fast-forward push 성공

## Vercel

- project: `tjdmswo11-3715s-projects/k-lol-gg`
- deployment ID: `dpl_53VkaxgQEYdDHCrjDWPxiiVc1zwX`
- deployment URL: `https://k-lol-3lwrikzco-tjdmswo11-3715s-projects.vercel.app`
- production alias: `https://k-lol-gg.vercel.app`
- ready state: `Ready`
- Vercel build: 정적 페이지 92/92 생성, 배포 완료

## 운영 점검

- `GET /api/health`: HTTP 200
- `GET /recruit-helper`: HTTP 200
- 서명 없는 `POST /api/integrations/kakao/v4/commands`: HTTP 400으로 차단
- 비밀값을 출력하지 않는 서명된 `구인현황`: HTTP 200, 계약 `KLOL_KAKAO_COMMAND_V4`, 첫 줄 `[K-LOL.GG 구인구직 현황]`
- 서명된 읽기 요청 관측 시간: 1,051ms

## 정리와 미확인 범위

- 작업트리 미연결로 자동 생성됐던 별도 `kakao-v4-gateway` Vercel 프로젝트는 ID를 대조한 뒤 삭제했다. 기존 `k-lol-gg` 프로젝트에는 영향이 없었다.
- 휴대폰 MessengerBot R에는 새 단일 파일을 사용자가 붙여넣어야 한다. 실제 카카오방 송수신 E2E와 체감 속도는 그 전까지 미확인이다.

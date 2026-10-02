# 홈 랭킹 쇼케이스 1.0.0 배포 기록

- source/tag: `8904912d47a27f6ab69a7fad22ad4c75f6dbe79e` / `home-ranking-showcase-v1.0.0`
- Vercel: `dpl_9Dp6RHwDTjzdXZaA55rTYHScL3LG`, READY
- immutable URL: https://k-lol-n3rsbg4h6-tjdmswo11-3715s-projects.vercel.app
- alias: https://k-lol-gg.vercel.app
- HTTP 검증: 2026-10-02T20:20:30.284Z, 7개 경로 정상. [결과](production-smoke.json).
- 공개 데이터로 390px 모바일의 슬라이드 전환 확인. [모바일 화면](production-mobile.jpg).

## 후속 수정 사유

모바일에서 데스크톱으로 전환하고 이동 버튼을 사용할 때 장식 원의 overflow 때문에 캐러셀 자체의 `scrollTop`이 96이 되는 경우를 발견했다. 배경과 테두리는 그대로인 상태에서 상단 문구만 가려졌다. 이 버전의 배포 사실과 당시 검증은 보존하고, `overflow: clip`을 적용한 1.0.1에서 내부 스크롤을 제거한다. 최종 화면은 1.0.1 근거를 참고한다.

복구 기준: `741124569c6a5b1b9a3453da0500c4aec430cefd` / `dpl_97X7eodVqiQ93MNKyQfZgWcgaqnE`. migration `0047_usage_analytics` 유지, 운영 DB 변경 없음.

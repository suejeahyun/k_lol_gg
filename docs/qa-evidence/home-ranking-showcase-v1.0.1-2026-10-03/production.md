# 홈 랭킹 쇼케이스 1.0.1 운영 검증

- source: c37f6dc37fdcd4c2c12e50fab214749164ae1cd6
- tag: home-ranking-showcase-v1.0.1
- Vercel: dpl_DBt8BXea1upip7ncq5AuoU5Jd2rJ, READY
- immutable URL: https://k-lol-i6txx8dmf-tjdmswo11-3715s-projects.vercel.app
- alias: https://k-lol-gg.vercel.app
- HTTP 확인 시각: 2026-10-02T20:26:27.143Z
- migration head: 0047_usage_analytics, 신규 migration/운영 DB 변경 없음

홈, 세 랭킹 보기, 플레이어 목록, 경기 목록, health의 7개 HTTP 검사가 통과했다. 홈의 여섯 섹션 순서와 슬라이드 조작부, 실제 랭킹 데이터가 표시된다. [HTTP 결과](production-smoke.json).

운영 브라우저에서 슬라이드 전환과 모바일→데스크톱 변경을 검사했다. 수정된 overflow는 clip, 내부 scrollTop은 0이며 가로 넘침이 없다. [브라우저 실측](production-browser.json), [데스크톱 화면](production-desktop.jpg), [모바일 화면](production-mobile.jpg).

전체 코드 검사와 격리 DB/브라우저 검증은 [검증 문서](README.md)를 참조한다. 실제 터치 기기와 OS 모션 설정 전환은 미검증이며, 브라우저에서 크기·조작·레이아웃을 확인했다. 현재 트리 secret scan 및 릴리스 근거 검사 통과. 완전 Git 이력 재검사는 범위상 중단했으며 완료로 계산하지 않았다.

최종 동작: 소개 → 랭킹 → 주요 작업 → 소식 → 내 활동 → 기록. 하나의 슬라이드에 한 지표를 보여주고 1위를 강조한다. 반복된 피드 건수와 홍보 문구는 제거하고 기록 바로가기를 추가했다.

이전 안정 배포 `dpl_97X7eodVqiQ93MNKyQfZgWcgaqnE` / https://k-lol-1qunnxd40-tjdmswo11-3715s-projects.vercel.app 을 재승격하면 전체 홈 변경을 되돌릴 수 있다. 1.0.0 tag/배포 기록은 보존했으며 상단 밀림 수정을 위해 1.0.1을 별도 발행했다. 소스·tag는 origin/main과 codex/home-ranking-showcase-20261003에 push했다.

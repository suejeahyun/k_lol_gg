# 사이트 이용 통계 1.0.0 — 운영 반영

- source: de3f7a777f9907e414696fdaee734966bde0dc06
- tag: usage-analytics-v1.0.0
- migration: 0047_usage_analytics (새 usage schema와 3개 테이블, 기존 데이터 수정 없음)
- deployment: dpl_3ftQA4oktnG7vStB3vkmCX8CPMrw, READY
- immutable URL: https://k-lol-hfnhzbrom-tjdmswo11-3715s-projects.vercel.app
- alias: https://k-lol-gg.vercel.app
- 확인: 2026-09-30T03:18:39.214Z

[로컬 검증](README.md), [운영 검사](production-smoke.json), [실제 익명 수집과 검증 데이터 정리](production-ingestion.json), [migration](usage-migration-result.json), [소스 비밀값 검사](secrets-tree.log)를 확인했다. 운영 health ready, 공개 홈·개인정보 안내 200, 관리자 페이지 미인증 redirect, CSV·사이트 설정 API 미인증 401, origin/본문 검증 통과. 실제 운영 주소의 익명 이벤트와 재전송을 보내 DB 저장 1건을 확인한 뒤 해당 합성 이벤트와 그 visitor만 제거했다. 다른 이용 기록은 건드리지 않았다.

일반 ADMIN 및 2단계 인증의 실제 세션 검사는 격리 환경에서 수행했다. 운영 계정을 만들거나 관리자 세션을 임의 발급하지 않았다. 운영 관리자는 기존 로그인·2단계 인증으로 /admin/usage를 열 수 있다. 과거 이용 기록은 소급 생성하지 않는다.

복구는 dpl_GmG7dNbzPv7TvC4zkJbA22vFKJbe 재승격 또는 수집 플래그 비활성화 후 재배포다. 추가한 통계 테이블은 보존한다.

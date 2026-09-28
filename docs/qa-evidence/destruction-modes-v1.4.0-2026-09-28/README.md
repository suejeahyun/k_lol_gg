# 멸망전 자동 절대평가 1.4.0

- 상태: NOT_DEPLOYED. 로컬 소스·합성 데이터 검증이며 운영 반영 또는 실제 Riot 응답 검증을 의미하지 않는다.
- 기능: destruction-modes@1.4.0 / tag destruction-modes-v1.4.0.
- migration head: 0046_overconfident_robbie_robertson. JSON aggregate 확장만 사용하며 SQL migration 없음.

## 실행 및 평가 계약

칼바람(ARAM)·증바람(ARAM_MAYHEM) 모집 마감으로 참가자가 확정되면 TEAM_BUILDING에서 서버 예약 작업이 자동 수집한다. 관리자 화면을 열어 둘 필요가 없다. 1분 주기 GET /api/cron/destruction-ratings는 CRON_SECRET 검증 후 최대 4단계를 진행하며 단계 간 8초 간격을 둔다. API 429의 Retry-After와 다른 대회의 수집 예산을 공유한다. 데이터가 많으면 여러 예약 실행에 걸쳐 이어진다. 참가자별 중간 결과를 저장하고 재실행 시 이어서 진행한다.

운영 조건: 기존 Riot production configuration·암호화 keyring·siteSettings.features.riotIntegration·CRON_SECRET·Vercel cron이 유효해야 한다. 플레이어 연결 계정과 해당 데이터가 필요하다. 현재 내전 projection이 READY이며 적용 공식과 일치해야 내전 점수를 사용할 수 있다. 설정 부재는 DISABLED, 연동·미배치·내전 미참여·API 미제공 자료는 평가 대기로 남는다.

최종 점수 = 일반 칼바람 × 0.20 + 솔랭 × 0.40 + 내전 × 0.20 + 챔피언 대응력 × 0.15 + 도전과제 × 0.05. 모든 항목은 0~100점. 소수 둘째 자리까지 총점을 반올림한 뒤 S>=80, A>=65, B>=50, C>=35, D>=0을 적용한다. 참가자 수나 순위를 사용하지 않는다. 초기 환산과 등급 경계는 실측으로 예측력이 검증된 모델이 아니라 대회 운영용 첫 기준이다.

- 일반 칼바람: Match-V5 queue450, 최근 90일 최대 100판. 재경기·5분 미만 제외. 보정 승률 (승+10)/(판수+20)을 30~70% 구간에서 0~100으로 환산한 값 40%, 역할 기여 60%. 기여는 팀 내 피해 비중/30%, 아군 회복+보호막 비중/50%, CC 비중/40% 중 최댓값(상한 1) 60점과 킬 관여율/80%(상한 1) 40점. 20판 중립 50점으로 기여 표본 보정. 기여 통계가 없으면 승률만으로 대체하지 않는다.
- 솔랭: 현재 solo rank의 고정 점수 구간. 아이언5~15, 브론즈15~25, 실버25~35, 골드35~45, 플래티넘45~55, 에메랄드55~65, 다이아몬드65~80, 마스터80~90, 그랜드마스터90~95, 챌린저95~100. 일반 티어는 IV~I 및 LP0~99를 보간하고 최상위는 LP0~1000에서 보간·상한 적용. 미배치에 임의 점수를 넣지 않는다.
- 내전: 현재 세대의 V2_DETERMINISTIC_1 점수를 100점으로 환산, 30판까지 중립 50점으로 보정. 0판·구 공식·미완료 projection은 미확인.
- 챔피언 대응력: 모드 공통 숙련도를 사용하는 대리 지표. 최근 180일에 플레이한 챔피언의 누적 숙련도 1만 이상 40명에서 폭 점수 70점. 각 숙련도를 최대10만으로 제한한 후 상위3명의 점유율에 따라 최대30점. 숙련도가 실제 증바람 대응 능력을 직접 측정한다는 뜻은 아니다.
- 도전과제: All Random All Champions, All Random All Flawless, NA-RAM의 ENABLED/LIFETIME 정의를 정확히 식별해 MASTER 목표 대비 달성률을 평균한다. 정의·값이 없으면 미확인. 누적 성취이며 증바람 판수·승률로 해석하지 않는다.

공식 API 경계는 [Riot API 문서](https://developer.riotgames.com/apis/)의 Match-V5, League-V4, Champion-Mastery-V4, Challenges-V1을 사용한다. 증바람 queue2400이나 클라이언트 전적에 접근하지 않는다. 실제 계정의 응답 필드 및 도전과제 구성은 운영 연결 확인이 별도로 필요하다.

## 누락·재평가·경매

누락 값을 0 또는 50으로 추정하거나 남은 비중으로 재분배하지 않는다. 미확인 항목이 가질 수 있는 총점 범위만 표시하고 등급과 경매 포인트는 보류한다. 정상 조회 결과가 실제 0이면 0점으로 반영할 수 있다. 수집 종료 후 운영자는 같은 환산 기준의 원자료·점수·근거를 보완할 수 있고 ADMIN_VERIFIED 출처와 감사 기록을 남긴다. 자동 조회 결과를 임의 덮어쓰지는 않는다.

주장 확정 전에는 합계100인 정수 비중을 변경해 이번 대회 전체 참가자를 재계산하거나 다시 수집할 수 있다. 주장 확정은 필요한 모든 항목 및 현재 연결 계정 일치를 검증한다. 확정 후에는 공식·점수·경매가가 고정되며 cron도 해당 대회를 갱신하지 않는다. 최소 입찰가는 S300/A250/B200/C150/D100P, 주장 시작은 2000-최소 입찰가. 이미 주장이 정해진 구형 대회는 기존 평가를 유지한다. 아직 주장 미확정인 구형 칼바람·증바람 대회는 다음 예약 실행에서 새 평가로 전환한다.

공개 DTO에는 점수·상태·출처만 포함하며 PUUID, 내부 계정 연결 ID, 원자료 근거는 공개하지 않는다. DB 쓰기는 행 잠금·revision·감사·outbox와 원자적으로 처리한다.

## 재현 검증

1. npm run check
2. npx tsx scripts/test-db/run-destruction-browser-qa.ts --absolute-ratings-only
3. npm run security:secrets
4. npm run release:evidence:check

브라우저 검사는 환경 파일을 로드하지 않는 일회성 PostgreSQL 18과 합성 계정·Riot 응답을 사용하며 운영 DB 및 실제 Riot API를 호출하지 않는다. 결과: 격리 DB 계약 PASS (협곡·기존 두 모드·새 자동 평가 두 모드, 정책 변경 멱등성·연결 계정 변경 차단·주장 확정 후 고정·90일 수집 전환). 실제 Riot 호출 없이 주입한 합성 응답으로 검증했다.

- [16개 화면 보고서](../../qa/destruction-absolute-ratings-2026-09-28/screenshots/index.json): 390/1440px, 두 모드, 공개/관리자, 확정/누락 상태. HTTP·overflow·브라우저 검사 문제 0. 공개 모바일 점수표는 내부 가로 스크롤 사용.
- [모바일 상호작용](../../qa/destruction-absolute-ratings-2026-09-28/interactions.json): 비중 합계101% 저장 차단·합계100% 저장·전체 참가자 재계산·axe 위반0·브라우저 예외0.
- [중계 전송 검사](../../qa/destruction-absolute-ratings-2026-09-28/edge-transport.json): X-Destruction-Revision 저장1, If-Match 저장0, 중계 응답 치환0.
- 브라우저 검증은 UI가 동일한 빌드에서 수행했으며, 이후 기존 부분 수집 자료의 90일 기준 전환을 보완하고 전체 check 및 격리 DB 검사를 다시 실행했다.


최종 검사: [전체 check](./check.txt) PASS — lint 오류0(기존 경고58), typecheck·ERD·계약445·단위1018 통과/1제외·빌드 통과. [격리 DB 최종 검사](./database.txt) PASS. [현재 작업 트리 비밀정보 검사](./secrets-tree.txt) PASS. 운영 API·운영 DB·배포 smoke는 수행하지 않았다.

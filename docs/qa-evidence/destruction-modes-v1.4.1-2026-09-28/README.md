# 멸망전 자동 절대평가 1.4.1 운영 검증

1.4.0의 자동 평가·20/40/20/15/5 비중·고정 등급·경매 연결을 유지한다. 운영 preflight에서 현재 활성 내전 projection이 V1_INTERNAL_MMR_1임을 확인했다. 이관 코드가 원본 0~100점에 100을 곱해 overall_score_bp에 저장하므로 동일 단위로 사용할 수 있다. READY인 현재 세대 및 전역·선수 공식의 일치까지 확인하고 V1_INTERNAL_MMR_1 또는 V2_DETERMINISTIC_1만 읽도록 보완했다. 전체 사이트 MMR 재계산이나 공식 전환을 실행하지 않는다.

- migration: 0046_overconfident_robbie_robertson 유지. DDL 없음.
- 이전 UI·평가 기준과 16화면 검증: [1.4.0 근거](../destruction-modes-v1.4.0-2026-09-28/README.md).
- 격리 PostgreSQL은 V2·이관 V1 두 가지 활성 공식에서 내전 점수가 반영되는지 검증한다.
- 운영 rollback 기준: 배포 전 READY dpl_5Zk83S7q36cu2v3EWdWNnowoCskN / source 99e71aa8deef1909dd623d774f6f18432cb2421e.
- 기존 test 대회 행과 참가 인덱스를 배포 전 .private/rating-deployment/에 보관했다. 실제 계정·원자료·비밀값은 공개 QA에 저장하지 않는다.
- 배포 후보·운영 alias·cron 상태·실계정 검증 결과는 별도 배포 증거로 기록한다. 이 문서 생성 시점에는 후보 배포 전이다.

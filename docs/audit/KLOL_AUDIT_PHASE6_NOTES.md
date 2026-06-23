# K-LOL.GG Audit Phase 6 Notes

## 적용 목적

5차 감사 리포트에서 남은 P0/P1 항목 중 실제 운영 위험도가 높은 항목부터 정리합니다.

## 변경 요약

1. `/api/players/balance`에 승인 유저/관리자 권한 검사를 추가했습니다.
2. `/players/balance` 페이지도 승인 유저/관리자만 접근하도록 서버 컴포넌트에서 차단합니다.
3. `/api/team-balance/season-applies`에 승인 유저/관리자 권한 검사와 최대 조회 제한을 추가했습니다.
4. 공개 조회 API `/api/recruits`, `/api/community/headlines`에 명시적인 `take` 제한을 추가했습니다.
5. 관리자 전용 목록 API `/api/seasons`, `/api/event-matches`, `/api/destruction-tournaments`의 GET에도 관리자 검사를 추가하고 최대 조회 제한을 명시했습니다.

## 의도적으로 유지한 항목

CSV 백업 API는 전체 데이터 백업 목적이므로 이번 패치에서 pagination을 강제하지 않았습니다. 대량 데이터가 커지면 스트리밍 CSV 또는 기간 필터 방식으로 별도 개선합니다.

## 확인 기준

- 비로그인 상태에서 `/players/balance`는 로그인으로 이동해야 합니다.
- 비승인 유저는 `/players/balance` 접근이 차단되어야 합니다.
- 승인 유저/관리자는 기존처럼 팀 밸런스 계산이 가능해야 합니다.
- 관리자 페이지의 시즌/이벤트/멸망전 목록은 기존처럼 표시되어야 합니다.
- 공개 구인현황과 커뮤니티 말머리는 기존처럼 표시되어야 합니다.

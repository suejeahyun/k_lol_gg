# 디스코드 복붙용

```text
[K-LOL.GG V2 개발 현황 — 시즌·참가]

V2 시즌 수명주기와 사이트 참가 신청을 사용자·관리자 한 흐름으로 연결했습니다.

• /applications 현재 시즌·신청 기간·참가 현황·내 신청 화면 추가
• 승인 계정과 active player 연결을 확인한 뒤 본인 신청·수정·접수 상태 취소 지원
• 관리자 시즌 생성·편집·복제·활성·종료·안전한 보관 추가
• 참가 신청 검색·시즌/상태/출처 필터·페이지·확정/예비/거절 검토 추가
• 관리자가 확정·예비·거절 결정을 revision 보호 아래 다시 검토할 수 있도록 운영 흐름 추가
• 단 하나의 활성 시즌, 사람+날짜+회차 중복 차단, revision 동시 수정 보호 적용
• KST 입력·표시 고정, 멱등성 재시도, 감사 로그, 24시간 영수증 적용
• 신청·취소 12회/10분 DB rate limit과 저장소 장애 시 안전 차단 적용
• 공개 응답의 회원명·로그인 ID·Discord·내부 메모 노출 0 확인
• 1440과 모바일 320/375/390 ready/empty/error/로그인 요구/검토 액션 화면 검수
• PostgreSQL 18 동시성·rollback과 실제 HTTP 권한/CSRF/replay/stale 계약 통과

현재 V2 로컬 후보이며 Git push, Vercel, 운영 DB에는 반영하지 않았습니다.
실제 Kakao 명단 수신·미매칭·다회차 처리는 S09, 무활동 영수증 정리는 S13에서 이어집니다.
공통 session transaction guard를 S01에서 S02/S03까지 통합하기 전에는 운영 GO로 판정하지 않습니다.
```

## 다음 패치 추천

1. S01 session-purpose transaction guard를 S02/S03 관리자 mutation에 retrofit하고 통합 role/revoke race 검증
2. S09 실제 Kakao snapshot ingest, 미매칭 pending, 참가자 매칭과 다회차 adapter
3. 운영 전 V1 legacy/source 승인 import와 count/hash/invariant·복구 리허설
4. S13 만료 receipt scheduler와 보존량·429/503 모니터링
5. 201명 이상 참가자 공개 pagination 또는 점진 로딩 정책

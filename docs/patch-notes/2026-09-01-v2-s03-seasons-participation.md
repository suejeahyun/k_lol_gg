# V2 S03 시즌·참가 패치 노트

## 사용자

- `/applications`에 현재 시즌, 신청 기간, 상태별 참가 현황, 내 신청을 연결했다.
- 익명·제한 계정·승인 계정·active player 미연결을 구분하고, 승인된 본인만 신청·수정할 수 있다.
- 주라인 `ALL`과 구체 부라인이 섞이지 않도록 UI와 server/DB 검증을 맞췄다.
- 사용자 취소는 접수 `APPLIED` 상태에서만 허용하고 검토 완료 신청은 보호한다.
- 참가자 200명 초과 시 표시 상한을 알리면서 전체 상태 count는 DB 전체 집계로 정확하게 유지한다.

## 관리자

- `/admin/seasons`에서 시즌 생성·편집·복제·활성·종료·안전한 보관을 처리한다.
- 참가 신청을 시즌·상태·출처·검색어로 filter하고 page 단위로 검토한다.
- 확정·예비·거절 결과는 revision 보호 아래 관리자가 재검토해 운영상 오분류를 바로잡을 수 있다.
- 모바일 320/375/390은 신청 카드 안에서 검토 버튼이 바로 보이고, 1440 표도 검토 열이 숨지 않는다.
- KST `datetime-local` 입력을 명시적 `+09:00`으로 저장하고 화면도 Asia/Seoul로 고정한다.

## 안전성

- PostgreSQL 단일 ACTIVE, identity dedupe, 상태·review·position check와 optimistic revision 적용
- RETIRED timestamp 정확 조합과 시즌 PATCH 5개 편집 field 필수 계약 적용
- same-origin, strict JSON/query, bidi/control 문자 차단, idempotency, If-Match, problem+json 적용
- 신청·취소 12회/600초 global/IP/account/session DB rate limit과 장애 시 503 fail-close 적용
- 변경 업무 필드 before/after audit와 24시간 receipt를 mutation과 같은 transaction으로 처리
- 공개 DTO의 회원명/login ID/Discord/internal note 노출 0을 실제 DB/HTTP로 확인

## 아직 포함하지 않은 항목

- S09 실제 Kakao snapshot ingest·미매칭·다회차·관리자 매칭
- S01 제한 session과 공통 transaction auth guard의 S02/S03 retrofit
- S13 무활동 receipt cleanup scheduler
- 운영 V1 데이터 import와 Vercel 배포

이 패치는 로컬 V2 후보이며 운영에 반영되지 않았다.

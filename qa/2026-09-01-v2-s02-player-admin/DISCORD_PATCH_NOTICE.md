# 디스코드 복붙용

```text
[K-LOL.GG V2 개발 현황 — 플레이어 등록부]

V2 플레이어 등록부의 숫자 ID 호환과 관리자 CRUD를 연결했습니다.

• V1 숫자 번호 보존용 unique legacy ID 추가
• UUID mapping이 있는 숫자 상세만 308 이동, 없으면 404
• 관리자 목록·검색·상세·등록·수정·soft-deactivation·명시적 재활성화 추가
• 회원명·사이트 계정 정보는 관리자 경계에서만 조회
• 중복 409, stale revision 412, 없는 대상 404 분리
• 변경·감사 로그·멱등성 영수증 원자 transaction 적용
• 영수증 24시간 만료와 player mutation 시 만료 행 정리 적용
• PostgreSQL 18, ADMIN/SUPER HTTP, 데스크톱·모바일 화면 검수 통과
• 런타임 취약점 0건, Git 비밀정보 검사 통과

현재 V2 로컬 후보이며 운영 Vercel/DB에는 반영하지 않았습니다.
밸런스·MMR 통계는 S05, Riot 연결·동기화는 S12에서 이어집니다.
```

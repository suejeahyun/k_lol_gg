# V2 S04 경기·결과 — 개발 검증 공지 초안

> 상태: 소스·정적·단위·격리 PostgreSQL 18 집중 검증 단계. 운영 DB와 Vercel에는 반영하지 않았습니다.

## 디스코드 복붙용

```text
[K-LOL.GG V2 개발 소식 — 경기·결과]

경기 결과 V2 화면과 접수 흐름을 새로 만들고 있습니다.

• 공개 경기 목록/상세: 시즌·기간·승자/무승부 검색, 게임별 10인 KDA와 MVP
• 결과 접수: 주최자·회차·날짜·2/3게임 입력, 비공개 이미지 등록, 코드 이어하기와 전체 이력
• 관리자 작업대: 구조화 경기 편집, 공개 경기 전체 교정, 무효화/복구
• 증거 검토: 비공개 원본과 OCR 후보를 비교하고 10개 행을 사람이 하나씩 확인한 뒤에만 승인
• Windows/macOS 캡처: Ctrl/Cmd+V 또는 파일 선택으로 비공개 가져오기와 안전한 재시도
• 안전성: revision 충돌 시 로컬/서버본 명시 비교, 멱등성, 업로드 제한, OCR 선예약, 취소 시 비공개 원본 정리 예약

현재는 개발 검증 단계이며 운영 사이트에는 아직 반영되지 않았습니다.
PostgreSQL 동시성·모바일 화면·전체 HTTP 통합 검증이 끝난 뒤 다시 안내하겠습니다.
```

## 다음 패치 권장

1. PostgreSQL 18 cancel/upload/OCR lease와 old/new contribution race 검증
2. 대량 match/player fixture EXPLAIN ANALYZE와 picker DOM 예산 측정
3. 1440/390/375/320 공개·owner·admin 상태별 시각 QA
4. S05 dirty-from 통계 projection consumer와 void/restore/시즌 이동 회귀

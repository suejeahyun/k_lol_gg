# QA 증거 — 카카오 경고·내전 결과 접수

기준 소스: 커밋 전 작업 트리 (2026-08-25 KST)

## 실행 항목

- `npx prisma validate`
- `npm run typecheck`
- `npm run lint`
- `npm run check:kakao-managed-forms`
- `npm run check:discipline-statistics`
- `npm run check:secrets`
- `npm run check:admin-guards`
- `npm run check:security-guard`
- `npm run build`

최종 결과는 `RESULTS.txt`에 기록한다.

## 정적 확인 범위

- 경고 카카오 양식에 `경고 사유` 필드 없음
- 일반 10판/내전 15판, 30일 기한
- 주의 3건의 실제 경고 전환 및 사용 주의 비활성화
- 활성 경고 3건의 강퇴 검토 생성
- 결과 사진 2/3장과 기존 내전 수기 등록 폼 연결
- 비공개 Blob 관리자 인증 조회
- Google Drive 의존성·환경변수 없음
- 하드코딩 봇 인증값 없음

## 운영에서 별도 확인할 항목

- 운영 DB 마이그레이션 적용
- Vercel Blob private store 읽기/쓰기
- 실제 메신저봇R `imageDB.getImage()`의 Base64 크기가 원본 3MB 제한 안인지 확인
- 카카오 방 이름·보낸 사람 식별 안정성

# 관리자 경기 저장 인증 수정 1.0.1

관리자 비밀번호 로그인 전환 후 경기 transaction authorizer만 TOTP 확인을 요구하여 정상 ADMIN 세션의 OCR 접수 생성이 SESSION_CHANGED/401로 실패했다. ADMIN/SUPER_ADMIN의 별도 ADMIN 세션을 허용하며 DB에서 세션 목적·종류·만료·철회·현재 역할·authVersion·계정 상태·비밀번호 변경 의무를 확인한다. 만료는 잠금 대기 이후 DB 현재 시각으로 평가한다.

- npm run check 통과: lint, typecheck, ERD, 계약 445개, 단위 1030개 통과/1개 skip, 안내 이미지 검증, production build.
- 격리 PostgreSQL: 기존 경기 snapshot 계약 및 신규 권한 14개 시나리오 통과.
- 실제 HTTP: 비밀번호만으로 관리자 로그인, TOTP timestamp가 null인 세션으로 관리자 OCR 접수 생성 201과 이미지 업로드 성공. 익명·철회 세션 401. 비공개 스토리지와 OCR은 로컬 합성 어댑터로 검증했다.
- 공개 경기 조회, KDA, 챔피언 이미지, 잘못된 ID/미존재/서비스 미설정 응답 회귀 통과.
- migration head 0047_usage_analytics 유지. DB 스키마 변경 없음.

[전체 검사](check.txt), [DB/HTTP 검사](database-http.txt). 운영 반영 상태는 후속 production.md와 릴리스 registry에서 확인한다.

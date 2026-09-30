# ADR-0010: 관리자 비밀번호 로그인

- 상태: 채택
- 기준일: 2026-09-30
- 결정 근거: 운영자가 관리자 페이지 2차 인증 삭제를 요청함. 기존 ADR-0002/0004와 기능별 문서의 TOTP 필수 조건은 이 결정으로 대체한다.

관리자는 승인된 ADMIN 또는 SUPER_ADMIN 계정의 아이디·비밀번호로 별도 ADMIN 세션을 발급받는다. 등록 여부와 과거 TOTP 복호화 키는 로그인에 관여하지 않는다. 새 세션은 adminTotpVerified=false와 totp_verified_at=NULL로 기록하며 실제 하지 않은 인증을 완료로 표시하지 않는다.

페이지·API·도메인 명령·DB transaction의 TOTP 필수 조건을 제거한다. 내부 명령의 ADMIN_SESSION / requireAdminSession 계약은 관리자 목적 세션과 역할, 현재 계정 authVersion, 승인 상태, 만료·폐기 여부를 확인한다. 일반 ACCOUNT 세션은 관리자 역할 계정이어도 관리자 세션을 대체하지 못한다. 사이트 설정은 계속 SUPER_ADMIN 전용이다.

관리자 보안 등록 화면은 원래 목적지로 redirect하고 등록·활성화·해제 HTTP endpoint는 관리자 인증 뒤 410을 반환한다. 등록 UI·초기화 UI·등록 유도 문구를 제거한다. 로그인 실패 제한, same-origin 검사, 임시 비밀번호 변경, 30분 HttpOnly/SameSite=Strict 쿠키, logout revoke는 유지한다.

DB 스키마와 과거 암호화 TOTP 기록은 복구를 위해 보존한다. 과거 저장소 구현과 검증은 호환성 근거로 남지만 활성 관리자 로그인/변경 경로에서 호출하지 않는다. 롤백은 이전 배포 재승격이며 비밀번호 전용 세션은 이전 TOTP 보호 조건을 통과하지 못한다.

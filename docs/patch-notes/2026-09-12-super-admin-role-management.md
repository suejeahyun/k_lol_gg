# 슈퍼관리자 계정 역할 관리 v1.0.0

SUPER_ADMIN은 `관리자 → 사용자 계정` 목록에서 일반 사용자의 `관리자 지정`을 선택해 USER와 ADMIN 역할을 변경할 수 있다. 역할 관리 폼과 목록 진입점은 SUPER_ADMIN에게만 보이며, 일반 ADMIN 요청은 입력 처리 전에 서버에서 403으로 차단한다.

승인됨(APPROVED)·미삭제 USER 계정은 플레이어 연결 여부와 관계없이 ADMIN으로 지정할 수 있다. 본인·SUPER_ADMIN·미승인·삭제 계정 보호, revision·멱등성·감사 로그·전체 세션 폐기는 유지한다. 승격된 사용자는 다음 관리자 로그인에서 2단계 인증을 등록해야 한다.

운영 DB migration이나 계정 데이터 변경은 없다. 검증 상세는 [`docs/qa-evidence/super-admin-role-management-2026-09-12/README.md`](../qa-evidence/super-admin-role-management-2026-09-12/README.md)에 기록했다.

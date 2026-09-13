# 플레이어 상세 연결 계정 관리자 지정 v1.0.0

`SUPER_ADMIN`은 `/admin/players/[playerId]`의 연결 계정 카드에서 승인된 일반 사용자(USER)를 관리자(ADMIN)로 지정할 수 있다. 일반 `ADMIN`에는 승격 UI를 노출하지 않고 직접 API 요청도 403으로 차단한다.

기존 계정 역할 API를 재사용하므로 same-origin, 로그인 아이디 재확인, 계정 revision 기반 동시 수정 보호, 멱등 receipt, 역할 변경 감사 로그와 대상 세션 폐기 계약을 유지한다. `SUPER_ADMIN` 부여·회수는 계속 금지한다.

DB migration과 운영 데이터 변경은 없다. 검증 상세와 디스코드 공지는 [`docs/qa-evidence/admin-player-role-promotion-2026-09-13/README.md`](../qa-evidence/admin-player-role-promotion-2026-09-13/README.md)에서 확인한다. 현재는 커밋·푸시·운영 배포 전 소스 상태다.

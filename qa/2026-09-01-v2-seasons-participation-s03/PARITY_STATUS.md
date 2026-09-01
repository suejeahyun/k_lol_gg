# V2 S03 시즌·참가 기능 동등성 상태

기준: `USER_ROUTE_MAP`, `USER_INVENTORY`, `ADMIN_ROUTE_MAP`, `ADMIN_INVENTORY`와 V1 동작 명세.
V1 코드는 동작 근거로만 확인했고 V2 구현에 복사하지 않았다.

| V1 계약 | V2 canonical | 상태 | 근거·경계 |
|---|---|---|---|
| `/participation` 공개 신청 허브 | `/applications` | S03 완료 | 활성 시즌 ready/empty/error, viewer 상태, 참가 현황 |
| `/participation/season` GET | `/api/applications/season` | S03 완료 | 공개 집계, 본인 신청, privacy projection |
| 시즌 SITE 신청·수정 | `POST /api/applications/season` | S03 완료 | APPROVED+active player, owner, revision, idempotency |
| 시즌 SITE 취소 | `DELETE /api/applications/season` | S03 완료 | APPLIED-only, owner, rate limit |
| `/api/participation` 모집 상태 | `/api/applications/available` | S03 완료 | viewer와 active player capability까지 반영 |
| 시즌 목록·현재 시즌 | `/api/seasons`, `/current` | S03 완료 | no-store 공개 DTO, query 없음 |
| `/admin/seasons` CRUD·복제·활성·종료 | `/admin/seasons`, `/api/admin/seasons/**` | S03 완료 | 단일 ACTIVE, revision, audit, safe retire |
| `/admin/kakao/season-apply` 목록·필터 | `/admin/seasons` review queue | SITE/DB 완료 | 상태 filter/page/review·reviewed 상태 재검토와 200+ 정확한 count |
| V1 legacy GET 주소 | canonical 308 | S03 완료 | GET/HEAD만, reviewed query allowlist |
| Kakao 실제 명단 수신·snapshot ingest | S09 integration adapter | 미완료·차단 | enum/hash/dedupe DB만 존재; webhook·미매칭·다회차 없음 |
| 제한 계정 session 발급·표시 | S01 account lifecycle | 통합 전 필수 | S03 viewer DB 재검사는 선반영, 실제 제한 session은 S01 |
| route→transaction auth 재검사 | S01 공통 tx guard | 통합 전 필수 | user account/player는 재검사, admin revoke/role/TOTP는 retrofit 필요 |
| 무활동 receipt cleanup | S13 scheduler | 미완료 | 24h TTL/index와 mutation cleanup만 완료 |
| 운영 V1 데이터 이관 | 별도 승인 runbook | 미실행 | 운영 DB·비밀·Vercel 접근 없음 |

## 판정

- SITE 시즌·참가 aggregate: 로컬 후보 완료
- Kakao 전체 기능 동등성: 미완료
- V2 전체 운영 GO: 금지
- push/Vercel/운영 DB 반영: 하지 않음

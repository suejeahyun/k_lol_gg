# Kakao 모집 명령 권한표

| 명령 | 같은 허용 방 일반 발신자 | 생성자 | 상대 팀장 | sender allowlist 운영자 | 다른 방 |
| --- | --- | --- | --- | --- | --- |
| `CREATE_PARTY`, `CREATE_SCRIM` | 성공 | 성공 | 성공 | 성공 | 방 allowlist 단계에서 거부 |
| `GET_PARTY_STATUS` | 성공 | 성공 | 성공 | 성공 | 404 |
| `JOIN_SCRIM` | 성공 후 상대 팀장 귀속 | 성공 여부는 도메인 상태 규칙 적용 | 성공 여부는 도메인 상태 규칙 적용 | 성공 여부는 도메인 상태 규칙 적용 | 404 |
| `SYNC_*`, `FINISH_PARTY`, `CANCEL_*` | 403 | 성공 | 성공 | 성공 | 404 |
| `REOPEN_SCRIM`, `CONFIRM_SCRIM`, `COMPLETE_SCRIM` | 403 | 성공 | 성공 | 성공 | 404 |
| `RESET_PARTY` | 거부 | 거부 | 거부 | Kakao 경로 거부 | 404 |

`/V2모집 <JSON>` 진입 자체는 sender allowlist 운영자 또는 명시적 비운영 개발 모드만 허용한다. V1 호환 명령은 `COMPAT_V1`, 원시 JSON은 `RAW_V2`로 서명 body에 귀속된다.

내전 전체 양식 `SYNC`와 `STATUS`는 허용 방 일반 발신자에게 공개하고, 명시적 강제 `CANCEL`만 trusted sender로 제한한다. authoritative 철회 범위는 `sourceRoomIdHash + applyDate + recruitNo + RIFT`이며 SITE와 관리자 검토 완료 행은 범위에 포함하지 않는다.

| 운영 양식 동작 | 허용 방 일반 발신자 | sender allowlist 운영자 | ADMIN 세션 |
| --- | --- | --- | --- |
| 외출·휴식·친구·정모·건의 제출 | 허용 | 허용 | Kakao 제출 경계와 무관 |
| 내전 전체 양식 `SYNC`, 현황 `STATUS` | 허용 | 허용 | Kakao 제출 경계와 무관 |
| 내전 강제 `CANCEL` | 거부 | 허용 | Kakao 제출 경계와 무관 |
| 검토·상태 변경·soft delete | Kakao 경로 없음 | Kakao 경로 없음 | ADMIN 인증·same-origin·revision·idempotency 필수 |

미연동 방은 제출자 권한과 관계없이 403 `KAKAO_ROOM_FORBIDDEN`이며, sender allowlist 추가로 우회하지 않는다.

동일 허용 방의 임의 sender A/B/C는 member-safe 서명 검증을 모두 통과하지만 trusted operator capability는 얻지 않는다. aggregate 수정은 각 sender가 직접 생성한 모집에만 허용되고, 다른 sender의 마감·취소·재오픈은 403이다.

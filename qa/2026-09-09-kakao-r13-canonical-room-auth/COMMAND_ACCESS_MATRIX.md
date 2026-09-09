# R13 command access matrix

| 상태·역할 | 허용 | 차단 |
| --- | --- | --- |
| HMAC 불일치·다른 installation material | 없음 | `INVALID_SIGNATURE` |
| HMAC 정상, room 미등록 | `/봇버전`, `/V2연동확인`, 도움말(휴대폰 로컬), `/V2방연동 CODE` | 일반 API `ROOM_BINDING_REQUIRED` |
| canonical room `ACTIVE`, 신규 sender | MEMBER 조회·생성·참가·제출 | MANAGER/ADMIN 명령 `ROLE_FORBIDDEN` |
| canonical room `ACTIVE`, MANAGER | MEMBER 명령, 소유자/관리 lifecycle | ADMIN 강제 명령 |
| canonical room `ACTIVE`, ADMIN | 방 내부 ADMIN 명령 | SUPER 사이트 관리 |
| canonical room `PAUSED` | 진단·pairing 검토 | 일반 API `ROOM_PAUSED` |
| canonical room `REVOKED` | 진단·관리자 검토 | 일반 API `ROOM_NOT_REGISTERED` |
| 다른 canonical room aggregate | 없음 | 존재 여부를 숨긴 `404 NOT_FOUND` |
| DB registry 장애 | 휴대폰 로컬 진단 | 서버 일반 API `503 REGISTRY_UNAVAILABLE` |

정적 `KAKAO_WEBHOOK_ALLOWED_ROOMS`/`SENDERS`는 이 표의 정상 권한 판정에 참여하지 않는다. 값은 명시적 비상 bootstrap 입력일 뿐이다.

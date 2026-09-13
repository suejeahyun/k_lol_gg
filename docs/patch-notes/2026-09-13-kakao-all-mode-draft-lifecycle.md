# 카카오 파티·내전·스크림 통합 수명주기 v1.0.0

파티, 내전, 스크림을 `양식 생성 → 전체 양식 작성·전송 → 활성화 → 빠른 추가·삭제 → 최신 현황`이라는 하나의 사용자 흐름으로 통일했다. 기존 V1의 표시 형식과 `/` 선택 사용을 유지한다.

생성 시 실제 번호를 예약하되 초안은 공개 현황에 노출하지 않는다. 파티에는 운영일과 주최자를 명시하고 시간·게임정보 공란 기본값을 활성화 시점에 적용한다. 내전은 사이트·확정 참가자를 보존하고 전체 정원 검증을 transaction 안에서 수행한다. 스크림은 기존 라인업을 단일 원천으로 사용해 빠른 명령과 전체 양식 수정이 서로 덮어쓰지 않게 했다.

Neon production에 `0039_massive_arachne`를 적용했고 사후 구조·journal 검증을 완료했다. 기능 커밋 `249a1bf24e27dac0f5c59103bc6d5b3ea0c80743`은 Vercel production 배포 `dpl_FaX8XujaQQrBY9ntwixwQTgQooAZ`로 운영 별칭에 연결했으며 상태 API와 공개 구인 API를 확인했다.

휴대폰 MessengerBot R 코드는 사이트 배포와 별도다. V1 strict R11 전체 파일은 생성·Rhino 정적 검증까지 완료했지만 실제 기기 설치와 두 Kakao 방 송수신은 사용자 설치 후 확인한다.

세부 근거와 롤백·남은 위험은 [`docs/qa-evidence/kakao-all-mode-draft-lifecycle-2026-09-13/README.md`](../qa-evidence/kakao-all-mode-draft-lifecycle-2026-09-13/README.md)에 기록했다.

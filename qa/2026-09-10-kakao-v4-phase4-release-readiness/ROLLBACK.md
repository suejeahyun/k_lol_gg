# Kakao V4 롤백

## 트리거

- 반복되는 5xx 또는 DB transaction 실패
- 정상 요청의 `INVALID_SIGNATURE`, `ROOM_BINDING_REQUIRED`, `ROOM_CAPABILITY_FORBIDDEN` 급증
- 중복 응답·중복 mutation 또는 replay/conflict 계약 위반
- RECRUIT/FEATURES 교차 라우팅
- V1 exact reply 훼손 또는 실기기 컴파일 실패

## 순서

1. 해당 방의 V4 MessengerBot 프로필을 먼저 중지한다.
2. 진행 중 mutation을 중단하고 event ID·시간·허용된 오류 코드만 기록한다. message body, sender 원문, secret은 기록하지 않는다.
3. 필요하면 `kakao_operation_settings`의 기존 승인된 kill switch 절차로 영향을 제한한다. 이 문서 작업에서는 값을 변경하지 않았다.
4. 서버의 기존 V3 route가 정상인지 확인한 뒤 백업한 정확한 V41 파일과 private 설정으로 해당 방의 V41 프로필 하나만 재시작한다.
5. `/봇버전`, 연동 상태, 읽기 명령을 확인한 뒤 제한된 테스트 모집 create/status/finish를 수행한다.
6. V4 installation/room/receipt 행과 migrations `0031`~`0034`는 삭제하거나 down-migrate하지 않는다. additive schema는 원인 분석과 재시도를 위해 보존한다.
7. V4가 만든 진행 중 aggregate는 자동 삭제하지 않고 관리자 검토로 종료·복구한다.
8. 재발 방지 패치와 staging 증거가 준비될 때까지 V4 rollout을 중지한다.

V41과 V4를 같은 방에서 동시에 켜는 방식은 롤백이 아니다. 항상 하나를 완전히 중지한 뒤 다른 하나를 시작한다.

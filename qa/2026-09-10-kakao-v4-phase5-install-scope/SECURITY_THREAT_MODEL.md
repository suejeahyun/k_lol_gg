# 보안 위협 모델

## 보호 자산과 신뢰 경계

- 보호 자산: V4 모집·내전·운영양식 상태, 내구성 event 영수증, nonce, identity/signing secret.
- 전화 설치본은 identity secret으로 설치 ID를 만들고 signing secret으로 원문 요청에 서명한다.
- 서버는 서명 검증과 설치 ID 검증을 모두 통과한 뒤에만 내부 설치 범위를 만든다.
- 카카오 room/channel/name 값은 신뢰 입력이 아니며 V4 계약에 들어오지 않는다.

## 위협과 대응

| 위협 | 대응 | 잔여 위험 |
| --- | --- | --- |
| 임의 installation ID 위조 | 서버가 identity secret과 profile ID로 기대값을 재계산하고 길이 확인 후 상수 시간 비교 | identity secret 탈취 시 해당 배포의 설치 ID를 재현할 수 있음 |
| RECRUIT/FEATURES 교차 사용 | profile ID가 installation ID HMAC 입력과 명령 분류 권한에 모두 포함됨 | 두 프로필이 같은 identity secret을 공유하므로 secret 자체가 탈취되면 둘 다 영향 가능 |
| 잘못된 현재/이전 서명 | key ID, 정확한 원문 body digest, 도메인 분리 재료로 HMAC 검증; 등록되지 않은 key ID와 변조 서명 거부 | bounded 이전 키 기간 동안 이전 키도 의도적으로 유효 |
| room/channel 위조 | 7필드 스키마 외 필드 거부, 관련 헤더 거부, 전화 콜백의 room/channel/group 미사용 | 전화 설치본 자체가 변조되면 signing secret 보호가 핵심 |
| 다른 일반 사용자의 상태 변경 | 같은 설치본의 모든 일반 사용자가 공유한다는 V4 정책을 명시적으로 적용 | 공유 범위 정책상 사용자별 소유권 분리는 제공하지 않음 |
| 중복 요청·재전송 | event ID, body digest, nonce와 기존 내구성 영수증을 유지; 같은 event/다른 body는 409 충돌 | 저장소 장애 시 서버는 사용 불가로 닫힘 |
| 비밀값 노출 | 기존 환경 변수 이름만 문서화하고 값은 코드·로그·QA에 기록하지 않음; identity와 signing 용도 분리 | 운영자 오설정으로 두 용도에 같은 값을 넣지 않도록 배포 점검 필요 |
| V3/V41 회귀 | V4 라우트에서만 레지스트리 의존 제거; V3 회귀 테스트와 전체 계약 테스트 수행 | 실제 운영 트래픽 전환은 이번 범위 밖 |

## 실패 폐쇄

- identity 설정 누락 또는 길이 오류: V4 서비스 구성 실패, HTTP 503.
- 임의/타 프로필 installation ID: 공개 응답은 `INVALID_SIGNATURE`, HTTP 401.
- 알 수 없는 key ID, HMAC 불일치, 오래된 timestamp, 금지 헤더·추가 본문 필드: 기존 V4 HTTP 경계에서 거부.
- event ID 본문 충돌: `REPLAY_CONFLICT`, HTTP 409.

## 비밀 회전 원칙

- signing key 회전은 current/previous의 제한된 이중 검증 창을 사용하며 installation scope를 바꾸지 않는다.
- identity secret은 설치 범위의 루트이므로 일반 signing key 회전 때 변경하지 않는다.
- identity secret 침해 대응으로 값을 바꾸면 새로운 설치 범위가 만들어진다. 이 경우 데이터 연결 정책을 먼저 정하고 전화 설치본과 서버를 함께 전환해야 한다.

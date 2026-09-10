# Kakao V4 휴대폰 실기기 수용 체크리스트

현재 결과: `NOT TESTED`

## 1. 준비와 식별

- [ ] run ID: `KAKAO-V4-YYYYMMDD-HHMM-KST`
- [ ] 검증 commit SHA
- [ ] RECRUIT/FEATURES 공개 artifact SHA-256
- [ ] private 설치본은 hash만 기록하고 본문·secret은 캡처하지 않음
- [ ] Android 제조사·모델·OS 버전
- [ ] MessengerBot R 버전과 Rhino 정보
- [ ] 카카오톡 앱 버전(USER_A/USER_B)
- [ ] staging 배포 ID와 테스트 시각(KST)
- [ ] `ROOM_RECRUIT`, `ROOM_FEATURES` 전용 QA 방 준비
- [ ] `USER_A`, `USER_B`는 서로 다른 일반 사용자이며 관리자·사전 등록 사용자가 아님

## 2. 두 봇 설치

### RECRUIT bot profile

- [ ] 기존 설치본 안전 백업과 SHA-256 기록
- [ ] RECRUIT 단일 파일 전체 붙여넣기·저장·재열기
- [ ] 마지막 marker와 전체 문자 수 확인
- [ ] 실제 컴파일 성공, 경고 0
- [ ] `/봇버전`에 V4 버전과 `RECRUIT` 표시
- [ ] ROOM_RECRUIT 하나만 구독

### FEATURES bot profile

- [ ] 별도 MessengerBot R profile 사용
- [ ] FEATURES 단일 파일 전체 붙여넣기·저장·재열기
- [ ] 실제 컴파일 성공, 경고 0
- [ ] `/봇버전`에 V4 버전과 `FEATURES` 표시
- [ ] ROOM_FEATURES 하나만 구독
- [ ] 두 설치본의 공개 installation hash가 서로 다름

## 3. room/channel 비의존성

- [ ] 서버 수신 envelope에 `room`, `roomName`, `channelId` 필드 없음
- [ ] `x-klol-room`, `x-klol-channel`, `x-klol-room-name` header 없음
- [ ] room 이름 변경 뒤에도 같은 정적 profile로 정상 동작
- [ ] 캡처에는 실제 방 이름·channel 값이 노출되지 않음

## 4. RECRUIT 두 사용자 흐름

- [ ] USER_A: `5인파티 12` 생성 성공
- [ ] USER_B: USER_A 양식에 A=`재현, 기용` 입력 후 전체 전송
- [ ] USER_B: B=`재현, 소영`으로 재전송, `기용`이 완전히 삭제됨
- [ ] USER_B: 다시 A로 전송, 최종 snapshot이 첫 A와 동일
- [ ] USER_B: 이름을 모두 삭제한 0명 양식 전송, 과거 이름 0개
- [ ] USER_B: USER_A의 `12ㅉ` 마감 성공
- [ ] 위 과정에 사용자 사전 등록·role 승격 요구 없음
- [ ] 동일 callback 재전송 시 mutation·응답 1회
- [ ] 같은 event ID에 다른 body 전송 시 HTTP 409 `REPLAY_CONFLICT`

## 5. slash와 profile 경계

- [ ] `구인현황`과 `/구인현황` 동일
- [ ] `랭킹`과 `/랭킹` 동일
- [ ] `//도움말`, `/ 5인파티`, `/`, URL, `오늘 /내전현황`, `구인/현황` 모두 무응답·HTTP 0
- [ ] ROOM_RECRUIT에서 `랭킹`, `전적`, `최근`, `내전구인` 무응답·HTTP 0
- [ ] ROOM_FEATURES에서 `5인파티`, `구인현황`, `12ㅉ`, `스크림구인` 무응답·HTTP 0

## 6. FEATURES 정상 흐름

- [ ] `랭킹` 성공
- [ ] `전적 <QA Riot ID>` 성공
- [ ] `최근 <QA Riot ID>` 성공
- [ ] 화면 수치와 staging 원본 fixture 일치
- [ ] 데이터가 없는 Riot ID의 빈 상태가 명확함

## 7. event ID와 네트워크

- [ ] `logId` 없는 같은 명령을 두 번 새 메시지로 보내 서로 다른 `event-boot-...-counter` 확인
- [ ] 첫 HTTP 연결 실패 후 retry가 발생하도록 QA proxy 설정
- [ ] retry 두 요청의 event ID와 body digest 동일
- [ ] retry로 DB mutation이 중복되지 않음
- [ ] 일반 text 요청이 5초 이내 timeout 안내
- [ ] 네트워크 복구 후 새 요청 성공

## 8. 오류 6종

- [ ] 정상 성공
- [ ] 잘못된 profile: `WRONG_PROFILE`
- [ ] 잘못된 서명: `INVALID_SIGNATURE`
- [ ] event body conflict: `REPLAY_CONFLICT`
- [ ] 연결/5xx: `SERVER_UNAVAILABLE`
- [ ] 잘못된 전체 양식: `INVALID_FORM`
- [ ] 각 메시지가 서로 구분되고 복구 방법이 다름
- [ ] secret, signature, token, stack, 내부 URL, 전체 사용자/설치 식별자 미노출

## 9. 스크림 1회 왕복

- [ ] `스크림구인` 또는 전체 스크림 양식 한 명령 성공
- [ ] 해당 command trace가 서버에 정확히 1건
- [ ] 사전 status·사후 detail·숨은 retry 없음
- [ ] 정상 응답에 필요한 번호와 결과가 한 번에 포함

## 10. 캡처 규칙

- 각 증거에 run ID, 시각, profile, 사용자 가명, 명령, 기대/실제 결과를 기록한다.
- 연속 흐름은 화면 녹화 1개와 핵심 단계 screenshot을 함께 남긴다.
- 파일명: `TCID_profile_user_step_YYYYMMDD-HHMMSS-KST.png`.
- 실제 이름·방 이름·프로필 사진·전화번호·카카오 ID·Riot ID는 전용 QA 가명 또는 redaction 처리한다.
- secret·signature·token·cookie는 캡처 후 모자이크가 아니라 원본 생성 단계부터 제외한다.
- 서버 로그는 trace ID, event ID, profile, command class, status, elapsed, request count만 남긴다.
- 모든 PASS 체크에는 `EVIDENCE_STRUCTURE.md` 아래 상대 경로가 하나 이상 있어야 한다.

## 11. 최종 서명

- [ ] 자동 acceptance 32/32 PASS
- [ ] 기존 V1 골든 57/57 PASS
- [ ] 이 체크리스트 전 항목 PASS
- [ ] P0/P1 미해결 0
- [ ] QA/개발/운영 담당자의 이름 또는 역할과 시각 기록
- [ ] 운영 배포는 별도 명시 승인 후 진행

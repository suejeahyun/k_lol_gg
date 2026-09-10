# Kakao V4 Phase 5-A — 설치 단위 공유 범위

## 범위

- 기준 커밋: `924ebd187c0064274a403414881fbf7cd4a3b362`
- 브랜치: `feat/kakao-v4-phase5-install-scope-20260910`
- 대상: V4 명령 라우트와 V4 서버 애플리케이션 경계
- 제외: V3/V41 라우트, 기존 방 등록·페어링 DB, 운영 DB, 배포, 실제 비밀값

## 확인됨

- V4 요청 본문은 `profileId`, `installationId`, `senderId`, `eventId`, `timestamp`, `nonce`, `text`의 7개 필드만 허용한다.
- MessengerBot 콜백의 room, channel, group 값은 V4 전송 인자와 본문에 사용되지 않는다.
- 서버는 `profileId`와 기존 identity secret으로 기대 installation ID를 재계산하고 상수 시간 비교한다.
- 현재 또는 이전 signing key의 정확한 HMAC 검증을 통과한 요청만 처리한다.
- 서버가 installation ID에서 결정적으로 만든 내부 범위를 기존 모집·도우미·운영양식 포트의 저장 범위로 사용한다. 이는 카카오 방 식별자가 아니다.
- 같은 프로필 설치본의 일반 사용자들은 sender ID가 달라도 동일한 내부 범위에서 생성·수정·마감을 이어서 수행한다.
- RECRUIT와 FEATURES는 프로필이 installation ID HMAC 입력에 포함되어 서로 다른 범위를 갖는다.
- 동일 event ID 재전송은 기존 내구성 영수증으로 재생되고, 본문이 달라지면 충돌로 닫힌다.
- V4 라우트는 방 레지스트리를 조회하지 않는다. V3/V41 라우트와 DB 페어링 코드는 수정하지 않았다.
- DB 스키마 변경이나 데이터 마이그레이션은 필요하지 않다. 기존 문자열 범위 컬럼과 영수증/nonce 경계를 그대로 사용한다.

## 추정 및 미확인

- 이번 결과는 소스·자동 테스트·정적 빌드 기준이다. 실제 Android MessengerBot 기기와 스테이징 HTTP 왕복은 수행하지 않았다.
- 운영 환경 변수 설정, 운영 DB 데이터, 운영 JAR 해시는 확인하거나 변경하지 않았다.
- V4는 아직 운영 적용 전이라는 전제다. 이미 별도 V4 시험 데이터를 장기 보존 중이라면 새 설치 범위와 합쳐지지 않으므로 배포 전 별도 확인이 필요하다.

## 다음 패치 후보

1. 스테이징에서 현재/이전 signing key 각각의 실제 서명 HTTP 왕복과 잘못된 서명 거부를 자동화한다.
2. 실제 MessengerBot RECRUIT/FEATURES 두 프로필에서 callback room 변조와 교차 사용자 생성·수정·마감을 기기 테스트한다.
3. installation/profile 인증 실패, replay 충돌, 내부 설치 범위별 처리량을 비식별 메트릭으로 추가한다.
4. identity secret과 signing key의 독립 회전·복구 훈련 문서를 운영 런북에 연결한다.
5. V4 시험 데이터가 존재할 경우 배포 전 읽기 전용으로 설치 범위 충돌·잔존 행을 점검하는 도구를 추가한다.

상세 검증 명령과 결과는 `VERIFICATION.md`, 보안 판단은 `SECURITY_THREAT_MODEL.md`, 복구 절차는 `ROLLBACK.md`를 따른다.

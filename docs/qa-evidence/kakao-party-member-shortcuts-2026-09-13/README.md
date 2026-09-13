# 카카오 파티 이름 빠른 추가·삭제 v1.0.0

## 판정

- 기능 ID: `kakao-party-member-shortcuts`
- 기능 버전: `1.0.0`
- 소스 상태: 통합 워크트리에 반영
- DB migration: 없음
- 운영 서버 배포: 미수행
- MessengerBot R 실기기 설치: 미확인
- 실제 Kakao 방 송수신: 미확인

따라서 현재 판정은 **소스 반영·로컬 focused 검증**이다. 운영 반영 또는 실기기 검증 완료로 판정하지 않는다.

## 변경 내용

- `상세 N 추가 이름` / `상세 N 삭제 이름`을 canonical `ADD_MEMBER` / `REMOVE_MEMBER`로 변환한다.
- 대상 조회를 현재 모집 운영일, 검증된 `RECRUIT` installation scope, `DRAFT | IN_PROGRESS` 상태로 제한한다.
- application의 `PARTY_MEMBER_ADD` / `PARTY_MEMBER_REMOVE` 명령과 `RecruitMutationBody.data` 결과 계약을 사용한다.
- 적용·중복·이름 없음·대상 없음·동명이인·99명 한도를 구체적인 HTTP 200 사용자 응답으로 분리한다.
- 적용된 주 명단 번호 또는 예비 번호를 성공 응답에 함께 표시한다.
- 모든 단축 명령 결과 아래에 최신 전체 구인현황을 붙인다.
- 구인 도움말과 상세 안내를 확장하면서 기존 전체 양식 수정 안내와 스냅샷 기능을 유지한다.

## 로컬 검증 증거

- `npm run typecheck`: PASS
- 변경 파일 ESLint와 `git diff --check`: PASS
- domain·application·HTTP·classifier·dispatcher·상세/전체 양식·서버 closure focused: 103/103 PASS
- V1/V4 휴대폰 builder 재생성 후 compatibility·strict mobile·client closure: 57/57 PASS
- `npm test`: 757 PASS, 1개 격리 PostgreSQL 전용 테스트는 일반 unit 실행에서 의도적으로 skip
- `V2_DB_CONTRACT_SCOPE=recruiting npm run test:db`: 일회성 PostgreSQL 18에서 47/47 PASS. 새 동시 단축 명령 두 개가 잠긴 최신 aggregate에 직렬 합성되고 cluster 종료·임시 경로 제거까지 확인
- V4 통합 산출물: 16,582자, ES5/Rhino 정적 계약 PASS
- V1 strict 산출물: LF 62,399자 / CRLF 64,228자, 기준 소스 SHA-256 `0514eb3c26862ffedfc132dbe1b258db25d30657aaf8455429467a151bfb18a2`, 도달 함수 63개 보존 계약 PASS

## 남은 위험과 운영 확인

- 같은 표시 이름이 여러 줄에 있는 경우 자동 삭제하지 않고 전체 양식에서 정확한 줄을 지우도록 안내한다.
- 주 정원이 차면 추가 이름은 예비 명단으로 들어간다. 참가자와 예비 합계 99명 한도에서는 추가하지 않는다.
- 오전 6시 KST 운영일 경계를 넘긴 오래된 번호는 현재 대상으로 사용하지 않는다.
- 운영 배포 후 실제 구인방에서 일반 사용자의 추가·삭제, 중복·없는 이름, 후속 전체 현황을 확인해야 한다.

## 롤백

스키마 변경과 운영 데이터 직접 수정은 없다. 문제가 있으면 서버를 직전 확인 배포로 되돌리고 휴대폰 봇도 직전 설치본으로 복원한다. 운영일·installation scope·상태 필터를 완화하는 방식으로 롤백하지 않는다.

## 다음 권장 패치

1. 동명이인 삭제를 안전하게 지정할 수 있는 별도 슬롯 기반 명령이 필요한지 실제 사용 로그로 판단한다.
2. 최신 현황 조회 실패율과 mutation 성공/무변경 비율을 개인정보 없이 집계한다.
3. 오전 6시 운영일 전환 직전 입력에 현재 운영일을 더 명확히 표시한다.

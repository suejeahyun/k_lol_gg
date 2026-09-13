# 카카오 파티 이름 빠른 추가·삭제 v1.0.0

## 판정

- 기능 ID: `kakao-party-member-shortcuts`
- 기능 버전: `1.0.0`
- 소스 상태: 통합 워크트리에 반영
- DB migration: 없음
- 운영 서버 배포: Vercel Production READY
- MessengerBot R 실기기 설치: 미확인
- 실제 Kakao 방 송수신: 미확인

따라서 현재 판정은 **소스·서버 운영 반영 완료, 휴대폰 설치 대기**다. 실기기 검증 완료로 판정하지 않는다.

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
- `npm run check`: PASS. lint 0 errors/기존 생성 파일 경고 37개, 758개 중 757 PASS·격리 DB 전용 1개 의도적 skip, 여성 챔피언 안내 이미지 68/68 검증, Next.js 93개 정적 페이지 운영 빌드 PASS
- domain·application·HTTP·classifier·dispatcher·상세/전체 양식·서버 closure focused: 103/103 PASS
- V1/V4 휴대폰 builder 재생성 후 compatibility·strict mobile·client closure: 57/57 PASS
- `npm test`: 757 PASS, 1개 격리 PostgreSQL 전용 테스트는 일반 unit 실행에서 의도적으로 skip
- `V2_DB_CONTRACT_SCOPE=recruiting npm run test:db`: 일회성 PostgreSQL 18에서 47/47 PASS. 새 동시 단축 명령 두 개가 잠긴 최신 aggregate에 직렬 합성되고 cluster 종료·임시 경로 제거까지 확인
- V4 통합 산출물: 16,582자, ES5/Rhino 정적 계약 PASS
- V1 strict 공개 산출물: LF 62,443자 / CRLF 64,274자, 기준 소스 SHA-256 `0514eb3c26862ffedfc132dbe1b258db25d30657aaf8455429467a151bfb18a2`, 도달 함수 63개 보존 계약 PASS
- 비공개 한 번 붙여넣기 산출물: 62,951자, RECRUIT·FEATURES 각각 HTTP 200 및 서명 게이트웨이 OK, 비밀값 출력 없음
- 현재 트리와 전체 Git 이력 비밀값 스캔: PASS

## 운영 배포 증거

- Git 태그: `kakao-party-member-shortcuts-v1.0.0`
- 기능 커밋: `524d7938b5850ce0b7677853c134c8ac2e53138f`
- Vercel 배포 ID: `dpl_BB98422yvyDwZxA1rx3aCYfdM44y`
- 불변 주소: `https://k-lol-39ie0ogdy-tjdmswo11-3715s-projects.vercel.app`
- 운영 별칭: `https://k-lol-gg.vercel.app`
- 확인 시각: `2026-09-13T10:03:05.2165556Z`
- `/api/health`: HTTP 200, `status=ready`
- `/help/recruits`: HTTP 200, 배포 HTML/RSC에서 `상세 12 추가 홍길동`·`상세 12 삭제 홍길동` 확인

## 남은 위험과 운영 확인

- 같은 표시 이름이 여러 줄에 있는 경우 자동 삭제하지 않고 전체 양식에서 정확한 줄을 지우도록 안내한다.
- 주 정원이 차면 추가 이름은 예비 명단으로 들어간다. 참가자와 예비 합계 99명 한도에서는 추가하지 않는다.
- 오전 6시 KST 운영일 경계를 넘긴 오래된 번호는 현재 대상으로 사용하지 않는다.
- 새 비공개 단일 파일을 휴대폰 MessengerBot R에 설치한 뒤 실제 구인방에서 일반 사용자의 추가·삭제, 중복·없는 이름, 후속 전체 현황을 확인해야 한다.

## 롤백

스키마 변경과 운영 데이터 직접 수정은 없다. 문제가 있으면 서버를 직전 확인 배포로 되돌리고 휴대폰 봇도 직전 설치본으로 복원한다. 운영일·installation scope·상태 필터를 완화하는 방식으로 롤백하지 않는다.

## 다음 권장 패치

1. 동명이인 삭제를 안전하게 지정할 수 있는 별도 슬롯 기반 명령이 필요한지 실제 사용 로그로 판단한다.
2. 최신 현황 조회 실패율과 mutation 성공/무변경 비율을 개인정보 없이 집계한다.
3. 오전 6시 운영일 전환 직전 입력에 현재 운영일을 더 명확히 표시한다.

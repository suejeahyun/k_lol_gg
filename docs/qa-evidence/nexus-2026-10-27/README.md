# NEXUS.GG 1.0.0 검증·배포

2026-10-27 (Asia/Seoul). NEXUS 운영 주소는 https://nexus-gg-kr.vercel.app 이다. source `ef7bf797c057a9fe5f4055791a9d2f74c5f04fee`, tag `nexus-service-v1.0.0`, 배포 `dpl_4iYBBP9VcNWckLnxbrxa5xzuC6XP`의 READY·프로젝트·source·alias를 확인했다. K-LOL 프로젝트에 배포하지 않았다.

## 검증 결과

| 검사 | 결과 |
| --- | --- |
| 전체 npm run check | lint 오류 0, 타입·ERD·가이드 이미지·production build PASS |
| 계약 테스트 | 741 PASS |
| 단위 테스트 | 1,197 PASS, 기존 별도 fixture 1 SKIP |
| 빈 DB·참조 초기화 | 격리 PostgreSQL 9/9 PASS |
| 최초 관리자 인증 HTTP | 격리 DB + 실제 NEXUS production build 10/10 PASS |
| 현재 추적·비추적 소스 비밀정보 검사 | PASS, private 파일 제외 확인 |
| 운영 HTTP | 공개 화면·health·manifest·sitemap·관리자 인증 경계 9/9 PASS |
| 운영 카카오 서버 | RECRUIT/FEATURES 상태·도움말 서명 요청 4/4 PASS |
| 브라우저 | 운영 홈 NEXUS 브랜드, 정상 이미지·빈 기록 상태 확인 |

카카오 검사는 업무 변경 명령을 보내지 않았다. 운영 사이트에서 합성 회원·경기·모집 자료를 만들지 않았다. 전체 Git 과거 이력 검사는 중단했으며 완료 근거로 집계하지 않는다. 현재 변경·배포 입력에 대한 비밀정보 검사는 통과했다.

## 초기 자료와 분리

[새 Neon DB 검증](remote-database.json): 기존 테이블 0개인 새 DB에 migration 50개 적용 후 업무 자료 0건 확인. 이후 공식 Data Dragon 16.17.1 챔피언 173개, 최초 SUPER_ADMIN 1개, 기본 설정 3행만 준비했다. 선수·시즌·경기·모집은 0건이며 기존 서비스 데이터를 가져오지 않았다.

인증 issuer·cookie·DB pool·휴대폰 설정키를 서비스별로 분리했다. NEXUS DB 설정 누락 시 K-LOL DB로 대체하지 않는다. 테스트에서는 같은 signing key를 넣어도 두 서비스의 세션을 교차 수용하지 않았다. Neon direct/pooler 호스트가 같은 DB를 가리키는 경우도 분리 검사에서 차단했다.

NEXUS 일반 봇의 요청 ID를 실제 서버 envelope/HMAC 검사로 확인했다. 기존 K-LOL 공개 생성본 해시는 유지한다. NEXUS 비공개 일반 봇은 CRLF 64,797자로 휴대폰 편집기 65,535자 제한 내다.

## 운영 자원과 남은 사용자 설정

- 별도 Vercel `nexus-gg`, Neon `NEXUS-GG`/`nexus_gg`, private Blob `nexus-gg-private` 준비.
- 새 Neon compute는 0.25–1 CU, 300초 유휴 자동 중지. 기존 프로젝트 설정을 바꾸지 않았다.
- 새 서비스의 cron과 알림 서버 설정 준비. 폰 알림은 수신 방 등록 전에는 요청·전송할 세션이 없다.
- **휴대폰 설치는 PENDING_USER_INSTALL.** `.private/NEXUS_PHONE_INSTALL.md`의 두 프로필 설치·방 구독·일회용 알림 등록이 필요하다. 실기기 송수신 완료를 주장하지 않는다.
- 최초 관리자 로그인 후 임시 비밀번호를 바꾸고 새 시즌을 생성해야 시즌 내전을 접수할 수 있다. 빈 데이터 요구에 따라 시즌을 임의 생성하지 않았다.
- 외부 Riot API 키 연동은 사용자 선택 대기이며 현재 비활성이다. 선택적인 OpenAI/RSO도 별도 키·콜백 설정이 필요하다.
- private Blob 생성·연결은 확인했으며 실제 사진 업로드는 사용자 로그인 후 기능별로 확인한다.

[배포·HTTP·봇 메타데이터](production.json), [운영 화면](production-home.png), [운영 시작](../../operations/NEXUS_RUNBOOK.md).

## 복구

NEXUS 최초 배포이므로 기존 K-LOL alias를 복구 대상으로 사용하지 않는다. 문제 발생 시 NEXUS 프로젝트를 일시 중지하거나 이 source에서 수정·재배포한다. 이후 정상 NEXUS 버전을 보관해 rollback 대상으로 사용한다. DB를 삭제·초기화하거나 기존 서비스 DB를 연결하지 않는다.

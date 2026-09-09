# Kakao R14.3 two-room V1 parity QA

## 범위와 상태

- 소스 브랜치: `fix/kakao-r14-2-2-v1-member-parity-20260909`
- DB migration head: `0034_kakao_room_capability_profiles`
- 운영 반영: **미반영**. Production 배포와 Neon migration 적용은 운영 인계 뒤 별도 수행한다.
- 삭제: 없음. 기존 방·모집·신청·회원 데이터는 보존한다.

## 구현 계약

1. 카카오 callback의 `room`, `channelId`, `isGroupChat`은 인증·라우팅에 사용하지 않는다.
2. installation ID 하나는 canonical room 하나에만 귀속된다.
3. `RECRUIT` 설치본은 파티·스크림·구인 생성/조회/수정/마감용이고, 같은 방의 모든 MEMBER가 V1 명령을 사용한다.
4. `FEATURES` 설치본은 내전 신청·외출 양식·조회 등 일반 사용자 기능용이다.
5. 잘못된 profile의 명령은 `ROOM_CAPABILITY_FORBIDDEN`과 짧은 다른 방 안내로 종료한다.
6. 웹사이트 관리자, raw V2, 보안 설정, 내부 maintenance 권한은 완화하지 않았다.
7. `2인파티`, `5인파티` 최초 양식에는 빈 시작시간·게임정보 줄을 출력하지 않는다. 사용자가 직접 추가한 값은 인식하며, 없거나 공백이면 서버 수신 시각의 KST `HH:mm`과 `미입력`을 저장한다.
8. V1 create/sync/finish는 사전·사후 status 호출 없이 각 1회의 signed HTTP로 처리한다. 원자적 번호 할당, HMAC V3, nonce, receipt, idempotency, optimistic revision은 유지한다.

## 검증 증거

| 검증 | 결과 |
| --- | --- |
| TypeScript | PASS |
| contract tests | 221/221 PASS |
| unit tests | 485/485 PASS |
| disposable PostgreSQL 18 suite | PASS, migration head 0034, replay/rollback/archive restore 포함 |
| Next production build | PASS |
| ESLint | 0 errors, 25 generated/legacy warnings |
| V1 command audit | 101 commands |
| public mobile Rhino audit | ES5, warning candidates 0, 64,560 chars, CRLF 64,657 |
| private RECRUIT Rhino audit | warning candidates 0, 64,952 chars, CRLF 65,050 |
| private FEATURES Rhino audit | warning candidates 0, 64,931 chars, CRLF 65,029 |
| Rhino 1.7.13 strict/fatal-warnings compile | public + RECRUIT + FEATURES 모두 stdout/stderr 경고 0, exit 0 |
| private setting comparison | shared 3 settings exact; RECRUIT identity exact; FEATURES identity distinct |
| scoped secret scan | 이번 diff와 tracked 파일만 검사, 고신뢰 패턴 0 |

전체 Git 이력 secret scan은 이번 변경과 무관하게 장시간 소요되어 중단했다. 이번 diff·tracked 파일과 private installer의 key/value 보존 여부를 값 비출력 방식으로 검증했으며, private 파일은 Git 밖 인계 폴더에만 둔다.

## 성능 관찰

- 휴대폰 응답 객체는 전체 round-trip ms와 `Server-Timing`을 수집한다.
- recruits API 로그는 route/source/command/status와 auth/parse/resolve/service/total ms만 기록한다. room, sender, installation, body, secret은 기록하지 않는다.
- Production에서 관측한 531~578ms는 기존 직렬 HTTP 완료 이벤트 사이 간격이며 서버 처리 시간으로 간주하지 않는다.
- 배포 뒤 명령별 50회 이상 표본으로 server total과 기기 round-trip p50/p95를 별도로 산출한다. 소스 검증만으로 실제 운영 지연 개선 완료를 주장하지 않는다.

## 운영 순서와 rollback

1. Neon 백업과 migration preflight를 확인한다.
2. migration 0034와 이 commit의 서버를 반영한다.
3. 기존 운영 구인방을 `RECRUIT`로 확인하고 기존 identity의 RECRUIT installer를 교체한다.
4. 새 `FEATURES` room pairing을 발급하고 신규 identity installer를 별도 MessengerBot 프로필에 설치한다.
5. 각 프로필은 실제 방 하나만 구독한다.
6. slash/무슬래시 smoke와 서로 다른 사용자 cross-owner close를 확인한다.

실패하면 두 R14.3 봇을 중지하고 이전 서버/휴대폰 설치본으로 되돌린다. 0034는 additive column/default이므로 기존 서버가 무시할 수 있지만, DB rollback이 필요하면 사전 백업 복원을 사용한다. 운영 데이터를 자동 병합하거나 삭제하지 않는다.

## 남은 위험

- 동일 private installer를 실제 두 방에서 실행하면 방을 구분할 수 없다. 설치·운영 절차로만 방지 가능하다.
- FEATURES는 신규 identity이므로 이전 휴대폰 local preview/photo cache를 승계하지 않는다.
- 실제 MessengerBot R 저장·컴파일과 카카오톡 실명령 지연은 운영 설치 뒤 확인해야 한다.

## 다음 패치 추천

1. 운영 표본의 p50/p95와 DB query count를 대시보드로 집계한다.
2. installation/member last-seen 갱신을 안전한 시간 창으로 throttle해 쓰기 부하를 줄인다.
3. openchat status의 독립 조회를 한 projection query로 통합한다.
4. 관리자 방 목록에 최근 wrong-profile 거부 횟수와 마지막 정상 요청 시각을 표시한다.

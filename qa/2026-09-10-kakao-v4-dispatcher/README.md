# Kakao V4 Phase 2-B dispatcher QA

작업일: 2026-09-10 KST

## 범위와 판정

- 브랜치: `feat/kakao-v4-dispatcher-20260910`
- 기준 커밋: `42b77971851d3b94fe4c0cb0879100ff19f1d791`
- V4 classifier의 출력 계약인 `CanonicalKakaoV4Command`와 dispatcher를 추가했다. 텍스트 파싱은 포함하지 않는다.
- 파티 create/status/detail/snapshot/finish, 스크림 create/status/detail/snapshot, 시즌 status/detail/권위 스냅샷을 기존 application service에 연결했다.
- 스크림 join/confirm/cancel/manual finish는 기존 상태를 변경하지 않고 사용 중단 안내만 반환한다.
- V4 `eventId`는 모든 명령 계열이 공유하는 durable receipt scope와 content-independent key hash를 사용한다. 같은 eventId와 같은 서명 본문은 저장 응답을 replay하고, 다른 본문은 `409 IDEMPOTENCY_MISMATCH`로 정규화한다.
- 파티/스크림 변경은 기존 transaction 안에서 권한 재확인, nonce claim, receipt claim, aggregate 변경, audit/outbox, receipt 완료를 함께 처리한다.
- 시즌 스냅샷과 조회도 기존 assistant transaction 안에서 nonce, receipt, 조회/변경을 함께 처리한다.
- V4 파티 snapshot/finish와 스크림 snapshot은 sender 소유권·역할 대신 설치 profile과 canonical room 범위만 확인한다.
- 시작 시간과 게임 정보가 빠진 파티 create는 서버 기본값(KST 현재 `HH:mm`, `미입력`)을 aggregate에 저장하지만 최초 모집 양식에는 표시하지 않는다. 상세/스냅샷 응답에는 표시한다.

## 변경하지 않은 항목

- DB migration 생성·적용 없음. 기존 receipt/nonce/schema를 재사용한다.
- 운영 DB, Vercel, 운영 JAR, 환경변수, 실제 카카오방 배포 변경 없음.
- classifier 텍스트 해석과 route의 canonical dispatch 호출은 독립 브랜치 병합 범위다. 현재 route의 기존 probe 동작은 유지된다.

## 남은 위험

- 날짜·번호 target 해석은 mutation transaction 직전의 별도 읽기다. 실제 mutation transaction에서 canonical room 소유권과 revision을 다시 검사하므로 잘못된 변경은 실패하지만, 동시 변경 시 클라이언트 재시도가 필요할 수 있다.
- 이번 검증은 unit/focused test다. 실제 PostgreSQL과 서명된 HTTP 요청을 함께 쓰는 staging E2E는 아직 수행하지 않았다.
- dispatcher가 route에 최종 연결되려면 classifier 브랜치가 이 canonical DTO를 직접 생성해야 하며 문자열 재파싱을 추가하면 안 된다.

## 다음 패치 추천

1. classifier 결과를 `CanonicalKakaoV4Command`로 고정하고 route에서 `executeCanonical`을 한 번만 호출한다.
2. 실제 PostgreSQL contract test로 read/mutation 공용 event scope, 동일 본문 replay, 다른 본문 409를 검증한다.
3. 서명된 staging HTTP E2E로 교차 사용자 A→B→A, 0명 스냅샷, 삭제 반영, finish를 확인한다.
4. V4 action/profile/replay/conflict를 개인정보 없이 집계하는 운영 관측 지표를 추가한다.
5. classifier 병합 후 V1 golden reply와 V4 `legacyReply`의 명령별 회귀표를 갱신한다.

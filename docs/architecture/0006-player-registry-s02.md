# 0006 — S02 플레이어 등록부와 관리자 변경 계약

상태: 구현 및 로컬 검증 완료, 운영 이관과 통계·Riot 연결은 미완료

## 배경

V1 플레이어 상세 주소는 숫자 식별자를 사용하지만 V2 공개 canonical 주소는 UUID를 사용한다.
동시에 회원명과 사이트 계정 정보는 관리자 경계 밖으로 나가면 안 되고, 관리자 변경은 재시도와
동시 수정에도 중복 반영되거나 감사 기록과 분리되어서는 안 된다.

## 결정

1. `registry.players.legacy_id`는 nullable PostgreSQL `integer`로 추가한다. 값이 있을 때는 양수이고
   전역 unique이며, V2 UUID가 계속 primary key다. 기존 V2 행은 UUID와 모든 필드를 보존한 채
   `legacy_id = NULL`로 이관한다.
2. `/app/players/[legacyId]`는 Node Route Handler에서 active 플레이어의 DB mapping을 확인한다.
   mapping이 있을 때만 상대 `Location`으로 `/players/[uuid]` 308을 반환하고, 없거나 비활성이면
   실제 404를 반환한다. `src/proxy.ts`에는 DB 접근을 추가하지 않는다.
3. 공개 projection은 UUID, Riot ID, 허용된 티어만 가진다. 회원명, 로그인 ID, 계정 UUID와 상태는
   `AdminPlayerRepository`와 `/api/admin/players/**` 응답에서만 사용한다.
4. 관리자 생성·수정·비활성화·재활성화는 ADMIN 이상 세션, exact same-origin, allowlist JSON,
   `Idempotency-Key`, 수정·상태 변경의 strong `If-Match: "revision"`을 요구한다. 편집 DTO로
   상태를 암묵 변경하지 않고 재활성화 전용 endpoint와 2단계 확인 UI를 사용한다.
5. 성공한 변경, revision 증가, audit event, 멱등성 영수증을 한 PostgreSQL transaction에서
   커밋한다. audit append가 실패하면 도메인 변경도 rollback한다.
6. 멱등성 영수증은 원문 키나 요청 본문을 저장하지 않는다. actor·scope와 도메인 분리된 key hash,
   canonical request hash, allowlist response, ETag와 만료 시각만 저장한다. 영수증은 24시간 후
   만료되고 모든 player mutation 시작 시 expiry index로 만료 행을 정리한다. mutation이 전혀 없는
   환경의 주기 정리는 S13 scheduler 범위다.
7. 삭제 대신 soft-deactivation을 사용한다. 공개 검색·legacy mapping에서만 제외하고 UUID,
   legacy ID, 회원명, 계정 연결, 과거 경기·통계 연결을 보존한다. 명시적 재활성화는 보존된 식별자를
   유지한 채 공개 검색과 legacy mapping을 복구하고 `PLAYER_REACTIVATED` audit event를 남긴다.

## HTTP 결과 계약

| 조건 | 결과 |
|---|---:|
| 비로그인 / USER 역할 | 401 / 403 |
| 잘못된 JSON·DTO·query·멱등성 키 | 400 |
| 플레이어 없음 | 404 |
| nickname#tag 또는 legacy ID 중복 | 409 |
| 같은 멱등성 키의 다른 payload | 409 |
| `If-Match` 없음·형식 오류 | 428 / 400 |
| revision stale | 412 + 현재 ETag |
| 저장소 미연결·실패 | 503 |
| 동일 성공 요청 재전송 | 최초 status/body/ETag + `Idempotency-Replayed: true` |

## 이관 계약

- forward migration은 기존 행을 덮어쓰거나 삭제하지 않는다.
- 숫자 ID 자동 추정이나 순번 재발급은 하지 않는다. V1 원본을 대조한 승인된 import에서만
  `legacy_id`를 채운다.
- import 전에 양수 32-bit 범위, V1 ID unique, V2 UUID 대상 unique를 검증한다.
- 충돌은 임의 승자를 선택하지 않고 중단해 운영자가 원본을 대조한다.
- production 이관은 아직 실행하지 않았다.

## 확인된 미완료

- S05 라인별 MMR·수동 보정·통계 재계산과 변경 이력 연결
- S12 Riot 계정 연결·RSO·동기화·재시도·운영 승인
- 운영 V1 전체 숫자 ID backfill 도구, count/hash/invariant 대조와 복구 훈련
- S13 무활동 환경의 만료 멱등성 영수증 주기 정리 scheduler와 운영 보존량 모니터링

이 항목 때문에 S02 기반 CRUD를 구현했더라도 V2 전체 기능 동등성이나 운영 준비 완료로
판정하지 않는다.

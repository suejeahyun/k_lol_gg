# Kakao V4 동일 방 다중 사용자 PostgreSQL P0 검수

## 기준과 범위

- 기준 SHA: `63415c29eca82f58042acc969836f7b7e249041a`
- 검증 대상: `P0-MULTIUSER-02`
- 변경 범위: 테스트와 격리 PostgreSQL 하네스
- 미변경: Kakao parser, dispatcher, PostgreSQL adapter, 운영 DB, Riot 데이터·스키마·migration
- Git 커밋·push·배포: 미수행

## 요구사항과 판정

- 같은 canonical 방의 다른 일반 사용자가 기존 파티 전체 양식을 수정할 수 있어야 한다: **확인됨**
- 같은 canonical 방의 또 다른 일반 사용자가 파티를 마감할 수 있어야 한다: **확인됨**
- 다른 canonical 방에서는 같은 날짜·모집번호를 사용해도 대상을 찾지 못하고 변경이 없어야 한다: **확인됨**
- 수정·마감에 관리자 역할이나 작성자 sender ID 일치를 요구하지 않아야 한다: **확인됨**

`tests/kakao-v4-input-tolerance-p0.test.ts`의 TODO를 실제 계약 테스트로 교체했다. 서로 다른 identity secret에서 파생한 두 설치본·방을 만들고, V4 command service → classifier/canonicalizer → dispatcher → command handler → PostgreSQL adapter 경로를 사용한다. 파티 작성자와 수정자·마감자는 모두 서로 다른 sender ID이며 관리자 계정·방 관리자 fixture를 만들지 않는다.

검증 후 PostgreSQL 행은 수정 리비전 `1`, 마감 리비전 `2`, 상태 `FINISHED`여야 한다. 다른 방 시도 직후에는 리비전 `1`, 상태 `IN_PROGRESS`, 명단이 그대로여야 한다. 성공한 수정·마감만 영수증 2건과 `RECRUITING_SYNC_PARTY`, `RECRUITING_FINISH_PARTY` 감사 이벤트를 남긴다.

## 재현 명령과 결과

```powershell
$env:V2_DB_CONTRACT_SCOPE='kakao-v4'
npm run test:db
```

- PostgreSQL: 로컬 격리 PostgreSQL 18 임시 클러스터
- 결과: 31/31 PASS, skip 0, todo 0
- 종료: 클러스터 정상 종료, 일회성 작업 경로 삭제 확인
- 변경 파일 ESLint: PASS
- 변경 파일 `git diff --check`: 오류 없음

`V2_DB_CONTRACT_SCOPE=recruiting` 전체 범위는 새 테스트에 도달하기 전 기존 `tests/database/recruiting.contract.test.ts:249`의 `0 !== 1` 실패로 중단됐다. 빈 명단을 빈 명단으로 동기화하면서 리비전 증가를 기대하는 기준 SHA 기존 테스트이며 이번 변경과 무관하다.

전체 `npm run typecheck`는 작업 중 다른 담당이 추가한 미커밋 `tests/public-ranking-view.test.ts:46-47`의 ES2018 정규식 플래그 오류로 실패했다. 새 테스트 파일 자체와 DB 하네스는 ESLint 및 실제 실행으로 확인했다.

## Riot 동일 계정 다중 플레이어 연결 위험 제안

### 현재 근거

기준 SHA의 `riot.account_links`에는 다음 제약이 있다.

- `riot_links_player_uidx`: 한 플레이어당 link row 1개
- `riot_links_owner_status_idx`: `(owner_user_account_id, status)` 일반 인덱스
- `registry.players_user_account_id_uidx`: 플레이어 등록부의 비어 있지 않은 계정 연결은 계정당 1개

하지만 `riot.account_links.owner_user_account_id` 자체에는 고유 제약이 없다. 또한 link의 `(player_id, owner_user_account_id)`가 `registry.players.(id, user_account_id)`와 동일한 쌍인지 강제하는 복합 FK도 없다. 따라서 관리자·이관·결함 경로가 잘못된 owner 값을 쓰면 같은 계정에 여러 `CONNECTED` Riot link가 생길 수 있다.

현재 공유 작업트리에서 다른 담당이 준비 중인 `riot_links_connected_normalized_key_uidx`는 동일 Riot ID의 중복 연결은 막지만, 서로 다른 Riot ID를 같은 owner 계정에 연결하는 경우는 막지 않는다.

### 제안하는 정확한 고유키

Drizzle 스키마 제안:

```ts
uniqueIndex("riot_links_connected_owner_user_account_uidx")
  .on(table.ownerUserAccountId)
  .where(sql`${table.status} = 'CONNECTED'`)
```

SQL migration 제안:

```sql
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "riot"."account_links"
    WHERE "status" = 'CONNECTED'
    GROUP BY "owner_user_account_id"
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'RIOT_CONNECTED_OWNER_DUPLICATES_REQUIRE_REVIEW';
  END IF;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX "riot_links_connected_owner_user_account_uidx"
ON "riot"."account_links" USING btree ("owner_user_account_id")
WHERE "riot"."account_links"."status" = 'CONNECTED';
```

부분 고유 인덱스이므로 계정당 활성 연결은 정확히 1개만 허용하면서 `DISCONNECTED`·`REVOKED` 이력 행은 보존한다. migration은 중복을 임의 선택하거나 삭제하지 않고 fail-closed해야 한다.

적용 전 읽기 전용 점검:

```sql
SELECT
  "owner_user_account_id",
  count(*) AS "connected_count",
  array_agg("id" ORDER BY "linked_at" DESC, "id") AS "link_ids"
FROM "riot"."account_links"
WHERE "status" = 'CONNECTED'
GROUP BY "owner_user_account_id"
HAVING count(*) > 1;
```

중복이 있으면 운영자가 등록부의 실제 `players.user_account_id`와 감사 로그를 대조해 canonical link를 결정한 뒤, 나머지는 hard delete하지 말고 기존 disconnect 명령 경계로 PUUID 제거·상태 변경·감사 기록을 남겨야 한다. 데이터 담당 패치에는 동시 연결 두 번째 시도의 constraint 실패와 연결 해제 후 재연결 허용을 격리 PostgreSQL에서 검증하는 테스트가 필요하다.

## 남은 위험

- P0 테스트는 격리 DB에서 통과했지만 운영 DB·운영 봇·실제 카카오 방에는 적용하거나 실행하지 않았다.
- 전체 recruiting DB 범위의 기존 리비전 기대 실패가 남아 있어 별도 정리가 필요하다.
- Riot 고유키는 제안만 작성했으며 현재 스키마·migration에는 반영하지 않았다.
- Riot 중복 데이터 존재 여부는 운영 DB를 조회하지 않아 미확인이다.

## 다음 패치 권장

1. 빈 명단→빈 명단 동기화의 리비전 계약을 확정하고 기존 recruiting DB 테스트의 `0 !== 1` 실패를 수정한다.
2. 데이터 담당 범위에서 Riot owner 중복 읽기 전용 preflight와 부분 고유 인덱스를 격리 PostgreSQL fresh·upgrade·재실행으로 검증한다.
3. 현재 공유 작업트리의 병렬 변경이 정리된 뒤 `npm run check`와 전체 `npm run test:db`를 다시 실행한다.
4. 별도 테스트 카카오 방에서 작성자·일반 구성원 2명·다른 방 사용자로 동일 시나리오를 실기기 검증한다.

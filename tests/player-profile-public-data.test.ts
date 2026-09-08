import assert from "node:assert/strict";
import test from "node:test";

import { isPublicRiotPlayerId } from "../src/modules/riot/application/riot-query";
import { PostgresPublicRiotQueryRepository } from "../src/modules/riot/infrastructure/postgres-public-riot-query";

const playerId = "a3e37453-d88d-4521-a487-bf0085bc0701";

function repositoryReturning(row: unknown) {
  const chain = {
    from() { return this; },
    leftJoin() { return this; },
    where() { return this; },
    async limit() { return row ? [row] : []; },
  };
  const database = { select: () => chain };
  return new PostgresPublicRiotQueryRepository(database as never);
}

test("공개 Riot 플레이어 ID는 canonical UUID만 받는다", () => {
  assert.equal(isPublicRiotPlayerId(playerId), true);
  assert.equal(isPublicRiotPlayerId("not-a-player"), false);
  assert.equal(isPublicRiotPlayerId(`${playerId}?include=secret`), false);
});

test("공개 Riot 조회는 없는 플레이어·미연동·동기화 대기·준비 완료를 구분한다", async () => {
  assert.deepEqual(await repositoryReturning(null).getPublicProfileState(playerId), { kind: "PLAYER_NOT_FOUND" });
  assert.deepEqual(await repositoryReturning({ playerId, linkId: null }).getPublicProfileState(playerId), { kind: "UNLINKED" });
  assert.deepEqual(await repositoryReturning({ playerId, linkId: "link", summaryPlayerId: null }).getPublicProfileState(playerId), { kind: "PENDING_SYNC" });

  const ready = await repositoryReturning({
    playerId,
    linkId: "link",
    summaryPlayerId: playerId,
    gameName: "FiveSeasons",
    tagLine: "KR1",
    soloTier: "GOLD",
    soloRank: "II",
    leaguePoints: 43,
    wins: 12,
    losses: 9,
    lastSyncedAt: new Date("2026-09-08T00:00:00.000Z"),
  }).getPublicProfileState(playerId);
  assert.deepEqual(ready, {
    kind: "READY",
    summary: {
      playerId,
      riotId: "FiveSeasons#KR1",
      soloTier: "GOLD",
      soloRank: "II",
      leaguePoints: 43,
      wins: 12,
      losses: 9,
      lastSyncedAt: "2026-09-08T00:00:00.000Z",
    },
  });
  assert.equal(JSON.stringify(ready).includes("protectedPuuid"), false);
  assert.equal(JSON.stringify(ready).includes("ownerUserAccountId"), false);
});

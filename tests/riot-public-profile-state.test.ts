import assert from "node:assert/strict";
import test from "node:test";

import { PUBLIC_RIOT_SNAPSHOT_STALE_AFTER_MS, resolvePublicRiotProfileState } from "../src/modules/riot/application/riot-query";

const now = new Date("2026-09-09T00:00:00.000Z");
const summary = { playerId: "0f2080b1-8f1f-4f32-95a1-47fd814e7ce8", riotId: "Summoner#KR1", soloTier: null, soloRank: null, leaguePoints: null, wins: 0, losses: 0, lastSyncedAt: now.toISOString() };

test("public Riot profile separates unlinked, stale, temporary and rate-limited states", () => {
  assert.equal(resolvePublicRiotProfileState({ playerFound: true, linked: false, summary: null, latestSync: null, now }).kind, "UNLINKED");
  assert.equal(resolvePublicRiotProfileState({ playerFound: true, linked: true, summary: { ...summary, lastSyncedAt: new Date(now.getTime() - PUBLIC_RIOT_SNAPSHOT_STALE_AFTER_MS - 1).toISOString() }, latestSync: null, now }).kind, "STALE_SNAPSHOT");
  assert.equal(resolvePublicRiotProfileState({ playerFound: true, linked: true, summary, latestSync: { status: "RETRY_WAIT", failureCode: "RATE_LIMITED", availableAt: new Date(now.getTime() + 60_000) }, now }).kind, "RATE_LIMITED");
  assert.equal(resolvePublicRiotProfileState({ playerFound: true, linked: true, summary: null, latestSync: { status: "RETRY_WAIT", failureCode: "NETWORK", availableAt: now }, now }).kind, "TEMPORARY_ERROR");
});

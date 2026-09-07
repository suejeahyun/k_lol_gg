import assert from "node:assert/strict";
import test from "node:test";

import {
  canonicalRiotId,
  claimRiotSyncJob,
  consumeRsoState,
  createRiotSyncJob,
  createRsoState,
  disconnectRiotAccount,
  finishRiotSyncJob,
  safeRsoReturnTo,
  toPublicRiotSummaryDto,
  type RiotAccountLink,
} from "../src/modules/riot";

const now = new Date("2026-09-07T06:00:00.000Z");

test("Riot IDs normalize NFKC and reject separators or oversized tags", () => {
  assert.deepEqual(canonicalRiotId({ gameName: " Ａｈｒｉ ", tagLine: " KR1 " }), { gameName: "Ahri", tagLine: "KR1", normalizedKey: "ahri#kr1" });
  assert.throws(() => canonicalRiotId({ gameName: "bad#name", tagLine: "KR1" }), /INVALID_RIOT_GAME_NAME/);
  assert.throws(() => canonicalRiotId({ gameName: "name", tagLine: "TOOLONG" }), /INVALID_RIOT_TAG_LINE/);
});

test("RSO return path cannot escape origin", () => {
  assert.equal(safeRsoReturnTo("/players/p1?tab=riot"), "/players/p1?tab=riot");
  for (const unsafe of ["https://evil.test", "//evil.test", "/\\evil", "javascript:alert(1)"]) {
    assert.equal(safeRsoReturnTo(unsafe), "/account/riot");
  }
});

test("RSO state is owner-bound, expiring and one-time", () => {
  const state = createRsoState({ id: "state-1", ownerAccountId: "account-1", stateDigestHex: "a".repeat(64), returnTo: "/account/riot", now });
  const consumed = consumeRsoState({ state, ownerAccountId: "account-1", presentedDigestHex: "a".repeat(64), now: new Date(now.getTime() + 1) });
  assert.ok(consumed.consumedAt);
  assert.throws(() => consumeRsoState({ state: consumed, ownerAccountId: "account-1", presentedDigestHex: "a".repeat(64), now }), /ALREADY_CONSUMED/);
  assert.throws(() => consumeRsoState({ state, ownerAccountId: "other", presentedDigestHex: "a".repeat(64), now }), /STATE_NOT_FOUND/);
  assert.throws(() => consumeRsoState({ state, ownerAccountId: "account-1", presentedDigestHex: "a".repeat(64), now: new Date(now.getTime() + 11 * 60 * 1_000) }), /STATE_EXPIRED/);
});

test("disconnect clears encrypted PUUID and hides existence from another owner", () => {
  const link: RiotAccountLink = { id: "link", revision: 0, playerId: "p", ownerAccountId: "a", gameName: "Ahri", tagLine: "KR1", puuidCiphertext: "encrypted", method: "RSO_VERIFIED", status: "CONNECTED", linkedAt: now, disconnectedAt: null };
  assert.throws(() => disconnectRiotAccount({ link, expectedRevision: 0, ownerAccountId: "other", actor: "OWNER", now }), /RIOT_LINK_NOT_FOUND/);
  const disconnected = disconnectRiotAccount({ link, expectedRevision: 0, ownerAccountId: "a", actor: "OWNER", now });
  assert.equal(disconnected.status, "DISCONNECTED");
  assert.equal(disconnected.puuidCiphertext, null);
});

test("sync jobs retry rate limits and transient failures with bounded backoff", () => {
  const queued = createRiotSyncJob({ id: "job", linkId: "link", requestedBy: "OWNER", now, maximumAttempts: 3 });
  const first = claimRiotSyncJob({ job: queued, expectedRevision: 0, leaseId: "lease-1", now });
  const waiting = finishRiotSyncJob({ job: first, expectedRevision: 1, expectedLeaseId: "lease-1", outcome: { kind: "RATE_LIMITED", retryAfterSeconds: 90 }, now });
  assert.equal(waiting.status, "RETRY_WAIT");
  assert.equal(waiting.availableAt.getTime(), now.getTime() + 90_000);
  assert.throws(() => claimRiotSyncJob({ job: waiting, expectedRevision: 2, leaseId: "lease-2", now }), /NOT_CLAIMABLE/);
  const secondAt = waiting.availableAt;
  const second = claimRiotSyncJob({ job: waiting, expectedRevision: 2, leaseId: "lease-2", now: secondAt });
  const succeeded = finishRiotSyncJob({ job: second, expectedRevision: 3, expectedLeaseId: "lease-2", outcome: { kind: "SUCCESS", partial: false }, now: secondAt });
  assert.equal(succeeded.status, "SUCCEEDED");
});

test("last allowed transient attempt becomes terminal failure", () => {
  const running = claimRiotSyncJob({ job: createRiotSyncJob({ id: "job", linkId: "link", requestedBy: "ADMIN", now, maximumAttempts: 1 }), expectedRevision: 0, leaseId: "lease", now });
  const failed = finishRiotSyncJob({ job: running, expectedRevision: 1, expectedLeaseId: "lease", outcome: { kind: "TRANSIENT_FAILURE", code: "TIMEOUT" }, now });
  assert.equal(failed.status, "FAILED");
  assert.equal(failed.failureCode, "TIMEOUT");
});

test("stale RUNNING lease is recoverable and the old worker cannot finish it", () => {
  const first = claimRiotSyncJob({
    job: createRiotSyncJob({ id: "job", linkId: "link", requestedBy: "JOB", now }),
    expectedRevision: 0,
    leaseId: "lease-old",
    now,
  });
  const recoveredAt = new Date(now.getTime() + 60_001);
  const recovered = claimRiotSyncJob({ job: first, expectedRevision: 1, leaseId: "lease-new", now: recoveredAt });
  assert.equal(recovered.attemptCount, 2);
  assert.throws(
    () => finishRiotSyncJob({ job: recovered, expectedRevision: 2, expectedLeaseId: "lease-old", outcome: { kind: "SUCCESS", partial: false }, now: recoveredAt }),
    /RIOT_SYNC_LEASE_LOST/,
  );
  const waiting = finishRiotSyncJob({
    job: recovered,
    expectedRevision: 2,
    expectedLeaseId: "lease-new",
    outcome: { kind: "TRANSIENT_FAILURE", code: "UPSTREAM_5XX" },
    now: recoveredAt,
  });
  assert.equal(waiting.status, "RETRY_WAIT");
  assert.equal(waiting.availableAt.getTime(), recoveredAt.getTime() + 20_000);
});

test("invalid upstream Retry-After is rejected rather than creating an invalid schedule", () => {
  const running = claimRiotSyncJob({
    job: createRiotSyncJob({ id: "job", linkId: "link", requestedBy: "JOB", now }),
    expectedRevision: 0,
    leaseId: "lease",
    now,
  });
  assert.throws(
    () => finishRiotSyncJob({ job: running, expectedRevision: 1, expectedLeaseId: "lease", outcome: { kind: "RATE_LIMITED", retryAfterSeconds: Number.NaN }, now }),
    /INVALID_RIOT_RETRY_AFTER/,
  );
});

test("permanent upstream failure never retries", () => {
  const running = claimRiotSyncJob({
    job: createRiotSyncJob({ id: "job", linkId: "link", requestedBy: "JOB", now }),
    expectedRevision: 0,
    leaseId: "lease",
    now,
  });
  const failed = finishRiotSyncJob({
    job: running,
    expectedRevision: 1,
    expectedLeaseId: "lease",
    outcome: { kind: "PERMANENT_FAILURE", code: "UNAUTHORIZED" },
    now,
  });
  assert.equal(failed.status, "FAILED");
  assert.equal(failed.failureCode, "UNAUTHORIZED");
  assert.equal(failed.completedAt?.toISOString(), now.toISOString());
});

test("public Riot DTO excludes PUUID, owner and request-log provenance", () => {
  const dto = toPublicRiotSummaryDto({ playerId: "p", gameName: "Ahri", tagLine: "KR1", soloTier: "DIAMOND", soloRank: "I", leaguePoints: 50, wins: 10, losses: 8, lastSyncedAt: now, puuid: "private", requestLogIds: ["private-log"] });
  assert.deepEqual(Object.keys(dto).sort(), ["lastSyncedAt", "leaguePoints", "losses", "playerId", "riotId", "soloRank", "soloTier", "wins"]);
  assert.equal(JSON.stringify(dto).includes("private"), false);
});

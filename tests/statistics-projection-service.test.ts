import assert from "node:assert/strict";
import test from "node:test";

import {
  affectedSeasonIdsForMatchChanged,
  processNextMatchChanged,
  type ClaimedMatchChangedEvent,
  type StatisticsProjectionRepository,
} from "../src/modules/statistics";

const oldSeasonId = "10000000-0000-4000-8000-000000000000";
const newSeasonId = "20000000-0000-4000-8000-000000000000";

function event(overrides: Partial<ClaimedMatchChangedEvent> = {}): ClaimedMatchChangedEvent {
  return {
    eventId: "30000000-0000-4000-8000-000000000000",
    eventType: "MATCH_CHANGED",
    action: "AMENDED",
    matchId: "40000000-0000-4000-8000-000000000000",
    matchRevision: 2,
    oldSeasonId,
    newSeasonId,
    inputDigest: Buffer.alloc(32, 7),
    lockedAt: new Date("2026-09-07T03:00:00.000Z"),
    ...overrides,
  };
}

test("affected seasons dedupe and lock in canonical order for every S04 action scope", () => {
  assert.deepEqual(affectedSeasonIdsForMatchChanged(event()), [oldSeasonId, newSeasonId]);
  assert.deepEqual(affectedSeasonIdsForMatchChanged(event({ newSeasonId: oldSeasonId })), [oldSeasonId]);
  assert.deepEqual(affectedSeasonIdsForMatchChanged(event({ action: "CREATED", oldSeasonId: null, newSeasonId: null })), []);
  assert.deepEqual(affectedSeasonIdsForMatchChanged(event({ action: "PUBLISHED", oldSeasonId: null })), [newSeasonId]);
  assert.deepEqual(affectedSeasonIdsForMatchChanged(event({ action: "VOIDED", newSeasonId: null })), [oldSeasonId]);
  assert.throws(
    () => affectedSeasonIdsForMatchChanged(event({ action: "PUBLISHED", oldSeasonId })),
    /INVALID_MATCH_CHANGED_SCOPE/,
  );
  assert.throws(
    () => affectedSeasonIdsForMatchChanged(event({ inputDigest: Buffer.alloc(31) })),
    /INVALID_MATCH_CHANGED_PROVENANCE/,
  );
});

test("application passes old/new season rebuild scope to one atomic repository operation", async () => {
  const claimed = event();
  let appliedScope: readonly string[] | null = null;
  const repository: StatisticsProjectionRepository = {
    async claimNextMatchChanged() { return claimed; },
    async applyClaimedMatchChanged(input) {
      appliedScope = input.affectedSeasonIds;
      return {
        eventId: claimed.eventId,
        kind: "APPLIED",
        affectedSeasonIds: input.affectedSeasonIds,
        projections: [],
      };
    },
    async failClaimedMatchChanged() { assert.fail("successful apply must not fail the lease"); },
  };
  const result = await processNextMatchChanged(repository, new Date("2026-09-07T03:00:01.000Z"));
  assert.equal(result.kind, "APPLIED");
  assert.deepEqual(appliedScope, [oldSeasonId, newSeasonId]);
});

test("application reports idle and releases a failed exact lease without touching READY data", async () => {
  const idle: StatisticsProjectionRepository = {
    async claimNextMatchChanged() { return null; },
    async applyClaimedMatchChanged() { assert.fail("idle cannot apply"); },
    async failClaimedMatchChanged() { assert.fail("idle cannot fail"); },
  };
  assert.deepEqual(await processNextMatchChanged(idle), { kind: "IDLE" });

  const claimed = event();
  let failureCode: string | null = null;
  const failing: StatisticsProjectionRepository = {
    async claimNextMatchChanged() { return claimed; },
    async applyClaimedMatchChanged() { throw new Error("database temporarily unavailable"); },
    async failClaimedMatchChanged(input) { failureCode = input.failureCode; },
  };
  const result = await processNextMatchChanged(failing);
  assert.equal(result.kind, "FAILED");
  assert.equal(failureCode, "DATABASE_TEMPORARILY_UNAVAILABLE");
});

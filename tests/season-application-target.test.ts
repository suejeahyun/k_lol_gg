import assert from "node:assert/strict";
import test from "node:test";
import { requireSeasonApplicationTarget, SeasonService } from "../src/modules/seasons/application/season-service";
import { SeasonServiceError } from "../src/modules/seasons/domain/season";

const target = { seasonId: "11111111-1111-4111-8111-111111111111", applyDate: "2026-10-13", roundId: null, applicationId: null };
test("public application target is complete and rejects missing, malformed and extra identity fields", () => {
  assert.deepEqual(requireSeasonApplicationTarget({ target }), target);
  assert.throws(() => requireSeasonApplicationTarget({}), (error) => error instanceof SeasonServiceError && error.code === "APPLICATION_TARGET_REQUIRED");
  for (const invalid of [null, { ...target, seasonId: "wrong" }, { ...target, applyDate: "2026-02-30" }, { ...target, roundId: undefined }, { ...target, applicationId: "wrong" }, { ...target, unexpected: true }]) {
    assert.throws(() => requireSeasonApplicationTarget({ target: invalid }), (error) => error instanceof SeasonServiceError && error.code === "INVALID_INPUT");
  }
});

test("bound application commands preserve the observed date and identity for transactional validation and replay", () => {
  const calls: Record<string, unknown>[] = [];
  const service = new SeasonService({
    upsertOwnApplication(_envelope: unknown, input: Record<string, unknown>) { calls.push(input); },
    cancelOwnApplication(_envelope: unknown, revision: number, applyDate: string, recruitNo: number, _now: Date, binding: unknown) { calls.push({ revision, applyDate, recruitNo, target: binding }); },
  } as never);
  const context = { actorSession: { userAccountId: target.seasonId }, requestId: "22222222-2222-4222-8222-222222222222", idempotencyMaterial: new TextEncoder().encode("synthetic") } as never;
  const now = new Date("2026-10-13T21:00:01Z");
  service.upsertOwnApplication(context, 0, { target, recruitNo: 1, mainPosition: "MID" }, now);
  service.cancelOwnApplication(context, 0, { target, recruitNo: 1 }, now);
  assert.equal(calls.length, 2);
  for (const input of calls) { assert.equal(input.applyDate, target.applyDate); assert.deepEqual(input.target, target); }
});

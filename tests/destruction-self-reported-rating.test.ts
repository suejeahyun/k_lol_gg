import assert from "node:assert/strict";
import test from "node:test";
import { validateReportedWinsLosses, selfReportedRating, upgradeSelfReportedRatings, withSelfReportedRecord } from "../src/modules/competitions/destruction/self-reported-rating";
import { advanceAutomaticRating } from "../src/modules/competitions/destruction/automatic-rating";
import { DEFAULT_RATING_POLICY, evaluateProvisionalRating } from "../src/modules/competitions/destruction/provisional-rating";
import type { DestructionAggregate } from "../src/modules/competitions/destruction/state";
import type { DestructionParticipant } from "../src/modules/competitions/destruction/teams";

const now = "2026-09-28T14:00:00Z";
const participant: DestructionParticipant = { id: "p", playerId: "owner", position: null, isCaptain: false, teamId: null, auctionStatus: "PENDING", purchasePoints: null, drawOrder: null };
const record = (wins: number, losses: number) => ({ wins, losses, mode: "ARAM_MAYHEM" as const, submittedAt: now });

test("self-reported total games ignore win rate, cap at 300 and distinguish zero from missing", () => {
  for (const [games, score] of [[0, 0], [1, 0.33], [10, 3.33], [100, 33.33], [150, 50], [299, 99.67], [300, 100], [301, 100], [1_000_000, 100]]) {
    assert.equal(selfReportedRating(record(games, 0), now).score, score);
    assert.equal(selfReportedRating(record(0, games), now).score, score);
  }
  assert.equal(selfReportedRating(record(60, 40), now).score, 33.33);
  assert.equal(selfReportedRating(record(1000, 1000), now).score, 100);
  assert.equal(selfReportedRating(record(1000, 0), now).score, 100);
  assert.equal(selfReportedRating(record(0, 1000), now).score, 100);
  assert.equal(selfReportedRating(record(0, 0), now).status, "READY");
  assert.equal(selfReportedRating(record(60, 40), now, "ABSOLUTE_V2").score, 70.83);
  assert.equal(selfReportedRating(record(0, 0), now, "ABSOLUTE_V2").score, null);
  assert.equal(selfReportedRating(undefined, now).status, "NO_DATA");
  for (const value of [null, undefined, {}, [], { wins: "1", losses: 1 }, { wins: -1, losses: 1 }, { wins: 0.5, losses: 2 }, { wins: NaN, losses: 2 }, { wins: 1_000_000, losses: 1 }, { wins: 1, losses: 1, mode: "ARAM" }, { wins: 1, losses: 1, score: 100 }]) assert.throws(() => validateReportedWinsLosses(value));
});

test("new automatic evaluation combines numeric input with four sources without requesting ARAM", async () => {
  let p = withSelfReportedRecord(participant, DEFAULT_RATING_POLICY, record(50, 50), now);
  const scores = { solo: 78.46, inhouse: 43.65, champions: 100, challenges: 72.93 };
  let calls = 0;
  const sources = { component: async (key: keyof typeof scores) => { calls++; return { score: scores[key], status: "READY" as const, source: "RIOT" as const, samples: 50, evidence: "synthetic", observedAt: now }; }, aram: async (): Promise<never> => { throw new Error("ARAM upstream must not be requested"); } };
  for (let i = 0; i < 4; i++) p = await advanceAutomaticRating(p, DEFAULT_RATING_POLICY, now, sources);
  assert.equal(calls, 4); assert.equal(p.ratingCollection?.complete, true);
  assert.equal(evaluateProvisionalRating(p.provisionalRating!).score, 62.24);
  const edited = withSelfReportedRecord(p, DEFAULT_RATING_POLICY, record(60, 40), now);
  assert.equal(evaluateProvisionalRating(edited.provisionalRating!).score, 62.24);
  assert.deepEqual(edited.provisionalRating?.components.solo, p.provisionalRating?.components.solo);
  assert.equal(evaluateProvisionalRating(withSelfReportedRecord(p, DEFAULT_RATING_POLICY, record(0, 0), now).provisionalRating!).score, 52.24);
  const missing = await advanceAutomaticRating({ ...p, selfReportedRecord: undefined, provisionalRating: { ...p.provisionalRating!, components: { ...p.provisionalRating!.components, aram: undefined } } }, DEFAULT_RATING_POLICY, now, sources);
  assert.equal(missing.provisionalRating?.components.aram?.status, "NO_DATA");
});

test("unfrozen old formulas drop the proxy, preserve other facts and weights; frozen auctions never change", () => {
  const previous = withSelfReportedRecord(participant, { ...DEFAULT_RATING_POLICY, version: "ABSOLUTE_V1" }, record(60, 40), now);
  const aggregate = { configuration: { gameMode: "ARAM_MAYHEM" }, lifecycle: { status: "TEAM_BUILDING" }, teams: [], applications: [], participants: [previous], ratingPolicy: { version: "ABSOLUTE_V1", weights: { aram: 20, solo: 35, inhouse: 25, champions: 15, challenges: 5 } } } as unknown as DestructionAggregate;
  const upgraded = upgradeSelfReportedRatings(aggregate, now);
  assert.equal(upgraded.ratingPolicy?.version, "ABSOLUTE_V3"); assert.equal(upgraded.ratingPolicy?.weights.solo, 35);
  assert.equal(upgraded.participants[0]?.provisionalRating?.components.aram?.score, null);
  const frozen: DestructionAggregate = { ...aggregate, teams: [{ id: "team", name: "Frozen", captainParticipantId: "p", initialAuctionPoints: 1750, remainingAuctionPoints: 1750, confirmed: true }] };
  assert.equal(upgradeSelfReportedRatings(frozen, now), frozen);
  assert.equal(upgradeSelfReportedRatings(upgraded, now), upgraded);
  const oldDefault = { ...aggregate, ratingPolicy: { version: "ABSOLUTE_V2" as const, weights: { aram: 20, solo: 40, inhouse: 20, champions: 15, challenges: 5 } }, applications: [{ id: "p", playerId: "owner", userAccountId: "account", position: null, status: "CONFIRMED", selfReportedRecord: record(60, 40) }] } as DestructionAggregate;
  const migrated = upgradeSelfReportedRatings(oldDefault, now);
  assert.deepEqual(migrated.ratingPolicy, DEFAULT_RATING_POLICY);
  assert.equal(migrated.participants[0]?.provisionalRating?.components.aram?.score, 33.33);
  const frozenV2 = { ...oldDefault, teams: frozen.teams };
  assert.equal(upgradeSelfReportedRatings(frozenV2, now), frozenV2);
});

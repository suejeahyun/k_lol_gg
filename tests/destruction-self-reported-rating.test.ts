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

test("self-reported cumulative wins are shrunk, bounded, and zero games remain unknown", () => {
  assert.equal(selfReportedRating(record(6, 4), now).score, 58.33);
  assert.equal(selfReportedRating(record(60, 40), now).score, 70.83);
  assert.equal(selfReportedRating(record(1000, 1000), now).score, 50);
  assert.equal(selfReportedRating(record(1000, 0), now).score, 100);
  assert.equal(selfReportedRating(record(0, 1000), now).score, 0);
  assert.equal(selfReportedRating(record(0, 0), now).score, null);
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
  assert.equal(evaluateProvisionalRating(p.provisionalRating!).score, 68.76);
  const edited = withSelfReportedRecord(p, DEFAULT_RATING_POLICY, record(60, 40), now);
  assert.equal(evaluateProvisionalRating(edited.provisionalRating!).score, 72.93);
  assert.deepEqual(edited.provisionalRating?.components.solo, p.provisionalRating?.components.solo);
  assert.equal(evaluateProvisionalRating(withSelfReportedRecord(p, DEFAULT_RATING_POLICY, record(0, 0), now).provisionalRating!).tier, null);
  const missing = await advanceAutomaticRating({ ...p, selfReportedRecord: undefined, provisionalRating: { ...p.provisionalRating!, components: { ...p.provisionalRating!.components, aram: undefined } } }, DEFAULT_RATING_POLICY, now, sources);
  assert.equal(missing.provisionalRating?.components.aram?.status, "NO_DATA");
});

test("unfrozen old formulas drop the proxy, preserve other facts and weights; frozen auctions never change", () => {
  const previous = withSelfReportedRecord(participant, { ...DEFAULT_RATING_POLICY, version: "ABSOLUTE_V1" }, record(60, 40), now);
  const aggregate = { configuration: { gameMode: "ARAM_MAYHEM" }, lifecycle: { status: "TEAM_BUILDING" }, teams: [], applications: [], participants: [previous], ratingPolicy: { version: "ABSOLUTE_V1", weights: { ...DEFAULT_RATING_POLICY.weights, solo: 35, inhouse: 25 } } } as unknown as DestructionAggregate;
  const upgraded = upgradeSelfReportedRatings(aggregate, now);
  assert.equal(upgraded.ratingPolicy?.version, "ABSOLUTE_V2"); assert.equal(upgraded.ratingPolicy?.weights.solo, 35);
  assert.equal(upgraded.participants[0]?.provisionalRating?.components.aram?.score, null);
  const frozen: DestructionAggregate = { ...aggregate, teams: [{ id: "team", name: "Frozen", captainParticipantId: "p", initialAuctionPoints: 1750, remainingAuctionPoints: 1750, confirmed: true }] };
  assert.equal(upgradeSelfReportedRatings(frozen, now), frozen);
  assert.equal(upgradeSelfReportedRatings(upgraded, now), upgraded);
});
